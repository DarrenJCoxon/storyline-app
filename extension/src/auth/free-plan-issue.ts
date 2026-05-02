export interface FreePlanIssueResult {
  licenceKey: string
  creditBalance: number
}

/**
 * Request a per-install free-tier licence from the backend. Each call mints
 * a new unique SL-FREE-XXXX-XXXX-XXXX key with its own credit pool (size
 * controlled by FREE_PLAN_CREDITS in backend/src/free-plan.ts).
 * Throws on network failure or non-2xx response.
 */
export async function issueFreePlan(backendUrl: string): Promise<FreePlanIssueResult> {
  const response = await fetch(`${backendUrl}/free-plan/issue`, { method: 'POST' })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Free plan issue failed (${response.status}): ${text}`)
  }
  const data = await response.json() as Partial<FreePlanIssueResult>
  if (!data.licenceKey || typeof data.creditBalance !== 'number') {
    throw new Error('Free plan issue returned malformed response')
  }
  return { licenceKey: data.licenceKey, creditBalance: data.creditBalance }
}
