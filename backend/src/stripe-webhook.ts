import type { Env, LicenceRecord, LicenceType } from './types.js'
import { sendLicenceEmail } from './email.js'
import {
  appendBatch,
  applyExternalRefund,
  buildPurchaseBatch,
  ensureBatches,
} from './credit-batches.js'

// Credit allocations per product (mapped by Stripe price/product metadata)
const PRODUCT_CREDITS: Record<string, number> = {
  credits_10:  1000,
  credits_20:  2200,
  byok_annual: 0,
}

export async function handleStripeWebhook(req: Request, env: Env): Promise<Response> {
  const signature = req.headers.get('Stripe-Signature')
  if (!signature) {
    return resp({ error: 'Missing Stripe-Signature' }, 400)
  }

  const rawBody = await req.text()

  // Verify signature using SubtleCrypto (Workers-native — no Stripe SDK needed)
  const valid = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
  if (!valid) {
    return resp({ error: 'Invalid signature' }, 400)
  }

  const event = JSON.parse(rawBody)

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object, env)
      break
    case 'payment_intent.succeeded':
      await handleTopup(event.data.object, env)
      break
    case 'refund.updated':
    case 'refund.created':
      await handleRefundEvent(event.data.object, env)
      break
    default:
      // Acknowledge unknown events
      break
  }

  return resp({ received: true })
}

async function handleCheckoutComplete(
  session: Record<string, unknown>,
  env: Env,
): Promise<void> {
  const metadata = session.metadata as Record<string, string> | undefined
  const productKey = metadata?.product_key ?? 'credits_10'
  const customerId = session.customer as string

  const credits = PRODUCT_CREDITS[productKey] ?? 1000
  const type: LicenceType = productKey === 'byok_annual' ? 'byok' : 'credits'

  // Pull payment details from the session so the refund window has accurate
  // pricePaidPence + currency. Fall back to a sensible price if Stripe
  // didn't include them (e.g. zero-amount BYOK setup).
  const amountTotal = (session.amount_total as number | null | undefined) ?? 0
  const currency = ((session.currency as string | undefined) ?? 'gbp').toLowerCase()
  const paymentIntentId = (session.payment_intent as string | undefined) ?? null

  // If the checkout was opened from an already-activated extension, the
  // existing licence key is passed as `client_reference_id`. Top up that
  // record's batches instead of issuing a brand-new key — otherwise the
  // user's free or already-purchased credits get stranded on the old key
  // (the original bug: new credits "overwrote" the free balance because
  // the user was effectively migrated onto a fresh empty record).
  const clientRef = (session.client_reference_id as string | undefined) ?? null
  const existingKey = clientRef && /^SL-[A-Z0-9-]+$/i.test(clientRef) ? clientRef : null
  const existingRecord = existingKey
    ? await env.LICENCES.get<LicenceRecord>(existingKey, 'json')
    : null

  if (
    existingKey
    && existingRecord
    && existingRecord.valid
    && type !== 'byok'
    && paymentIntentId
    && amountTotal > 0
  ) {
    // Idempotency: webhook can fire twice (Stripe retry). Skip if this
    // payment intent already produced a batch on this record.
    const ensured = ensureBatches(existingRecord)
    if (!ensured.batches?.some(b => b.stripePaymentIntentId === paymentIntentId)) {
      const batch = buildPurchaseBatch({
        paymentIntentId,
        pricePaidPence: amountTotal,
        currency,
        credits,
        purchasedAt: new Date(),
      })
      // A free-tier user upgrading to paid: promote the type so future
      // payment_intent.succeeded top-ups (which reject type === 'free')
      // and downstream tier checks treat them as a paying customer. The
      // 150 free credits are preserved as the grandfathered batch by
      // ensureBatches above.
      const promoted = ensured.type === 'free' ? { ...ensured, type } : ensured
      const updated = appendBatch(promoted, batch)
      await env.LICENCES.put(existingKey, JSON.stringify(updated))
      await indexPaymentIntent(env, paymentIntentId, existingKey)
    }

    // Map session → existing key so the /success page lookup still works.
    const sessionId = session.id as string | undefined
    if (sessionId) {
      await env.LICENCES.put(`session:${sessionId}`, existingKey, { expirationTtl: 172800 })
    }
    // No new licence email — the user already has this key.
    return
  }

  // First-time buyer (or unrecognised client_reference_id): issue a fresh key.
  const licenceKey = generateLicenceKey()

  let record: LicenceRecord = {
    type,
    valid: true,
    creditBalance: 0,
    totalPurchased: 0,
    stripeCustomerId: customerId,
    batches: [],
  }

  if (type === 'byok') {
    // BYOK has no credits; nothing to batch.
    record.creditBalance = 0
    record.totalPurchased = 0
  } else if (paymentIntentId && amountTotal > 0) {
    const batch = buildPurchaseBatch({
      paymentIntentId,
      pricePaidPence: amountTotal,
      currency,
      credits,
      purchasedAt: new Date(),
    })
    record = appendBatch(record, batch)
    await indexPaymentIntent(env, paymentIntentId, licenceKey)
  } else {
    // No payment intent (e.g. free upgrade flow) — credit as grandfathered.
    record.creditBalance = credits
    record.totalPurchased = credits
    record = ensureBatches(record)
  }

  await env.LICENCES.put(licenceKey, JSON.stringify(record))

  // Store session → licence key so the /success page can look it up (48h TTL)
  const sessionId = session.id as string | undefined
  if (sessionId) {
    await env.LICENCES.put(`session:${sessionId}`, licenceKey, { expirationTtl: 172800 })
  }

  // Store email → licence key for self-service key recovery
  const customerDetails = session.customer_details as Record<string, unknown> | undefined
  const email = customerDetails?.email as string | undefined
  if (email) {
    const normalised = email.trim().toLowerCase()
    await env.LICENCES.put(`email:${normalised}`, licenceKey)
    if (env.POSTMARK_API_KEY) {
      await sendLicenceEmail(normalised, licenceKey, env.POSTMARK_API_KEY).catch(err =>
        console.error('[stripe-webhook] email send failed:', err),
      )
    }
  }
}

async function handleTopup(
  paymentIntent: Record<string, unknown>,
  env: Env,
): Promise<void> {
  const metadata = paymentIntent.metadata as Record<string, string> | undefined
  const licenceKey = metadata?.licence_key
  const productKey = metadata?.product_key ?? 'credits_10'

  if (!licenceKey) return

  const existing = await env.LICENCES.get<LicenceRecord>(licenceKey, 'json')
  if (!existing || !existing.valid) return

  // Free tier cannot be topped up
  if (existing.type === 'free') return

  const topup = PRODUCT_CREDITS[productKey] ?? 1000
  const paymentIntentId = (paymentIntent.id as string | undefined) ?? null
  const amountReceived =
    (paymentIntent.amount_received as number | null | undefined)
    ?? (paymentIntent.amount as number | null | undefined)
    ?? 0
  const currency = ((paymentIntent.currency as string | undefined) ?? 'gbp').toLowerCase()

  if (!paymentIntentId || amountReceived <= 0) {
    // Fallback: legacy behaviour — bump balance, no batch.
    const updated: LicenceRecord = {
      ...existing,
      creditBalance: existing.creditBalance + topup,
      totalPurchased: existing.totalPurchased + topup,
    }
    await env.LICENCES.put(licenceKey, JSON.stringify(updated))
    return
  }

  // Idempotency: if a batch already exists for this payment intent, skip.
  const ensured = ensureBatches(existing)
  if (ensured.batches?.some(b => b.stripePaymentIntentId === paymentIntentId)) {
    return
  }

  const batch = buildPurchaseBatch({
    paymentIntentId,
    pricePaidPence: amountReceived,
    currency,
    credits: topup,
    purchasedAt: new Date(),
  })
  const updated = appendBatch(ensured, batch)

  await env.LICENCES.put(licenceKey, JSON.stringify(updated))
  await indexPaymentIntent(env, paymentIntentId, licenceKey)
}

/**
 * Handle Stripe-reported refunds (dashboard manual refunds, disputes, or our
 * own /refund-batch call coming back as an event). Listens to `refund.updated`
 * and `refund.created` — the modern Stripe pattern. `refund.updated` carries
 * the final status, so we only burn credits when status === 'succeeded' to
 * avoid burning credits for refunds that ultimately fail (async payment
 * methods like BACS / SEPA). Burns unconditionally if the user-initiated
 * `/refund-batch` route has already pre-marked the batch — applyExternalRefund
 * is a no-op in that case.
 */
async function handleRefundEvent(
  refund: Record<string, unknown>,
  env: Env,
): Promise<void> {
  const paymentIntentId = refund.payment_intent as string | undefined
  const status = refund.status as string | undefined

  if (!paymentIntentId) return
  // refund.created fires before status is final; refund.updated carries it.
  // Only act on succeeded refunds — failed ones reverse on Stripe's side.
  if (status && status !== 'succeeded') return

  const licenceKey = await env.LICENCES.get(`pi:${paymentIntentId}`)
  if (!licenceKey) {
    console.warn(`[stripe-webhook] refund event for unknown PI ${paymentIntentId}`)
    return
  }

  const existing = await env.LICENCES.get<LicenceRecord>(licenceKey, 'json')
  if (!existing) return

  const result = applyExternalRefund(existing, paymentIntentId)
  if (!result) {
    // Already refunded (likely the echo of our /refund-batch call) — no-op.
    return
  }

  await env.LICENCES.put(licenceKey, JSON.stringify(result.record))
  console.log(
    `[stripe-webhook] external refund applied: licence=${licenceKey.slice(0, 12)}… `
    + `batch=${result.batch.id} credits=${result.batch.creditsTotal}`,
  )
}

/**
 * Index payment_intent → licenceKey so charge.refunded webhooks can find
 * the right record without scanning. Cheap O(1) KV write.
 */
async function indexPaymentIntent(env: Env, paymentIntentId: string, licenceKey: string): Promise<void> {
  await env.LICENCES.put(`pi:${paymentIntentId}`, licenceKey)
}

function generateLicenceKey(): string {
  // SL-XXXX-XXXX-XXXX-XXXX format
  const hex = () => crypto.getRandomValues(new Uint8Array(2))
    .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '').toUpperCase()
  return `SL-${hex()}-${hex()}-${hex()}-${hex()}`
}

async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> {
  try {
    // Stripe header format: t=timestamp,v1=signature
    const parts = Object.fromEntries(
      header.split(',').map(p => p.split('=') as [string, string]),
    )
    const timestamp = parts['t']
    const expected = parts['v1']
    if (!timestamp || !expected) return false

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signedData = `${timestamp}.${payload}`
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedData))
    const computed = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    return computed === expected
  } catch {
    return false
  }
}

function resp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
