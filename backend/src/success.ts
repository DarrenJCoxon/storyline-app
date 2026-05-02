import type { Env } from './types.js'

const GITHUB_REPO = 'DarrenJCoxon/storyline-app'
const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases/latest`

interface GithubAsset { name: string; browser_download_url: string }
interface GithubRelease { tag_name: string; assets: GithubAsset[] }

async function getLatestRelease(): Promise<GithubRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'storyline-backend' },
    })
    if (!res.ok) return null
    return await res.json() as GithubRelease
  } catch {
    return null
  }
}

function detectOS(ua: string): 'mac' | 'windows' | 'unknown' {
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac'
  if (/Windows/i.test(ua)) return 'windows'
  return 'unknown'
}

export async function handleSuccess(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('session_id')

  if (!sessionId) {
    return html(errorPage('No session ID found. If you just purchased, check your email or contact support.'))
  }

  const licenceKey = await env.LICENCES.get(`session:${sessionId}`)
  if (!licenceKey) {
    return html(errorPage('Session not found or expired. Your licence key may have already been shown — check your email or contact support at coxondj@gmail.com.'))
  }

  const ua = req.headers.get('User-Agent') ?? ''
  const os = detectOS(ua)
  const release = await getLatestRelease()

  const downloadLinks = buildDownloadLinks(os, release)

  return html(successPage(licenceKey, downloadLinks))
}

interface DownloadLinks {
  primary: { label: string; url: string } | null
  secondary: { label: string; url: string } | null
  fallback: string
}

function buildDownloadLinks(os: 'mac' | 'windows' | 'unknown', release: GithubRelease | null): DownloadLinks {
  if (!release?.assets.length) {
    return { primary: null, secondary: null, fallback: RELEASES_URL }
  }

  const assets = release.assets
  const find = (pattern: RegExp) => assets.find(a => pattern.test(a.name))

  if (os === 'mac') {
    const silicon = find(/aarch64\.dmg$/i)
    const intel = find(/x64\.dmg$/i)
    return {
      primary: silicon ? { label: 'Download for Mac (Apple Silicon)', url: silicon.browser_download_url } : null,
      secondary: intel ? { label: 'Download for Mac (Intel)', url: intel.browser_download_url } : null,
      fallback: RELEASES_URL,
    }
  }

  if (os === 'windows') {
    const exe = find(/x64-setup\.exe$/i) ?? find(/\.msi$/i)
    return {
      primary: exe ? { label: 'Download for Windows', url: exe.browser_download_url } : null,
      secondary: null,
      fallback: RELEASES_URL,
    }
  }

  // Unknown OS — show both platforms
  const silicon = find(/aarch64\.dmg$/i)
  const intel = find(/x64\.dmg$/i)
  const win = find(/x64-setup\.exe$/i) ?? find(/\.msi$/i)
  return {
    primary: silicon ? { label: 'Download for Mac (Apple Silicon)', url: silicon.browser_download_url } : null,
    secondary: intel ? { label: 'Download for Mac (Intel)', url: intel.browser_download_url } : null,
    fallback: win?.browser_download_url ?? RELEASES_URL,
  }
}

function downloadButtons(links: DownloadLinks): string {
  const btn = (label: string, url: string, primary: boolean) =>
    `<a href="${url}" class="dl-btn${primary ? ' primary' : ''}">${label}</a>`

  const parts: string[] = []
  if (links.primary) parts.push(btn(links.primary.label, links.primary.url, true))
  if (links.secondary) parts.push(btn(links.secondary.label, links.secondary.url, false))
  if (!links.primary && !links.secondary) {
    parts.push(btn('Download Installer', links.fallback, true))
  }
  if (links.secondary || (!links.primary && links.fallback !== RELEASES_URL)) {
    parts.push(`<a href="${RELEASES_URL}" class="dl-link">All downloads</a>`)
  }

  return parts.join('\n')
}

function successPage(licenceKey: string, links: DownloadLinks): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Storyline — Purchase Complete</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #e8e8e8; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; max-width: 560px; width: 100%; padding: 40px; }
    .check { width: 48px; height: 48px; background: #16a34a; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; }
    .check svg { width: 24px; height: 24px; stroke: white; fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
    .subtitle { color: #888; font-size: 15px; margin-bottom: 32px; }
    .label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 8px; }
    .key-box { background: #0f0f0f; border: 1px solid #333; border-radius: 8px; padding: 14px 18px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 14px; letter-spacing: 0.05em; color: #a78bfa; display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .copy-btn { background: #2a2a2a; border: none; color: #e8e8e8; font-size: 12px; padding: 5px 12px; border-radius: 6px; cursor: pointer; transition: background 0.15s; flex-shrink: 0; margin-left: 12px; }
    .copy-btn:hover { background: #3a3a3a; }
    .activate-btn { display: block; text-align: center; padding: 16px 24px; border-radius: 10px; font-size: 17px; font-weight: 600; text-decoration: none; margin-bottom: 14px; background: #16a34a; color: white; transition: background 0.15s; }
    .activate-btn:hover { background: #15803d; }
    .dl-btn { display: block; text-align: center; padding: 12px 20px; border-radius: 8px; font-size: 15px; font-weight: 500; text-decoration: none; margin-bottom: 10px; transition: opacity 0.15s; }
    .dl-btn.primary { background: #7c3aed; color: white; }
    .dl-btn.primary:hover { opacity: 0.9; }
    .dl-btn:not(.primary) { background: #2a2a2a; color: #e8e8e8; }
    .dl-btn:not(.primary):hover { background: #333; }
    .dl-link { display: block; text-align: center; font-size: 13px; color: #666; text-decoration: none; margin-top: 4px; margin-bottom: 20px; }
    .dl-link:hover { color: #888; }
    .divider { border: none; border-top: 1px solid #2a2a2a; margin: 24px 0; }
    .steps h2 { font-size: 14px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 16px; }
    .step { display: flex; gap: 12px; margin-bottom: 14px; align-items: flex-start; }
    .step-num { width: 22px; height: 22px; border-radius: 50%; background: #2a2a2a; font-size: 12px; font-weight: 600; color: #888; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
    .step-text { font-size: 14px; color: #bbb; line-height: 1.5; }
    .step-text code { background: #2a2a2a; padding: 1px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; color: #e8e8e8; }
    .note { margin-top: 24px; padding: 14px 16px; background: #1e1a00; border: 1px solid #3d3200; border-radius: 8px; font-size: 13px; color: #cca300; line-height: 1.5; }
    .note a { color: #cca300; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">
      <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <h1>You're all set</h1>
    <p class="subtitle">One click activates Storyline on this computer.</p>

    <a href="vscode://darrenjcoxon.storyline-extension/activate?key=${licenceKey}" class="activate-btn">
      Activate Storyline →
    </a>
    <p style="text-align:center; color:#888; font-size:12px; margin-bottom:24px;">
      This opens your installed Storyline (VS Code) and applies your credits automatically.
    </p>

    <hr class="divider">

    <div class="label">Don't have Storyline installed yet?</div>
    ${downloadButtons(links)}
    <p style="text-align:center; color:#888; font-size:12px; margin-top:4px; margin-bottom:24px;">
      Install the app, then come back to this page and click Activate Storyline above.
    </p>

    <hr class="divider">

    <div class="label">Adding to a second device?</div>
    <p style="color:#888; font-size:13px; margin-bottom:10px; line-height:1.5;">
      Save the licence key below — paste it into the "Paste key from email" prompt on your other machine.
    </p>
    <div class="key-box">
      <span id="key">${licenceKey}</span>
      <button class="copy-btn" onclick="copyKey()">Copy</button>
    </div>

    <div class="note">
      Save this page or note your key — it's also in your purchase confirmation email. Questions? Email <a href="mailto:coxondj@gmail.com">coxondj@gmail.com</a>.
    </div>
  </div>

  <script>
    function copyKey() {
      const key = document.getElementById('key').textContent
      navigator.clipboard.writeText(key).then(() => {
        const btn = document.querySelector('.copy-btn')
        btn.textContent = 'Copied!'
        setTimeout(() => { btn.textContent = 'Copy' }, 2000)
      })
    }
  </script>
</body>
</html>`
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Storyline — Error</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f0f0f; color: #e8e8e8; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; max-width: 480px; width: 100%; padding: 40px; }
    h1 { font-size: 20px; margin-bottom: 12px; }
    p { color: #888; font-size: 15px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Something went wrong</h1>
    <p>${message}</p>
  </div>
</body>
</html>`
}

function html(body: string): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
