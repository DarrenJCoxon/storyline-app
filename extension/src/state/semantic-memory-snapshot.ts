import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { getSemanticMemoryService } from './semantic-memory-service.js'
import { readSemanticMemoryConfig } from './semantic-memory.js'
import {
  openProjectStore,
  closeStore,
  type StorylineNuVector,
} from '@storyline/core/dist/nuvector.js'
import { logError, logInfo } from '../diagnostic-log.js'

/**
 * NT-17 — snapshot / export the semantic memory.
 *
 * NuVector ships a snapshot() / restore() pair that serialises the
 * full store state to a single file. Surface them as commands so
 * writers can:
 *   - back up the index alongside the manuscript
 *   - migrate the index to a new machine without re-embedding
 *   - share an index with a co-author working on the same project
 *
 * The snapshot file is JSON (NuVector's native format) — `git diff` can
 * read it, but it's bulky enough that the default project .gitignore
 * should skip it. Writers who want to commit it for shared workflows
 * can opt in.
 */

export async function exportSemanticMemoryCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    void vscode.window.showWarningMessage('Open a Storyline project first.')
    return
  }

  if (!readSemanticMemoryConfig().enabled) {
    void vscode.window.showInformationMessage(
      'Enable storyline.semanticMemory.enabled before exporting.',
    )
    return
  }

  const service = getSemanticMemoryService()
  if (!service) {
    void vscode.window.showWarningMessage('Semantic memory service not ready.')
    return
  }

  const snapshotPath = await pickSnapshotPath(folder.uri.fsPath, 'export')
  if (!snapshotPath) return

  const projectRoot = folder.uri.fsPath
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Storyline — exporting semantic memory to ${path.basename(snapshotPath)}`,
    },
    async () => {
      // NuVector's snapshot uses the current store handle. We use a fresh
      // openProjectStore here so we don't fight with the long-lived
      // service handle for write contention; v0.1.5 doesn't need this in
      // theory, but being explicit avoids any future surprise.
      const cfg = readSemanticMemoryConfig()
      let store: StorylineNuVector | null = null
      try {
        store = await openProjectStore(projectRoot, { tenant: cfg.tenant })
        await store.snapshot(snapshotPath)
        logInfo(`[Storyline] semantic-memory exported → ${snapshotPath}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logError(`[Storyline] semantic-memory export failed: ${msg}`)
        void vscode.window.showErrorMessage(`Export failed: ${msg}`)
      } finally {
        if (store) {
          try { await closeStore(store) } catch { /* ignore */ }
        }
      }
    },
  )

  if (fs.existsSync(snapshotPath)) {
    const open = await vscode.window.showInformationMessage(
      `Exported to ${snapshotPath}.`,
      'Reveal in Finder',
    )
    if (open === 'Reveal in Finder') {
      void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(snapshotPath))
    }
  }
}

export async function importSemanticMemoryCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    void vscode.window.showWarningMessage('Open a Storyline project first.')
    return
  }

  if (!readSemanticMemoryConfig().enabled) {
    void vscode.window.showInformationMessage(
      'Enable storyline.semanticMemory.enabled before importing.',
    )
    return
  }

  const picked = await vscode.window.showOpenDialog({
    title: 'Pick a Storyline semantic-memory snapshot',
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { Snapshot: ['json', 'nv'] },
  })
  if (!picked || picked.length === 0) return

  const confirm = await vscode.window.showWarningMessage(
    'Importing will overwrite this project\'s current semantic memory. Continue?',
    { modal: true },
    'Import',
  )
  if (confirm !== 'Import') return

  const projectRoot = folder.uri.fsPath
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Storyline — importing ${path.basename(picked[0].fsPath)}`,
    },
    async () => {
      const cfg = readSemanticMemoryConfig()
      let store: StorylineNuVector | null = null
      try {
        store = await openProjectStore(projectRoot, { tenant: cfg.tenant })
        await store.restore(picked[0].fsPath)
        logInfo(`[Storyline] semantic-memory imported ← ${picked[0].fsPath}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logError(`[Storyline] semantic-memory import failed: ${msg}`)
        void vscode.window.showErrorMessage(`Import failed: ${msg}`)
      } finally {
        if (store) {
          try { await closeStore(store) } catch { /* ignore */ }
        }
      }
    },
  )

  void vscode.window.showInformationMessage(
    'Import complete. Reload the window if your active sessions appear stale.',
  )
}

async function pickSnapshotPath(
  projectRoot: string,
  mode: 'export' | 'import',
): Promise<string | null> {
  const stamp = new Date().toISOString().slice(0, 10)
  const defaultPath = path.join(projectRoot, '.storyline', `nuvector-snapshot-${stamp}.json`)
  if (mode === 'import') return defaultPath
  const picked = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(defaultPath),
    title: 'Export Storyline semantic memory',
    filters: { Snapshot: ['json'] },
  })
  return picked ? picked.fsPath : null
}
