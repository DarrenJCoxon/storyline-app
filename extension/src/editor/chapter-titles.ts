import * as fs from 'fs'
import * as path from 'path'

type TitlesMap = Record<string, string>

function titlesPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.storyline', 'chapter-titles.json')
}

export function readChapterTitles(workspaceRoot: string): TitlesMap {
  try {
    return JSON.parse(fs.readFileSync(titlesPath(workspaceRoot), 'utf-8')) as TitlesMap
  } catch {
    return {}
  }
}

export function getChapterTitle(workspaceRoot: string, relPath: string): string | null {
  const titles = readChapterTitles(workspaceRoot)
  return titles[relPath] ?? null
}

export function setChapterTitle(workspaceRoot: string, relPath: string, title: string): void {
  const p = titlesPath(workspaceRoot)
  const titles = readChapterTitles(workspaceRoot)
  if (title.trim()) {
    titles[relPath] = title.trim()
  } else {
    delete titles[relPath]
  }
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(titles, null, 2), 'utf-8')
}

export function humanizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/\.(md|markdown)$/i, '')
  const chMatch = base.match(/^(?:ch(?:apter)?[-_]?)(\d+)(?:[-_]+(.+))?$/i)
  if (chMatch) {
    const num = parseInt(chMatch[1], 10)
    const titlePart = chMatch[2]
      ? chMatch[2].replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : ''
    return titlePart ? `Chapter ${num}: ${titlePart}` : `Chapter ${num}`
  }
  return (
    base
      .replace(/^[\d_]+[\s\-_]*/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase()) || base
  )
}
