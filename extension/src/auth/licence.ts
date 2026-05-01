import * as vscode from 'vscode'

const SECRET_KEY = 'storyline.licenceKey'
const CACHE_KEY  = 'storyline.licenceCache'

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
      await this.context.globalState.update(CACHE_KEY, { key, info })
      return info
    }

    if (opts.useCache) {
      const cached = this.context.globalState.get<{ key: string; info: LicenceInfo }>(CACHE_KEY)
      // Only use the cache if it was recorded against THIS licence key.
      // Without this check a stale cache (from a previous key, or from
      // before a wrangler KV reset) keeps showing fake credits while
      // /chat 401s on every send.
      if (cached?.key === key) return cached.info
    }

    try {
      const response = await fetch(`${this.backendUrl}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenceKey: key }),
      })

      if (!response.ok) {
        // Clear any stale cache so we don't keep returning the old "valid" record.
        await this.context.globalState.update(CACHE_KEY, undefined)
        return fallback
      }

      const info = await response.json() as LicenceInfo
      await this.context.globalState.update(CACHE_KEY, { key, info })
      return info
    } catch {
      // Offline — return last cached result only if it matches the current key.
      const cached = this.context.globalState.get<{ key: string; info: LicenceInfo }>(CACHE_KEY)
      return cached?.key === key ? cached.info : fallback
    }
  }
}
