import * as fs from 'fs'
import * as path from 'path'
import { logInfo, logWarn } from '../diagnostic-log.js'

export interface IntegrityWarning {
  kind: 'contradiction' | 'drift' | 'gap'
  article: string
  relatedArticle: string
  description: string
  suggestion: string
}

// Which articles are semantically related — used to pick comparison targets.
const RELATED_ARTICLES: Readonly<Record<string, string[]>> = {
  world:       ['protagonist', 'cast', 'structure', 'logline'],
  protagonist: ['cast', 'structure', 'world', 'scenes'],
  cast:        ['protagonist', 'structure', 'relationships', 'world'],
  logline:     ['world', 'protagonist', 'structure'],
  structure:   ['protagonist', 'cast', 'scenes', 'themes', 'world'],
  scenes:      ['structure', 'protagonist', 'cast', 'themes'],
  themes:      ['structure', 'scenes', 'protagonist'],
  // NF
  'nf-reader':      ['nf-idea', 'nf-positioning', 'pa-framework', 'pb-narrative', 'pc-skill'],
  'nf-idea':        ['nf-reader', 'nf-positioning', 'pa-framework', 'pb-narrative', 'pc-skill'],
  'nf-positioning': ['nf-reader', 'nf-idea', 'pa-framework', 'pb-narrative', 'pc-skill'],
  'pa-framework':   ['nf-reader', 'nf-idea', 'nf-positioning', 'pa-application', 'pa-chapters'],
  'pa-application': ['pa-framework', 'pa-chapters', 'nf-reader', 'nf-idea'],
  'pa-chapters':    ['pa-framework', 'pa-application', 'nf-positioning'],
  'pb-narrative':   ['nf-reader', 'nf-idea', 'nf-positioning', 'pb-scenes', 'pb-chapters'],
  'pb-scenes':      ['pb-narrative', 'pb-chapters', 'nf-idea'],
  'pb-chapters':    ['pb-narrative', 'pb-scenes', 'nf-positioning'],
  'pc-skill':       ['nf-reader', 'nf-idea', 'nf-positioning', 'pc-pedagogy'],
  'pc-pedagogy':    ['pc-skill', 'nf-reader', 'nf-idea'],
  'ac-curriculum':  ['nf-reader', 'nf-idea', 'nf-positioning'],
}

/**
 * Check a freshly-compiled wiki article against its most semantically related
 * articles for contradictions, drift, or gaps. Runs async and returns warnings
 * that the chat panel can surface as non-blocking findings cards.
 *
 * Uses the same backend /chat endpoint as the rest of the extension
 * (DeepSeek via OpenRouter) — no separate model needed.
 */
export async function checkWikiIntegrity(
  changedArticle: string,
  projectDir: string,
  backendUrl: string,
  licenceKey: string,
): Promise<IntegrityWarning[]> {
  const related = RELATED_ARTICLES[changedArticle]
  if (!related?.length) return []

  const wikiDir = path.join(projectDir, '.storyline', 'wiki')

  const changedPath = path.join(wikiDir, `${changedArticle}.md`)
  if (!fs.existsSync(changedPath)) return []
  const changedText = readArticleBody(changedPath)
  if (!changedText) return []

  const targets = related
    .map(r => ({
      name: r,
      path: path.join(wikiDir, `${r}.md`),
    }))
    .filter(t => fs.existsSync(t.path))
    .map(t => ({ name: t.name, body: readArticleBody(t.path) }))
    .filter(t => t.body)
    .slice(0, 3)

  if (targets.length === 0) return []

  const prompt = buildPrompt(changedArticle, changedText, targets)

  try {
    const raw = await fetchCompletion(backendUrl, licenceKey, prompt)
    return parseResponse(raw)
  } catch (err) {
    logWarn('[Storyline] integrity check failed:', err)
    return []
  }
}

function readArticleBody(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    // Strip the HTML comment header <!-- compiled: ... sourceHash: ... -->
    return content.replace(/<!-- compiled:.*?sourceHash:.*?-->/, '').trim()
  } catch {
    return ''
  }
}

function buildPrompt(
  changedArticle: string,
  changedText: string,
  targets: Array<{ name: string; body: string }>,
): string {
  const targetBlocks = targets
    .map((t, i) => `--- Article ${i + 1}: ${t.name} ---\n${t.body}`)
    .join('\n\n')

  return `You are a book-planning continuity editor.

The writer just updated their planning wiki article "${changedArticle}". Compare it against the related articles below. Look for:
- contradictions: facts in "${changedArticle}" that directly conflict with related articles
- drift: gradual changes that undermine earlier decisions (e.g. protagonist flaw changed after beats were built on the original)
- gaps: important information missing from "${changedArticle}" that related articles assume exists

Updated article:
---
${changedText}

Related articles:
${targetBlocks}

Return ONLY a JSON array of warnings. If nothing is wrong, return [].
Each warning must have exactly these fields:
- kind: "contradiction" | "drift" | "gap"
- article: the article name (always "${changedArticle}")
- relatedArticle: which related article the issue concerns
- description: one sentence explaining the issue in plain English
- suggestion: one concrete action the writer should take

Max 3 warnings. Prioritise the most serious issues.`
}

async function fetchCompletion(
  backendUrl: string,
  licenceKey: string,
  userMessage: string,
): Promise<string> {
  const res = await fetch(`${backendUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      licenceKey,
      stageId: 'integrity-check',
      systemPrompt: 'You are a continuity editor. You detect contradictions, drift, and gaps in book planning documents. Always respond with ONLY a JSON array — no markdown, no prose outside the JSON.',
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

function parseResponse(raw: string): IntegrityWarning[] {
  // Try to extract JSON from the raw text (model may wrap it in markdown)
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      kind?: string
      article?: string
      relatedArticle?: string
      description?: string
      suggestion?: string
    }>
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(w => w.kind && w.description)
      .map(w => ({
        kind: (w.kind === 'contradiction' || w.kind === 'drift' || w.kind === 'gap')
          ? w.kind
          : 'drift',
        article: w.article || '',
        relatedArticle: w.relatedArticle || '',
        description: String(w.description),
        suggestion: String(w.suggestion || ''),
      }))
  } catch {
    return []
  }
}
