import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleValidate } from '../validate.js'
import type { Env } from '../types.js'

function makeEnv(kvData: Record<string, unknown>): Env {
  return {
    LICENCES: {
      get: vi.fn(async (key: string, type: string) => {
        const val = kvData[key]
        return val ?? null
      }),
      put: vi.fn(),
    } as unknown as KVNamespace,
    OPENROUTER_API_KEY: 'test',
    STRIPE_WEBHOOK_SECRET: 'test',
    IMAGE_MODEL: 'test',
    CHAT_MODEL: 'deepseek/test',
  }
}

function makeReq(body: unknown): Request {
  return new Request('https://api.storyline.app/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /validate', () => {
  it('returns 401 for an unknown licence key', async () => {
    const res = await handleValidate(makeReq({ licenceKey: 'SL-FAKE' }), makeEnv({}))
    expect(res.status).toBe(401)
    const body = await res.json() as { valid: boolean }
    expect(body.valid).toBe(false)
  })

  it('returns type and creditBalance for a valid key', async () => {
    const record = { type: 'credits', valid: true, creditBalance: 950, totalPurchased: 1000, stripeCustomerId: 'cus_xxx' }
    const env = makeEnv({ 'SL-GOOD': record })
    const res = await handleValidate(makeReq({ licenceKey: 'SL-GOOD' }), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { valid: boolean; type: string; creditBalance: number }
    expect(body.valid).toBe(true)
    expect(body.type).toBe('credits')
    expect(body.creditBalance).toBe(950)
  })

  it('returns 400 when licenceKey is missing', async () => {
    const res = await handleValidate(makeReq({}), makeEnv({}))
    expect(res.status).toBe(400)
  })

  it('does not expose AI keys or internal fields', async () => {
    const record = { type: 'credits', valid: true, creditBalance: 100, totalPurchased: 1000, stripeCustomerId: 'cus_xxx' }
    const res = await handleValidate(makeReq({ licenceKey: 'SL-KEY' }), makeEnv({ 'SL-KEY': record }))
    const body = await res.text()
    expect(body).not.toContain('stripeCustomerId')
    expect(body).not.toContain('totalPurchased')
  })
})
