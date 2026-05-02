import type { CreditBatch, LicenceRecord } from './types.js'

export const REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const EPOCH_ISO = '1970-01-01T00:00:00.000Z'

export function generateBatchId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `batch_${hex}`
}

/**
 * If `record.batches` is undefined, lazily create it. Records that already
 * have a non-zero `creditBalance` get a single grandfathered batch covering
 * the existing balance — non-refundable (refund window in the past) so old
 * pre-batch purchases aren't accidentally refundable under the new clause.
 *
 * Idempotent — no-op if `batches` is already set.
 */
export function ensureBatches(record: LicenceRecord): LicenceRecord {
  if (record.batches !== undefined) return record

  if (record.creditBalance <= 0) {
    return { ...record, batches: [] }
  }

  const grandfathered: CreditBatch = {
    id: generateBatchId(),
    stripePaymentIntentId: null,
    pricePaidPence: 0,
    currency: 'gbp',
    creditsTotal: record.creditBalance,
    creditsRemaining: record.creditBalance,
    purchasedAt: EPOCH_ISO,
    refundEligibleUntil: EPOCH_ISO,
    refundedAt: null,
    source: record.type === 'free' ? 'free' : 'grandfathered',
  }

  return { ...record, batches: [grandfathered] }
}

/**
 * Recompute `creditBalance` from the active batches. Call after every
 * mutation so the flat field stays in sync for clients reading it directly.
 */
export function recomputeBalance(record: LicenceRecord): LicenceRecord {
  const batches = record.batches ?? []
  const balance = batches
    .filter(b => !b.refundedAt)
    .reduce((sum, b) => sum + b.creditsRemaining, 0)
  return { ...record, creditBalance: balance }
}

/**
 * FIFO consumption: drain the oldest active batch first. That minimises
 * refund liability — the oldest batch is closest to its 14-day expiry, so
 * spending from it first means the bulk of unspent credits stay in newer
 * (still fully refundable) batches.
 *
 * Throws InsufficientCreditsError if the active total is less than `amount`.
 */
export class InsufficientCreditsError extends Error {
  constructor(public short: number) {
    super(`Insufficient credits: short by ${short}`)
  }
}

export function consumeCredits(record: LicenceRecord, amount: number): LicenceRecord {
  if (amount < 0) throw new Error('amount must be non-negative')
  if (amount === 0) return record

  const ensured = ensureBatches(record)
  const batches = (ensured.batches ?? []).map(b => ({ ...b }))

  const order = batches
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !b.refundedAt && b.creditsRemaining > 0)
    .sort((a, b) => a.b.purchasedAt.localeCompare(b.b.purchasedAt))

  let remaining = amount
  for (const { i } of order) {
    if (remaining === 0) break
    const take = Math.min(batches[i].creditsRemaining, remaining)
    batches[i].creditsRemaining -= take
    remaining -= take
  }

  if (remaining > 0) throw new InsufficientCreditsError(remaining)

  return recomputeBalance({ ...ensured, batches })
}

interface PurchaseBatchArgs {
  paymentIntentId: string
  pricePaidPence: number
  currency: string
  credits: number
  purchasedAt: Date
  id?: string
}

/**
 * Build a purchase batch. The 14-day refund window starts at `purchasedAt`.
 */
export function buildPurchaseBatch(args: PurchaseBatchArgs): CreditBatch {
  const refundUntil = new Date(args.purchasedAt.getTime() + REFUND_WINDOW_MS)
  return {
    id: args.id ?? generateBatchId(),
    stripePaymentIntentId: args.paymentIntentId,
    pricePaidPence: args.pricePaidPence,
    currency: args.currency,
    creditsTotal: args.credits,
    creditsRemaining: args.credits,
    purchasedAt: args.purchasedAt.toISOString(),
    refundEligibleUntil: refundUntil.toISOString(),
    refundedAt: null,
    source: 'purchase',
  }
}

/**
 * Append a batch and update the derived balance + totalPurchased counter.
 */
export function appendBatch(record: LicenceRecord, batch: CreditBatch): LicenceRecord {
  const ensured = ensureBatches(record)
  return recomputeBalance({
    ...ensured,
    batches: [...(ensured.batches ?? []), batch],
    totalPurchased: ensured.totalPurchased + batch.creditsTotal,
  })
}

export type RefundErrorCode =
  | 'BATCH_NOT_FOUND'
  | 'ALREADY_REFUNDED'
  | 'WINDOW_EXPIRED'
  | 'NOT_REFUNDABLE'
  | 'NO_REFUNDABLE_AMOUNT'

export class RefundValidationError extends Error {
  constructor(public code: RefundErrorCode, message: string) {
    super(message)
  }
}

export interface RefundComputation {
  record: LicenceRecord
  refundPence: number
  creditsRefunded: number
  paymentIntentId: string
  currency: string
}

/**
 * Validate + compute a user-initiated refund. Returns an updated record with
 * the batch marked refunded and remaining credits zeroed. The caller is
 * responsible for actually issuing the Stripe refund afterwards.
 *
 * Pro-rata math: refundPence = floor(creditsRemaining / creditsTotal * pricePaidPence).
 * Credits already consumed are not refundable per Consumer Contracts Regs 2013.
 */
export function computeRefund(
  record: LicenceRecord,
  batchId: string,
  now: Date = new Date(),
): RefundComputation {
  const ensured = ensureBatches(record)
  const batches = (ensured.batches ?? []).map(b => ({ ...b }))
  const idx = batches.findIndex(b => b.id === batchId)

  if (idx === -1) throw new RefundValidationError('BATCH_NOT_FOUND', 'Batch not found')

  const batch = batches[idx]

  if (batch.refundedAt) {
    throw new RefundValidationError('ALREADY_REFUNDED', 'Batch already refunded')
  }
  if (!batch.stripePaymentIntentId || batch.source !== 'purchase') {
    throw new RefundValidationError('NOT_REFUNDABLE', 'Batch is not user-refundable')
  }
  if (now > new Date(batch.refundEligibleUntil)) {
    throw new RefundValidationError('WINDOW_EXPIRED', '14-day refund window has expired')
  }
  if (batch.creditsRemaining <= 0 || batch.creditsTotal <= 0) {
    throw new RefundValidationError('NO_REFUNDABLE_AMOUNT', 'No unused credits remaining')
  }

  const refundPence = Math.floor(
    (batch.creditsRemaining / batch.creditsTotal) * batch.pricePaidPence,
  )

  if (refundPence <= 0) {
    throw new RefundValidationError('NO_REFUNDABLE_AMOUNT', 'Refund amount rounds to zero')
  }

  const creditsRefunded = batch.creditsRemaining

  batches[idx] = {
    ...batch,
    creditsRemaining: 0,
    refundedAt: now.toISOString(),
  }

  return {
    record: recomputeBalance({ ...ensured, batches }),
    refundPence,
    creditsRefunded,
    paymentIntentId: batch.stripePaymentIntentId,
    currency: batch.currency,
  }
}

/**
 * Webhook-driven refund: Stripe reported a refund (e.g. dashboard manual,
 * dispute resolution). Burn remaining credits regardless of refund window.
 * Returns null if no matching active batch exists for the payment intent.
 */
export function applyExternalRefund(
  record: LicenceRecord,
  paymentIntentId: string,
  now: Date = new Date(),
): { record: LicenceRecord; batch: CreditBatch } | null {
  const ensured = ensureBatches(record)
  const batches = (ensured.batches ?? []).map(b => ({ ...b }))
  const idx = batches.findIndex(
    b => b.stripePaymentIntentId === paymentIntentId && !b.refundedAt,
  )
  if (idx === -1) return null

  batches[idx] = {
    ...batches[idx],
    creditsRemaining: 0,
    refundedAt: now.toISOString(),
  }

  return {
    record: recomputeBalance({ ...ensured, batches }),
    batch: batches[idx],
  }
}

/**
 * Public-facing batch summary for the "Recent Purchases" UI. Hides nothing
 * sensitive but normalises field names and pre-computes refundability.
 */
export interface BatchSummary {
  id: string
  purchasedAt: string
  pricePaidPence: number
  currency: string
  creditsTotal: number
  creditsRemaining: number
  refundEligibleUntil: string
  refundedAt: string | null
  source: CreditBatch['source']
  /** True iff a user-initiated refund would succeed right now. */
  refundable: boolean
  /** Pence that would be refunded if the user clicked Refund right now. */
  refundablePence: number
}

export function summariseBatches(record: LicenceRecord, now: Date = new Date()): BatchSummary[] {
  const ensured = ensureBatches(record)
  return (ensured.batches ?? []).map(b => {
    const refundable =
      !b.refundedAt
      && b.source === 'purchase'
      && !!b.stripePaymentIntentId
      && b.creditsRemaining > 0
      && now <= new Date(b.refundEligibleUntil)
    const refundablePence = refundable
      ? Math.floor((b.creditsRemaining / Math.max(1, b.creditsTotal)) * b.pricePaidPence)
      : 0
    return {
      id: b.id,
      purchasedAt: b.purchasedAt,
      pricePaidPence: b.pricePaidPence,
      currency: b.currency,
      creditsTotal: b.creditsTotal,
      creditsRemaining: b.creditsRemaining,
      refundEligibleUntil: b.refundEligibleUntil,
      refundedAt: b.refundedAt,
      source: b.source,
      refundable: refundable && refundablePence > 0,
      refundablePence,
    }
  })
}
