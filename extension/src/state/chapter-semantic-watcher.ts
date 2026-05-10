import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { getSemanticMemoryService } from './semantic-memory-service.js'
import { logVerbose } from '../diagnostic-log.js'

/**
 * NT-05: chapter manuscript watcher. Fires a debounced semantic-memory
 * upsert 5 seconds after the writer stops typing. Each chapter file
 * becomes one Layer 1 chunk + one Layer 2 chunk per scene marker (or
 * a single chapter chunk when no scene markers are present).
 *
 * The watcher is a no-op until the writer opts into semantic memory —
 * then it begins indexing as content lands.
 */

const DEBOUNCE_MS = 5_000
const MANUSCRIPT_GLOB = 'manuscript/**/*.md'

export function registerChapterSemanticWatcher(context: vscode.ExtensionContext): void {
  const watcher = vscode.workspace.createFileSystemWatcher(MANUSCRIPT_GLOB)
  const timers = new Map<string, NodeJS.Timeout>()

  const schedule = (uri: vscode.Uri): void => {
    const key = uri.fsPath
    const existing = timers.get(key)
    if (existing) clearTimeout(existing)
    const t = setTimeout(() => {
      timers.delete(key)
      void embedChapterFile(uri).catch(() => { /* logged inside the service */ })
    }, DEBOUNCE_MS)
    timers.set(key, t)
  }

  context.subscriptions.push(
    watcher,
    watcher.onDidChange(schedule),
    watcher.onDidCreate(schedule),
    watcher.onDidDelete(uri => { void onChapterDeleted(uri).catch(() => { /* swallowed */ }) }),
    {
      dispose: () => {
        for (const t of timers.values()) clearTimeout(t)
        timers.clear()
      },
    },
  )
}

async function embedChapterFile(uri: vscode.Uri): Promise<void> {
  const service = getSemanticMemoryService()
  if (!service) return

  let raw: string
  try {
    raw = await fs.readFile(uri.fsPath, 'utf-8')
  } catch {
    return
  }

  const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!projectRoot) return

  const relPath = path.relative(projectRoot, uri.fsPath)
  const chapterNumber = parseChapterNumber(relPath)
  if (chapterNumber == null) return

  // Whole-chapter chunk (Layer 1).
  await service.upsert({
    id: `book:default/chapter:${chapterNumber}`,
    kind: 'nuwiki_article_summary',
    text: raw,
    metadata: {
      // schema doc §5.1
      articleId: `book:default/chapter:${chapterNumber}`,
      documentType: 'storyline_chapter',
      subject: { kind: 'chapter', id: String(chapterNumber) },
      version: new Date().toISOString(),
      sectionCount: 0,
      lastCompiledAt: new Date().toISOString(),
      isFresh: true,
      backlinks: { inboundCount: 0, outboundCount: 0 },
      summaryTokenLength: Math.ceil(raw.length / 4),
      bookId: 'default',
      mode: 'fiction',
      chapterNumber,
      estimatedWords: estimateWords(raw),
    },
  })

  // Scene chunks (Layer 2) — one per scene marker if present.
  const scenes = splitIntoScenes(raw, chapterNumber)
  for (const scene of scenes) {
    await service.upsert({
      id: scene.id,
      kind: 'nuwiki_section',
      text: scene.text,
      metadata: {
        // schema doc §5.2
        articleId: `book:default/chapter:${chapterNumber}`,
        documentType: 'storyline_scene',
        subject: { kind: 'scene', id: scene.localId },
        version: new Date().toISOString(),
        sectionKey: scene.localId,
        sectionHeading: scene.heading ?? scene.localId,
        citationCount: 0,
        parentArticleSummary: '',
        position: scene.position,
        bookId: 'default',
        chapterNumber,
        sceneNumber: scene.position,
        wordCount: estimateWords(scene.text),
        hasPose: scene.text.trim().length > 0,
      },
    })
  }

  logVerbose(`[Storyline] semantic-memory chapter:${chapterNumber} indexed (${scenes.length} scenes)`)
}

async function onChapterDeleted(uri: vscode.Uri): Promise<void> {
  const service = getSemanticMemoryService()
  if (!service) return
  const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!projectRoot) return
  const relPath = path.relative(projectRoot, uri.fsPath)
  const chapterNumber = parseChapterNumber(relPath)
  if (chapterNumber == null) return
  // We don't know the scene ids without reading the file, so delete the
  // whole-chapter chunk and let any subsequent re-create rebuild scenes.
  // Stale scene chunks under this chapter are tolerable until NT-08's
  // edge cleanup pass; a future enhancement can sweep them on delete.
  await service.deleteByIds([`book:default/chapter:${chapterNumber}`])
}

function parseChapterNumber(relPath: string): number | null {
  // Accept "manuscript/01-foo.md", "manuscript/chapter-3.md",
  // "manuscript/03 - title.md" — anything starting with digits.
  const filename = path.basename(relPath)
  const m = /^(?:chapter[-_])?(\d+)/i.exec(filename)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

interface SceneChunk {
  id: string
  localId: string
  position: number
  text: string
  heading?: string
}

/**
 * Split chapter prose into scene chunks. Heuristic: scene boundary is
 * `# `, `## `, or `***` / `* * *` on a line of their own. A chapter
 * with no markers becomes one scene.
 */
function splitIntoScenes(raw: string, chapterNumber: number): SceneChunk[] {
  const lines = raw.split(/\r?\n/)
  const out: SceneChunk[] = []
  let buf: string[] = []
  let heading: string | undefined
  let pos = 1

  const flush = (): void => {
    const text = buf.join('\n').trim()
    if (text.length === 0) return
    const localId = `ch${chapterNumber}-s${pos}`
    out.push({
      id: `book:default/scene:${localId}`,
      localId,
      position: pos,
      text,
      heading,
    })
    pos += 1
    buf = []
    heading = undefined
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const isHeading = /^#{1,2}\s+/.test(trimmed)
    const isHr = /^\*\s*\*\s*\*$|^\*{3,}$/.test(trimmed)
    if (isHeading || isHr) {
      flush()
      if (isHeading) heading = trimmed.replace(/^#{1,2}\s+/, '')
      continue
    }
    buf.push(line)
  }
  flush()

  return out
}

function estimateWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}
