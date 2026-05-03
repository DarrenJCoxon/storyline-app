import type { Env, LicenceRecord } from './types.js'
import { getReferralStats } from './referral.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

/**
 * GET  /referral/stats?key=SL-...
 * POST /referral/stats  body: { licenceKey }
 *
 * Returns the user's referral code, count, credits earned, and remaining
 * cap. Both verbs supported so the share-modal webview can use POST
 * (consistent with the rest of the API) and external link previews can
 * use GET.
 */
export async function handleReferralStats(req: Request, env: Env): Promise<Response> {
  const licenceKey = await extractLicenceKey(req)
  if (!licenceKey) return errJson('licenceKey is required', 400)

  const record = await env.LICENCES.get<LicenceRecord>(licenceKey, 'json')
  if (!record || !record.valid) return errJson('Invalid licence key', 401)

  const stats = await getReferralStats(env, licenceKey)
  return json(stats)
}

async function extractLicenceKey(req: Request): Promise<string | null> {
  const url = new URL(req.url)
  const fromQuery = url.searchParams.get('key')
  if (fromQuery) return fromQuery

  if (req.method === 'POST') {
    try {
      const body = await req.json() as { licenceKey?: string }
      return body.licenceKey ?? null
    } catch {
      return null
    }
  }
  return null
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
