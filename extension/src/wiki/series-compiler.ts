import * as fs from 'fs'
import * as path from 'path'
import type { ProjectState } from '@storyline/core'
import { logInfo, logWarn } from '../diagnostic-log.js'

export interface SeriesArticle {
  type: 'arc' | 'world' | 'character'
  slug: string
  label: string
  body: string
}

/**
 * Compile series-level articles from the current book's state.
 * Only runs when seriesContext.isSeries is true.
 *
 * Articles are written to .storyline/wiki/series/ and also stored
 * to odd-flow so subsequent books in the series can retrieve them.
 */
export function compileSeriesArticles(state: ProjectState, projectDir: string): SeriesArticle[] {
  const raw = state as unknown as Record<string, unknown>
  const seriesCtx = (raw['premise'] as Record<string, unknown> | undefined)?.['seriesContext'] as Record<string, unknown> | undefined
  if (!seriesCtx || !seriesCtx['isSeries']) return []

  const seriesSlug = seriesSlugFromContext(seriesCtx)
  const articles: SeriesArticle[] = []

  // 1. Series arc
  const arcBody = compileArcArticle(seriesCtx, raw)
  if (arcBody) {
    articles.push({ type: 'arc', slug: 'arc', label: 'Series arc', body: arcBody })
  }

  // 2. Series world (genre + tone + audience — things that persist)
  const worldBody = compileWorldArticle(raw)
  if (worldBody) {
    articles.push({ type: 'world', slug: 'world', label: 'Series world', body: worldBody })
  }

  // 3. Character state at end of this book
  const protagonist = raw['protagonist'] as Record<string, unknown> | undefined
  if (protagonist?.['name']) {
    const charBody = compileCharacterArticle(protagonist, seriesCtx)
    if (charBody) {
      const charSlug = characterSlug(protagonist['name'] as string)
      articles.push({ type: 'character', slug: `characters/${charSlug}`, label: `${protagonist['name']} (end of Book ${seriesCtx['currentBookNumber'] ?? 1})`, body: charBody })
    }
  }

  // Also compile supporting cast if present
  const characters = raw['characters'] as Array<Record<string, unknown>> | undefined
  if (characters?.length) {
    for (const char of characters) {
      const name = char['name']
      if (!name || typeof name !== 'string') continue
      const charBody = compileSupportingCharacterArticle(char, seriesCtx)
      if (charBody) {
        const charSlug = characterSlug(name)
        articles.push({ type: 'character', slug: `characters/${charSlug}`, label: `${name} (end of Book ${seriesCtx['currentBookNumber'] ?? 1})`, body: charBody })
      }
    }
  }

  // Write to disk
  const seriesDir = path.join(projectDir, '.storyline', 'wiki', 'series')
  try { fs.mkdirSync(seriesDir, { recursive: true }) } catch { /* ignore */ }
  const charDir = path.join(seriesDir, 'characters')
  try { fs.mkdirSync(charDir, { recursive: true }) } catch { /* ignore */ }

  for (const art of articles) {
    const filePath = path.join(seriesDir, `${art.slug}.md`)
    try {
      fs.writeFileSync(filePath, art.body, 'utf-8')
      logInfo(`[Storyline] series wiki: wrote ${art.slug}`)
    } catch (err) {
      logWarn(`[Storyline] series wiki: failed to write ${art.slug}`, err)
    }
  }

  // Store to odd-flow for cross-book retrieval (fire-and-forget).
  // Key includes book number so each book's end-state is preserved
  // separately — Book 2+ can retrieve Book 1's state for continuity checks.
  void import('../state/memory.js')
    .then(m => {
      const bookNum = seriesCtx['currentBookNumber'] ?? 1
      for (const art of articles) {
        void m.storeMemoryEntry(
          `series:${seriesSlug}:book${bookNum}:${art.slug}`,
          art.body,
          ['series', `series:${seriesSlug}`, `book:${bookNum}`],
        ).catch(() => { /* non-fatal */ })
      }
    })
    .catch(() => { /* non-fatal */ })

  return articles
}

function seriesSlugFromContext(seriesCtx: Record<string, unknown>): string {
  const title = seriesCtx['seriesTitle']
  if (typeof title === 'string' && title.trim()) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  }
  return 'unnamed-series'
}

function characterSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function compileArcArticle(seriesCtx: Record<string, unknown>, raw: Record<string, unknown>): string {
  const overallArc = seriesCtx['overallArc']
  const firstBookFocus = seriesCtx['firstBookFocus']
  const bookCount = seriesCtx['bookCount']
  const currentBook = seriesCtx['currentBookNumber'] ?? 1

  const parts: string[] = []
  if (typeof overallArc === 'string' && overallArc.trim()) {
    parts.push(`**Overall arc**: ${overallArc.trim()}`)
  }
  if (typeof firstBookFocus === 'string' && firstBookFocus.trim()) {
    parts.push(`**Book ${currentBook} focus**: ${firstBookFocus.trim()}`)
  }
  if (typeof bookCount === 'number') {
    parts.push(`**Planned books**: ${bookCount}`)
  }

  if (parts.length === 0) return ''
  return parts.join('\n\n')
}

function compileWorldArticle(raw: Record<string, unknown>): string {
  const genre = raw['genre'] as Record<string, unknown> | undefined
  if (!genre) return ''

  const parts: string[] = []
  const primary = genre['primaryGenre']
  const tone = genre['tone']
  const audience = genre['audience']
  const variant = genre['genreVariant']

  if (typeof primary === 'string' && primary.trim()) parts.push(`**Genre**: ${primary.trim()}`)
  if (typeof tone === 'string' && tone.trim()) parts.push(`**Tone**: ${tone.trim()}`)
  if (typeof audience === 'string' && audience.trim()) parts.push(`**Audience**: ${audience.trim()}`)
  if (typeof variant === 'string' && variant.trim() && variant !== 'standard') parts.push(`**Variant**: ${variant.trim()}`)

  if (parts.length === 0) return ''
  return parts.join('\n\n')
}

function compileCharacterArticle(protagonist: Record<string, unknown>, seriesCtx: Record<string, unknown>): string {
  const currentBook = seriesCtx['currentBookNumber'] ?? 1
  const parts: string[] = []

  const name = protagonist['name']
  if (typeof name === 'string') parts.push(`**Name**: ${name}`)

  const age = protagonist['age']
  if (age != null) parts.push(`**Age**: ${age}`)

  const occupation = protagonist['occupation']
  if (typeof occupation === 'string' && occupation.trim()) parts.push(`**Occupation**: ${occupation.trim()}`)

  const want = protagonist['want']
  if (typeof want === 'string' && want.trim()) parts.push(`**Want** (Book ${currentBook}): ${want.trim()}`)

  const need = protagonist['need']
  if (typeof need === 'string' && need.trim()) parts.push(`**Need** (Book ${currentBook}): ${need.trim()}`)

  const flaw = protagonist['flaw']
  if (typeof flaw === 'string' && flaw.trim()) parts.push(`**Flaw** (Book ${currentBook}): ${flaw.trim()}`)

  const ghost = protagonist['ghost']
  if (typeof ghost === 'string' && ghost.trim()) parts.push(`**Ghost** (Book ${currentBook}): ${ghost.trim()}`)

  const arcDirection = protagonist['arcDirection']
  if (typeof arcDirection === 'string' && arcDirection.trim()) {
    parts.push(`**Arc direction** (Book ${currentBook}): ${arcDirection.trim()}`)
  }

  if (parts.length === 0) return ''
  return parts.join('\n\n')
}

function compileSupportingCharacterArticle(char: Record<string, unknown>, seriesCtx: Record<string, unknown>): string {
  const currentBook = seriesCtx['currentBookNumber'] ?? 1
  const parts: string[] = []

  const name = char['name']
  if (typeof name === 'string') parts.push(`**Name**: ${name}`)

  const role = char['role']
  if (typeof role === 'string' && role.trim()) parts.push(`**Role**: ${role.trim()}`)

  const want = char['want']
  if (typeof want === 'string' && want.trim()) parts.push(`**Want** (Book ${currentBook}): ${want.trim()}`)

  const need = char['need']
  if (typeof need === 'string' && need.trim()) parts.push(`**Need** (Book ${currentBook}): ${need.trim()}`)

  const flaw = char['flaw']
  if (typeof flaw === 'string' && flaw.trim()) parts.push(`**Flaw** (Book ${currentBook}): ${flaw.trim()}`)

  const relationship = char['relationshipToProtagonist']
  if (typeof relationship === 'string' && relationship.trim()) {
    parts.push(`**Relationship to protagonist** (Book ${currentBook}): ${relationship.trim()}`)
  }

  if (parts.length === 0) return ''
  return parts.join('\n\n')
}

// ─── Cross-book continuity check ───────────────────────────────────────────────

export interface SeriesDrift {
  field: string
  description: string
  suggestion?: string
}

/**
 * Compare the current book's protagonist draft against the previous book's
 * end-state character article (stored in odd-flow). Returns a list of drift
 * findings for fields that have changed in ways that may break series continuity.
 *
 * Only checks fields that should evolve predictably across books:
 * - want/need/flaw/ghost/arcDirection may legitimately change, but drastic
 *   reversals (e.g. flaw disappearing, arc direction flipping) are flagged.
 * - name/age/occupation should stay consistent; any change is an error.
 */
export function compareProtagonistToSeriesArticle(
  protagonist: Record<string, unknown> | undefined,
  prevArticle: string,
  currentBook: number,
): SeriesDrift[] {
  if (!protagonist) return []

  const drifts: SeriesDrift[] = []

  // Identity fields — should never change
  const identityFields = ['name', 'age', 'occupation'] as const
  for (const field of identityFields) {
    const current = protagonist[field]
    const prevMatch = prevArticle.match(new RegExp(`\\*\\*${field.charAt(0).toUpperCase() + field.slice(1)}\\*\\*: (.+)`))
    const prev = prevMatch?.[1]?.trim()
    if (prev && current != null) {
      const currentStr = String(current).trim()
      if (currentStr !== prev) {
        drifts.push({
          field,
          description: `Protagonist ${field} changed from "${prev}" (Book ${currentBook - 1}) to "${currentStr}". Identity fields should remain consistent across a series.`,
          suggestion: `Confirm this is intentional — a ${field} change between books usually signals a different character or a reboot.`,
        })
      }
    }
  }

  // Arc fields — may evolve, but flag drastic reversals
  const arcFields = ['want', 'need', 'flaw', 'ghost', 'arcDirection'] as const
  for (const field of arcFields) {
    const current = protagonist[field]
    const prevMatch = prevArticle.match(new RegExp(`\\*\\*${field.charAt(0).toUpperCase() + field.slice(1)}\\*\\* \\((?:Book ${currentBook - 1})\\): (.+)`))
    const prev = prevMatch?.[1]?.trim()
    if (prev && typeof current === 'string' && current.trim()) {
      const currentStr = current.trim()
      // Exact match — no drift
      if (currentStr === prev) continue

      // Flag if the field was present before but is now empty or contradictory
      const contradictionPatterns: Record<string, string[]> = {
        flaw: ['no flaw', 'none', 'not flawed'],
        ghost: ['no ghost', 'none', 'no backstory wound'],
        arcDirection: ['no arc', 'static', 'unchanged'],
      }
      const contradictions = contradictionPatterns[field] ?? []
      if (contradictions.some(c => currentStr.toLowerCase().includes(c))) {
        drifts.push({
          field,
          description: `Protagonist ${field} was "${prev}" at the end of Book ${currentBook - 1}, but is now described as "${currentStr}". This contradicts the established arc.`,
          suggestion: `Either preserve the previous ${field} or explicitly justify the change in the series context.`,
        })
        continue
      }

      // General drift — only flag if it's a complete replacement, not an evolution
      // Simple heuristic: if the new text shares fewer than 3 significant words, flag it
      const prevWords = new Set(prev.toLowerCase().split(/\s+/).filter(w => w.length > 3))
      const currentWords = currentStr.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      const shared = currentWords.filter(w => prevWords.has(w))
      if (shared.length < 2 && currentWords.length > 2) {
        drifts.push({
          field,
          description: `Protagonist ${field} changed significantly from "${prev}" (Book ${currentBook - 1}) to "${currentStr}". The new ${field} bears little resemblance to the established arc.`,
          suggestion: `Review the ${field} to ensure it evolves naturally from Book ${currentBook - 1}'s end-state rather than contradicting it.`,
        })
      }
    }
  }

  return drifts
}
