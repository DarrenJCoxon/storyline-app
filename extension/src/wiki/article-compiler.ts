import * as fs from 'fs'
import * as path from 'path'
import type { ProjectState } from '@storyline/core'
import { logInfo, logWarn } from '../diagnostic-log.js'

// ─── Article definitions ──────────────────────────────────────────────────────

interface ArticleDef {
  label: string
  instruction: string   // what to compile — appended after the base prompt
  stateKeys: string[]   // which top-level state keys feed this article
  tokenBudget: number   // target output length hint (passed in prompt)
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Kick off wiki article compilation after a stage save. Always fire-and-forget —
 * never blocks stage advance or the opening prompt.
 */
export function triggerWikiCompilation(
  stageId: string,
  state: ProjectState,
  projectDir: string,
  backendUrl: string,
  getLicenceKey: () => Promise<string | undefined>,
): void {
  const raw = state as unknown as Record<string, unknown>
  if (raw['mode'] !== 'fiction') return  // NF wiki: future iteration

  const articleTypes = STAGE_TO_ARTICLES[stageId]
  if (!articleTypes?.length) return

  void (async () => {
    const licenceKey = await getLicenceKey().catch(() => undefined)
    if (!licenceKey) return

    const wikiDir = path.join(projectDir, '.storyline', 'wiki')
    try { fs.mkdirSync(wikiDir, { recursive: true }) } catch { /* ignore */ }

    for (const articleType of articleTypes) {
      const def = ARTICLE_DEFS[articleType]
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
  for (const k of def.stateKeys) {
    if (raw[k] != null) sourceData[k] = raw[k]
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
