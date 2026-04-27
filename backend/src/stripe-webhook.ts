import type { Env, LicenceRecord, LicenceType } from './types.js'
import { sendLicenceEmail } from './email.js'

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

  const licenceKey = generateLicenceKey()

  const record: LicenceRecord = {
    type,
    valid: true,
    creditBalance: type === 'byok' ? 0 : credits,
    totalPurchased: credits,
    stripeCustomerId: customerId,
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
    if (env.RESEND_API_KEY) {
      await sendLicenceEmail(normalised, licenceKey, env.RESEND_API_KEY).catch(err =>
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
  const updated: LicenceRecord = {
    ...existing,
    creditBalance: existing.creditBalance + topup,
    totalPurchased: existing.totalPurchased + topup,
  }

  await env.LICENCES.put(licenceKey, JSON.stringify(updated))
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
