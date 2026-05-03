import * as fs from 'fs'
import * as path from 'path'
import type { ProjectState } from '@storyline/core'
import { logInfo, logWarn } from '../diagnostic-log.js'

// ─── Article definitions ──────────────────────────────────────────────────────

interface ArticleDef {
  label: string
  instruction: string         // what to compile — appended after the base prompt
  stateKeys?: string[]        // top-level state keys (fiction articles)
  nfStageKeys?: string[]      // nfStages[<stageId>] keys (NF articles)
  tokenBudget: number         // target output length hint (passed in prompt)
}

const ARTICLE_DEFS: Readonly<Record<string, ArticleDef>> = {
  world: {
    label: 'World & premise',
    instruction: "Summarise the book's genre, tone, target audience, and central story premise. Lead with the most distinctive commercial elements and the story hook.",
    stateKeys: ['genre', 'premise'],
    tokenBudget: 200,
  },
  protagonist: {
    label: 'Protagonist',
    instruction: "Summarise the protagonist's identity (name, age, occupation, daily world), external want, internal need, ghost (backstory wound), flaw, core lie, and arc direction. Include voice notes if present.",
    stateKeys: ['protagonist'],
    tokenBudget: 220,
  },
  cast: {
    label: 'Supporting cast',
    instruction: 'Summarise all supporting characters: name, role in the story, relationship to the protagonist, key flaw or arc, and any notable dynamics between characters.',
    stateKeys: ['characters'],
    tokenBudget: 220,
  },
  logline: {
    label: 'Logline',
    instruction: 'Summarise the refined logline and the single most compelling commercial hook. What makes a reader pick this up?',
    stateKeys: ['premise', 'logline'],
    tokenBudget: 150,
  },
  structure: {
    label: 'Story structure',
    instruction: 'Summarise the 15-beat story structure (focus on turning points: Catalyst, Break Into Two, Midpoint, All Is Lost, Break Into Three), the B story and its thematic function, and any subplots. Be specific about what actually happens at each major beat.',
    stateKeys: ['beatSheet', 'bStory', 'subplots'],
    tokenBudget: 280,
  },
  scenes: {
    label: 'Scene & chapter outline',
    instruction: 'Summarise the scene outline: which scenes appear in each act, the key turning-point scenes, and how chapters are grouped. Note any important scene-level decisions.',
    stateKeys: ['sceneOutline', 'chapterOutline'],
    tokenBudget: 220,
  },
  themes: {
    label: 'Themes & threads',
    instruction: 'Summarise the thematic throughlines, promise/payoff plot threads, and how the plot threads serve or deepen the central theme.',
    stateKeys: ['plotThreads'],
    tokenBudget: 180,
  },
}

// Which articles to (re)compile after each fiction stage save
const STAGE_TO_ARTICLES: Readonly<Record<string, string[]>> = {
  genre:          ['world'],
  premise:        ['world', 'logline'],
  protagonist:    ['protagonist'],
  characters:     ['cast'],
  relationships:  ['cast'],
  logline:        ['logline'],
  beatSheet:      ['structure'],
  bStory:         ['structure'],
  subplots:       ['structure'],
  sceneOutline:   ['scenes'],
  plotThreads:    ['themes'],
  chapterOutline: ['scenes'],
}

// ─── NF article definitions ───────────────────────────────────────────────────
//
// NF articles compile from state.nfStages[<stageId>] rather than top-level
// state keys. Three foundation articles are shared across all NF pipelines
// (A, B, C, academic); the per-pipeline articles compile only the active
// pipeline's stages.

const NF_ARTICLE_DEFS: Readonly<Record<string, ArticleDef>> = {
  // ── DNA foundation (all NF pipelines) ─────────────────────────────────────
  'nf-reader': {
    label: 'Reader & transformation',
    instruction: 'Summarise who this book is written for (the named avatar), what they currently struggle with, and the specific transformation or promise the book delivers.',
    nfStageKeys: ['dna-reader', 'dna-transform', 'dna-promise'],
    tokenBudget: 220,
  },
  'nf-idea': {
    label: 'Core idea & author angle',
    instruction: "Summarise the book's commercial category, the one big idea that differentiates it (including what makes it different from comps), and what makes the author the right person to write it.",
    nfStageKeys: ['dna-category', 'dna-idea', 'dna-author'],
    tokenBudget: 220,
  },
  'nf-positioning': {
    label: 'Positioning & craft',
    instruction: 'Summarise the comparable titles, voice and register, evidence philosophy, commercial model, and working title. For academic projects, include level, specification, and assessment shape instead of voice/comps.',
    nfStageKeys: [
      'dna-comps', 'dna-voice', 'dna-evidence', 'dna-commercial', 'dna-title',
      'dna-ac-level', 'dna-ac-spec', 'dna-ac-assessment',
    ],
    tokenBudget: 260,
  },

  // ── Pipeline A — Prescriptive ─────────────────────────────────────────────
  'pa-framework': {
    label: 'Argument & framework',
    instruction: 'Summarise the central thesis, the framework or model that organises the argument, the principles within it, and the main objections being addressed. Be specific about how the model is structured.',
    nfStageKeys: ['pa-thesis', 'pa-objections', 'pa-framework', 'pa-principles'],
    tokenBudget: 280,
  },
  'pa-application': {
    label: 'Evidence & application',
    instruction: 'Summarise how each principle is supported by evidence, how readers apply the framework in practice, and any narrative braid choices (argument-led vs braid).',
    nfStageKeys: ['pa-evidence', 'pa-application', 'pa-braid'],
    tokenBudget: 240,
  },
  'pa-chapters': {
    label: 'Chapter plan',
    instruction: 'Summarise the chapter sequence, what each chapter accomplishes, and the opener strategy.',
    nfStageKeys: ['pa-chapters', 'pa-opener'],
    tokenBudget: 280,
  },

  // ── Pipeline B — Narrative NF ─────────────────────────────────────────────
  'pb-narrative': {
    label: 'Narrative arc',
    instruction: 'Summarise the central thesis, the cast of real-world figures, the timeline, the narrative fork (idea-led vs event-led), and the theme.',
    nfStageKeys: ['pb-thesis', 'pb-cast', 'pb-timeline', 'pb-fork', 'pb-theme'],
    tokenBudget: 280,
  },
  'pb-scenes': {
    label: 'Scenes & sourcing',
    instruction: 'Summarise the key scenes that carry the narrative and the sourcing strategy that backs each scene.',
    nfStageKeys: ['pb-scenes', 'pb-sourcing'],
    tokenBudget: 240,
  },
  'pb-chapters': {
    label: 'Chapter plan',
    instruction: 'Summarise the chapter sequence and what each chapter accomplishes narratively.',
    nfStageKeys: ['pb-chapters'],
    tokenBudget: 240,
  },

  // ── Pipeline C — How-To / Skill Ladder ────────────────────────────────────
  'pc-skill': {
    label: 'Skill arc',
    instruction: 'Summarise the skill being taught, the assumed starting level, the end state, the decomposition into sub-skills, and any prerequisites.',
    nfStageKeys: ['pc-skill', 'pc-start-level', 'pc-end-state', 'pc-decompose', 'pc-prereqs'],
    tokenBudget: 260,
  },
  'pc-pedagogy': {
    label: 'Lessons, drills, milestones',
    instruction: 'Summarise the lesson plan, exercise/drill design, milestone assessments, and worked examples (including common mistakes the reader will make).',
    nfStageKeys: ['pc-lessons', 'pc-drills', 'pc-milestones', 'pc-examples'],
    tokenBudget: 280,
  },

  // ── Academic ──────────────────────────────────────────────────────────────
  'ac-curriculum': {
    label: 'Curriculum & coverage',
    instruction: 'Summarise the syllabus outcome inventory and the chapter plan that maps to it. Include outcome codes verbatim where present.',
    nfStageKeys: ['ac-syllabus', 'ac-chapters'],
    tokenBudget: 280,
  },
}

// Which articles to (re)compile after each NF stage save
const NF_STAGE_TO_ARTICLES: Readonly<Record<string, string[]>> = {
  // DNA stages
  'dna-category':      ['nf-idea'],
  'dna-reader':        ['nf-reader'],
  'dna-transform':     ['nf-reader'],
  'dna-idea':          ['nf-idea'],
  'dna-author':        ['nf-idea'],
  'dna-promise':       ['nf-reader'],
  'dna-comps':         ['nf-positioning'],
  'dna-voice':         ['nf-positioning'],
  'dna-evidence':      ['nf-positioning'],
  'dna-commercial':    ['nf-positioning'],
  'dna-title':         ['nf-positioning'],
  'dna-consolidate':   ['nf-reader', 'nf-idea', 'nf-positioning'],  // full DNA refresh
  'dna-ac-level':      ['nf-positioning'],
  'dna-ac-spec':       ['nf-positioning'],
  'dna-ac-assessment': ['nf-positioning'],

  // Pipeline A
  'pa-thesis':      ['pa-framework'],
  'pa-objections':  ['pa-framework'],
  'pa-framework':   ['pa-framework'],
  'pa-principles':  ['pa-framework'],
  'pa-evidence':    ['pa-application'],
  'pa-application': ['pa-application'],
  'pa-braid':       ['pa-application'],
  'pa-chapters':    ['pa-chapters'],
  'pa-opener':      ['pa-chapters'],

  // Pipeline B
  'pb-thesis':   ['pb-narrative'],
  'pb-cast':     ['pb-narrative'],
  'pb-timeline': ['pb-narrative'],
  'pb-fork':     ['pb-narrative'],
  'pb-theme':    ['pb-narrative'],
  'pb-scenes':   ['pb-scenes'],
  'pb-sourcing': ['pb-scenes'],
  'pb-chapters': ['pb-chapters'],

  // Pipeline C
  'pc-skill':       ['pc-skill'],
  'pc-start-level': ['pc-skill'],
  'pc-end-state':   ['pc-skill'],
  'pc-decompose':   ['pc-skill'],
  'pc-prereqs':     ['pc-skill'],
  'pc-lessons':     ['pc-pedagogy'],
  'pc-drills':      ['pc-pedagogy'],
  'pc-milestones':  ['pc-pedagogy'],
  'pc-examples':    ['pc-pedagogy'],

  // Academic
  'ac-syllabus': ['ac-curriculum'],
  'ac-chapters': ['ac-curriculum'],
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Kick off wiki article compilation after a stage save. Always fire-and-forget —
 * never blocks stage advance or the opening prompt.
 *
 * Dispatches by mode: fiction stages compile from top-level state keys (genre,
 * protagonist, etc.); NF stages compile from state.nfStages[<stageId>] entries.
 */
export function triggerWikiCompilation(
  stageId: string,
  state: ProjectState,
  projectDir: string,
  backendUrl: string,
  getLicenceKey: () => Promise<string | undefined>,
): void {
  const raw = state as unknown as Record<string, unknown>
  const mode = raw['mode']
  if (mode !== 'fiction' && mode !== 'nonfiction') return

  const isNf = mode === 'nonfiction'
  const articleTypes = isNf ? NF_STAGE_TO_ARTICLES[stageId] : STAGE_TO_ARTICLES[stageId]
  if (!articleTypes?.length) return

  const defs = isNf ? NF_ARTICLE_DEFS : ARTICLE_DEFS

  void (async () => {
    const licenceKey = await getLicenceKey().catch(() => undefined)
    if (!licenceKey) return

    const wikiDir = path.join(projectDir, '.storyline', 'wiki')
    try { fs.mkdirSync(wikiDir, { recursive: true }) } catch { /* ignore */ }

    for (const articleType of articleTypes) {
      const def = defs[articleType]
      if (!def) continue
      try {
        await compileArticle(articleType, def, state, wikiDir, backendUrl, licenceKey)
        logInfo(`[Storyline] wiki: compiled ${articleType} after ${stageId} save`)
      } catch (err) {
        logWarn(`[Storyline] wiki: failed to compile ${articleType}`, err)
      }
    }
  })()
}

// ─── Compilation ─────────────────────────────────────────────────────────────

const COMPILE_SYSTEM = `You are a book planning assistant generating compact wiki articles for a novelist's planning tool.

Your output is read by an AI assistant to stay consistent across a 14-stage planning process. Write for an AI reader.

Rules:
- Flowing prose only — no bullet points, no headers, no field names, no JSON.
- Third person ("The protagonist…" not "You…").
- Include only information present in the source data; skip null or missing fields entirely.
- Dense and informative — every sentence must carry meaning.
- Stay within the token budget.
- End with a period.`

async function compileArticle(
  articleType: string,
  def: ArticleDef,
  state: ProjectState,
  wikiDir: string,
  backendUrl: string,
  licenceKey: string,
): Promise<void> {
  const raw = state as unknown as Record<string, unknown>
  const sourceData: Record<string, unknown> = {}

  // Fiction articles: pull from top-level state keys
  if (def.stateKeys) {
    for (const k of def.stateKeys) {
      if (raw[k] != null) sourceData[k] = raw[k]
    }
  }

  // NF articles: pull from state.nfStages[<stageId>]
  if (def.nfStageKeys) {
    const nfStages = (raw['nfStages'] as Record<string, unknown> | undefined) ?? {}
    for (const k of def.nfStageKeys) {
      if (nfStages[k] != null) sourceData[k] = nfStages[k]
    }
  }

  if (Object.keys(sourceData).length === 0) return

  const hash = stateHash(sourceData)
  const filePath = path.join(wikiDir, `${articleType}.md`)

  // Skip recompile when source hasn't changed
  if (fs.existsSync(filePath)) {
    const existing = readFileSafe(filePath)
    if (parseHash(existing) === hash) return
  }

  const userMessage = [
    def.instruction,
    `Target: ${def.tokenBudget} tokens.`,
    '',
    'Planning data:',
    '```json',
    JSON.stringify(sourceData, null, 2),
    '```',
  ].join('\n')

  const body = await fetchCompletion(backendUrl, licenceKey, COMPILE_SYSTEM, userMessage)
  if (!body.trim()) return

  const article = `<!-- compiled: ${new Date().toISOString()} sourceHash: ${hash} -->\n${body.trim()}\n`
  fs.writeFileSync(filePath, article, 'utf-8')

  // Also store to odd-flow so semantic retrieval can find it during prompt
  // assembly (Optimisation 3). Fire-and-forget — never blocks compilation.
  // Dynamic import keeps the test environment free of the vscode dependency
  // chain (memory.ts → vscode).
  void import('../state/memory.js')
    .then(m => m.storeMemoryEntry(`wiki:${articleType}`, body.trim(), [`stage:${articleType}`, 'wiki']))
    .catch(() => { /* non-fatal */ })
}

// ─── Backend call ─────────────────────────────────────────────────────────────

async function fetchCompletion(
  backendUrl: string,
  licenceKey: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const res = await fetch(`${backendUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      licenceKey,
      stageId: 'wiki-compile',
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`/chat ${res.status}: ${text}`)
  }

  return bufferSSE(res)
}

async function bufferSSE(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder()
  let buffer = ''
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') break
      try {
        const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) result += delta
      } catch { /* ignore malformed SSE chunks */ }
    }
  }

  return result
}

// ─── Utilities ────────────────────────────────────────────────────────────────

// djb2-variant hash — fast, good distribution, no crypto needed here
function stateHash(data: unknown): string {
  const str = JSON.stringify(data)
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h, 33) ^ str.charCodeAt(i)
  }
  return (h >>> 0).toString(16)
}

function parseHash(content: string): string | null {
  return content.match(/<!-- compiled:.*? sourceHash: ([a-f0-9]+) -->/)?.[1] ?? null
}

function readFileSafe(filePath: string): string {
  try { return fs.readFileSync(filePath, 'utf-8') } catch { return '' }
}
