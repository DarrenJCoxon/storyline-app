import * as vscode from 'vscode'

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
    return this.context.secrets.get(SECRET_KEY)
  }

  async setLicenceKey(key: string): Promise<void> {
    await this.context.secrets.store(SECRET_KEY, key)
  }

  async clearLicenceKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY)
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
}
