import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleCritique } from '../critique.js'
import type { Env } from '../types.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEnv(kvData: Record<string, unknown>): Env {
  return {
    LICENCES: {
      get: vi.fn(async (key: string, _type: string) => {
        const val = kvData[key]
        return val ?? null
      }),
      put: vi.fn(),
    } as unknown as KVNamespace,
    OPENROUTER_API_KEY: 'test-key',
    STRIPE_WEBHOOK_SECRET: 'test',
    IMAGE_MODEL: 'test',
    CHAT_MODEL: 'deepseek/test',
  }
}

function makeReq(body: unknown): Request {
  return new Request('https://api.storyline.app/critique', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validRecord(creditBalance = 100) {
  return {
    type: 'credits' as const,
    valid: true,
    creditBalance,
    totalPurchased: 1000,
    stripeCustomerId: 'cus_test',
  }
}

function validState(): Record<string, unknown> {
  return { genre: { primaryGenre: 'Thriller' } }
}

function mockOpenRouterSuccess(findings = 'TIER: structural\n✅ Structurally sound.') {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: findings } }],
        model: 'deepseek/test',
        usage: { total_tokens: 123 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  )
}

function mockOpenRouterFailure(status = 500) {
  return vi.fn(async () =>
    new Response('Internal Server Error', { status }),
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /critique', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ── Happy path — explicit validate tier ──────────────────────────────────────

  it('returns findings for a valid request with explicit validate tier', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(50) })
    vi.stubGlobal('fetch', mockOpenRouterSuccess('TIER: validate\n✅ Schema check passes.'))

    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'genre', tier: 'validate', state: validState() }),
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { findings: string; modelUsed: string; tier: string; tokensUsed: number }
    expect(body.findings).toContain('validate')
    expect(body.tier).toBe('validate')
    expect(body.modelUsed).toBe('deepseek/test')
    expect(body.tokensUsed).toBe(123)
  })

  // ── Tier derived from stageId ─────────────────────────────────────────────

  it('derives validate tier when tier is omitted and stageId is "genre"', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(50) })
    const fetchMock = mockOpenRouterSuccess('TIER: validate\n✅ Schema check passes.')
    vi.stubGlobal('fetch', fetchMock)

    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'genre', state: validState() }),
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { tier: string }
    expect(body.tier).toBe('validate')

    // Verify system prompt sent to OpenRouter contained 'validate' indicator
    const callArgs = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    const requestBody = JSON.parse(callArgs[1].body)
    expect(requestBody.messages[0].role).toBe('system')
    expect(requestBody.messages[0].content).toContain('schema validator')
  })

  it('derives synthesis tier for stageId "critique"', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(50) })
    const fetchMock = mockOpenRouterSuccess('TIER: synthesis\n✅ Cross-stage check passes.')
    vi.stubGlobal('fetch', fetchMock)

    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'critique', state: validState() }),
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { tier: string }
    expect(body.tier).toBe('synthesis')
  })

  it('derives prose tier for stageId "draftCritique"', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(50) })
    const fetchMock = mockOpenRouterSuccess('TIER: structural\n✅ Faithful to the plan.')
    vi.stubGlobal('fetch', fetchMock)

    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'draftCritique', state: validState() }),
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { tier: string }
    expect(body.tier).toBe('prose')
  })

  it('derives structural tier for an unrecognised stageId', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(50) })
    const fetchMock = mockOpenRouterSuccess('TIER: structural\n✅ Structurally sound.')
    vi.stubGlobal('fetch', fetchMock)

    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'beatSheet', state: validState() }),
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { tier: string }
    expect(body.tier).toBe('structural')
  })

  // ── Auth / credit checks ──────────────────────────────────────────────────

  it('returns 401 for an unknown licence key', async () => {
    const env = makeEnv({})
    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-FAKE', stageId: 'genre', state: validState() }),
      env,
    )
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Invalid licence key')
  })

  it('returns 401 for a licence with valid=false', async () => {
    const env = makeEnv({ 'SL-BAD': { ...validRecord(), valid: false } })
    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-BAD', stageId: 'genre', state: validState() }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it('returns 402 when credit balance is below tier cost', async () => {
    // validate costs 1 credit — 0 balance should 402
    const env = makeEnv({ 'SL-BROKE': validRecord(0) })
    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-BROKE', stageId: 'genre', tier: 'validate', state: validState() }),
      env,
    )
    expect(res.status).toBe(402)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Credits exhausted')
  })

  it('returns 402 when balance is less than synthesis cost (8)', async () => {
    const env = makeEnv({ 'SL-LOW': validRecord(5) }) // 5 < 8
    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-LOW', stageId: 'critique', tier: 'synthesis', state: validState() }),
      env,
    )
    expect(res.status).toBe(402)
  })

  // ── Credit deduction amounts ──────────────────────────────────────────────

  it('deducts 1 credit for validate tier', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(10) })
    vi.stubGlobal('fetch', mockOpenRouterSuccess())

    await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'genre', tier: 'validate', state: validState() }),
      env,
    )

    const putCalls = (env.LICENCES.put as ReturnType<typeof vi.fn>).mock.calls
    const deductCall = putCalls.find(([key]) => key === 'SL-GOOD')!
    const stored = JSON.parse(deductCall[1] as string) as { creditBalance: number }
    expect(stored.creditBalance).toBe(9) // 10 - 1
  })

  it('deducts 3 credits for structural tier', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(10) })
    vi.stubGlobal('fetch', mockOpenRouterSuccess())

    await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'beatSheet', tier: 'structural', state: validState() }),
      env,
    )

    const putCalls = (env.LICENCES.put as ReturnType<typeof vi.fn>).mock.calls
    const stored = JSON.parse(putCalls.find(([key]) => key === 'SL-GOOD')![1] as string) as { creditBalance: number }
    expect(stored.creditBalance).toBe(7) // 10 - 3
  })

  it('deducts 8 credits for synthesis tier', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(20) })
    vi.stubGlobal('fetch', mockOpenRouterSuccess())

    await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'critique', tier: 'synthesis', state: validState() }),
      env,
    )

    const putCalls = (env.LICENCES.put as ReturnType<typeof vi.fn>).mock.calls
    const stored = JSON.parse(putCalls.find(([key]) => key === 'SL-GOOD')![1] as string) as { creditBalance: number }
    expect(stored.creditBalance).toBe(12) // 20 - 8
  })

  it('deducts 5 credits for prose tier', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(10) })
    vi.stubGlobal('fetch', mockOpenRouterSuccess())

    await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'draftCritique', tier: 'prose', state: validState() }),
      env,
    )

    const putCalls = (env.LICENCES.put as ReturnType<typeof vi.fn>).mock.calls
    const stored = JSON.parse(putCalls.find(([key]) => key === 'SL-GOOD')![1] as string) as { creditBalance: number }
    expect(stored.creditBalance).toBe(5) // 10 - 5
  })

  // ── OpenRouter failure → refund ───────────────────────────────────────────

  it('refunds credits and returns 502 when OpenRouter fails', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(10) })
    vi.stubGlobal('fetch', mockOpenRouterFailure(503))

    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'genre', tier: 'validate', state: validState() }),
      env,
    )

    expect(res.status).toBe(502)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Upstream error 503')

    // Two licence puts: deduction then refund (rate-limit counter puts are interleaved but filtered out)
    const putCalls = (env.LICENCES.put as ReturnType<typeof vi.fn>).mock.calls
    const licencePuts = putCalls.filter(([key]) => key === 'SL-GOOD')
    expect(licencePuts.length).toBe(2)

    // Refund restores original balance (10)
    const refundStored = JSON.parse(licencePuts[1][1] as string) as { creditBalance: number }
    expect(refundStored.creditBalance).toBe(10)
  })

  // ── Validation ────────────────────────────────────────────────────────────

  it('returns 400 when licenceKey is missing', async () => {
    const env = makeEnv({})
    const res = await handleCritique(
      makeReq({ stageId: 'genre', state: validState() }),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when stageId is missing', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord() })
    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', state: validState() }),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when state is missing', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord() })
    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'genre' }),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const env = makeEnv({})
    const req = new Request('https://api.storyline.app/critique', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    })
    const res = await handleCritique(req, env)
    expect(res.status).toBe(400)
  })

  // ── BYOK guard ────────────────────────────────────────────────────────────

  it('returns 403 for a byok licence', async () => {
    const byokRecord = { ...validRecord(), type: 'byok' as const }
    const env = makeEnv({ 'SL-BYOK': byokRecord })
    const res = await handleCritique(
      makeReq({ licenceKey: 'SL-BYOK', stageId: 'genre', state: validState() }),
      env,
    )
    expect(res.status).toBe(403)
  })

  // ── Non-streaming response ────────────────────────────────────────────────

  it('sends stream: false to OpenRouter', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(50) })
    const fetchMock = mockOpenRouterSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'genre', tier: 'validate', state: validState() }),
      env,
    )

    const [, fetchInit] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    const requestBody = JSON.parse(fetchInit.body)
    expect(requestBody.stream).toBe(false)
  })

  // ── Uses env.CHAT_MODEL ───────────────────────────────────────────────────

  it('passes env.CHAT_MODEL to OpenRouter, not a hardcoded model name', async () => {
    const env = makeEnv({ 'SL-GOOD': validRecord(50) })
    env.CHAT_MODEL = 'custom/model-for-test'
    const fetchMock = mockOpenRouterSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await handleCritique(
      makeReq({ licenceKey: 'SL-GOOD', stageId: 'genre', tier: 'validate', state: validState() }),
      env,
    )

    const [, fetchInit] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    const requestBody = JSON.parse(fetchInit.body)
    expect(requestBody.model).toBe('custom/model-for-test')
  })
})
