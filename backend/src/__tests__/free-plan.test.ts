import { describe, it, expect, vi } from 'vitest'
import { handleFreePlanIssue } from '../free-plan.js'
import type { Env } from '../types.js'

function makeEnv(): { env: Env; store: Map<string, string> } {
  const store = new Map<string, string>()
  const env = {
    LICENCES: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    } as unknown as KVNamespace,
    OPENROUTER_API_KEY: 'test',
    STRIPE_WEBHOOK_SECRET: 'test',
    IMAGE_MODEL: 'test',
    CHAT_MODEL: 'deepseek/test',
  } as Env
  return { env, store }
}

function makeReq(ip = '1.2.3.4'): Request {
  return new Request('https://api.storyline.app/free-plan/issue', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip },
  })
}

describe('POST /free-plan/issue', () => {
  it('mints a unique SL-FREE-* key with 250 credits and writes the record', async () => {
    const { env, store } = makeEnv()
    const res = await handleFreePlanIssue(makeReq('10.0.0.1'), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { licenceKey: string; creditBalance: number }
    expect(body.licenceKey).toMatch(/^SL-FREE-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)
    expect(body.creditBalance).toBe(250)

    const stored = JSON.parse(store.get(body.licenceKey)!)
    expect(stored).toMatchObject({
      valid: true,
      type: 'free',
      creditBalance: 250,
      totalPurchased: 250,
    })
  })

  it('issues distinct keys on consecutive calls', async () => {
    const { env } = makeEnv()
    const a = await (await handleFreePlanIssue(makeReq('10.0.0.2'), env)).json() as { licenceKey: string }
    const b = await (await handleFreePlanIssue(makeReq('10.0.0.2'), env)).json() as { licenceKey: string }
    expect(a.licenceKey).not.toBe(b.licenceKey)
  })

  it('rate-limits a single IP after 3 issuances per day', async () => {
    const { env } = makeEnv()
    for (let i = 0; i < 3; i++) {
      const ok = await handleFreePlanIssue(makeReq('10.0.0.3'), env)
      expect(ok.status).toBe(200)
    }
    const blocked = await handleFreePlanIssue(makeReq('10.0.0.3'), env)
    expect(blocked.status).toBe(429)
  })
})
