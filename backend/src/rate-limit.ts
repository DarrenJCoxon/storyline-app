import type { Env } from './types.js'

interface RateLimitOptions {
  /** KV key prefix, e.g. "rl:resend" */
  prefix: string
  /** Max requests allowed within the window */
  max: number
  /** Window size in seconds */
  windowSecs: number
}

interface RateLimitResult {
  limited: boolean
  retryAfter: number
}

export async function checkRateLimit(
  req: Request,
  env: Env,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  const window = Math.floor(Date.now() / 1000 / opts.windowSecs)
  const key = `${opts.prefix}:${ip}:${window}`

  const raw = await env.LICENCES.get(key)
  const count = raw ? parseInt(raw, 10) : 0

  if (count >= opts.max) {
    return { limited: true, retryAfter: opts.windowSecs }
  }

  await env.LICENCES.put(key, String(count + 1), { expirationTtl: opts.windowSecs * 2 })
  return { limited: false, retryAfter: 0 }
}

export function rateLimitedResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests', retryAfter }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    },
  )
}
