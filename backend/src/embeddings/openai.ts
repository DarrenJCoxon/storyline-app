/**
 * OpenAI embedding adapter — single chokepoint for every embedding call.
 *
 * Pure I/O abstraction: takes texts, returns vectors. Knows nothing about
 * licences or budgets — those concerns live in the route handler.
 *
 * Locked to `text-embedding-3-small` (1536 dimensions, $0.02 / million
 * tokens). Swapping providers later (Voyage, Cohere) means changing the
 * single `embed()` implementation here; no caller has to change.
 */

export const STORYLINE_EMBEDDING_MODEL = 'text-embedding-3-small'
export const STORYLINE_EMBEDDING_DIMENSIONS = 1536

/** OpenAI's per-request input array cap. */
const OPENAI_BATCH_MAX = 2048

/** Retry parameters for transient upstream errors. */
const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 250

export interface EmbedAdapterEnv {
  OPENAI_API_KEY?: string
  /** When set to '1', return deterministic fake vectors instead of calling
   *  OpenAI. Used by unit tests so they don't burn API budget. */
  STORYLINE_EMBED_FIXTURE?: string
}

export interface EmbedResult {
  embeddings: number[][]
  totalTokens: number
  model: string
}

export class EmbedConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmbedConfigError'
  }
}

export class EmbedUpstreamError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`OpenAI embeddings ${status}: ${body.slice(0, 200)}`)
    this.name = 'EmbedUpstreamError'
    this.status = status
    this.body = body
  }
}

/**
 * Embed an array of texts. Transparently splits into OpenAI batches of
 * up to {@link OPENAI_BATCH_MAX} inputs and retries transient failures
 * with exponential backoff + jitter.
 *
 * The returned `embeddings` array is in the same order as `texts`.
 */
export async function embed(
  texts: string[],
  env: EmbedAdapterEnv,
): Promise<EmbedResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, model: STORYLINE_EMBEDDING_MODEL }
  }

  if (env.STORYLINE_EMBED_FIXTURE === '1') {
    return fixtureEmbed(texts)
  }

  if (!env.OPENAI_API_KEY) {
    throw new EmbedConfigError('OPENAI_API_KEY is not configured')
  }

  const out: number[][] = new Array(texts.length)
  let totalTokens = 0

  for (let offset = 0; offset < texts.length; offset += OPENAI_BATCH_MAX) {
    const batch = texts.slice(offset, offset + OPENAI_BATCH_MAX)
    const batchResult = await callOpenAIWithRetry(batch, env.OPENAI_API_KEY)
    for (let i = 0; i < batchResult.embeddings.length; i++) {
      out[offset + i] = batchResult.embeddings[i]
    }
    totalTokens += batchResult.totalTokens
  }

  return { embeddings: out, totalTokens, model: STORYLINE_EMBEDDING_MODEL }
}

/**
 * Deterministic fake vectors for tests. Same `text` always returns the
 * same vector so test assertions on similarity ordering are stable.
 */
function fixtureEmbed(texts: string[]): EmbedResult {
  const embeddings = texts.map(deterministicVector)
  // Cheap token estimate — close enough for tests that exercise budget logic.
  const totalTokens = texts.reduce((sum, t) => sum + Math.max(1, Math.ceil(t.length / 4)), 0)
  return { embeddings, totalTokens, model: STORYLINE_EMBEDDING_MODEL }
}

function deterministicVector(text: string): number[] {
  const seed = hashString(text)
  const v = new Array<number>(STORYLINE_EMBEDDING_DIMENSIONS)
  for (let i = 0; i < v.length; i++) {
    v[i] = Math.sin(seed * 0.000_173 + i * 0.001)
  }
  return v
}

function hashString(s: string): number {
  // FNV-1a 32-bit. Cheap, deterministic, no crypto dependency.
  let h = 0x811c_9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x0100_0193)
  }
  return h >>> 0
}

interface OpenAIBatchResult {
  embeddings: number[][]
  totalTokens: number
}

async function callOpenAIWithRetry(
  batch: string[],
  apiKey: string,
): Promise<OpenAIBatchResult> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await callOpenAIOnce(batch, apiKey)
    } catch (e) {
      lastError = e
      const retryable =
        e instanceof EmbedUpstreamError &&
        (e.status === 429 || (e.status >= 500 && e.status < 600))
      const networkError = !(e instanceof EmbedUpstreamError)
      if (!retryable && !networkError) {
        throw e
      }
      if (attempt === MAX_ATTEMPTS - 1) break
      const backoff =
        BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 100)
      await sleep(backoff)
    }
  }
  if (lastError instanceof Error) throw lastError
  throw new Error('OpenAI embeddings failed after retries')
}

async function callOpenAIOnce(
  batch: string[],
  apiKey: string,
): Promise<OpenAIBatchResult> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: STORYLINE_EMBEDDING_MODEL,
      input: batch,
      encoding_format: 'float',
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new EmbedUpstreamError(res.status, text)
  }

  const json = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>
    usage: { prompt_tokens: number; total_tokens: number }
  }

  // OpenAI guarantees same-order responses, but defensively sort by `index`.
  const embeddings = new Array<number[]>(batch.length)
  for (const item of json.data) {
    embeddings[item.index] = item.embedding
  }

  return {
    embeddings,
    totalTokens: json.usage?.total_tokens ?? 0,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
