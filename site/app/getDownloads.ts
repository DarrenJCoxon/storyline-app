// Resolve installer download URLs from the GitHub Releases API at request
// time so a new release tag (e.g. v0.2.4 → Storyline.Installer_0.2.4_*.dmg)
// is picked up automatically — no site code change, no version constant
// to keep in sync with installer/src-tauri/tauri.conf.json.
//
// Cached for 10 minutes via Next.js fetch revalidate, so this is one API
// call per region per 10 min, well inside GitHub's unauthenticated limit.

const REPO = 'DarrenJCoxon/storyline-app'
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`

export type Downloads = {
  macAppleSilicon: { label: string; url: string }
  macIntel:        { label: string; url: string }
  windows:         { label: string; url: string }
}

type Asset = { name: string; browser_download_url: string }
type Release = { assets?: Asset[] }

const LABELS = {
  macAppleSilicon: 'Mac (Apple Silicon — M1, M2, M3, M4)',
  macIntel:        'Mac (Intel — older Macs)',
  windows:         'Windows 10 or 11',
} as const

// Match the Tauri bundler's filename suffixes. The version segment in the
// middle changes every release, so we match by suffix only.
function pickAsset(assets: Asset[], match: (name: string) => boolean): string | null {
  return assets.find(a => match(a.name))?.browser_download_url ?? null
}

export async function getDownloads(): Promise<Downloads> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      next: { revalidate: 600 },
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const release = (await res.json()) as Release
    const assets = release.assets ?? []

    const aarch64 = pickAsset(assets, n => n.endsWith('_aarch64.dmg'))
    const x64dmg  = pickAsset(assets, n => n.endsWith('_x64.dmg'))
    const winExe  = pickAsset(assets, n => n.endsWith('_x64-setup.exe'))

    return {
      macAppleSilicon: { label: LABELS.macAppleSilicon, url: aarch64 ?? RELEASES_PAGE },
      macIntel:        { label: LABELS.macIntel,        url: x64dmg  ?? RELEASES_PAGE },
      windows:         { label: LABELS.windows,         url: winExe  ?? RELEASES_PAGE },
    }
  } catch {
    // Network or rate-limit failure: send users to the releases page so
    // they can still pick the right asset by hand.
    return {
      macAppleSilicon: { label: LABELS.macAppleSilicon, url: RELEASES_PAGE },
      macIntel:        { label: LABELS.macIntel,        url: RELEASES_PAGE },
      windows:         { label: LABELS.windows,         url: RELEASES_PAGE },
    }
  }
}
