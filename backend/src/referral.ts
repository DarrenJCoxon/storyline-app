import type { Env, LicenceRecord } from './types.js'

/**
 * Referral system — see docs/roadmap/pricing-rationale/referral-program.md.
 *
 * Each Storyline user gets a stable 8-character referral code derived
 * deterministically from their licence key. New free-plan signups arriving
 * with `?ref=<code>` (or `body.ref`) get +50 credits on top of the 150
 * starter (200 total); the referrer gets +25 credits per successful award,
 * capped at 20 awards per code (= £5 retail value).
 *
 * KV layout (single LICENCES binding, namespaced via key prefix):
 *   ref:code:<code>       → licenceKey               (code → key lookup)
 *   ref:awards:<key>      → JSON AwardLedger         (cap + dedup state)
 *
 * Anti-abuse: machineIds are recorded against the referrer's award list,
 * so the same device can never be awarded twice via different codes, and
 * a referrer can't self-refer (their own machineId is implicitly already
 * accounted for once they've claimed their original free key).
 */

export const REFERRAL_BONUS_NEW_USER = 50
export const REFERRAL_BONUS_REFERRER = 25
export const REFERRAL_AWARDS_CAP = 20

export interface AwardLedger {
  /** Total successful awards. Caps at REFERRAL_AWARDS_CAP. */
  count: number
  /** Total credits issued to the referrer (bumps by 25 per award until cap). */
  creditsEarned: number
  /** machineIds we've already paid out for. Prevents double-award via
   *  reinstall + new code. Bounded by the cap so the array stays small. */
  awardedMachineIds: string[]
}

export type AwardOutcome =
  | { kind: 'awarded' }
  | { kind: 'cap-hit' }
  | { kind: 'duplicate-machine' }
  | { kind: 'unknown-code' }
  | { kind: 'self-referral' }

const CODE_KEY_PREFIX = 'ref:code:'
const AWARDS_KEY_PREFIX = 'ref:awards:'

/**
 * Derive a stable 8-char referral code from a licence key. Same key always
 * produces the same code, different keys map to different codes (modulo
 * the 40-bit collision space, which is fine for hand-shared invite links).
 *
 * Uses SHA-256 → first 5 bytes (40 bits) → Crockford-style base32 (8 chars).
 * Crockford excludes I/L/O/U to avoid 1/0/V/0 misreads when the code is
 * spoken aloud or scribbled on a napkin.
 */
export async function deriveReferralCode(licenceKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(licenceKey)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  const view = new Uint8Array(hash).slice(0, 5)
  return crockfordBase32(view)
}

/** Encode 5 bytes (40 bits) as 8 Crockford base32 characters. */
function crockfordBase32(bytes: Uint8Array): string {
  if (bytes.length !== 5) throw new Error('crockfordBase32 expects exactly 5 bytes')
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  // 40 bits = 8 × 5-bit groups. Read big-endian.
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  let out = ''
  for (let i = 0; i < 8; i++) {
    const idx = Number((n >> BigInt(35 - i * 5)) & 0x1fn)
    out += alphabet[idx]
  }
  return out
}

/**
 * Validate user-supplied code shape before any KV lookup. Crockford alphabet,
 * exactly 8 chars, uppercase. Rejects garbage early so we don't store
 * arbitrary input under our `ref:` namespace.
 */
export function isValidReferralCode(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(raw.trim().toUpperCase())
}

/**
 * Index a licence key under its referral code. Idempotent — overwriting
 * with the same code is harmless and lets us re-index legacy keys
 * lazily on first /referral/stats call.
 */
export async function ensureCodeIndex(env: Env, licenceKey: string): Promise<string> {
  const code = await deriveReferralCode(licenceKey)
  const existing = await env.LICENCES.get(`${CODE_KEY_PREFIX}${code}`)
  if (existing !== licenceKey) {
    await env.LICENCES.put(`${CODE_KEY_PREFIX}${code}`, licenceKey)
  }
  return code
}

/** Look up the referrer's licence key from a code. Returns null on miss
 *  or shape failure. */
export async function lookupReferrerByCode(env: Env, code: string): Promise<string | null> {
  if (!isValidReferralCode(code)) return null
  const key = await env.LICENCES.get(`${CODE_KEY_PREFIX}${code.toUpperCase()}`)
  return key ?? null
}

export async function loadAwardLedger(env: Env, licenceKey: string): Promise<AwardLedger> {
  const stored = await env.LICENCES.get<AwardLedger>(`${AWARDS_KEY_PREFIX}${licenceKey}`, 'json')
  return stored ?? { count: 0, creditsEarned: 0, awardedMachineIds: [] }
}

async function saveAwardLedger(env: Env, licenceKey: string, ledger: AwardLedger): Promise<void> {
  await env.LICENCES.put(`${AWARDS_KEY_PREFIX}${licenceKey}`, JSON.stringify(ledger))
}

/**
 * Apply a referral award atomically. Pure-ish — caller passes the ledger
 * decision; this function records it and returns the outcome.
 *
 * Cap behaviour matches the doc: at cap, the referrer stops earning but
 * the new user still gets their 50-credit bonus (the link keeps working
 * as an invite, just without further payout).
 */
export async function tryAwardReferral(args: {
  env: Env
  referrerKey: string
  newUserMachineId: string
}): Promise<AwardOutcome> {
  const { env, referrerKey, newUserMachineId } = args

  // Look up the referrer to verify they exist + are still valid.
  const referrer = await env.LICENCES.get<LicenceRecord>(referrerKey, 'json')
  if (!referrer || !referrer.valid) return { kind: 'unknown-code' }

  const ledger = await loadAwardLedger(env, referrerKey)

  if (ledger.awardedMachineIds.includes(newUserMachineId)) {
    return { kind: 'duplicate-machine' }
  }

  // Self-referral: the referrer's own machineId is implicitly excluded
  // because the machineId-guard in /free-plan/issue would have returned
  // their existing key before we got here. But we double-check by
  // looking up the referrer's machineId mapping.
  const referrerMachineKey = await findMachineIdForLicenceKey(env, referrerKey)
  if (referrerMachineKey === newUserMachineId) {
    return { kind: 'self-referral' }
  }

  if (ledger.count >= REFERRAL_AWARDS_CAP) {
    // Still record the machineId so a future top-up that lifts the cap
    // doesn't double-pay this user. New user gets bonus regardless of
    // referrer cap state.
    ledger.awardedMachineIds.push(newUserMachineId)
    await saveAwardLedger(env, referrerKey, ledger)
    return { kind: 'cap-hit' }
  }

  // Award the referrer + record. Free referrers have flat creditBalance
  // (no batches); paid referrers also get a flat increment because
  // referral bonuses are non-refundable and shouldn't appear as a
  // refundable purchase batch in the user's purchase history.
  const updatedReferrer: LicenceRecord = {
    ...referrer,
    creditBalance: referrer.creditBalance + REFERRAL_BONUS_REFERRER,
    totalPurchased: referrer.totalPurchased + REFERRAL_BONUS_REFERRER,
  }
  await env.LICENCES.put(referrerKey, JSON.stringify(updatedReferrer))

  ledger.count += 1
  ledger.creditsEarned += REFERRAL_BONUS_REFERRER
  ledger.awardedMachineIds.push(newUserMachineId)
  await saveAwardLedger(env, referrerKey, ledger)

  return { kind: 'awarded' }
}

/**
 * O(1) machineId reverse-lookup via the `key:<licenceKey>:mid` index
 * written by /free-plan/issue alongside the forward `mid:<machineId>`
 * mapping. Keys minted before the reverse index was added return null,
 * which is a safe false-negative: worst case a self-referrer earns the
 * bonus once (bounded by their cap + machineId dedup on the new-user
 * side).
 */
async function findMachineIdForLicenceKey(env: Env, licenceKey: string): Promise<string | null> {
  return env.LICENCES.get(`key:${licenceKey}:mid`)
}

export interface ReferralStats {
  code: string
  referralCount: number
  creditsEarned: number
  capRemaining: number
}

/**
 * Public stats response for the share-modal "running tally". Computes the
 * code on the fly so legacy keys (pre-referral) don't need migration —
 * the code is just deterministic-from-key.
 */
export async function getReferralStats(env: Env, licenceKey: string): Promise<ReferralStats> {
  const code = await ensureCodeIndex(env, licenceKey)
  const ledger = await loadAwardLedger(env, licenceKey)
  return {
    code,
    referralCount: ledger.count,
    creditsEarned: ledger.creditsEarned,
    capRemaining: Math.max(0, REFERRAL_AWARDS_CAP - ledger.count),
  }
}
