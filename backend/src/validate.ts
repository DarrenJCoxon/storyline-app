import type { Env, ValidateRequest, ValidateResponse, LicenceRecord } from './types.js'
import { checkRateLimit, rateLimitedResponse } from './rate-limit.js'

export async function handleValidate(req: Request, env: Env): Promise<Response> {
  // Rate limit: 10 attempts per IP per minute — prevents key enumeration
  const rl = await checkRateLimit(req, env, { prefix: 'rl:validate', max: 10, windowSecs: 60 })
  if (rl.limited) return rateLimitedResponse(rl.retryAfter)

  let body: ValidateRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  if (!body.licenceKey) {
    return json({ error: 'licenceKey is required' }, 400)
  }

  const record = await env.LICENCES.get<LicenceRecord>(body.licenceKey, 'json')

  if (!record || !record.valid) {
    return json<ValidateResponse>({ valid: false, type: 'free', creditBalance: 0 }, 401)
  }

  return json<ValidateResponse>({
    valid: true,
    type: record.type,
    creditBalance: record.creditBalance,
  })
}

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
