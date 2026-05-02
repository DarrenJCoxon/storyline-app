import type { Env } from './types.js'
import { handleValidate } from './validate.js'
import { handleFreePlanIssue } from './free-plan.js'
import { handleChat, handleAdminStats } from './chat.js'
import { handleCritique } from './critique.js'
import { handleIllustrate } from './illustrate.js'
import { handleStripeWebhook } from './stripe-webhook.js'
import { handleTranscribe } from './transcribe.js'
import { handleSuccess } from './success.js'
import { handleResendKey } from './resend-key.js'
import { handleLogError } from './log-error.js'
import { handleTerms, handlePrivacy } from './legal.js'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const { pathname } = url

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
        },
      })
    }

    // Admin endpoints
    if (req.method === 'GET' && pathname === '/admin/stats') {
      return handleAdminStats(req, env)
    }

    // GET-only and GET+POST pages
    if (req.method === 'GET' && pathname === '/success') {
      return handleSuccess(req, env)
    }
    if (req.method === 'GET' && pathname === '/terms') {
      return handleTerms()
    }
    if (req.method === 'GET' && pathname === '/privacy') {
      return handlePrivacy()
    }
    if ((req.method === 'GET' || req.method === 'POST') && pathname === '/resend-key') {
      return handleResendKey(req, env)
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    switch (pathname) {
      case '/validate':
        return handleValidate(req, env)
      case '/free-plan/issue':
        return handleFreePlanIssue(req, env)
      case '/chat':
        return handleChat(req, env)
      case '/critique':
        return handleCritique(req, env)
      case '/illustrate':
        return handleIllustrate(req, env)
      case '/transcribe':
        return handleTranscribe(req, env)
      case '/stripe-webhook':
      case '/stripe/webhook':
        return handleStripeWebhook(req, env)
      case '/log-error':
        return handleLogError(req, env)
      case '/dev/seed-licence':
        return handleDevSeed(req, env)
      default:
        return new Response('Not found', { status: 404 })
    }
  },
}

async function handleDevSeed(req: Request, env: Env): Promise<Response> {
  if (env.DEV_MODE !== 'true') {
    return new Response('Not found', { status: 404 })
  }

  const body = await req.json().catch(() => null) as { licenceKey?: string; creditBalance?: number; type?: 'free' | 'credits' | 'byok' } | null
  const licenceKey = body?.licenceKey ?? 'SL-DEV-0000-0000-DEV0'
  const record = {
    valid: true,
    type: body?.type ?? 'credits',
    creditBalance: body?.creditBalance ?? 1_000_000,
    totalPurchased: body?.creditBalance ?? 1_000_000,
    stripeCustomerId: 'dev-seed',
  }

  await env.LICENCES.put(licenceKey, JSON.stringify(record))

  return new Response(JSON.stringify({ ok: true, licenceKey, record }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
