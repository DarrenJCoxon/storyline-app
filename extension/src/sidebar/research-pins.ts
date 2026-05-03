import * as path from 'path'
import * as fs from 'fs'

const PINS_FILE = '.storyline/research-pins.json'
const PIN_BUDGET_BYTES = 32_000   // ~8k tokens for pinned notes
const PIN_PER_FILE_BYTES = 8_000

export interface PinsData {
  pinned: string[]  // relPaths: research/<cat>/<note>.md
  chapterScoped: Record<string, string[]>  // chapterRelPath → note relPaths
}

export function readPins(projectPath: string): PinsData {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(projectPath, PINS_FILE), 'utf-8')) as Partial<PinsData>
    return { pinned: data.pinned ?? [], chapterScoped: data.chapterScoped ?? {} }
  } catch {
    return { pinned: [], chapterScoped: {} }
  }
}

export function writePins(projectPath: string, data: PinsData): void {
  const p = path.join(projectPath, PINS_FILE)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

export function togglePin(projectPath: string, relPath: string, pinned: boolean): PinsData {
  const data = readPins(projectPath)
  const without = data.pinned.filter(r => r !== relPath)
  data.pinned = pinned ? [...without, relPath] : without
  writePins(projectPath, data)
  return data
}

export function toggleChapterPin(
  projectPath: string,
  chapterRelPath: string,
  noteRelPath: string,
  attach: boolean,
): PinsData {
  const data = readPins(projectPath)
  const existing = data.chapterScoped[chapterRelPath] ?? []
  const without = existing.filter(r => r !== noteRelPath)
  data.chapterScoped[chapterRelPath] = attach ? [...without, noteRelPath] : without
  if (data.chapterScoped[chapterRelPath].length === 0) {
    delete data.chapterScoped[chapterRelPath]
  }
  writePins(projectPath, data)
  return data
}

/** Build the pinned-notes context block for injection into the system prompt. */
export function buildPinnedNotesBlock(projectPath: string, activeChapterRelPath?: string): string {
  const { pinned, chapterScoped } = readPins(projectPath)

  // Merge global pins + chapter-scoped pins for the active chapter (deduped)
  const chapterPins = activeChapterRelPath ? (chapterScoped[activeChapterRelPath] ?? []) : []
  const allPinned = [...new Set([...pinned, ...chapterPins])]

  if (allPinned.length === 0) return ''

  let remaining = PIN_BUDGET_BYTES
  const parts: string[] = []
  const skipped: string[] = []

  for (const relPath of allPinned) {
    if (remaining <= 0) { skipped.push(path.basename(relPath)); continue }
    let content: string
    try {
      content = fs.readFileSync(path.join(projectPath, relPath), 'utf-8').trim()
    } catch { continue }
    if (!content) continue
    const allow = Math.min(content.length, PIN_PER_FILE_BYTES, remaining)
    const slice = content.slice(0, allow)
    const truncated = slice.length < content.length
    const label = path.basename(relPath, path.extname(relPath))
    parts.push(`### ${label}${truncated ? '  *(truncated)*' : ''}\n\n${slice}`)
    remaining -= slice.length
  }

  if (parts.length === 0) return ''

  const skippedNote = skipped.length > 0
    ? `\n\n*(${skipped.length} pinned note${skipped.length === 1 ? '' : 's'} not loaded — context budget reached: ${skipped.join(', ')})*`
    : ''

  return `## Pinned research notes

*The writer has pinned the following research notes for this session. Treat them as authoritative — refer to them when relevant and don't contradict facts they assert.*

${parts.join('\n\n---\n\n')}${skippedNote}`
}
