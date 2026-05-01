import * as https from 'https'
import * as http from 'http'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'

const GITHUB_REPO = 'DarrenJCoxon/storyline-app'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const LAST_CHECK_KEY = 'storyline.lastUpdateCheck'

interface GitHubRelease {
  tag_name: string
  assets: Array<{ name: string; browser_download_url: string }>
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1
  }
  return 0
}

function httpsGetString(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'storyline-vscode-extension' } }, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        resolve(httpsGetString(res.headers.location))
        return
      }
      let data = ''
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const get = (u: string) => {
      const lib = u.startsWith('https') ? https : http
      lib.get(u, { headers: { 'User-Agent': 'storyline-vscode-extension' } }, res => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          get(res.headers.location)
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        res.on('error', reject)
      }).on('error', reject)
    }
    get(url)
  })
}

async function getLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const json = await httpsGetString(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`)
    const release = JSON.parse(json) as GitHubRelease
    if (!release.tag_name) return null
    return release
  } catch {
    return null
  }
}

/**
 * Install a VSIX from inside the running extension host. Uses the built-in
 * `workbench.extensions.installExtension` command which goes through VS Code's
 * extension manager — same code path as right-click → Install in the
 * Extensions view. Critically, this is the *only* supported way to update an
 * already-loaded extension while VS Code is running.
 *
 * Shelling out to `code --install-extension` from in-process produced
 * "Please restart VS Code before reinstalling" errors and left half-extracted
 * directories under ~/.vscode/extensions/ that broke subsequent installs.
 */
async function tryInstallVsix(vsixPath: string): Promise<boolean> {
  try {
    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(vsixPath))
    return true
  } catch {
    return false
  }
}

export async function checkForUpdate(context: vscode.ExtensionContext): Promise<void> {
  const lastCheck = context.globalState.get<number>(LAST_CHECK_KEY, 0)
  if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return
  await context.globalState.update(LAST_CHECK_KEY, Date.now())

  const release = await getLatestRelease()
  if (!release) return

  const installedVersion = vscode.extensions.getExtension('darrenjcoxon.storyline-extension')?.packageJSON?.version as string | undefined
  if (!installedVersion) return
  if (compareVersions(release.tag_name, installedVersion) <= 0) return

  const vsixAsset = release.assets.find(a => a.name.endsWith('.vsix'))

  if (!vsixAsset) {
    const choice = await vscode.window.showInformationMessage(
      `Storyline ${release.tag_name} is available (installed: ${installedVersion}).`,
      'Open Releases'
    )
    if (choice === 'Open Releases') {
      void vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${GITHUB_REPO}/releases/latest`))
    }
    return
  }

  const choice = await vscode.window.showInformationMessage(
    `Storyline ${release.tag_name} is available (installed: ${installedVersion}).`,
    'Update Now',
    'Later'
  )
  if (choice !== 'Update Now') return

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Storyline: downloading update…', cancellable: false },
    async () => {
      const tmpPath = path.join(os.tmpdir(), `storyline-${release.tag_name}.vsix`)
      try {
        await downloadFile(vsixAsset.browser_download_url, tmpPath)
        const installed = await tryInstallVsix(tmpPath)
        if (installed) {
          const reload = await vscode.window.showInformationMessage(
            `Storyline updated to ${release.tag_name}. Reload VS Code to activate.`,
            'Reload Now'
          )
          if (reload === 'Reload Now') {
            void vscode.commands.executeCommand('workbench.action.reloadWindow')
          }
        } else {
          const choice = await vscode.window.showWarningMessage(
            `Storyline update downloaded but couldn't be installed automatically. Install via the Extensions view → ⋯ menu → "Install from VSIX…"`,
            'Reveal VSIX',
          )
          if (choice === 'Reveal VSIX') {
            void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(tmpPath))
          }
        }
      } catch {
        void vscode.window.showWarningMessage('Storyline: update download failed. Check your internet connection.')
      }
    }
  )
}
