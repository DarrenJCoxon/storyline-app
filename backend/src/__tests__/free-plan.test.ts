import { describe, it, expect, vi } from 'vitest'
import { handleFreePlanIssue } from '../free-plan.js'
import type { Env } from '../types.js'

function makeEnv(): { env: Env; store: Map<string, string> } {
  const store = new Map<string, string>()
  const env = {
    LICENCES: {
      // Match the real KV signature: when called with type 'json',
      // parse the stored string. Without that the machineId-guard
      // path can't validate the existing record and the test would
      // diverge from production behaviour.
      get: vi.fn(async (key: string, type?: string) => {
        const raw = store.get(key)
        if (raw === undefined) return null
        if (type === 'json') return JSON.parse(raw)
        return raw
      }),
      put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    } as unknown as KVNamespace,
    OPENROUTER_API_KEY: 'test',
    STRIPE_WEBHOOK_SECRET: 'test',
    IMAGE_MODEL: 'test',
    CHAT_MODEL: 'deepseek/test',
  } as Env
  return { env, store }
}

function makeReq(opts: { ip?: string; machineId?: string } = {}): Request {
  const { ip = '1.2.3.4', machineId } = opts
  return new Request('https://api.storyline.app/free-plan/issue', {
    method: 'POST',
    headers: {
      'CF-Connecting-IP': ip,
      'Content-Type': 'application/json',
    },
    body: machineId ? JSON.stringify({ machineId }) : undefined,
  })
}

describe('POST /free-plan/issue', () => {
  it('mints a unique SL-FREE-* key with 150 credits and writes the record', async () => {
    const { env, store } = makeEnv()
    const res = await handleFreePlanIssue(makeReq({ ip: '10.0.0.1' }), env)
    expect(res.status).toBe(200)
    const body = await res.json() as { licenceKey: string; creditBalance: number }
    expect(body.licenceKey).toMatch(/^SL-FREE-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)
    expect(body.creditBalance).toBe(150)

    const stored = JSON.parse(store.get(body.licenceKey)!)
    expect(stored).toMatchObject({
      valid: true,
      type: 'free',
      creditBalance: 150,
      totalPurchased: 150,
    })
  })

  it('issues distinct keys on consecutive calls', async () => {
    const { env } = makeEnv()
    const a = await (await handleFreePlanIssue(makeReq({ ip: '10.0.0.2' }), env)).json() as { licenceKey: string }
    const b = await (await handleFreePlanIssue(makeReq({ ip: '10.0.0.2' }), env)).json() as { licenceKey: string }
    expect(a.licenceKey).not.toBe(b.licenceKey)
  })

  it('rate-limits a single IP after 30 issuances per day', async () => {
    const { env } = makeEnv()
    for (let i = 0; i < 30; i++) {
      const ok = await handleFreePlanIssue(makeReq({ ip: '10.0.0.3' }), env)
      expect(ok.status).toBe(200)
    }
    const blocked = await handleFreePlanIssue(makeReq({ ip: '10.0.0.3' }), env)
    expect(blocked.status).toBe(429)
  })

  it('returns the same key on repeat calls with the same machineId', async () => {
    const { env } = makeEnv()
    const a = await (await handleFreePlanIssue(
      makeReq({ ip: '10.0.0.4', machineId: 'machine-aaa' }),
      env,
    )).json() as { licenceKey: string; creditBalance: number; reused: boolean }
    expect(a.reused).toBe(false)

    const b = await (await handleFreePlanIssue(
      makeReq({ ip: '10.0.0.4', machineId: 'machine-aaa' }),
      env,
    )).json() as { licenceKey: string; creditBalance: number; reused: boolean }
    expect(b.licenceKey).toBe(a.licenceKey)
    expect(b.reused).toBe(true)
    // Reused returns whatever balance the existing record holds — not a fresh 150.
    expect(b.creditBalance).toBe(a.creditBalance)
  })

  it('different machineIds get distinct keys', async () => {
    const { env } = makeEnv()
    const a = await (await handleFreePlanIssue(
      makeReq({ ip: '10.0.0.5', machineId: 'machine-a' }),
      env,
    )).json() as { licenceKey: string }
    const b = await (await handleFreePlanIssue(
      makeReq({ ip: '10.0.0.5', machineId: 'machine-b' }),
      env,
    )).json() as { licenceKey: string }
    expect(a.licenceKey).not.toBe(b.licenceKey)
  })

  it('persists the machineId → licenceKey mapping under mid: namespace', async () => {
    const { env, store } = makeEnv()
    const res = await (await handleFreePlanIssue(
      makeReq({ ip: '10.0.0.6', machineId: 'machine-test-123' }),
      env,
    )).json() as { licenceKey: string }
    expect(store.get('mid:machine-test-123')).toBe(res.licenceKey)
  })

  it('rejects malformed machineIds without crashing — falls through to legacy mint', async () => {
    const { env } = makeEnv()
    // machineId with whitespace, control chars, or too long → ignored, mints fresh.
    const a = await (await handleFreePlanIssue(
      makeReq({ ip: '10.0.0.7', machineId: 'has spaces and $@!' }),
      env,
    )).json() as { licenceKey: string; reused: boolean }
    expect(a.reused).toBe(false)
    const b = await (await handleFreePlanIssue(
      makeReq({ ip: '10.0.0.7', machineId: 'has spaces and $@!' }),
      env,
    )).json() as { licenceKey: string; reused: boolean }
    // No machineId persisted, so second call mints a fresh key.
    expect(b.licenceKey).not.toBe(a.licenceKey)
  })

  it('back-compat: legacy callers without a body still receive a fresh key', async () => {
    const { env } = makeEnv()
    // No body at all — the older extension versions POST with nothing.
    const req = new Request('https://api.storyline.app/free-plan/issue', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '10.0.0.8' },
    })
    const res = await handleFreePlanIssue(req, env)
    expect(res.status).toBe(200)
    const body = await res.json() as { licenceKey: string; creditBalance: number }
    expect(body.licenceKey).toMatch(/^SL-FREE-/)
    expect(body.creditBalance).toBe(150)
  })
})
