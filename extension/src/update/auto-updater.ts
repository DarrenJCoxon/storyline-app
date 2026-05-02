import * as https from 'https'
import * as http from 'http'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { logInfo } from '../diagnostic-log.js'

const GITHUB_REPO = 'DarrenJCoxon/storyline-app'
// Auto-check throttle. We ship multiple versions in some days, so the
// previous 24h cooldown meant users opening VS Code daily would see at
// most one update notification per day regardless of how many versions
// actually shipped. 4h surfaces same-day shipments while still keeping
// GitHub's unauthenticated rate limit (60/hr/IP) comfortably untouched.
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
const LAST_CHECK_KEY = 'storyline.lastUpdateCheck'
// Per-version snooze: when the user clicks "Later", suppress further
// nags for THAT specific tag for 24h. New tags ignore the snooze and
// notify immediately. Without this we'd either pester ("Later" is
// useless) or silence forever ("Later" too sticky).
const SNOOZED_VERSION_KEY = 'storyline.snoozedUpdateVersion'
const SNOOZED_UNTIL_KEY = 'storyline.snoozedUpdateUntil'
const SNOOZE_MS = 24 * 60 * 60 * 1000

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
    if (!release.tag_name) {
      logInfo('[Storyline] auto-update: GitHub response had no tag_name (rate limited?)')
      return null
    }
    return release
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logInfo(`[Storyline] auto-update: failed to fetch latest release — ${msg}`)
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

/**
 * Check the GitHub releases endpoint for a newer VSIX and offer the user
 * an in-place update.
 *
 * @param context Extension context for globalState persistence.
 * @param opts.force When true, bypasses the throttle and per-version
 *                   snooze. Set by the manual "Storyline: Check for
 *                   Updates" command. Also surfaces an info toast when
 *                   no update is available, so the user knows the check
 *                   actually ran.
 */
export async function checkForUpdate(
  context: vscode.ExtensionContext,
  opts: { force?: boolean } = {},
): Promise<void> {
  const force = opts.force === true

  if (!force) {
    const lastCheck = context.globalState.get<number>(LAST_CHECK_KEY, 0)
    if (Date.now() - lastCheck < CHECK_INTERVAL_MS) {
      logInfo('[Storyline] auto-update: throttled, skipping (last check < 4h ago)')
      return
    }
  }

  logInfo(`[Storyline] auto-update: ${force ? 'forced' : 'scheduled'} check starting`)

  const release = await getLatestRelease()
  if (!release) {
    // DON'T persist the cooldown on failure — a transient network blip
    // or GitHub rate-limit shouldn't lock out the next check for 4h.
    if (force) {
      void vscode.window.showWarningMessage(
        'Storyline: couldn\'t reach GitHub to check for updates. Try again in a few minutes.',
      )
    }
    return
  }

  // Persist the cooldown only after a successful fetch so failures retry
  // on the next activation.
  await context.globalState.update(LAST_CHECK_KEY, Date.now())
  logInfo(`[Storyline] auto-update: latest = ${release.tag_name}`)

  const installedVersion = vscode.extensions.getExtension('darrenjcoxon.storyline-extension')?.packageJSON?.version as string | undefined
  if (!installedVersion) {
    logInfo('[Storyline] auto-update: could not read installed version, skipping')
    return
  }
  logInfo(`[Storyline] auto-update: installed = ${installedVersion}`)

  if (compareVersions(release.tag_name, installedVersion) <= 0) {
    logInfo('[Storyline] auto-update: already up to date')
    if (force) {
      void vscode.window.showInformationMessage(
        `Storyline is up to date (${installedVersion}).`,
      )
    }
    return
  }

  // Honour any per-version snooze the user set by clicking "Later".
  // Snooze only applies to the SAME tag — a newer release ignores it
  // and notifies immediately.
  if (!force) {
    const snoozedTag = context.globalState.get<string>(SNOOZED_VERSION_KEY)
    const snoozedUntil = context.globalState.get<number>(SNOOZED_UNTIL_KEY, 0)
    if (snoozedTag === release.tag_name && Date.now() < snoozedUntil) {
      logInfo(`[Storyline] auto-update: ${release.tag_name} snoozed by user, skipping prompt`)
      return
    }
  }

  const vsixAsset = release.assets.find(a => a.name.endsWith('.vsix'))

  if (!vsixAsset) {
    logInfo('[Storyline] auto-update: release has no VSIX asset, falling back to "Open Releases"')
    const choice = await vscode.window.showInformationMessage(
      `Storyline ${release.tag_name} is available (installed: ${installedVersion}).`,
      'Open Releases',
      'Later',
    )
    if (choice === 'Open Releases') {
      void vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${GITHUB_REPO}/releases/latest`))
    } else if (choice === 'Later') {
      await snoozeVersion(context, release.tag_name)
    }
    return
  }

  const choice = await vscode.window.showInformationMessage(
    `Storyline ${release.tag_name} is available (installed: ${installedVersion}).`,
    'Update Now',
    'Later',
  )
  if (choice === 'Later') {
    await snoozeVersion(context, release.tag_name)
    logInfo(`[Storyline] auto-update: user picked Later for ${release.tag_name}`)
    return
  }
  if (choice !== 'Update Now') {
    // Notification dismissed without a choice (timed out / closed).
    // Don't snooze — re-prompt next activation.
    return
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Storyline: downloading update…', cancellable: false },
    async () => {
      const tmpPath = path.join(os.tmpdir(), `storyline-${release.tag_name}.vsix`)
      try {
        await downloadFile(vsixAsset.browser_download_url, tmpPath)
        const installed = await tryInstallVsix(tmpPath)
        if (installed) {
          logInfo(`[Storyline] auto-update: installed ${release.tag_name}`)
          const reload = await vscode.window.showInformationMessage(
            `Storyline updated to ${release.tag_name}. Reload VS Code to activate.`,
            'Reload Now',
          )
          if (reload === 'Reload Now') {
            void vscode.commands.executeCommand('workbench.action.reloadWindow')
          }
        } else {
          logInfo(`[Storyline] auto-update: tryInstallVsix failed for ${release.tag_name}`)
          const choice = await vscode.window.showWarningMessage(
            'Storyline update downloaded but couldn\'t be installed automatically. Install via the Extensions view → ⋯ menu → "Install from VSIX…"',
            'Reveal VSIX',
          )
          if (choice === 'Reveal VSIX') {
            void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(tmpPath))
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logInfo(`[Storyline] auto-update: download failed — ${msg}`)
        void vscode.window.showWarningMessage('Storyline: update download failed. Check your internet connection.')
      }
    },
  )
}

async function snoozeVersion(context: vscode.ExtensionContext, tag: string): Promise<void> {
  await context.globalState.update(SNOOZED_VERSION_KEY, tag)
  await context.globalState.update(SNOOZED_UNTIL_KEY, Date.now() + SNOOZE_MS)
}
