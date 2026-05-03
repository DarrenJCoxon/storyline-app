import type { Env } from './types.js'
import { sendLicenceEmail } from './email.js'
import { checkRateLimit } from './rate-limit.js'

export async function handleResendKey(req: Request, env: Env): Promise<Response> {
  // GET → show the self-service form
  if (req.method === 'GET') {
    return new Response(resendFormHtml(env.TURNSTILE_SITE_KEY), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // Rate limit: 3 attempts per IP per hour
  const rl = await checkRateLimit(req, env, { prefix: 'rl:resend', max: 3, windowSecs: 3600 })
  if (rl.limited) {
    return new Response(
      resendFormHtml(env.TURNSTILE_SITE_KEY, 'Too many attempts — please try again later.'),
      { status: 429, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  // POST → look up and resend
  let email: string | undefined
  let turnstileToken: string | undefined
  const ct = req.headers.get('Content-Type') ?? ''
  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => ({})) as { email?: string; token?: string }
    email = body.email
    turnstileToken = body.token
  } else {
    const form = await req.formData().catch(() => null)
    email = form?.get('email')?.toString()
    turnstileToken = form?.get('cf-turnstile-response')?.toString()
  }

  // Verify Turnstile token when configured
  if (env.TURNSTILE_SECRET_KEY) {
    const valid = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, req)
    if (!valid) {
      return new Response(
        resendFormHtml(env.TURNSTILE_SITE_KEY, 'Bot check failed — please try again.'),
        { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      )
    }
  }

  if (!email?.includes('@')) {
    return new Response(resendFormHtml(env.TURNSTILE_SITE_KEY, 'Please enter a valid email address.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const normalised = email.trim().toLowerCase()
  const licenceKey = await env.LICENCES.get(`email:${normalised}`)

  // Always return success — don't reveal whether an email is registered
  if (licenceKey && env.POSTMARK_API_KEY) {
    try {
      await sendLicenceEmail(normalised, licenceKey, env.POSTMARK_API_KEY)
    } catch (err) {
      console.error('Postmark error:', err)
    }
  }

  return new Response(resendSuccessHtml(email), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function verifyTurnstile(
  token: string | undefined,
  secret: string,
  req: Request,
): Promise<boolean> {
  if (!token) return false
  const ip = req.headers.get('CF-Connecting-IP') ?? undefined
  const body = new FormData()
  body.append('secret', secret)
  body.append('response', token)
  if (ip) body.append('remoteip', ip)

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v1/siteverify', {
    method: 'POST',
    body,
  }).catch(() => null)

  if (!res?.ok) return false
  const data = await res.json() as { success: boolean }
  return data.success === true
}

function resendFormHtml(siteKey?: string, error?: string): string {
  const turnstileWidget = siteKey
    ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <div class="cf-turnstile" data-sitekey="${siteKey}" data-theme="dark" style="margin-top:16px"></div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Storyline — Resend Licence Key</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#e8e8e8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;max-width:440px;width:100%;padding:40px}
    h1{font-size:20px;font-weight:600;margin-bottom:8px}
    p{color:#888;font-size:14px;line-height:1.6;margin-bottom:24px}
    label{display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#666;margin-bottom:8px}
    input{width:100%;background:#0f0f0f;border:1px solid #333;border-radius:8px;padding:12px 14px;color:#e8e8e8;font-size:15px;outline:none}
    input:focus{border-color:#7c3aed}
    .error{color:#f87171;font-size:13px;margin-bottom:16px}
    button{width:100%;margin-top:16px;background:#7c3aed;color:white;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:500;cursor:pointer}
    button:hover{opacity:0.9}
  </style>
</head>
<body>
  <div class="card">
    <h1>Recover your licence key</h1>
    <p>Enter the email address you used to purchase Storyline and we'll resend your key.</p>
    ${error ? `<p class="error">${error}</p>` : ''}
    <form method="POST">
      <label for="email">Email address</label>
      <input type="email" id="email" name="email" placeholder="you@example.com" required autofocus>
      ${turnstileWidget}
      <button type="submit">Send my key</button>
    </form>
  </div>
</body>
</html>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
}

function resendSuccessHtml(email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Storyline — Key Sent</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#e8e8e8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;max-width:440px;width:100%;padding:40px;text-align:center}
    .check{width:48px;height:48px;background:#16a34a;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
    .check svg{width:24px;height:24px;stroke:white;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
    h1{font-size:20px;font-weight:600;margin-bottom:8px}
    p{color:#888;font-size:14px;line-height:1.6}
  </style>
</head>
<body>
  <div class="card">
    <div class="check"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h1>Check your inbox</h1>
    <p>If <strong style="color:#e8e8e8">${escHtml(email)}</strong> has a Storyline licence, the key is on its way. Check your spam folder if it doesn't arrive within a minute.</p>
  </div>
</body>
</html>`
}
