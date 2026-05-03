import { describe, it, expect, vi } from 'vitest'
import {
  REFERRAL_AWARDS_CAP,
  REFERRAL_BONUS_REFERRER,
  deriveReferralCode,
  ensureCodeIndex,
  getReferralStats,
  isValidReferralCode,
  loadAwardLedger,
  lookupReferrerByCode,
  tryAwardReferral,
} from '../referral.js'
import type { Env, LicenceRecord } from '../types.js'

interface FakeKv {
  store: Map<string, string>
  env: Env
}

function makeEnv(seedRecords: Record<string, LicenceRecord> = {}): FakeKv {
  const store = new Map<string, string>()
  for (const [k, rec] of Object.entries(seedRecords)) store.set(k, JSON.stringify(rec))

  const env = {
    LICENCES: {
      get: vi.fn(async (key: string, type?: string) => {
        const raw = store.get(key)
        if (raw === undefined) return null
        if (type === 'json') return JSON.parse(raw)
        return raw
      }),
      put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
      list: vi.fn(async ({ prefix }: { prefix: string }) => ({
        keys: Array.from(store.keys())
          .filter(k => k.startsWith(prefix))
          .map(name => ({ name })),
        list_complete: true,
        cursor: undefined,
      })),
    } as unknown as KVNamespace,
    OPENROUTER_API_KEY: 'test',
    STRIPE_WEBHOOK_SECRET: 'test',
    IMAGE_MODEL: 'test',
    CHAT_MODEL: 'test',
  } as Env
  return { store, env }
}

function freeRec(balance = 150): LicenceRecord {
  return {
    valid: true,
    type: 'free',
    creditBalance: balance,
    totalPurchased: balance,
    stripeCustomerId: 'free-tier',
  }
}

describe('deriveReferralCode', () => {
  it('produces an 8-char code from any licence key', async () => {
    const code = await deriveReferralCode('SL-FREE-AAAA-BBBB-CCCC')
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
  })

  it('is deterministic — same key → same code', async () => {
    const a = await deriveReferralCode('SL-FREE-AAAA-BBBB-CCCC')
    const b = await deriveReferralCode('SL-FREE-AAAA-BBBB-CCCC')
    expect(a).toBe(b)
  })

  it('different keys produce different codes', async () => {
    const a = await deriveReferralCode('SL-FREE-AAAA-BBBB-CCCC')
    const b = await deriveReferralCode('SL-FREE-XXXX-YYYY-ZZZZ')
    expect(a).not.toBe(b)
  })

  it('uses Crockford alphabet (no I, L, O, U)', async () => {
    // Try 100 random-ish keys and check none of them produce I/L/O/U.
    for (let i = 0; i < 100; i++) {
      const code = await deriveReferralCode(`SL-TEST-${i.toString(16).padStart(8, '0')}`)
      expect(code).not.toMatch(/[ILOU]/)
    }
  })
})

describe('isValidReferralCode', () => {
  it('accepts valid 8-char Crockford codes', () => {
    expect(isValidReferralCode('R7NBPK4Q')).toBe(true)
    expect(isValidReferralCode('00000000')).toBe(true)
    expect(isValidReferralCode('ZZZZZZZZ')).toBe(true)
  })

  it('rejects wrong length', () => {
    expect(isValidReferralCode('SHORT')).toBe(false)
    expect(isValidReferralCode('THISISTOOLONG')).toBe(false)
  })

  it('rejects forbidden Crockford chars', () => {
    expect(isValidReferralCode('IIIIIIII')).toBe(false)
    expect(isValidReferralCode('LLLLLLLL')).toBe(false)
    expect(isValidReferralCode('OOOOOOOO')).toBe(false)
    expect(isValidReferralCode('UUUUUUUU')).toBe(false)
  })

  it('rejects non-strings + empty', () => {
    expect(isValidReferralCode(null)).toBe(false)
    expect(isValidReferralCode(undefined)).toBe(false)
    expect(isValidReferralCode(12345678)).toBe(false)
    expect(isValidReferralCode('')).toBe(false)
  })
})

describe('ensureCodeIndex + lookupReferrerByCode', () => {
  it('round-trips a code → key lookup', async () => {
    const { env } = makeEnv()
    const referrerKey = 'SL-FREE-1111-2222-3333'
    const code = await ensureCodeIndex(env, referrerKey)
    const found = await lookupReferrerByCode(env, code)
    expect(found).toBe(referrerKey)
  })

  it('is case-insensitive on the lookup side', async () => {
    const { env } = makeEnv()
    const referrerKey = 'SL-FREE-AAAA-BBBB-CCCC'
    const code = await ensureCodeIndex(env, referrerKey)
    const found = await lookupReferrerByCode(env, code.toLowerCase())
    expect(found).toBe(referrerKey)
  })

  it('returns null for unknown codes', async () => {
    const { env } = makeEnv()
    const result = await lookupReferrerByCode(env, '99999999')
    expect(result).toBeNull()
  })

  it('returns null for invalid-shape codes', async () => {
    const { env } = makeEnv()
    expect(await lookupReferrerByCode(env, 'BAD')).toBeNull()
    expect(await lookupReferrerByCode(env, 'IIIIIIII')).toBeNull()
  })
})

describe('tryAwardReferral', () => {
  const referrerKey = 'SL-FREE-REF-1234-5678'

  it('awards on first valid call: +25 to referrer, ledger updated', async () => {
    const { env, store } = makeEnv({ [referrerKey]: freeRec(150) })
    const outcome = await tryAwardReferral({
      env,
      referrerKey,
      newUserMachineId: 'machine-newuser',
    })
    expect(outcome.kind).toBe('awarded')

    const updated = JSON.parse(store.get(referrerKey)!) as LicenceRecord
    expect(updated.creditBalance).toBe(150 + REFERRAL_BONUS_REFERRER)

    const ledger = await loadAwardLedger(env, referrerKey)
    expect(ledger.count).toBe(1)
    expect(ledger.creditsEarned).toBe(REFERRAL_BONUS_REFERRER)
    expect(ledger.awardedMachineIds).toEqual(['machine-newuser'])
  })

  it('rejects duplicate machineIds for same referrer', async () => {
    const { env } = makeEnv({ [referrerKey]: freeRec(150) })
    await tryAwardReferral({ env, referrerKey, newUserMachineId: 'm-dup' })
    const second = await tryAwardReferral({ env, referrerKey, newUserMachineId: 'm-dup' })
    expect(second.kind).toBe('duplicate-machine')
    const ledger = await loadAwardLedger(env, referrerKey)
    expect(ledger.count).toBe(1) // unchanged
  })

  it('hits cap at 20 awards — referrer stops earning', async () => {
    const { env, store } = makeEnv({ [referrerKey]: freeRec(150) })
    for (let i = 0; i < REFERRAL_AWARDS_CAP; i++) {
      const r = await tryAwardReferral({ env, referrerKey, newUserMachineId: `m-${i}` })
      expect(r.kind).toBe('awarded')
    }

    const referrerBefore = JSON.parse(store.get(referrerKey)!) as LicenceRecord
    expect(referrerBefore.creditBalance).toBe(150 + REFERRAL_AWARDS_CAP * REFERRAL_BONUS_REFERRER)

    // 21st attempt — cap hit, no further credit awarded.
    const capped = await tryAwardReferral({ env, referrerKey, newUserMachineId: 'm-21' })
    expect(capped.kind).toBe('cap-hit')

    const referrerAfter = JSON.parse(store.get(referrerKey)!) as LicenceRecord
    expect(referrerAfter.creditBalance).toBe(referrerBefore.creditBalance) // unchanged
  })

  it('returns unknown-code when the referrer record is missing', async () => {
    const { env } = makeEnv() // empty
    const r = await tryAwardReferral({
      env,
      referrerKey: 'SL-FREE-DOES-NOT-EXIST',
      newUserMachineId: 'm-1',
    })
    expect(r.kind).toBe('unknown-code')
  })

  it('returns self-referral when the referrer machineId == new user machineId', async () => {
    const machineId = 'machine-self'
    const { env, store } = makeEnv({ [referrerKey]: freeRec(150) })
    // Seed the mid: index so findMachineIdForLicenceKey resolves it.
    store.set(`mid:${machineId}`, referrerKey)

    const r = await tryAwardReferral({
      env,
      referrerKey,
      newUserMachineId: machineId,
    })
    expect(r.kind).toBe('self-referral')

    const ledger = await loadAwardLedger(env, referrerKey)
    expect(ledger.count).toBe(0)
  })
})

describe('getReferralStats', () => {
  it('returns live stats for a brand-new user (no awards yet)', async () => {
    const key = 'SL-FREE-STATS-TEST'
    const { env } = makeEnv({ [key]: freeRec(150) })
    const stats = await getReferralStats(env, key)
    expect(stats.referralCount).toBe(0)
    expect(stats.creditsEarned).toBe(0)
    expect(stats.capRemaining).toBe(REFERRAL_AWARDS_CAP)
    expect(stats.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
  })

  it('reflects awards after they happen', async () => {
    const key = 'SL-FREE-STATS-LIVE'
    const { env } = makeEnv({ [key]: freeRec(150) })
    await tryAwardReferral({ env, referrerKey: key, newUserMachineId: 'm-x' })
    await tryAwardReferral({ env, referrerKey: key, newUserMachineId: 'm-y' })

    const stats = await getReferralStats(env, key)
    expect(stats.referralCount).toBe(2)
    expect(stats.creditsEarned).toBe(2 * REFERRAL_BONUS_REFERRER)
    expect(stats.capRemaining).toBe(REFERRAL_AWARDS_CAP - 2)
  })
})
