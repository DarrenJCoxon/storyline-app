import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { ensureOptIn, readSemanticMemoryConfig } from './semantic-memory.js'
import { reindexSemanticMemoryCommand } from './semantic-memory-reindex.js'
import { logInfo, logError } from '../diagnostic-log.js'

/**
 * Discoverable palette entries for the semantic-memory feature. Without
 * these, the only way to enable was to invoke a command that *uses*
 * semantic memory (search / reindex / why) and rely on its first-run
 * dialog — which is fine in theory but invisible to a writer who
 * doesn't already know the feature exists.
 */

const CFG_KEY = 'storyline.semanticMemory.enabled'

export async function enableSemanticMemoryCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    void vscode.window.showWarningMessage('Open a Storyline project first.')
    return
  }

  const cfgBefore = readSemanticMemoryConfig()
  if (cfgBefore.enabled) {
    void vscode.window.showInformationMessage(
      'Semantic memory is already enabled. Run "Storyline: Re-index Semantic Memory" if you want to refresh the index.',
    )
    return
  }

  const outcome = await ensureOptIn()
  if (outcome !== 'enabled') {
    // Either declined or already-declined; ensureOptIn handled the dialog.
    return
  }

  // Just enabled — offer to backfill the index now.
  const choice = await vscode.window.showInformationMessage(
    'Semantic memory is on. Index this project now so the AI can search everything you\'ve already written?',
    'Index now',
    'Later',
  )
  if (choice === 'Index now') {
    await reindexSemanticMemoryCommand()
  }
}

export async function disableSemanticMemoryCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    void vscode.window.showWarningMessage('Open a Storyline project first.')
    return
  }

  const cfg = readSemanticMemoryConfig()
  if (!cfg.enabled) {
    void vscode.window.showInformationMessage('Semantic memory is already off.')
    return
  }

  const confirm = await vscode.window.showWarningMessage(
    'Disable semantic memory? Future saves will no longer be indexed.',
    { modal: true },
    'Disable',
  )
  if (confirm !== 'Disable') return

  await vscode.workspace.getConfiguration().update(
    CFG_KEY,
    false,
    vscode.ConfigurationTarget.Workspace,
  )
  logInfo('[Storyline] semantic memory disabled')

  const choice = await vscode.window.showInformationMessage(
    'Semantic memory disabled. Delete the local index too? Choosing "Keep" lets you re-enable later without re-indexing from scratch.',
    'Delete index',
    'Keep index',
  )
  if (choice !== 'Delete index') return

  const indexPath = path.join(folder.uri.fsPath, '.storyline', 'memory.nv')
  try {
    await fs.rm(indexPath, { recursive: true, force: true })
    void vscode.window.showInformationMessage('Local semantic-memory index deleted.')
    logInfo(`[Storyline] semantic-memory index removed: ${indexPath}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logError(`[Storyline] failed to delete index: ${msg}`)
    void vscode.window.showErrorMessage(`Could not delete index — see Storyline log.`)
  }
}
