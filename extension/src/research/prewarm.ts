// CB-20 — Prewarm the research file cache.
//
// PDF/DOCX/EPUB extraction is async (pdf-parse, mammoth, ZIP+inflate).
// The system-prompt builder that reads research/ for AI context is
// synchronous — it reads from the cache at .storyline/research-cache/
// rather than parsing on the fly. This module populates that cache on
// workspace open + when the research dir changes, so by the time the
// AI needs the text it's already plain-text on disk.
//
// Cheap when the cache is fresh (parser short-circuits on mtime check).
// Slow on first run after a writer drops in 50 PDFs — runs in the
// background, doesn't block any user interaction.

import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { parseResearchFile, isSupportedResearchFile, detectFormat } from './file-parser.js'
import { logInfo, logWarn } from '../diagnostic-log.js'

let watcher: vscode.FileSystemWatcher | undefined
let pending: Promise<void> | null = null

export async function prewarmResearchCache(projectDir: string): Promise<void> {
  // Coalesce — multiple callers in flight share one pass.
  if (pending) return pending
  pending = (async () => {
    try {
      const files = collectResearchFiles(projectDir)
      const heavy = files.filter(f => {
        const fmt = detectFormat(f)
        return fmt === 'pdf' || fmt === 'docx' || fmt === 'epub'
      })
      if (heavy.length === 0) return

      logInfo(`[Storyline] research prewarm: ${heavy.length} non-text file(s) to parse`)
      for (const file of heavy) {
        try {
          await parseResearchFile(file, projectDir)
        } catch (err) {
          logWarn(`[Storyline] research prewarm: ${path.basename(file)} failed`, err)
        }
      }
      logInfo('[Storyline] research prewarm: done')
    } finally {
      pending = null
    }
  })()
  return pending
}

function collectResearchFiles(projectDir: string): string[] {
  const root = path.join(projectDir, 'research')
  if (!fs.existsSync(root)) return []
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(full)
      } else if (e.isFile() && isSupportedResearchFile(e.name) && !e.name.startsWith('_')) {
        out.push(full)
      }
    }
  }
  walk(root)
  return out
}

/**
 * Watch research/ for changes and re-prewarm when something binary
 * lands or changes. The first prewarm runs immediately on registration.
 *
 * Wired into activate() under the hasProject gate so non-Storyline
 * workspaces don't spawn the watcher.
 */
export function registerResearchPrewarm(context: vscode.ExtensionContext): void {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return
  const projectDir = folder.uri.fsPath

  // Initial pass — fire-and-forget.
  void prewarmResearchCache(projectDir)

  if (watcher) return  // Already registered

  const pattern = new vscode.RelativePattern(folder, 'research/**/*.{pdf,docx,epub}')
  watcher = vscode.workspace.createFileSystemWatcher(pattern)

  const trigger = (): void => { void prewarmResearchCache(projectDir) }
  context.subscriptions.push(watcher.onDidCreate(trigger))
  context.subscriptions.push(watcher.onDidChange(trigger))
  context.subscriptions.push(watcher)
}
