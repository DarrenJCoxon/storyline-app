import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * NT-16 — proper-noun redaction. Memoir writers, journalists, anyone
 * working on legally fraught material may want to redact people and
 * places before sending text to OpenAI for embedding.
 *
 * Strategy: a lightweight rule-based NER pass detects capitalised
 * multi-word phrases and known one-word names. Each unique surface
 * form gets a stable pseudonym (PERSON_001, PLACE_002). The mapping
 * lives at .storyline/pseudonyms.json — never sent anywhere — and is
 * applied to outgoing text and reverse-applied to retrieved text.
 *
 * This is deliberately heuristic. A heavier ML NER lives behind a
 * follow-up if the rule-based pass produces too many false positives.
 */

const CFG_KEY = 'storyline.semanticMemory.redactProperNouns'
const PSEUDONYM_REL_PATH = path.join('.storyline', 'pseudonyms.json')

interface PseudonymStore {
  /** Surface form (case-sensitive) → pseudonym. */
  forward: Record<string, string>
  /** Pseudonym → original. */
  reverse: Record<string, string>
  /** Counters per kind, used to mint new pseudonyms. */
  counters: { person: number; place: number; org: number }
}

export function isRedactionEnabled(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(CFG_KEY) === true
}

export interface RedactionResult {
  redactedText: string
  /** Mapping applied during this redaction. */
  pseudonyms: Record<string, string>
}

/**
 * Redact proper nouns in text and persist any new pseudonyms. Returns
 * the redacted text plus the mapping used (pseudonym → original) so
 * callers can reverse-translate later.
 */
export function redactProperNouns(text: string, projectRoot: string): RedactionResult {
  if (!text) return { redactedText: text, pseudonyms: {} }
  const store = loadStore(projectRoot)
  const used: Record<string, string> = {}

  // Detect capitalised multi-word phrases first (e.g. "John Smith",
  // "New York"). They beat single-word names because most narrative
  // mentions of a person spell out at least first + last name.
  const multiWordRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g
  text = text.replace(multiWordRe, (match) => {
    const pseudonym = mintPseudonym(store, match, 'person')
    used[pseudonym] = match
    return pseudonym
  })

  // Now single-word capitalised names that aren't sentence-initial. The
  // sentence-initial check is approximate: skip a token immediately after
  // a sentence terminator + space.
  const singleWordRe = /(^|[^.!?]\s+)([A-Z][a-z]+)\b/g
  text = text.replace(singleWordRe, (_full, lead: string, name: string) => {
    if (COMMON_WORDS.has(name)) return `${lead}${name}`
    const pseudonym = mintPseudonym(store, name, 'person')
    used[pseudonym] = name
    return `${lead}${pseudonym}`
  })

  saveStore(projectRoot, store)
  return { redactedText: text, pseudonyms: used }
}

/**
 * Reverse-translate text that contains pseudonyms back to the writer's
 * real proper nouns. Used after retrieval so search results show real
 * names even though the index contains pseudonyms.
 */
export function unredact(text: string, projectRoot: string): string {
  if (!text) return text
  const store = loadStore(projectRoot)
  let result = text
  // Sort by descending length to avoid PERSON_001 substituting inside
  // PERSON_0010 etc. (counters are bounded but defensive).
  const pseudonyms = Object.keys(store.reverse).sort((a, b) => b.length - a.length)
  for (const p of pseudonyms) {
    const original = store.reverse[p]
    result = result.split(p).join(original)
  }
  return result
}

function mintPseudonym(
  store: PseudonymStore,
  surface: string,
  kind: 'person' | 'place' | 'org',
): string {
  const existing = store.forward[surface]
  if (existing) return existing
  store.counters[kind] = (store.counters[kind] ?? 0) + 1
  const id = String(store.counters[kind]).padStart(3, '0')
  const tag = `${kind.toUpperCase()}_${id}`
  store.forward[surface] = tag
  store.reverse[tag] = surface
  return tag
}

function loadStore(projectRoot: string): PseudonymStore {
  const file = path.join(projectRoot, PSEUDONYM_REL_PATH)
  if (!fs.existsSync(file)) {
    return { forward: {}, reverse: {}, counters: { person: 0, place: 0, org: 0 } }
  }
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PseudonymStore>
    return {
      forward: parsed.forward ?? {},
      reverse: parsed.reverse ?? {},
      counters: { person: 0, place: 0, org: 0, ...(parsed.counters ?? {}) },
    }
  } catch {
    return { forward: {}, reverse: {}, counters: { person: 0, place: 0, org: 0 } }
  }
}

function saveStore(projectRoot: string, store: PseudonymStore): void {
  try {
    const dir = path.join(projectRoot, '.storyline')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(projectRoot, PSEUDONYM_REL_PATH), JSON.stringify(store, null, 2), 'utf-8')
  } catch {
    /* best-effort */
  }
}

/**
 * Words that look like names (capitalised) but aren't. Conservative
 * stop-list — we'd rather under-redact a name than over-redact prose.
 */
const COMMON_WORDS = new Set([
  'I', 'A', 'An', 'The', 'And', 'But', 'Or', 'Not', 'For', 'With', 'From',
  'To', 'In', 'On', 'At', 'By', 'Of', 'As', 'If', 'When', 'While',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
])
