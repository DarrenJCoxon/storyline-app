import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * NT-20 — lightweight project file manifest. The system prompt always
 * carries a structural inventory of every project file the AI might need
 * to reason about (manuscript chapters, planning chapter cards, planning
 * stage docs, research items). Contents stay out — that's NT-21's job
 * via NuVector retrieval. The goal here is to fix the "AI doesn't know
 * what files exist" failure mode (transcript 2026-05-10) without bloating
 * the prompt with prose.
 *
 * Total size for a 100-chapter project with 50 research items: ~14 KB.
 */

export interface ProjectFileEntry {
  /** POSIX-shaped path relative to the project root. */
  relPath: string
  bytes: number
  /** ISO date (day precision). */
  lastModified: string
  wordCount?: number
  /** First H1/H2 heading, capped at 80 chars. Helps the AI recognise
   *  chapters by name rather than just filename. */
  firstHeading?: string
}

export interface ProjectManifest {
  /** `manuscript/*.md` — the actual chapter prose. */
  chapters: ProjectFileEntry[]
  /** `planning/chapters/*.md` — per-chapter planning cards (NF Pipeline A
   *  uses these heavily). */
  planningChapters: ProjectFileEntry[]
  /** `planning/stages/*.md` — rendered stage docs. */
  planningStages: ProjectFileEntry[]
  /** `.storyline/research/*.md` — research items. */
  research: ProjectFileEntry[]
}

interface WalkOptions {
  withFirstHeading: boolean
  withWordCount: boolean
}

export function buildProjectManifest(projectRoot: string): ProjectManifest {
  return {
    chapters: walkMarkdownDir(projectRoot, 'manuscript', { withFirstHeading: true, withWordCount: true }),
    planningChapters: walkMarkdownDir(projectRoot, path.join('planning', 'chapters'), { withFirstHeading: true, withWordCount: false }),
    planningStages: walkMarkdownDir(projectRoot, path.join('planning', 'stages'), { withFirstHeading: false, withWordCount: false }),
    research: walkMarkdownDir(projectRoot, path.join('.storyline', 'research'), { withFirstHeading: true, withWordCount: false }),
  }
}

function walkMarkdownDir(projectRoot: string, relDir: string, opts: WalkOptions): ProjectFileEntry[] {
  const dir = path.join(projectRoot, relDir)
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const out: ProjectFileEntry[] = []
  for (const name of names.sort()) {
    if (!name.endsWith('.md')) continue
    const file = path.join(dir, name)
    let stat: fs.Stats
    try {
      stat = fs.statSync(file)
    } catch {
      continue
    }
    const entry: ProjectFileEntry = {
      relPath: relDir.split(path.sep).concat(name).join('/'),
      bytes: stat.size,
      lastModified: stat.mtime.toISOString().slice(0, 10),
    }
    if (opts.withFirstHeading || opts.withWordCount) {
      try {
        const text = fs.readFileSync(file, 'utf-8')
        if (opts.withFirstHeading) {
          const m = /^#{1,2}\s+(.+)$/m.exec(text)
          if (m) entry.firstHeading = m[1].trim().slice(0, 80)
        }
        if (opts.withWordCount) {
          entry.wordCount = countWords(text)
        }
      } catch {
        /* tolerate read failures — better partial than crash */
      }
    }
    out.push(entry)
  }
  return out
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Render the manifest as a markdown block for the system prompt. The
 * shape is deliberately scannable — bullet lists with bracketed metadata —
 * so the AI doesn't have to parse JSON.
 */
export function renderProjectManifest(manifest: ProjectManifest): string {
  const lines: string[] = []
  const totalFiles =
    manifest.chapters.length +
    manifest.planningChapters.length +
    manifest.planningStages.length +
    manifest.research.length
  if (totalFiles === 0) return ''

  lines.push('## Project files')
  lines.push('')
  lines.push(
    '_Authoritative inventory of every file in this project. Use these paths verbatim when the writer asks you to read or amend a specific file. If a file is not listed here, it does not exist on disk yet._',
  )
  lines.push('')

  if (manifest.chapters.length > 0) {
    lines.push(`### Manuscript chapters (${manifest.chapters.length})`)
    for (const e of manifest.chapters) {
      const wc = e.wordCount != null ? ` — ${e.wordCount} words` : ''
      const heading = e.firstHeading ? `, "${e.firstHeading}"` : ''
      lines.push(`- ${e.relPath}${wc}${heading}`)
    }
    lines.push('')
  }

  if (manifest.planningChapters.length > 0) {
    lines.push(`### Planning chapter cards (${manifest.planningChapters.length})`)
    for (const e of manifest.planningChapters) {
      const heading = e.firstHeading ? ` — "${e.firstHeading}"` : ''
      lines.push(`- ${e.relPath}${heading}`)
    }
    lines.push('')
  }

  if (manifest.planningStages.length > 0) {
    lines.push(`### Planning stage docs (${manifest.planningStages.length})`)
    for (const e of manifest.planningStages) {
      lines.push(`- ${e.relPath}`)
    }
    lines.push('')
  }

  if (manifest.research.length > 0) {
    lines.push(`### Research items (${manifest.research.length})`)
    for (const e of manifest.research) {
      const heading = e.firstHeading ? ` — "${e.firstHeading}"` : ''
      lines.push(`- ${e.relPath}${heading}`)
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

/**
 * Convenience: build + render in one go, returning the prompt block
 * (or an empty string for projects with nothing to manifest).
 */
export function projectManifestBlock(projectRoot: string | null): string {
  if (!projectRoot) return ''
  try {
    const manifest = buildProjectManifest(projectRoot)
    return renderProjectManifest(manifest)
  } catch {
    return ''
  }
}
