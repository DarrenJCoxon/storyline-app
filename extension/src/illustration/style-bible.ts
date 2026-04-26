import * as fs from 'fs'
import * as path from 'path'

/**
 * Style Bible — a per-project record of recurring character descriptions,
 * art-style direction, palette and tone. Used to keep an illustrated book
 * visually consistent: the bible's text is auto-prepended to every
 * illustration prompt so the AI knows what the protagonist looks like
 * and what palette to paint in.
 *
 * Stored at `.storyline/style-bible.json`. Edited via the Illustrations
 * panel UI; consumed by both IllustrationsPanel (illustrations) and
 * CoverPanel (cover art).
 */

export interface StyleBibleCharacter {
  /** Stable id for refs. Generated from name on save. */
  id: string
  name: string
  /** Free-text physical/clothing description. */
  description: string
  isProtagonist: boolean
}

export interface StyleBible {
  characters: StyleBibleCharacter[]
  artStyle: string
  palette: string
  tone: string
}

const FILE_REL = '.storyline/style-bible.json'

export const EMPTY_STYLE_BIBLE: StyleBible = {
  characters: [],
  artStyle: '',
  palette: '',
  tone: '',
}

export function readStyleBible(projectDir: string): StyleBible {
  try {
    const raw = fs.readFileSync(path.join(projectDir, FILE_REL), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StyleBible>
    return {
      characters: Array.isArray(parsed.characters) ? parsed.characters : [],
      artStyle: typeof parsed.artStyle === 'string' ? parsed.artStyle : '',
      palette: typeof parsed.palette === 'string' ? parsed.palette : '',
      tone: typeof parsed.tone === 'string' ? parsed.tone : '',
    }
  } catch { return { ...EMPTY_STYLE_BIBLE } }
}

export function writeStyleBible(projectDir: string, bible: StyleBible): void {
  const file = path.join(projectDir, FILE_REL)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(bible, null, 2), 'utf-8')
}

/**
 * Render the style bible as a prompt prefix that anchors the AI to the
 * book's visual identity. Empty fields are omitted so the prefix only
 * grows as the writer fills the bible in.
 */
export function buildStyleBiblePrompt(bible: StyleBible): string {
  const parts: string[] = []

  if (bible.characters.length > 0) {
    parts.push('CHARACTER REFERENCE — keep these characters consistent across every illustration:')
    for (const c of bible.characters) {
      const role = c.isProtagonist ? ' (protagonist)' : ''
      parts.push(`  • ${c.name}${role}: ${c.description}`)
    }
  }
  if (bible.artStyle) parts.push(`ART STYLE: ${bible.artStyle}`)
  if (bible.palette) parts.push(`COLOUR PALETTE: ${bible.palette}`)
  if (bible.tone) parts.push(`TONE: ${bible.tone}`)
  if (parts.length === 0) return ''
  return parts.join('\n') + '\n\n'
}

/* ── Character reference images ─────────────────────────────────────────
 * Tracked in `.storyline/illustration-refs.json`. Each entry points at a
 * generated illustration that should be used as a visual anchor — usually
 * a character model sheet or a style sample. The Illustrations panel
 * passes these to /v1/images/edits with input_fidelity=high so the
 * model preserves the character's features.
 */

export interface IllustrationRef {
  /** Absolute path to the file. */
  absolutePath: string
  /** Display name. */
  filename: string
  kind: 'character' | 'style' | 'scene'
  /** Optional character id from style-bible.characters this ref depicts. */
  characterId?: string
  addedAt: string
}

const REFS_FILE_REL = '.storyline/illustration-refs.json'

export function readRefs(projectDir: string): IllustrationRef[] {
  try {
    const raw = fs.readFileSync(path.join(projectDir, REFS_FILE_REL), 'utf-8')
    const parsed = JSON.parse(raw) as { refs?: unknown }
    const refs = Array.isArray(parsed.refs) ? parsed.refs : []
    // Filter out any refs whose underlying file has been deleted.
    return (refs as IllustrationRef[]).filter(r => r?.absolutePath && fs.existsSync(r.absolutePath))
  } catch { return [] }
}

export function writeRefs(projectDir: string, refs: IllustrationRef[]): void {
  const file = path.join(projectDir, REFS_FILE_REL)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ refs }, null, 2), 'utf-8')
}

export function addRef(projectDir: string, ref: Omit<IllustrationRef, 'addedAt'>): IllustrationRef[] {
  const existing = readRefs(projectDir)
  // Replace any existing entry for the same path so adding twice doesn't dup.
  const filtered = existing.filter(r => r.absolutePath !== ref.absolutePath)
  const next: IllustrationRef = { ...ref, addedAt: new Date().toISOString() }
  const out = [...filtered, next]
  writeRefs(projectDir, out)
  return out
}

export function removeRef(projectDir: string, absolutePath: string): IllustrationRef[] {
  const out = readRefs(projectDir).filter(r => r.absolutePath !== absolutePath)
  writeRefs(projectDir, out)
  return out
}

/** Slugify a character name into a stable id. */
export function characterIdFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'character'
}
