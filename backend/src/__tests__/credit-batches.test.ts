import { describe, it, expect } from 'vitest'
import {
  appendBatch,
  applyExternalRefund,
  buildPurchaseBatch,
  computeRefund,
  consumeCredits,
  ensureBatches,
  InsufficientCreditsError,
  recomputeBalance,
  REFUND_WINDOW_MS,
  RefundValidationError,
  summariseBatches,
} from '../credit-batches.js'
import type { CreditBatch, LicenceRecord } from '../types.js'

function legacyRecord(creditBalance: number): LicenceRecord {
  return {
    type: 'credits',
    valid: true,
    creditBalance,
    totalPurchased: creditBalance,
    stripeCustomerId: 'cus_test',
  }
}

function purchaseBatch(overrides: Partial<CreditBatch> & {
  purchasedAt?: string
}): CreditBatch {
  const purchasedAt = overrides.purchasedAt ?? new Date('2026-01-01T00:00:00.000Z').toISOString()
  const refundUntil = new Date(new Date(purchasedAt).getTime() + REFUND_WINDOW_MS).toISOString()
  return {
    id: 'batch_test',
    stripePaymentIntentId: 'pi_test',
    pricePaidPence: 1000,
    currency: 'gbp',
    creditsTotal: 1000,
    creditsRemaining: 1000,
    purchasedAt,
    refundEligibleUntil: refundUntil,
    refundedAt: null,
    source: 'purchase',
    ...overrides,
  }
}

describe('ensureBatches', () => {
  it('materialises a grandfathered batch from a legacy record', () => {
    const result = ensureBatches(legacyRecord(500))
    expect(result.batches).toHaveLength(1)
    expect(result.batches![0]).toMatchObject({
      source: 'grandfathered',
      creditsTotal: 500,
      creditsRemaining: 500,
      stripePaymentIntentId: null,
      pricePaidPence: 0,
    })
    // Refund window in the past — non-refundable.
    expect(new Date(result.batches![0].refundEligibleUntil).getTime()).toBeLessThan(Date.now())
  })

  it('uses source "free" for free-tier records', () => {
    const free: LicenceRecord = { ...legacyRecord(250), type: 'free' }
    const result = ensureBatches(free)
    expect(result.batches![0].source).toBe('free')
  })

  it('returns an empty batches array for zero-balance records', () => {
    const result = ensureBatches(legacyRecord(0))
    expect(result.batches).toEqual([])
  })

  it('is idempotent — does not re-materialise', () => {
    const once = ensureBatches(legacyRecord(500))
    const twice = ensureBatches(once)
    expect(twice.batches).toBe(once.batches)
  })
})

describe('consumeCredits — FIFO', () => {
  it('drains the oldest batch first', () => {
    let r: LicenceRecord = { ...legacyRecord(0), batches: [] }
    r = appendBatch(r, purchaseBatch({
      id: 'batch_a',
      purchasedAt: new Date('2026-01-01').toISOString(),
      creditsTotal: 1000, creditsRemaining: 1000,
    }))
    r = appendBatch(r, purchaseBatch({
      id: 'batch_b',
      purchasedAt: new Date('2026-01-05').toISOString(),
      creditsTotal: 1000, creditsRemaining: 1000,
    }))

    const after = consumeCredits(r, 300)

    expect(after.batches!.find(b => b.id === 'batch_a')!.creditsRemaining).toBe(700)
    expect(after.batches!.find(b => b.id === 'batch_b')!.creditsRemaining).toBe(1000)
    expect(after.creditBalance).toBe(1700)
  })

  it('spans multiple batches when one is exhausted', () => {
    let r: LicenceRecord = { ...legacyRecord(0), batches: [] }
    r = appendBatch(r, purchaseBatch({
      id: 'batch_a',
      purchasedAt: new Date('2026-01-01').toISOString(),
      creditsTotal: 100, creditsRemaining: 100,
    }))
    r = appendBatch(r, purchaseBatch({
      id: 'batch_b',
      purchasedAt: new Date('2026-01-05').toISOString(),
      creditsTotal: 100, creditsRemaining: 100,
    }))

    const after = consumeCredits(r, 150)

    expect(after.batches!.find(b => b.id === 'batch_a')!.creditsRemaining).toBe(0)
    expect(after.batches!.find(b => b.id === 'batch_b')!.creditsRemaining).toBe(50)
    expect(after.creditBalance).toBe(50)
  })

  it('throws InsufficientCreditsError when total < amount', () => {
    const r = appendBatch(
      { ...legacyRecord(0), batches: [] },
      purchaseBatch({ creditsTotal: 100, creditsRemaining: 100 }),
    )
    expect(() => consumeCredits(r, 200)).toThrow(InsufficientCreditsError)
  })

  it('skips refunded batches', () => {
    let r: LicenceRecord = { ...legacyRecord(0), batches: [] }
    r = appendBatch(r, purchaseBatch({
      id: 'batch_a',
      purchasedAt: new Date('2026-01-01').toISOString(),
      creditsTotal: 1000, creditsRemaining: 1000,
      refundedAt: new Date().toISOString(),
    }))
    r = appendBatch(r, purchaseBatch({
      id: 'batch_b',
      purchasedAt: new Date('2026-01-05').toISOString(),
      creditsTotal: 1000, creditsRemaining: 1000,
    }))

    const after = consumeCredits(r, 200)

    expect(after.batches!.find(b => b.id === 'batch_a')!.creditsRemaining).toBe(1000) // untouched
    expect(after.batches!.find(b => b.id === 'batch_b')!.creditsRemaining).toBe(800)
  })

  it('migrates legacy records on first consume', () => {
    const r = legacyRecord(500)
    expect(r.batches).toBeUndefined()
    const after = consumeCredits(r, 100)
    expect(after.batches).toHaveLength(1)
    expect(after.creditBalance).toBe(400)
    expect(after.batches![0].source).toBe('grandfathered')
  })

  it('returns input unchanged when amount is 0', () => {
    const r = legacyRecord(500)
    expect(consumeCredits(r, 0)).toBe(r)
  })
})

describe('computeRefund', () => {
  const purchase = (overrides: Partial<CreditBatch> = {}) =>
    purchaseBatch({
      id: 'batch_x',
      pricePaidPence: 1000,
      creditsTotal: 1000,
      creditsRemaining: 700,
      purchasedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
      ...overrides,
    })

  it('refunds pro-rata for unused credits', () => {
    const r: LicenceRecord = {
      ...legacyRecord(700),
      batches: [purchase()],
    }
    const result = computeRefund(r, 'batch_x', new Date('2026-01-08T00:00:00Z'))

    expect(result.refundPence).toBe(700) // 700/1000 * 1000 = 700p
    expect(result.creditsRefunded).toBe(700)
    expect(result.paymentIntentId).toBe('pi_test')
    expect(result.record.creditBalance).toBe(0)
    expect(result.record.batches![0].refundedAt).not.toBeNull()
    expect(result.record.batches![0].creditsRemaining).toBe(0)
  })

  it('uses Math.floor for the refund amount', () => {
    const r: LicenceRecord = {
      ...legacyRecord(0),
      batches: [purchase({ creditsRemaining: 333 })], // 333/1000 * 1000 = 333.0p
    }
    const result = computeRefund(r, 'batch_x', new Date('2026-01-05'))
    expect(result.refundPence).toBe(333)
  })

  it('throws BATCH_NOT_FOUND for unknown id', () => {
    const r: LicenceRecord = { ...legacyRecord(0), batches: [purchase()] }
    expect(() => computeRefund(r, 'nope')).toThrowError(
      expect.objectContaining({ code: 'BATCH_NOT_FOUND' }),
    )
  })

  it('throws ALREADY_REFUNDED for a refunded batch', () => {
    const r: LicenceRecord = {
      ...legacyRecord(0),
      batches: [purchase({ refundedAt: new Date().toISOString(), creditsRemaining: 0 })],
    }
    expect(() => computeRefund(r, 'batch_x')).toThrowError(
      expect.objectContaining({ code: 'ALREADY_REFUNDED' }),
    )
  })

  it('throws WINDOW_EXPIRED past 14 days', () => {
    const r: LicenceRecord = { ...legacyRecord(700), batches: [purchase()] }
    // 15 days after purchase
    const tooLate = new Date('2026-01-16T00:00:00Z')
    expect(() => computeRefund(r, 'batch_x', tooLate)).toThrowError(
      expect.objectContaining({ code: 'WINDOW_EXPIRED' }),
    )
  })

  it('throws NOT_REFUNDABLE for grandfathered batches', () => {
    const r = ensureBatches(legacyRecord(500))
    const grandfatheredId = r.batches![0].id
    expect(() => computeRefund(r, grandfatheredId)).toThrowError(
      expect.objectContaining({ code: 'NOT_REFUNDABLE' }),
    )
  })

  it('throws NO_REFUNDABLE_AMOUNT when all credits consumed', () => {
    const r: LicenceRecord = {
      ...legacyRecord(0),
      batches: [purchase({ creditsRemaining: 0 })],
    }
    expect(() => computeRefund(r, 'batch_x', new Date('2026-01-05'))).toThrowError(
      expect.objectContaining({ code: 'NO_REFUNDABLE_AMOUNT' }),
    )
  })

  it('throws NO_REFUNDABLE_AMOUNT when refund rounds to zero', () => {
    // 1 credit out of 1_000_000 paid 1p → floor(1/1_000_000 * 1) = 0
    const r: LicenceRecord = {
      ...legacyRecord(1),
      batches: [purchase({
        creditsTotal: 1_000_000,
        creditsRemaining: 1,
        pricePaidPence: 1,
      })],
    }
    expect(() => computeRefund(r, 'batch_x', new Date('2026-01-05'))).toThrowError(
      expect.objectContaining({ code: 'NO_REFUNDABLE_AMOUNT' }),
    )
  })
})

describe('applyExternalRefund — webhook-driven', () => {
  it('burns remaining credits on the matching batch', () => {
    const r: LicenceRecord = {
      ...legacyRecord(700),
      batches: [purchaseBatch({ id: 'batch_x', stripePaymentIntentId: 'pi_test', creditsRemaining: 700 })],
    }
    const result = applyExternalRefund(r, 'pi_test')!
    expect(result.batch.creditsRemaining).toBe(0)
    expect(result.batch.refundedAt).not.toBeNull()
    expect(result.record.creditBalance).toBe(0)
  })

  it('ignores window expiry — works regardless of date', () => {
    const r: LicenceRecord = {
      ...legacyRecord(700),
      batches: [purchaseBatch({
        id: 'batch_x',
        stripePaymentIntentId: 'pi_test',
        purchasedAt: new Date('2025-01-01').toISOString(),
        creditsRemaining: 700,
      })],
    }
    // 1 year later — still applies (chargeback/dispute path)
    const result = applyExternalRefund(r, 'pi_test', new Date('2026-01-01'))!
    expect(result.batch.creditsRemaining).toBe(0)
  })

  it('returns null when no active batch matches', () => {
    const r: LicenceRecord = {
      ...legacyRecord(0),
      batches: [purchaseBatch({
        stripePaymentIntentId: 'pi_test',
        creditsRemaining: 0,
        refundedAt: new Date().toISOString(),
      })],
    }
    expect(applyExternalRefund(r, 'pi_test')).toBeNull()
    expect(applyExternalRefund(r, 'pi_other')).toBeNull()
  })
})

describe('summariseBatches', () => {
  it('flags purchase batches within window as refundable', () => {
    const r: LicenceRecord = {
      ...legacyRecord(500),
      batches: [purchaseBatch({ creditsRemaining: 500, creditsTotal: 1000, pricePaidPence: 1000 })],
    }
    const [s] = summariseBatches(r, new Date('2026-01-05'))
    expect(s.refundable).toBe(true)
    expect(s.refundablePence).toBe(500) // 500/1000 * 1000p
  })

  it('flags expired-window batches as non-refundable', () => {
    const r: LicenceRecord = {
      ...legacyRecord(500),
      batches: [purchaseBatch({ creditsRemaining: 500 })],
    }
    const [s] = summariseBatches(r, new Date('2026-02-01')) // 1 month later
    expect(s.refundable).toBe(false)
    expect(s.refundablePence).toBe(0)
  })

  it('flags grandfathered batches as non-refundable', () => {
    const r = ensureBatches(legacyRecord(500))
    const [s] = summariseBatches(r)
    expect(s.refundable).toBe(false)
    expect(s.source).toBe('grandfathered')
  })
})

describe('buildPurchaseBatch', () => {
  it('sets refundEligibleUntil to purchasedAt + 14 days', () => {
    const purchasedAt = new Date('2026-03-01T12:00:00Z')
    const batch = buildPurchaseBatch({
      paymentIntentId: 'pi_x',
      pricePaidPence: 1000,
      currency: 'gbp',
      credits: 1000,
      purchasedAt,
    })
    const expected = new Date(purchasedAt.getTime() + 14 * 86_400_000).toISOString()
    expect(batch.refundEligibleUntil).toBe(expected)
    expect(batch.source).toBe('purchase')
    expect(batch.creditsRemaining).toBe(1000)
  })
})

describe('recomputeBalance', () => {
  it('sums creditsRemaining across non-refunded batches', () => {
    const r: LicenceRecord = {
      ...legacyRecord(0),
      batches: [
        purchaseBatch({ id: 'a', creditsRemaining: 100 }),
        purchaseBatch({ id: 'b', creditsRemaining: 200, refundedAt: new Date().toISOString() }),
        purchaseBatch({ id: 'c', creditsRemaining: 300 }),
      ],
    }
    const result = recomputeBalance(r)
    expect(result.creditBalance).toBe(400) // 100 + 300; b refunded
  })
})

describe('appendBatch', () => {
  it('updates derived balance and totalPurchased', () => {
    let r: LicenceRecord = { ...legacyRecord(0), batches: [], totalPurchased: 0 }
    r = appendBatch(r, purchaseBatch({ id: 'a', creditsTotal: 1000, creditsRemaining: 1000 }))
    expect(r.creditBalance).toBe(1000)
    expect(r.totalPurchased).toBe(1000)
    r = appendBatch(r, purchaseBatch({ id: 'b', creditsTotal: 500, creditsRemaining: 500 }))
    expect(r.creditBalance).toBe(1500)
    expect(r.totalPurchased).toBe(1500)
  })
})
