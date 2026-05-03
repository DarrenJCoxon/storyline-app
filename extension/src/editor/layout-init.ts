import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

const SETTINGS_KEY = 'storyline.layoutInitDone'

export async function initLayout(context: vscode.ExtensionContext): Promise<void> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders?.length) return

  const root = folders[0].uri.fsPath

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

  // Open the planning chat for returning users
  try { await vscode.commands.executeCommand('storyline.openPlanning') } catch { /* */ }

  // Reveal Storyline's own sidebar container once. No retries — the user
  // can always click the Storyline icon in the activity bar to return.
  try {
    await vscode.commands.executeCommand('workbench.view.extension.storyline-sidebar')
  } catch { /* non-fatal if called before container registers */ }

  await context.globalState.update(SETTINGS_KEY, true)
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
