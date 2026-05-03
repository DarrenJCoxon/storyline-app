import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { scaffoldProject } from './project-scaffold.js'
import { ChatPanel } from '../panels/ChatPanel.js'
import { logError } from '../diagnostic-log.js'
import { WelcomePanel } from '../panels/WelcomePanel.js'
import { scheduleExplorerFocusRetries } from '../editor/layout-init.js'

/**
 * Tabs/labels we recognise as VS Code's default welcome / get-started UI
 * (and adjacent noise we want to clear so the activation lands on a clean
 * three-column Storyline layout). Match is case-insensitive substring.
 */
const NOISE_TAB_LABELS = [
  'welcome',
  'get started',
  'getting started',
  'release notes',
]

/**
 * One-click forward into a working Storyline session — used by every
 * activation path (Start Free button, welcome notification, Stripe
 * deep-link, Reset & start over). Produces a clean three-column layout:
 *
 *   [ Explorer ] | [ Storyline Welcome ] | [ Storyline Chat ]
 *
 * No VS Code Get Started tab, no auxiliary bar, no right-side Copilot
 * chat, no extension-noise tabs.
 *
 * Why each step:
 *   1. Scaffold the workspace if the project doesn't exist yet.
 *   2. Wipe stale conversation files — Reset & start over re-mints a key
 *      and the chat panel reads turn history from these files; old turns
 *      cause fireOpeningPrompt to skip and the user sees a silent chat.
 *   3. Dispose existing Storyline panels so they re-init cleanly.
 *   4. Close VS Code's default welcome / get-started tabs and any
 *      auxiliary panel that's holding focus.
 *   5. Show the Explorer in column 0 (file tree).
 *   6. Open Storyline Welcome in column 1 (rendered guide).
 *   7. Open Storyline Chat in column 2 (planning conversation).
 */
export async function postActivateOpenWorkspace(
  context: vscode.ExtensionContext,
  extensionUri: vscode.Uri,
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders?.length) {
    void vscode.window.showInformationMessage(
      'Storyline is activated. Open a folder to start your first book — File → Open Folder.',
    )
    return
  }

  const projectDir = folders[0].uri.fsPath

  // 1. Scaffold the project layout. Always runs — scaffoldProject is fully
  //    idempotent (mkdir -p, writeIfMissing, plus a placeholder-state check
  //    inside) and handles the case where the Tauri installer pre-created
  //    only `.storyline/state.json` with `{}` to satisfy the extension's
  //    workspaceContains activation event. Without this, manuscript/,
  //    docs/, output/ never get created on installer-launched projects.
  try {
    scaffoldProject(projectDir, folders[0].name)
  } catch (err) {
    logError('[Storyline] postActivate: scaffold failed', err)
  }

  // 2. Wipe stale conversation files so Reset & start over gets a clean
  //    chat with the AI's opening prompt firing again.
  for (const f of [
    path.join(projectDir, '.storyline', 'conversation.json'),
    path.join(projectDir, '.storyline', 'chat-display.json'),
  ]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch { /* non-fatal */ }
  }

  // 3. Dispose existing Storyline panels so the next show() re-creates
  //    them with fresh state.
  ChatPanel.current()?.dispose()
  WelcomePanel.current()?.dispose()

  // 4. Close VS Code's default welcome / get-started / release-notes tabs
  //    and the auxiliary bar (right-side panels like Copilot Chat).
  await closeNoise()

  // 5. Open Storyline Welcome in column 1 (main editor area).
  WelcomePanel.show(context, extensionUri)

  // Brief beat so the welcome panel renders before chat steals focus.
  await new Promise(r => setTimeout(r, 250))

  // 6. Open Storyline Chat in column 2.
  await vscode.commands.executeCommand('storyline.openPlanning')

  // 7. Make sure the Explorer is visible in the side bar — and focused.
  //    Runs as a spaced-retry chain (50/500/1500/3500/6000ms) because
  //    extensions that activate on `onStartupFinished` (Claude Code,
  //    GitLens, etc.) typically register their own sidebar view at
  //    800-1500ms and would win a single attempt here. Fire-and-forget;
  //    don't await — we want this CTA path to return so VS Code can
  //    finish layout, while the retries pull the Explorer back as
  //    competing extensions settle.
  void scheduleExplorerFocusRetries()
}

/**
 * Close VS Code's default welcome / get-started tabs and the right-side
 * auxiliary bar so the activation lands on a clean Storyline-only layout.
 * Quietly ignores everything that fails — these commands are
 * best-effort cosmetic cleanup, never fatal.
 */
async function closeNoise(): Promise<void> {
  // Close auxiliary bar — this hides Copilot Chat / Cline / any
  // right-side extension panel that was open.
  try { await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar') } catch { /* */ }
  // Close the bottom panel (terminal / problems / output) — lets the
  // user see the chat without a panel below cropping it.
  try { await vscode.commands.executeCommand('workbench.action.closePanel') } catch { /* */ }

  // Close any tab whose label matches the noise set. Iterate over a copy
  // because closing tabs mutates the live list.
  const tabsToClose: vscode.Tab[] = []
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const label = (tab.label ?? '').toLowerCase()
      if (NOISE_TAB_LABELS.some(noise => label.includes(noise))) {
        // Don't close OUR welcome — only VS Code's.
        if (label === 'welcome to storyline') continue
        tabsToClose.push(tab)
      }
    }
  }
  for (const tab of tabsToClose) {
    try { await vscode.window.tabGroups.close(tab) } catch { /* */ }
  }
}
