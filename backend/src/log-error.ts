import type { Env } from './types.js'

/**
 * Production error reporting endpoint.
 *
 * The extension fires-and-forgets a POST here whenever an AI call fails
 * (chat / illustrate / cover / critique / transcribe). The Worker logs a
 * structured JSON line to `console.error`, which Cloudflare captures and
 * surfaces in the Workers Logs live tail and the past-7-days retention.
 *
 * No KV writes — keeping this dependency-free so a misbehaving client
 * can't fill up storage. If volume ever justifies it, switch to Logpush
 * → R2 for longer retention + SQL queries.
 *
 * Privacy: the licence key is hashed (first 12 hex chars of SHA-256)
 * before being logged, so you can group errors by user without storing
 * the raw key.
 */
interface LogErrorPayload {
  endpoint: string         // 'chat' | 'illustrate' | 'cover' | 'critique' | 'transcribe' | 'validate' | string
  statusCode: number       // HTTP status returned by the failing call (or 0 for network errors)
  message: string          // human-readable error text
  version?: string         // extension version, if known
  licenceKey?: string      // raw key — hashed server-side before logging
  stageId?: string         // chat-specific: which planning stage was active
  platform?: string        // 'darwin' | 'win32' | 'linux'
}

export async function handleLogError(req: Request, env: Env): Promise<Response> {
  // Best-effort parse; an empty body just means the client sent garbage.
  // We don't want to surface that as a 4xx since it'd cause client retry storms.
  let body: LogErrorPayload | null = null
  try {
    body = await req.json() as LogErrorPayload
  } catch {
    return new Response('ok', { status: 200 })
  }

  if (!body || typeof body !== 'object') {
    return new Response('ok', { status: 200 })
  }

  const hashedKey = body.licenceKey
    ? (await sha256Hex(body.licenceKey)).slice(0, 12)
    : 'anon'

  // Single JSON line so it's parseable from the dashboard live tail.
  console.error(JSON.stringify({
    kind: 'extension-error',
    endpoint: String(body.endpoint || 'unknown'),
    statusCode: typeof body.statusCode === 'number' ? body.statusCode : 0,
    message: String(body.message || '').slice(0, 1000),  // bound size
    version: body.version ? String(body.version) : 'unknown',
    licenceKeyHash: hashedKey,
    stageId: body.stageId ? String(body.stageId) : undefined,
    platform: body.platform ? String(body.platform) : undefined,
    ts: new Date().toISOString(),
    cf: {
      country: req.cf?.country ?? null,
      colo: req.cf?.colo ?? null,
    },
  }))

  // Always 200 — clients should never retry an error report.
  return new Response('ok', { status: 200 })
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
