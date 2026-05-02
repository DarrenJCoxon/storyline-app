import type { Env, LicenceRecord } from './types.js'
import {
  computeRefund,
  RefundValidationError,
  summariseBatches,
} from './credit-batches.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

interface RefundRequestBody {
  licenceKey?: string
  batchId?: string
}

/**
 * POST /refund-batch
 * Body: { licenceKey, batchId }
 * Refunds the unused portion of one credit batch. UK consumer-rights
 * compliant — pro-rata, 14-day window, used credits non-refundable.
 *
 * Order of operations matters:
 *   1. Validate (compute would-be record + Stripe call params).
 *   2. Call Stripe with Idempotency-Key tied to the batch ID.
 *   3. On Stripe success → write the updated record to KV.
 *   4. On Stripe failure → return error, KV untouched.
 *
 * The charge.refunded webhook acts as a backstop: even if the KV write in
 * step 3 fails, the next webhook delivery will run applyExternalRefund and
 * reconcile state.
 */
export async function handleRefund(req: Request, env: Env): Promise<Response> {
  let body: RefundRequestBody
  try {
    body = await req.json()
  } catch {
    return errJson('Invalid JSON', 400)
  }

  if (!body.licenceKey || !body.batchId) {
    return errJson('licenceKey and batchId are required', 400)
  }

  const record = await env.LICENCES.get<LicenceRecord>(body.licenceKey, 'json')
  if (!record || !record.valid) {
    return errJson('Invalid licence key', 401)
  }

  let computation
  try {
    computation = computeRefund(record, body.batchId)
  } catch (e) {
    if (e instanceof RefundValidationError) {
      const status = e.code === 'BATCH_NOT_FOUND' ? 404 : 409
      return errJson(e.message, status, { code: e.code })
    }
    console.error('[/refund-batch] computation error:', e)
    return errJson('Refund could not be computed', 500)
  }

  if (!env.STRIPE_SECRET_KEY) {
    return errJson('Refunds are temporarily unavailable — please contact support.', 503)
  }

  const stripeResult = await issueStripeRefund(env.STRIPE_SECRET_KEY, {
    paymentIntentId: computation.paymentIntentId,
    amountPence: computation.refundPence,
    batchId: body.batchId,
    licenceKey: body.licenceKey,
  })

  if (!stripeResult.ok) {
    console.error(
      `[/refund-batch] Stripe refund failed: licence=${body.licenceKey.slice(0, 12)}… `
      + `batch=${body.batchId} reason=${stripeResult.error}`,
    )
    return errJson('Refund could not be processed by the payment provider — please try again or contact support.', 502)
  }

  await env.LICENCES.put(body.licenceKey, JSON.stringify(computation.record))

  console.log(
    `[/refund-batch] refunded ${computation.refundPence}p `
    + `(${computation.creditsRefunded} credits) `
    + `licence=${body.licenceKey.slice(0, 12)}… batch=${body.batchId} `
    + `stripeRefund=${stripeResult.refundId}`,
  )

  return json({
    refundedPence: computation.refundPence,
    creditsRefunded: computation.creditsRefunded,
    currency: computation.currency,
    newBalance: computation.record.creditBalance,
    batches: summariseBatches(computation.record),
  })
}

interface StripeRefundArgs {
  paymentIntentId: string
  amountPence: number
  batchId: string
  licenceKey: string
}

async function issueStripeRefund(
  secretKey: string,
  args: StripeRefundArgs,
): Promise<{ ok: true; refundId: string } | { ok: false; error: string }> {
  const form = new URLSearchParams()
  form.set('payment_intent', args.paymentIntentId)
  form.set('amount', String(args.amountPence))
  form.set('reason', 'requested_by_customer')
  form.set('metadata[batchId]', args.batchId)
  form.set('metadata[licenceKey]', args.licenceKey)

  let res: Response
  try {
    res = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        // Idempotency-Key prevents Stripe from charging two refunds if the
        // user double-clicks or retries; tied to batch so retries with the
        // same intent return the same refund object.
        'Idempotency-Key': `refund-${args.batchId}`,
      },
      body: form.toString(),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>')
    return { ok: false, error: `Stripe ${res.status}: ${text}` }
  }

  const data = await res.json() as { id?: string }
  return { ok: true, refundId: data.id ?? 'unknown' }
}

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function errJson(message: string, status: number, extra: Record<string, unknown> = {}): Response {
  return json({ error: message, ...extra }, status)
}
