import type { Env } from './types.js'

/**
 * CB-15 — Dev-only endpoint to wipe the machineId guard from
 * /free-plan/issue, so a developer or tester can request a fresh
 * 150-credit free plan from the same machine.
 *
 * Without this endpoint, /free-plan/issue's machineId guard returns
 * the previously-issued key (and whatever balance the user has burned
 * down to), which is the right behaviour for production but blocks
 * iterative testing of the new-user flow.
 *
 * Auth: requires `Authorization: Bearer <ADMIN_KEY>` header. The same
 * ADMIN_KEY pattern that gates /admin/stats. If ADMIN_KEY isn't set on
 * the worker, falls back to OPENROUTER_API_KEY (which is already a
 * required production secret) — keeps dev-only endpoints from being
 * silently open if env vars drift.
 *
 * Body: { machineId: string }. Required. Without it the endpoint is
 * a 400 — refuse to delete anything ambient.
 *
 * What it deletes from KV:
 *   - mid:<machineId>          → forward map (machineId → licence key)
 *   - key:<licenceKey>:mid     → reverse map
 *   - <licenceKey>             → the LicenceRecord itself
 *
 * After this, the next /free-plan/issue call from the same machineId
 * mints a fresh key with the full FREE_PLAN_CREDITS allocation.
 */
export async function handleFreePlanReset(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') {
    return resp({ error: 'POST required' }, 405)
  }

  const auth = req.headers.get('Authorization')
  const adminKey = env.ADMIN_KEY ?? env.OPENROUTER_API_KEY
  if (!auth || auth !== `Bearer ${adminKey}`) {
    return resp({ error: 'Unauthorized' }, 401)
  }

  let body: { machineId?: string } | null = null
  try {
    body = await req.json()
  } catch {
    return resp({ error: 'invalid JSON' }, 400)
  }

  const machineId = body?.machineId?.trim()
  if (!machineId) {
    return resp({ error: 'machineId required' }, 400)
  }

  const forwardKey = `mid:${machineId}`
  const licenceKey = await env.LICENCES.get(forwardKey)

  const deleted: string[] = []
  if (licenceKey) {
    await env.LICENCES.delete(licenceKey)
    deleted.push(licenceKey)
    await env.LICENCES.delete(`key:${licenceKey}:mid`)
    deleted.push(`key:${licenceKey}:mid`)
  }
  await env.LICENCES.delete(forwardKey)
  deleted.push(forwardKey)

  return resp({ ok: true, machineId, licenceKey: licenceKey ?? null, deleted }, 200)
}

function resp(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
