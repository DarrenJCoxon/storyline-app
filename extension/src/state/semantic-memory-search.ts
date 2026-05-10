import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { getSemanticMemoryService } from './semantic-memory-service.js'
import { ensureOptIn, readSemanticMemoryConfig } from './semantic-memory.js'
import { logVerbose, logError } from '../diagnostic-log.js'

/**
 * NT-07 — semantic search command. Writer types a query in plain
 * English ("where did I plant the cipher subplot?"), the service
 * embeds it, NuVector returns top results, the UI shows a quick-pick
 * list. Selecting a result jumps to the source file at the right line
 * (or as close as the chunk id can resolve).
 *
 * NT-07a scope: command-palette only. The in-chat `/find` slash
 * command and the persistent sidebar webview are NT-07b — same plumbing,
 * different surfaces.
 */

interface ResolvedTarget {
  uri: vscode.Uri
  /** Optional 1-based line number to reveal at. */
  line?: number
}

/**
 * Map a chunk id (per docs/design/nuos-memory-schema.md §2) back to
 * a file the writer can open. Returns null when the source can't be
 * located on disk.
 */
export function resolveChunkIdToTarget(
  chunkId: string,
  projectRoot: string,
): ResolvedTarget | null {
  // Strip the optional `book:<bookId>/` prefix.
  const stripped = chunkId.replace(/^book:[^/]+\//, '')

  const sceneMatch = /^scene:ch(\d+)-s(\d+)$/.exec(stripped)
  if (sceneMatch) {
    const chapterNumber = parseInt(sceneMatch[1], 10)
    const file = findChapterFile(projectRoot, chapterNumber)
    return file ? { uri: vscode.Uri.file(file) } : null
  }

  const chapterMatch = /^chapter:(\d+)$/.exec(stripped)
  if (chapterMatch) {
    const file = findChapterFile(projectRoot, parseInt(chapterMatch[1], 10))
    return file ? { uri: vscode.Uri.file(file) } : null
  }

  const researchMatch = /^research:(.+)$/.exec(stripped)
  if (researchMatch) {
    const itemId = researchMatch[1]
    const file = path.join(projectRoot, '.storyline', 'research', `${itemId}.md`)
    return fs.existsSync(file) ? { uri: vscode.Uri.file(file) } : null
  }

  const stageMatch = /^stage:([A-Za-z0-9-]+)/.exec(stripped)
  if (stageMatch) {
    const stageId = stageMatch[1]
    // Stage docs are rendered at planning/stages/<id>.md.
    const file = path.join(projectRoot, 'planning', 'stages', `${stageId}.md`)
    if (fs.existsSync(file)) return { uri: vscode.Uri.file(file) }
    // Fall back to state.json — every stage is in there.
    const statePath = path.join(projectRoot, '.storyline', 'state.json')
    return fs.existsSync(statePath) ? { uri: vscode.Uri.file(statePath) } : null
  }

  return null
}

/**
 * Locate the manuscript file for chapter N. Filenames vary
 * (`01.md`, `01-opening.md`, `chapter-1.md`); we accept anything that
 * starts with the right digit run.
 */
function findChapterFile(projectRoot: string, chapterNumber: number): string | null {
  const dir = path.join(projectRoot, 'manuscript')
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return null
  }
  const padded = String(chapterNumber).padStart(2, '0')
  for (const name of entries) {
    if (!name.endsWith('.md')) continue
    const m = /^(?:chapter[-_])?(\d+)/i.exec(name)
    if (!m) continue
    if (parseInt(m[1], 10) !== chapterNumber) continue
    // Prefer exact two-digit prefix for stable round-tripping; otherwise first match.
    if (name.startsWith(padded)) return path.join(dir, name)
    return path.join(dir, name)
  }
  return null
}

interface QuickPickResult extends vscode.QuickPickItem {
  ref: string
  text?: string
}

export async function searchSemanticMemoryCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    void vscode.window.showWarningMessage('Open a Storyline project first.')
    return
  }

  const outcome = await ensureOptIn()
  if (outcome === 'declined' || outcome === 'already-declined') {
    void vscode.window.showInformationMessage(
      'Semantic memory is off — enable it in settings (storyline.semanticMemory.enabled) to search.',
    )
    return
  }
  if (!readSemanticMemoryConfig().enabled) return

  const query = await vscode.window.showInputBox({
    prompt: 'Search your project — by meaning, not keyword',
    placeHolder: 'e.g. scenes where I introduce the cipher subplot',
    ignoreFocusOut: true,
  })
  if (!query || query.trim().length === 0) return

  const service = getSemanticMemoryService()
  if (!service) {
    void vscode.window.showWarningMessage('Semantic memory service not ready.')
    return
  }

  const projectRoot = folder.uri.fsPath

  const pack = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Searching "${truncate(query, 60)}"…` },
    () => service.search(query, { topK: 10 }),
  )

  if (!pack || pack.items.length === 0) {
    void vscode.window.showInformationMessage(
      pack ? 'No matches — try a broader query.' : 'Search unavailable — check your licence and budget.',
    )
    return
  }

  const items: QuickPickResult[] = pack.items.map((it) => ({
    ref: it.ref,
    text: it.text,
    label: humanLabel(it.ref),
    description: scoreLabel(it.score),
    detail: oneLine(it.text ?? it.summary ?? '', 200),
  }))

  const picked = await vscode.window.showQuickPick(items, {
    title: `Storyline — search results for "${truncate(query, 50)}"`,
    placeHolder: 'Pick a result to open it',
    matchOnDescription: true,
    matchOnDetail: true,
  })
  if (!picked) return

  const target = resolveChunkIdToTarget(picked.ref, projectRoot)
  if (!target) {
    void vscode.window.showWarningMessage(
      `Couldn't open the source file for ${picked.ref}. The chunk may have been generated before the file existed on disk.`,
    )
    logVerbose(`[Storyline] semantic-memory: no source file for ${picked.ref}`)
    return
  }

  try {
    const doc = await vscode.workspace.openTextDocument(target.uri)
    await vscode.window.showTextDocument(doc, {
      preview: false,
      selection: target.line ? new vscode.Range(target.line - 1, 0, target.line - 1, 0) : undefined,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logError(`[Storyline] semantic-memory: open document failed: ${msg}`)
    void vscode.window.showErrorMessage(`Couldn't open ${target.uri.fsPath}: ${msg}`)
  }
}

function humanLabel(chunkId: string): string {
  // Strip the book scope and pretty-print the kind.
  const stripped = chunkId.replace(/^book:[^/]+\//, '')
  const sceneMatch = /^scene:ch(\d+)-s(\d+)$/.exec(stripped)
  if (sceneMatch) return `Chapter ${sceneMatch[1]}, scene ${sceneMatch[2]}`
  const chapterMatch = /^chapter:(\d+)$/.exec(stripped)
  if (chapterMatch) return `Chapter ${chapterMatch[1]}`
  const stageMatch = /^stage:(.+)$/.exec(stripped)
  if (stageMatch) return `Planning — ${stageMatch[1]}`
  const researchMatch = /^research:(.+)$/.exec(stripped)
  if (researchMatch) return `Research — ${researchMatch[1]}`
  return stripped
}

function scoreLabel(score: number): string {
  return `${(score * 100).toFixed(0)}%`
}

function oneLine(s: string, maxLen: number): string {
  const collapsed = s.replace(/\s+/g, ' ').trim()
  return collapsed.length > maxLen ? `${collapsed.slice(0, maxLen)}…` : collapsed
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s
}
