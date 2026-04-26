import type { Env } from './types.js'
import { handleValidate } from './validate.js'
import { handleChat } from './chat.js'
import { handleCritique } from './critique.js'
import { handleIllustrate } from './illustrate.js'
import { handleStripeWebhook } from './stripe-webhook.js'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const { pathname } = url

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
        },
      })
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    switch (pathname) {
      case '/validate':
        return handleValidate(req, env)
      case '/chat':
        return handleChat(req, env)
      case '/critique':
        return handleCritique(req, env)
      case '/illustrate':
        return handleIllustrate(req, env)
      case '/stripe-webhook':
        return handleStripeWebhook(req, env)
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
