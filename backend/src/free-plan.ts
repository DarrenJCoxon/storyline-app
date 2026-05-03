import type { Env, LicenceRecord } from './types.js'
import { checkRateLimit, rateLimitedResponse } from './rate-limit.js'
import {
  ensureCodeIndex,
  isValidReferralCode,
  lookupReferrerByCode,
  REFERRAL_BONUS_NEW_USER,
  tryAwardReferral,
} from './referral.js'

// 150 is the "finish one complete book plan, then hit the wall" sweet spot.
// A typical 14-stage plan runs ~70-140 chat turns at 1 credit each, so 150
// lets users finish one plan and feel the value, without enough left over
// to start a second free book — preserving the natural conversion trigger.
// Earlier 250 allowed a full second plan before hitting the wall, which
// blunted conversion pressure.
const FREE_PLAN_CREDITS = 150

interface IssueRequestBody {
  /** Stable per-VS-Code-install identifier (vscode.env.machineId).
   *  When present, the same machineId always receives the same key on
   *  repeat calls — prevents reinstall-to-farm-credits abuse without
   *  requiring email verification. Optional for back-compat with
   *  pre-machineId extension versions. */
  machineId?: string
  /** Referral code (e.g. "R7NBPK4Q"). When present and valid, new user
   *  gets +50 credits; referrer gets +25 (capped). Accepted both in body
   *  and as ?ref= query param for URL-share use cases. */
  ref?: string
}

/**
 * Mint a per-install free-tier licence. Each first-run user gets their own
 * unique SL-FREE-XXXX-XXXX-XXXX key with its own credit pool (FREE_PLAN_CREDITS
 * above), so usage by one user can't deplete another's free plan.
 *
 * Anti-abuse stack (defence in depth — an attacker has to defeat all):
 *   1. IP rate limit: 30 issuances per IP per day (existing).
 *   2. machineId mapping: same machineId always returns the same key
 *      — uninstall + reinstall doesn't farm a fresh 150 credits.
 *   3. Held in reserve: Cloudflare Turnstile if scripted abuse becomes
 *      measurable despite layers 1+2.
 */
export async function handleFreePlanIssue(req: Request, env: Env): Promise<Response> {
  // Rate limit per IP — 30 free plans per IP per day. Reset & start over
  // mints a fresh key each click, and a user troubleshooting their first
  // activation can easily hit 5-10 attempts. 30/day comfortably covers
  // that plus household NATs / school networks, while still blocking
  // scripted abuse from a single IP.
  const rl = await checkRateLimit(req, env, { prefix: 'rl:free-issue', max: 30, windowSecs: 86400 })
  if (rl.limited) return rateLimitedResponse(rl.retryAfter)

  // Optional body — pre-machineId extension versions POST with no body,
  // so JSON parse failures fall through to the legacy mint path rather
  // than 400ing.
  let body: IssueRequestBody = {}
  try {
    const raw = await req.text()
    if (raw) body = JSON.parse(raw) as IssueRequestBody
  } catch {
    /* legacy clients — fall through with empty body */
  }

  const machineId = sanitiseMachineId(body.machineId)

  // Accept ref code from body OR ?ref= query param. URL form is what the
  // marketing site forwards through `/r/<code>` redirects.
  const url = new URL(req.url)
  const rawRef = body.ref ?? url.searchParams.get('ref') ?? undefined
  const refCode = isValidReferralCode(rawRef) ? rawRef.toUpperCase() : null

  // machineId guard: if this device has already received a key, return it.
  // The user gets back into their existing balance instead of a fresh 150.
  // Note: re-issued keys never trigger referral awards — the referral
  // is one-shot per device, gated by the same machineId index.
  if (machineId) {
    const existingKey = await env.LICENCES.get(`mid:${machineId}`)
    if (existingKey) {
      const existingRecord = await env.LICENCES.get<LicenceRecord>(existingKey, 'json')
      if (existingRecord && existingRecord.valid) {
        return json({
          licenceKey: existingKey,
          creditBalance: existingRecord.creditBalance,
          reused: true,
        })
      }
      // Mapping exists but record is gone or invalid — fall through to
      // mint fresh and overwrite the mapping. Rare (manual KV cleanup,
      // licence revocation), but safe.
    }
  }

  // Resolve referrer up-front so we know whether to mint with bonus.
  // Referrer-side credit award + ledger update happens after the new
  // record is written so KV-write failures don't double-charge.
  let referrerKey: string | null = null
  if (refCode) {
    referrerKey = await lookupReferrerByCode(env, refCode)
  }
  const newUserBonus = referrerKey ? REFERRAL_BONUS_NEW_USER : 0
  const startingCredits = FREE_PLAN_CREDITS + newUserBonus

  const licenceKey = generateFreeKey()
  const record: LicenceRecord = {
    valid: true,
    type: 'free',
    creditBalance: startingCredits,
    totalPurchased: startingCredits,
    stripeCustomerId: 'free-tier',
  }

  try {
    await env.LICENCES.put(licenceKey, JSON.stringify(record))
    if (machineId) {
      await env.LICENCES.put(`mid:${machineId}`, licenceKey)
      // Reverse index: lets referral.ts resolve machineId for a key in O(1)
      // instead of paginating the entire mid: keyspace.
      await env.LICENCES.put(`key:${licenceKey}:mid`, machineId)
    }
    // Index this user's own code so they can immediately share their
    // link via the in-app modal without a separate write step.
    await ensureCodeIndex(env, licenceKey)
  } catch (e) {
    console.error('[/free-plan/issue] KV write failed:', e)
    return json({ error: 'Could not provision free plan — please try again.' }, 503)
  }

  // Apply the referrer-side award. If this fails (cap, dup, self-ref) the
  // new user keeps their bonus — the cost-of-failure is at most £0.50 of
  // credits we shouldn't have minted, which is acceptable vs. the UX cost
  // of denying the bonus to a legitimate referred user.
  let refOutcome: string | undefined
  if (referrerKey && machineId) {
    const outcome = await tryAwardReferral({ env, referrerKey, newUserMachineId: machineId })
    refOutcome = outcome.kind
    console.log(`[/free-plan/issue] referral outcome: ${outcome.kind} ref=${refCode} new=${licenceKey.slice(0, 12)}…`)
  }

  return json({
    licenceKey,
    creditBalance: startingCredits,
    reused: false,
    bonusAwarded: newUserBonus,
    refOutcome,
  })
}

/** Strip whitespace and clamp to 128 chars to bound KV-key length. Reject
 *  anything that doesn't look like a hex/base32-ish identifier so we don't
 *  store arbitrary user-supplied strings under our `mid:` namespace. */
function sanitiseMachineId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.length > 128) return null
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null
  return trimmed
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
