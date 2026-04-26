import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

export async function shouldShowOnboarding(context: vscode.ExtensionContext): Promise<boolean> {
  const hasProject = hasStorylineProject()
  const hasCredential = await hasAnyCredential(context)
  return !hasProject || !hasCredential
}

function hasStorylineProject(): boolean {
  const folders = vscode.workspace.workspaceFolders
  if (!folders?.length) return false
  const stateFile = path.join(folders[0].uri.fsPath, '.storyline', 'state.json')
  return fs.existsSync(stateFile)
}

async function hasAnyCredential(context: vscode.ExtensionContext): Promise<boolean> {
  const key = await context.secrets.get('storyline.licenceKey')
  if (key) return true
  const byok = context.globalState.get('storyline.byokConfig')
  if (byok) return true
  const ollama = context.globalState.get<boolean>('storyline.ollamaEnabled')
  return ollama ?? false
}
