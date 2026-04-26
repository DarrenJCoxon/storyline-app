import type { Env, ChatRequest, LicenceRecord } from './types.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

export async function handleChat(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  let body: ChatRequest
  try {
    body = await req.json()
  } catch {
    return errJson('Invalid JSON', 400)
  }

  if (!body.licenceKey || !body.messages || !body.stageId) {
    return errJson('licenceKey, messages, and stageId are required', 400)
  }

  // Validate licence
  const record = await env.LICENCES.get<LicenceRecord>(body.licenceKey, 'json')
  if (!record || !record.valid) {
    return errJson('Invalid licence key', 401)
  }

  // BYOK users never call this endpoint — they call their own provider directly
  if (record.type === 'byok') {
    return errJson('BYOK licences do not use the managed proxy', 403)
  }

  if (record.creditBalance <= 0) {
    return errJson('Credits exhausted — top up to continue', 402)
  }

  // Optimistic deduction — write decremented balance BEFORE upstream call to avoid races.
  // If upstream fails we refund.
  const deducted: LicenceRecord = { ...record, creditBalance: Math.max(0, record.creditBalance - 1) }
  await env.LICENCES.put(body.licenceKey, JSON.stringify(deducted))

  // Build messages with system prompt prepended (Storyline harness comes from extension)
  const upstreamMessages = body.systemPrompt
    ? [{ role: 'system' as const, content: body.systemPrompt }, ...body.messages]
    : body.messages

  // Proxy to OpenRouter, streaming
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://storyline.app',
      'X-Title': 'Storyline',
    },
    body: JSON.stringify({
      model: env.CHAT_MODEL,
      messages: upstreamMessages,
      stream: true,
    }),
  })

  if (!upstream.ok) {
    // Refund the deducted credit since upstream failed
    await env.LICENCES.put(body.licenceKey, JSON.stringify(record))
    const text = await upstream.text()
    return errJson(`Upstream error ${upstream.status}: ${text}`, 502)
  }

  // Stream the SSE response straight back — credits already deducted above
  const { readable, writable } = new TransformStream()

  const pump = async () => {
    const reader = upstream.body!.getReader()
    const writer = writable.getWriter()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        await writer.write(value)
      }
    } finally {
      await writer.close()
    }
  }

  pump() // fire-and-forget — pump runs while response streams

  return new Response(readable, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}

function errJson(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
