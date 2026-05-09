// CB-15 — admin-gated /free-plan/reset endpoint that wipes a machineId's
// guard mapping and licence record so a fresh /free-plan/issue mints a
// clean 150-credit key.

import { describe, it, expect, vi } from 'vitest'
import { handleFreePlanReset } from '../free-plan-reset.js'
import type { Env } from '../types.js'

function makeEnv(initial: Record<string, string> = {}): { env: Env; store: Map<string, string> } {
  const store = new Map(Object.entries(initial))
  const env = {
    LICENCES: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
      delete: vi.fn(async (key: string) => { store.delete(key) }),
    } as unknown as KVNamespace,
    OPENROUTER_API_KEY: 'test-fallback',
    ADMIN_KEY: 'test-admin',
    STRIPE_WEBHOOK_SECRET: 'x',
    IMAGE_MODEL: 'x',
    CHAT_MODEL: 'x',
  } as Env
  return { env, store }
}

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://api.test/free-plan/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('handleFreePlanReset', () => {
  it('rejects non-POST', async () => {
    const { env } = makeEnv()
    const res = await handleFreePlanReset(new Request('https://api.test/free-plan/reset'), env)
    expect(res.status).toBe(405)
  })

  it('rejects requests without a Bearer token', async () => {
    const { env } = makeEnv()
    const res = await handleFreePlanReset(makeReq({ machineId: 'm1' }), env)
    expect(res.status).toBe(401)
  })

  it('rejects requests with the wrong token', async () => {
    const { env } = makeEnv()
    const res = await handleFreePlanReset(
      makeReq({ machineId: 'm1' }, { Authorization: 'Bearer wrong' }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it('rejects POSTs missing the machineId field', async () => {
    const { env } = makeEnv()
    const res = await handleFreePlanReset(
      makeReq({}, { Authorization: 'Bearer test-admin' }),
      env,
    )
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/machineId/)
  })

  it('deletes the forward map, reverse map, and licence record', async () => {
    const machineId = 'machine-abc'
    const licenceKey = 'SL-FREE-1234-ABCD-5678'
    const { env, store } = makeEnv({
      [`mid:${machineId}`]: licenceKey,
      [`key:${licenceKey}:mid`]: machineId,
      [licenceKey]: JSON.stringify({ valid: true, type: 'free', creditBalance: 145 }),
    })

    const res = await handleFreePlanReset(
      makeReq({ machineId }, { Authorization: 'Bearer test-admin' }),
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; machineId: string; licenceKey: string; deleted: string[] }
    expect(body.ok).toBe(true)
    expect(body.licenceKey).toBe(licenceKey)
    expect(body.deleted).toContain(licenceKey)
    expect(body.deleted).toContain(`mid:${machineId}`)
    expect(body.deleted).toContain(`key:${licenceKey}:mid`)

    expect(store.has(`mid:${machineId}`)).toBe(false)
    expect(store.has(`key:${licenceKey}:mid`)).toBe(false)
    expect(store.has(licenceKey)).toBe(false)
  })

  it('is idempotent — succeeds even when no mapping exists', async () => {
    const { env, store } = makeEnv()
    const res = await handleFreePlanReset(
      makeReq({ machineId: 'never-seen' }, { Authorization: 'Bearer test-admin' }),
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { licenceKey: string | null; deleted: string[] }
    expect(body.licenceKey).toBeNull()
    expect(body.deleted).toContain('mid:never-seen')
    expect(store.size).toBe(0)
  })

  it('falls back to OPENROUTER_API_KEY when ADMIN_KEY is unset', async () => {
    const { env } = makeEnv()
    const e2 = { ...env, ADMIN_KEY: undefined } as unknown as Env
    const res = await handleFreePlanReset(
      makeReq({ machineId: 'm1' }, { Authorization: 'Bearer test-fallback' }),
      e2,
    )
    expect(res.status).toBe(200)
  })
})
