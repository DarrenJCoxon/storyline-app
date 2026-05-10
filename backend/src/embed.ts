import type { Env, LicenceRecord } from './types.js'
import { getDevLicenceRecord } from './dev-bypass.js'
import { checkRateLimit, rateLimitedResponse } from './rate-limit.js'
import {
  embed,
  EmbedConfigError,
  EmbedUpstreamError,
  STORYLINE_EMBEDDING_MODEL,
} from './embeddings/openai.js'

/**
 * POST /embed — semantic-memory embedding endpoint for the Storyline
 * extension. Sends text chunks to OpenAI's `text-embedding-3-small` and
 * returns 1536-dim vectors. The vectors flow back to the writer's local
 * NuVector store; only the embedding step leaves the machine.
 *
 * Charges no credits — embeddings are cheap ($0.02/M tokens) and treating
 * them like chat calls would be punitive. Abuse is bounded by the per-key
 * daily token budget below.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

/** Daily token budget per licence key. 10M tokens covers re-indexing a
 *  full novel (~130k tokens) about 75 times. Generous for honest use,
 *  tight enough that a leaked key can't cost more than ~$0.20/day. */
const DAILY_TOKEN_BUDGET = 10_000_000

/** Max texts in a single /embed request — OpenAI's per-call cap. The
 *  adapter splits internally too, but bounding here protects KV/Worker
 *  memory if a misbehaving client sends a million inputs in one call. */
const MAX_INPUT_TEXTS = 2048

/** Max bytes for the request body. */
const MAX_BODY_BYTES = 4_194_304 // 4 MB — comfortably fits 2048 chunks.

interface EmbedRequest {
  licenceKey: string
  texts: string[]
}

interface EmbedResponseBody {
  embeddings: number[][]
  model: string
  totalTokens: number
  /** Tokens consumed by this licence so far today, after this call. */
  budgetUsed: number
  /** Total daily budget. Lets the client surface progress in UI. */
  budgetLimit: number
}

export async function handleEmbed(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  const cl = req.headers.get('Content-Length')
  if (cl && parseInt(cl, 10) > MAX_BODY_BYTES) {
    return errJson(`Request body too large (max ${MAX_BODY_BYTES} bytes)`, 413)
  }

  let body: EmbedRequest
  try {
    body = (await req.json()) as EmbedRequest
  } catch {
    return errJson('Invalid JSON', 400)
  }

  if (!body.licenceKey || !Array.isArray(body.texts)) {
    return errJson('licenceKey and texts (string[]) are required', 400)
  }
  if (body.texts.length === 0) {
    return jsonResponse({
      embeddings: [],
      model: STORYLINE_EMBEDDING_MODEL,
      totalTokens: 0,
      budgetUsed: 0,
      budgetLimit: DAILY_TOKEN_BUDGET,
    })
  }
  if (body.texts.length > MAX_INPUT_TEXTS) {
    return errJson(`Too many inputs (max ${MAX_INPUT_TEXTS} per request)`, 400)
  }
  for (const t of body.texts) {
    if (typeof t !== 'string') {
      return errJson('Every entry in texts must be a string', 400)
    }
  }

  const [rlKey, rlIp] = await Promise.all([
    checkRateLimit(req, env, {
      prefix: 'rl:embed:key',
      max: 60,
      windowSecs: 60,
      id: body.licenceKey,
    }),
    checkRateLimit(req, env, { prefix: 'rl:embed:ip', max: 200, windowSecs: 60 }),
  ])
  if (rlKey.limited || rlIp.limited) {
    return rateLimitedResponse(Math.max(rlKey.retryAfter, rlIp.retryAfter))
  }

  let record: LicenceRecord | null
  try {
    record = await env.LICENCES.get<LicenceRecord>(body.licenceKey, 'json')
  } catch (e) {
    console.error('[/embed] KV read error:', e)
    return errJson('Service temporarily unavailable', 503)
  }
  if (!record) record = getDevLicenceRecord(body.licenceKey, req.url, env)
  if (!record || !record.valid) {
    return errJson('Invalid licence key', 401)
  }
  if (record.type === 'byok') {
    return errJson('BYOK licences embed locally — no managed proxy needed', 403)
  }

  const budgetKey = budgetKeyFor(body.licenceKey)
  const budgetUsedBefore = await readBudgetUsed(env, budgetKey)
  if (budgetUsedBefore >= DAILY_TOKEN_BUDGET) {
    logBudgetExceeded(body.licenceKey, budgetUsedBefore)
    return errJson('Daily embedding budget exceeded — resets at 00:00 UTC', 429)
  }

  let result
  try {
    result = await embed(body.texts, env)
  } catch (e) {
    if (e instanceof EmbedConfigError) {
      console.error('[/embed] config error:', e.message)
      return errJson('Embedding service misconfigured', 503)
    }
    if (e instanceof EmbedUpstreamError) {
      console.error('[/embed] upstream error:', e.status, e.body.slice(0, 200))
      return errJson('Embedding upstream error', 502)
    }
    console.error('[/embed] unexpected error:', e)
    return errJson('Could not generate embeddings', 502)
  }

  const budgetUsedAfter = budgetUsedBefore + result.totalTokens
  await writeBudgetUsed(env, budgetKey, budgetUsedAfter)

  return jsonResponse({
    embeddings: result.embeddings,
    model: result.model,
    totalTokens: result.totalTokens,
    budgetUsed: budgetUsedAfter,
    budgetLimit: DAILY_TOKEN_BUDGET,
  } satisfies EmbedResponseBody)
}

function budgetKeyFor(licenceKey: string): string {
  const day = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return `embed:budget:${licenceKey}:${day}`
}

async function readBudgetUsed(env: Env, key: string): Promise<number> {
  try {
    const raw = await env.LICENCES.get(key)
    if (!raw) return 0
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch (e) {
    console.error('[/embed] budget read failed:', e)
    return 0
  }
}

async function writeBudgetUsed(env: Env, key: string, used: number): Promise<void> {
  try {
    // 48-hour TTL gives the value time to be read while it's still relevant
    // for "today" without stockpiling stale daily counters.
    await env.LICENCES.put(key, String(used), { expirationTtl: 48 * 60 * 60 })
  } catch (e) {
    console.error('[/embed] budget write failed:', e)
  }
}

function logBudgetExceeded(licenceKey: string, used: number): void {
  console.error(
    JSON.stringify({
      kind: 'embed-budget-exceeded',
      licenceKeyPrefix: licenceKey.slice(0, 12),
      tokensUsedToday: used,
      dailyBudget: DAILY_TOKEN_BUDGET,
      ts: new Date().toISOString(),
    }),
  )
}

function jsonResponse(body: EmbedResponseBody): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function errJson(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
