import * as vscode from 'vscode'
import { secretsGet, secretsStore, secretsDelete } from '../utils/secrets-timeout.js'

const SECRET_KEY = 'storyline.licenceKey'
const CACHE_KEY  = 'storyline.licenceCache'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes — long enough to absorb KV propagation races, short enough to discard stale entries after a backend reset

// Local-only developer bypass. Validates without hitting the backend so
// `npm run ship`-built dev installs can use the AI in a test project even
// when the Cloudflare KV doesn't have the user's key seeded. Never check
// for this key client-side from anything that calls /chat or /illustrate
// — those endpoints will still 401 on the server. This bypass only affects
// the local /validate path.
export const DEV_LICENCE_KEY = 'SL-DEV-LOCAL-TEST-KEY'

export interface LicenceInfo {
  valid: boolean
  type: 'free' | 'credits' | 'byok'
  creditBalance: number
}

/** Mirror of backend `BatchSummary` — keep field names in sync. */
export interface BatchSummary {
  id: string
  purchasedAt: string
  pricePaidPence: number
  currency: string
  creditsTotal: number
  creditsRemaining: number
  refundEligibleUntil: string
  refundedAt: string | null
  source: 'free' | 'purchase' | 'grandfathered'
  refundable: boolean
  refundablePence: number
}

export interface ListBatchesResponse {
  creditBalance: number
  batches: BatchSummary[]
}

export interface RefundResponse {
  refundedPence: number
  creditsRefunded: number
  currency: string
  newBalance: number
  batches: BatchSummary[]
}

interface CacheEntry {
  key: string
  info: LicenceInfo
  ts: number
}

export class LicenceManager {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly backendUrl: string,
  ) {}

  async getLicenceKey(): Promise<string | undefined> {
    return secretsGet(this.context, SECRET_KEY)
  }

  async setLicenceKey(key: string): Promise<void> {
    await secretsStore(this.context, SECRET_KEY, key)
  }

  async clearLicenceKey(): Promise<void> {
    await secretsDelete(this.context, SECRET_KEY)
    this.context.globalState.update(CACHE_KEY, undefined)
  }

  /** Drop the cached validation info — call after a 401 from /chat or
   *  /illustrate so we don't keep displaying stale credit balances. */
  async clearCache(): Promise<void> {
    await this.context.globalState.update(CACHE_KEY, undefined)
  }

  async validate(opts: { useCache?: boolean } = {}): Promise<LicenceInfo> {
    const fallback: LicenceInfo = { valid: false, type: 'free', creditBalance: 0 }

    const key = await this.getLicenceKey()
    if (!key) return fallback

    // Local-only dev bypass — see DEV_LICENCE_KEY comment above.
    if (key === DEV_LICENCE_KEY) {
      const info: LicenceInfo = { valid: true, type: 'credits', creditBalance: 999999 }
      await this.context.globalState.update(CACHE_KEY, { key, info, ts: Date.now() })
      return info
    }

    if (opts.useCache) {
      const cached = this.context.globalState.get<CacheEntry>(CACHE_KEY)
      // Only use the cache if it was recorded against THIS licence key AND
      // is within the TTL. Without the TTL a stale cache (from a previous
      // key, or from before a wrangler KV reset) keeps showing fake credits
      // while /chat 401s on every send.
      if (cached?.key === key && Date.now() - (cached.ts ?? 0) < CACHE_TTL_MS) return cached.info
    }

    // Cloudflare KV is eventually consistent across colos. A freshly-minted
    // SL-FREE-* key sometimes isn't visible to the colo serving /validate
    // for a few seconds. Retry transparently before declaring failure so
    // ChatPanel and the activation flow self-heal across the propagation
    // window. Paid keys are stable in KV, so we don't pay this cost there.
    const isFree = key.startsWith('SL-FREE-')
    const attemptDelays = isFree ? [0, 3000, 7000] : [0]

    let info: LicenceInfo | null = null
    for (const delay of attemptDelays) {
      if (delay > 0) await new Promise(r => setTimeout(r, delay))
      try {
        const response = await fetch(`${this.backendUrl}/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenceKey: key }),
        })
        if (response.ok) {
          info = await response.json() as LicenceInfo
          if (info.valid) {
            await this.context.globalState.update(CACHE_KEY, { key, info, ts: Date.now() })
            return info
          }
        }
        // Otherwise loop and try again (or fall through after last attempt)
      } catch {
        // Offline / network error — return last cached result if matched and fresh
        const cached = this.context.globalState.get<CacheEntry>(CACHE_KEY)
        if (cached?.key === key && Date.now() - (cached.ts ?? 0) < CACHE_TTL_MS) {
          return cached.info
        }
        return fallback
      }
    }

    // Every attempt returned non-ok or invalid. Clear stale cache and fall
    // back. The reactivate UX takes over from here.
    await this.context.globalState.update(CACHE_KEY, undefined)
    return info ?? fallback
  }

  /** Fetch the user's purchase history with refundability flags. */
  async listBatches(): Promise<ListBatchesResponse | null> {
    const key = await this.getLicenceKey()
    if (!key || key === DEV_LICENCE_KEY) return null

    try {
      const res = await fetch(`${this.backendUrl}/list-batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenceKey: key }),
      })
      if (!res.ok) return null
      return await res.json() as ListBatchesResponse
    } catch {
      return null
    }
  }

  /**
   * Request a pro-rata refund for one credit batch. Returns the updated
   * balance + batch list on success, or an error message on failure.
   */
  async requestRefund(batchId: string): Promise<
    | { ok: true; result: RefundResponse }
    | { ok: false; error: string }
  > {
    const key = await this.getLicenceKey()
    if (!key) return { ok: false, error: 'No licence key on this install.' }

    let res: Response
    try {
      res = await fetch(`${this.backendUrl}/refund-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenceKey: key, batchId }),
      })
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      return { ok: false, error: body.error ?? `HTTP ${res.status}` }
    }

    const result = await res.json() as RefundResponse
    // Drop the cached LicenceInfo so the next validate() pulls the new balance.
    await this.clearCache()
    return { ok: true, result }
  }
}
