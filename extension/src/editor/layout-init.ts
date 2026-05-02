import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

const SETTINGS_KEY = 'storyline.layoutInitDone'

const VSCODE_SETTINGS = {
  'workbench.activityBar.location': 'top',
}

export async function initLayout(context: vscode.ExtensionContext): Promise<void> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders?.length) return

  const root = folders[0].uri.fsPath
  const done = context.globalState.get<boolean>(SETTINGS_KEY)

  if (!done) {
    try {
      const vscodeDir = path.join(root, '.vscode')
      fs.mkdirSync(vscodeDir, { recursive: true })
      const settingsPath = path.join(vscodeDir, 'settings.json')

      let existing: Record<string, unknown> = {}
      try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) } catch { /* new file */ }

      const merged = { ...existing, ...VSCODE_SETTINGS }
      fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
    } catch { /* non-fatal */ }

    await context.globalState.update(SETTINGS_KEY, true)
  }

  // Create first chapter file (silently — for later, when the user starts drafting)
  const chapter01 = path.join(root, 'manuscript', 'chapter-01.md')
  if (!fs.existsSync(chapter01)) {
    try {
      fs.mkdirSync(path.join(root, 'manuscript'), { recursive: true })
      const projectName = readProjectName(root)
      fs.writeFileSync(chapter01, `# ${projectName}\n\n`, 'utf-8')
    } catch { /* non-fatal */ }
  }

  // Open chapter-01.md in column 1
  try {
    const uri = vscode.Uri.file(chapter01)
    await vscode.commands.executeCommand('storyline.openEditor', uri)
  } catch { /* panel not ready yet */ }

  // Clean layout: close auxiliary bar, focus Explorer, ensure no extension
  // panels steal the sidebar. Runs after a brief beat so VS Code's view
  // restoration is complete.
  await new Promise(r => setTimeout(r, 300))
  await ensureExplorerFocus()
}

async function ensureExplorerFocus(): Promise<void> {
  try { await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar') } catch { /* */ }
  try { await vscode.commands.executeCommand('workbench.action.closePanel') } catch { /* */ }
  try { await vscode.commands.executeCommand('workbench.view.explorer') } catch { /* */ }
  try { await vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer') } catch { /* */ }
}

function readProjectName(root: string): string {
  try {
    const statePath = path.join(root, '.storyline', 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    return state?.projectName ?? 'Chapter 1'
  } catch {
    return 'Chapter 1'
  }
}
