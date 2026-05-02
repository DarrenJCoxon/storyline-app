import type { Env, LicenceRecord } from './types.js'
import { checkRateLimit, rateLimitedResponse } from './rate-limit.js'

const FREE_PLAN_CREDITS = 250

/**
 * Mint a per-install free-tier licence. Each first-run user gets their own
 * unique SL-FREE-XXXX-XXXX-XXXX key with its own 250-credit pool, so usage
 * by one user can't deplete another's free plan.
 */
export async function handleFreePlanIssue(req: Request, env: Env): Promise<Response> {
  // Rate limit per IP — 10 free plans per IP per day. Loose enough that
  // household NATs, school networks, or genuine reinstalls don't get
  // mistaken for abuse, but still tight enough to block scripted mass
  // issuance from a single IP.
  const rl = await checkRateLimit(req, env, { prefix: 'rl:free-issue', max: 10, windowSecs: 86400 })
  if (rl.limited) return rateLimitedResponse(rl.retryAfter)

  const licenceKey = generateFreeKey()
  const record: LicenceRecord = {
    valid: true,
    type: 'free',
    creditBalance: FREE_PLAN_CREDITS,
    totalPurchased: FREE_PLAN_CREDITS,
    stripeCustomerId: 'free-tier',
  }

  try {
    await env.LICENCES.put(licenceKey, JSON.stringify(record))
  } catch (e) {
    console.error('[/free-plan/issue] KV write failed:', e)
    return json({ error: 'Could not provision free plan — please try again.' }, 503)
  }

  return json({ licenceKey, creditBalance: FREE_PLAN_CREDITS })
}

function generateFreeKey(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0').toUpperCase()).join('')
  return `SL-FREE-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`
}

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
