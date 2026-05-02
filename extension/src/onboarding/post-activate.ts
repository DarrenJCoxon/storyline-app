import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { scaffoldProject } from './project-scaffold.js'

/**
 * One-click forward into a working Storyline session — used by every
 * activation path (Start Free button, welcome notification, Stripe
 * deep-link). Scaffolds the workspace if needed, opens the welcome doc
 * preview in column 1, and opens the planning chat beside it.
 *
 * Order matters: the welcome doc opens FIRST so the rendered preview
 * lives in column 1. Doing it after the chat is opened would land the
 * preview in chat's column and visually hide it.
 *
 * Quietly no-ops on workspaces with no folder (notifies the user
 * instead) so the activation never silently swallows.
 */
export async function postActivateOpenWorkspace(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders?.length) {
    void vscode.window.showInformationMessage(
      'Storyline is activated. Open a folder to start your first book — File → Open Folder.',
    )
    return
  }

  const projectDir = folders[0].uri.fsPath
  const stateFile = path.join(projectDir, '.storyline', 'state.json')
  if (!fs.existsSync(stateFile)) {
    try {
      scaffoldProject(projectDir, folders[0].name)
    } catch (err) {
      console.error('[Storyline] postActivate: scaffold failed', err)
    }
  }

  const welcomeUri = vscode.Uri.file(path.join(projectDir, 'docs', 'welcome.md'))
  if (fs.existsSync(welcomeUri.fsPath)) {
    try {
      const doc = await vscode.workspace.openTextDocument(welcomeUri)
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.One,
        preview: false,
      })
      await vscode.commands.executeCommand('markdown.showPreview', welcomeUri)
      // Close the raw markdown source tab — leaves only the rendered
      // preview in column 1.
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    } catch (err) {
      console.error('[Storyline] postActivate: welcome doc open failed', err)
    }
  }

  await vscode.commands.executeCommand('storyline.openPlanning')
}
