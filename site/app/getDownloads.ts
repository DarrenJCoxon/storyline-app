// Resolve installer download URLs from the GitHub Releases API at request
// time. We can't rely on /releases/latest alone because we ship two kinds
// of release tag:
//   - `v*`           — full installer build with DMG/MSI/VSIX assets
//   - `extension-v*` — VSIX-only fast-iteration release (no installer)
//
// Both are now published as non-prereleases (so the GitHub "Latest" badge
// tracks whichever is genuinely most recent), but only the `v*` ones
// have the installer assets the homepage download buttons need. Walk
// /releases (newest first by published_at) and pick the most recent
// release that has at least one installer asset; ignore extension-only
// releases that don't.
//
// Cached for 10 minutes via Next.js fetch revalidate, so this is one API
// call per region per 10 min, well inside GitHub's unauthenticated limit.

const REPO = 'DarrenJCoxon/storyline-app'
const RELEASES_PAGE = `https://github.com/${REPO}/releases`

export type Downloads = {
  macAppleSilicon: { label: string; url: string }
  macIntel:        { label: string; url: string }
  windows:         { label: string; url: string }
}

type Asset = { name: string; browser_download_url: string }
type Release = {
  tag_name?: string
  published_at?: string
  prerelease?: boolean
  assets?: Asset[]
}

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

function hasInstallerAsset(assets: Asset[]): boolean {
  return assets.some(a =>
    a.name.endsWith('_aarch64.dmg') ||
    a.name.endsWith('_x64.dmg') ||
    a.name.endsWith('_x64-setup.exe'),
  )
}

export async function getDownloads(): Promise<Downloads> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
      next: { revalidate: 600 },
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const releases = (await res.json()) as Release[]
    if (!Array.isArray(releases)) throw new Error('releases response wasn\'t an array')

    // Sort by published_at desc — GitHub groups non-prereleases above
    // prereleases otherwise, which can hide a newer release behind an
    // older one in API order. Then pick the first release that has at
    // least one installer asset.
    const sorted = [...releases].sort((a, b) => {
      const ta = a.published_at ? Date.parse(a.published_at) : 0
      const tb = b.published_at ? Date.parse(b.published_at) : 0
      return tb - ta
    })
    const installerRelease = sorted.find(r => hasInstallerAsset(r.assets ?? []))
    const assets = installerRelease?.assets ?? []

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
