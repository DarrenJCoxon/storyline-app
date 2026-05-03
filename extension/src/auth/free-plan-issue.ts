import * as vscode from 'vscode'

export interface FreePlanIssueResult {
  licenceKey: string
  creditBalance: number
  /** True when the backend returned the existing key for this device's
   *  machineId (re-install / re-prompt) rather than minting a fresh
   *  150-credit pool. Surfaced to callers so a re-issued key can be
   *  greeted with "welcome back" copy instead of "fresh free plan". */
  reused: boolean
}

/**
 * Request a per-install free-tier licence from the backend. Each call mints
 * a new unique SL-FREE-XXXX-XXXX-XXXX key with its own credit pool (size
 * controlled by FREE_PLAN_CREDITS in backend/src/free-plan.ts).
 *
 * Sends `vscode.env.machineId` so the backend can return the existing key
 * for this device on repeat calls — prevents reinstall-to-farm-credits
 * abuse without requiring email verification.
 *
 * Optional `ref` is the 8-char Crockford referral code that arrives via
 * the `vscode://...activate?ref=<code>` URI handler. Passing it earns
 * the new user the +50-credit bonus and the referrer the +25-credit
 * award (subject to caps + dedup on the backend).
 *
 * Throws on network failure or non-2xx response.
 */
export async function issueFreePlan(
  backendUrl: string,
  ref?: string,
): Promise<FreePlanIssueResult> {
  const body: { machineId: string; ref?: string } = { machineId: vscode.env.machineId }
  if (ref) body.ref = ref
  const response = await fetch(`${backendUrl}/free-plan/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Free plan issue failed (${response.status}): ${text}`)
  }
  const data = await response.json() as Partial<FreePlanIssueResult>
  if (!data.licenceKey || typeof data.creditBalance !== 'number') {
    throw new Error('Free plan issue returned malformed response')
  }
  return {
    licenceKey: data.licenceKey,
    creditBalance: data.creditBalance,
    reused: data.reused === true,
  }
}
