import * as vscode from 'vscode'

const SECRET_KEY = 'storyline.licenceKey'
const CACHE_KEY  = 'storyline.licenceCache'

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

  async validate(opts: { useCache?: boolean } = {}): Promise<LicenceInfo> {
    const fallback: LicenceInfo = { valid: false, type: 'free', creditBalance: 0 }

    const key = await this.getLicenceKey()
    if (!key) return fallback

    if (opts.useCache) {
      const cached = this.context.globalState.get<LicenceInfo>(CACHE_KEY)
      if (cached) return cached
    }

    try {
      const response = await fetch(`${this.backendUrl}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenceKey: key }),
      })

      if (!response.ok) return fallback

      const info = await response.json() as LicenceInfo
      // Cache the result so activation works offline after first success
      await this.context.globalState.update(CACHE_KEY, info)
      return info
    } catch {
      // Offline — return last cached result if available
      return this.context.globalState.get<LicenceInfo>(CACHE_KEY) ?? fallback
    }
  }
}
