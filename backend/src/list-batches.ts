import type { Env, LicenceRecord } from './types.js'
import { ensureBatches, summariseBatches } from './credit-batches.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

/**
 * POST /list-batches
 * Body: { licenceKey }
 * Returns the user's purchase history with refundability flags for the
 * "Recent Purchases" panel.
 */
export async function handleListBatches(req: Request, env: Env): Promise<Response> {
  let body: { licenceKey?: string }
  try {
    body = await req.json()
  } catch {
    return errJson('Invalid JSON', 400)
  }

  if (!body.licenceKey) return errJson('licenceKey is required', 400)

  const record = await env.LICENCES.get<LicenceRecord>(body.licenceKey, 'json')
  if (!record || !record.valid) return errJson('Invalid licence key', 401)

  const ensured = ensureBatches(record)
  const summaries = summariseBatches(ensured)

  return json({
    creditBalance: ensured.creditBalance,
    batches: summaries,
  })
}

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function errJson(message: string, status: number): Response {
  return json({ error: message }, status)
}
