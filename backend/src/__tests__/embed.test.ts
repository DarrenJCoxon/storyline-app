import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleEmbed } from '../embed.js'
import { embed, STORYLINE_EMBEDDING_DIMENSIONS, STORYLINE_EMBEDDING_MODEL } from '../embeddings/openai.js'
import type { Env } from '../types.js'

function makeEnv(opts: {
  kvData?: Record<string, unknown>
  fixture?: boolean
  apiKey?: string
} = {}): { env: Env; kv: { data: Record<string, string> } } {
  const data: Record<string, string> = {}
  for (const [k, v] of Object.entries(opts.kvData ?? {})) {
    data[k] = typeof v === 'string' ? v : JSON.stringify(v)
  }
  const kv = {
    data,
    get: vi.fn(async (key: string, type?: string) => {
      const raw = data[key]
      if (raw == null) return null
      if (type === 'json') return JSON.parse(raw)
      return raw
    }),
    put: vi.fn(async (key: string, value: string) => {
      data[key] = value
    }),
  }
  const env: Env = {
    LICENCES: kv as unknown as KVNamespace,
    OPENROUTER_API_KEY: 'unused',
    STRIPE_WEBHOOK_SECRET: 'unused',
    CHAT_MODEL: 'unused',
    IMAGE_MODEL: 'unused',
    OPENAI_API_KEY: opts.apiKey,
    STORYLINE_EMBED_FIXTURE: opts.fixture ? '1' : undefined,
  }
  return { env, kv }
}

function makeReq(body: unknown): Request {
  return new Request('https://api.storyline.app/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validRecord() {
  return {
    type: 'credits' as const,
    valid: true,
    creditBalance: 100,
    totalPurchased: 1000,
    stripeCustomerId: 'cus_test',
  }
}

describe('embed adapter (NT-02 unit)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fixture mode returns deterministic vectors of the right shape', async () => {
    const env = { STORYLINE_EMBED_FIXTURE: '1' }
    const a = await embed(['hello world', 'second chunk'], env)
    const b = await embed(['hello world', 'second chunk'], env)

    expect(a.embeddings).toHaveLength(2)
    expect(a.embeddings[0]).toHaveLength(STORYLINE_EMBEDDING_DIMENSIONS)
    expect(a.model).toBe(STORYLINE_EMBEDDING_MODEL)
    expect(a.totalTokens).toBeGreaterThan(0)
    // Determinism: same input → same vector across calls.
    expect(a.embeddings[0]).toEqual(b.embeddings[0])
    // Different inputs → different vectors.
    expect(a.embeddings[0]).not.toEqual(a.embeddings[1])
  })

  it('returns empty result for empty input without calling OpenAI', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await embed([], { OPENAI_API_KEY: 'sk-test' })
    expect(result.embeddings).toHaveLength(0)
    expect(result.totalTokens).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws EmbedConfigError when OPENAI_API_KEY is missing', async () => {
    await expect(embed(['some text'], {})).rejects.toThrow(/OPENAI_API_KEY/)
  })

  it('batches inputs above the 2048 cap into multiple OpenAI calls', async () => {
    let callCount = 0
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      callCount++
      const body = JSON.parse(init!.body as string) as { input: string[] }
      const data = body.input.map((_t, i) => ({
        embedding: new Array(STORYLINE_EMBEDDING_DIMENSIONS).fill(0),
        index: i,
      }))
      return new Response(
        JSON.stringify({ data, usage: { prompt_tokens: 100, total_tokens: 100 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchSpy)

    const inputs = new Array(2050).fill('chunk').map((c, i) => `${c}-${i}`)
    const result = await embed(inputs, { OPENAI_API_KEY: 'sk-test' })

    expect(callCount).toBe(2) // 2048 + 2
    expect(result.embeddings).toHaveLength(2050)
  })

  it('retries on 429 and succeeds on the second attempt', async () => {
    let attempt = 0
    const fetchSpy = vi.fn(async () => {
      attempt++
      if (attempt === 1) {
        return new Response('rate limited', { status: 429 })
      }
      return new Response(
        JSON.stringify({
          data: [{ embedding: new Array(STORYLINE_EMBEDDING_DIMENSIONS).fill(0), index: 0 }],
          usage: { prompt_tokens: 5, total_tokens: 5 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await embed(['retry me'], { OPENAI_API_KEY: 'sk-test' })
    expect(result.embeddings).toHaveLength(1)
    expect(attempt).toBe(2)
  })

  it('does not retry on non-retryable 4xx (e.g. 401)', async () => {
    const fetchSpy = vi.fn(async () => new Response('unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchSpy)
    await expect(embed(['x'], { OPENAI_API_KEY: 'sk-bad' })).rejects.toThrow(/401/)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('POST /embed (NT-02 handler)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects requests with missing fields', async () => {
    const { env } = makeEnv({ fixture: true })
    const res = await handleEmbed(makeReq({ licenceKey: 'SL-X' }), env)
    expect(res.status).toBe(400)
  })

  it('rejects an unknown licence key', async () => {
    const { env } = makeEnv({ fixture: true, kvData: {} })
    const res = await handleEmbed(
      makeReq({ licenceKey: 'SL-NOPE', texts: ['hi'] }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it('rejects BYOK licences (they embed locally)', async () => {
    const { env } = makeEnv({
      fixture: true,
      kvData: {
        'SL-BYOK': {
          ...validRecord(),
          type: 'byok',
        },
      },
    })
    const res = await handleEmbed(
      makeReq({ licenceKey: 'SL-BYOK', texts: ['hi'] }),
      env,
    )
    expect(res.status).toBe(403)
  })

  it('happy path — returns vectors and increments daily budget', async () => {
    const { env, kv } = makeEnv({
      fixture: true,
      kvData: { 'SL-OK': validRecord() },
    })
    const res = await handleEmbed(
      makeReq({ licenceKey: 'SL-OK', texts: ['scene one', 'scene two'] }),
      env,
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      embeddings: number[][]
      model: string
      totalTokens: number
      budgetUsed: number
      budgetLimit: number
    }
    expect(json.embeddings).toHaveLength(2)
    expect(json.embeddings[0]).toHaveLength(STORYLINE_EMBEDDING_DIMENSIONS)
    expect(json.model).toBe(STORYLINE_EMBEDDING_MODEL)
    expect(json.totalTokens).toBeGreaterThan(0)
    expect(json.budgetUsed).toBe(json.totalTokens)
    expect(json.budgetLimit).toBe(10_000_000)

    // Budget was persisted under today's date.
    const today = new Date().toISOString().slice(0, 10)
    const budgetKey = `embed:budget:SL-OK:${today}`
    expect(kv.data[budgetKey]).toBe(String(json.totalTokens))
  })

  it('accumulates budget across multiple calls', async () => {
    const { env } = makeEnv({
      fixture: true,
      kvData: { 'SL-OK': validRecord() },
    })

    const r1 = await handleEmbed(makeReq({ licenceKey: 'SL-OK', texts: ['a'] }), env)
    const j1 = (await r1.json()) as { budgetUsed: number; totalTokens: number }
    const r2 = await handleEmbed(makeReq({ licenceKey: 'SL-OK', texts: ['b'] }), env)
    const j2 = (await r2.json()) as { budgetUsed: number; totalTokens: number }

    expect(j2.budgetUsed).toBe(j1.budgetUsed + j2.totalTokens)
  })

  it('rejects when daily budget already exceeded', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const { env } = makeEnv({
      fixture: true,
      kvData: {
        'SL-OK': validRecord(),
        [`embed:budget:SL-OK:${today}`]: '10000000',
      },
    })
    const res = await handleEmbed(
      makeReq({ licenceKey: 'SL-OK', texts: ['x'] }),
      env,
    )
    expect(res.status).toBe(429)
  })

  it('rejects too many input texts in one request', async () => {
    const { env } = makeEnv({
      fixture: true,
      kvData: { 'SL-OK': validRecord() },
    })
    const tooMany = new Array(2049).fill('chunk')
    const res = await handleEmbed(
      makeReq({ licenceKey: 'SL-OK', texts: tooMany }),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('returns empty result without charging budget when texts is empty', async () => {
    const { env, kv } = makeEnv({
      fixture: true,
      kvData: { 'SL-OK': validRecord() },
    })
    const res = await handleEmbed(
      makeReq({ licenceKey: 'SL-OK', texts: [] }),
      env,
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { embeddings: number[][]; totalTokens: number }
    expect(json.embeddings).toHaveLength(0)
    expect(json.totalTokens).toBe(0)

    // No budget key written for an empty call.
    const today = new Date().toISOString().slice(0, 10)
    expect(kv.data[`embed:budget:SL-OK:${today}`]).toBeUndefined()
  })
})
