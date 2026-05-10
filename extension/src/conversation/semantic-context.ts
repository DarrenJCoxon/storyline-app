import { getSemanticMemoryService } from '../state/semantic-memory-service.js'
import { readSemanticMemoryConfig } from '../state/semantic-memory.js'
import { logVerbose } from '../diagnostic-log.js'

/**
 * NT-21 — per-turn semantic retrieval. The complement to NT-20's manifest:
 * the manifest tells the AI **what files exist**; this block tells it
 * **what's in the files relevant to this specific turn**.
 *
 * Implementation: every chat turn embeds the writer's most recent message,
 * pulls top-K chunks from NuVector, and renders them as a markdown block
 * the system prompt can carry. Bounded — topK + per-chunk size cap keeps
 * the block well under the 160 KB system-prompt ceiling.
 *
 * No-ops cleanly when:
 * - semantic memory is disabled (the writer hasn't opted in)
 * - the service hasn't been instantiated yet (first activation pass)
 * - the message is empty / synthetic
 * - the index is empty (no chunks upserted yet)
 */

interface BuildOpts {
  /** The writer's most recent message — primary retrieval signal. */
  userMessage: string
  /** Active planning stage. Used as a tie-breaker context if the message is short. */
  stageId?: string
  /** How many hits to include. Default 6 — tuned for prompt budget. */
  topK?: number
  /** Max characters per chunk in the rendered block. Default 1200. */
  perChunkMaxChars?: number
}

/** Returns an empty string when there's nothing relevant to inject. */
export async function buildSemanticContextBlock(opts: BuildOpts): Promise<string> {
  const cfg = readSemanticMemoryConfig()
  if (!cfg.enabled) return ''
  const service = getSemanticMemoryService()
  if (!service) return ''

  const query = composeQuery(opts.userMessage, opts.stageId)
  if (!query) return ''

  const topK = opts.topK ?? 6
  const perChunkMaxChars = opts.perChunkMaxChars ?? 1200

  let pack
  try {
    pack = await service.search(query, { topK })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logVerbose(`[Storyline] semantic-context: search failed: ${msg}`)
    return ''
  }
  if (!pack || pack.items.length === 0) return ''

  const lines: string[] = []
  lines.push('## Project context relevant to this turn')
  lines.push('')
  lines.push(
    '_Top semantic-memory hits for the writer\'s most recent message. Use these as authoritative excerpts of what already exists in the project — do not invent content that contradicts them. Reference paths come from the Project files manifest above._',
  )
  lines.push('')

  for (const item of pack.items) {
    const heading = humanLabel(item.ref)
    const score = `${(item.score * 100).toFixed(0)}%`
    const body = truncate(item.text ?? item.summary ?? '', perChunkMaxChars)
    lines.push(`### ${heading} (relevance ${score})`)
    if (body) {
      lines.push('')
      lines.push(body)
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

/**
 * Build the retrieval query. Strategy:
 * - If the user message has substance (>= 8 chars after trim), use it as-is.
 * - If short or empty, fall back to a stage-flavoured prompt so retrieval
 *   still surfaces something useful (the synthetic save-intent flow uses
 *   "Please emit the save block" — useless as a query, so we substitute).
 */
function composeQuery(userMessage: string, stageId?: string): string {
  const trimmed = userMessage.trim()
  if (trimmed.length >= 8 && !isSyntheticMessage(trimmed)) {
    return trimmed.slice(0, 1200) // cap to keep embedding fast on long messages
  }
  if (stageId) return `current planning stage: ${stageId}`
  return ''
}

const SYNTHETIC_MESSAGES = [
  'Please emit the save block for this stage now.',
  'continue',
  'next',
  'ok',
  'yes',
  'no',
]

function isSyntheticMessage(s: string): boolean {
  const lower = s.toLowerCase()
  return SYNTHETIC_MESSAGES.some(syn => lower === syn.toLowerCase())
}

/** Maps a NuVector chunk id to a writer-friendly label. Same shape as the
 *  search command's quick-pick labels — kept in sync intentionally. */
function humanLabel(chunkId: string): string {
  const stripped = chunkId.replace(/^book:[^/]+\//, '')
  const sceneMatch = /^scene:ch(\d+)-s(\d+)$/.exec(stripped)
  if (sceneMatch) return `Chapter ${sceneMatch[1]}, scene ${sceneMatch[2]}`
  const chapterMatch = /^chapter:(\d+)$/.exec(stripped)
  if (chapterMatch) return `Chapter ${chapterMatch[1]}`
  const stageMatch = /^stage:(.+)$/.exec(stripped)
  if (stageMatch) return `Planning — ${stageMatch[1]}`
  const researchMatch = /^research:(.+)$/.exec(stripped)
  if (researchMatch) return `Research — ${researchMatch[1]}`
  return stripped
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}
