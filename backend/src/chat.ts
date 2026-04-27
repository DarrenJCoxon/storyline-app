import type { Env, ChatRequest, LicenceRecord, OpenRouterUsage, DailyStats } from './types.js'
import { reasoningEffortForStage, buildReasoningParam } from './reasoning.js'

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

  const record = await env.LICENCES.get<LicenceRecord>(body.licenceKey, 'json')
  if (!record || !record.valid) return errJson('Invalid licence key', 401)
  if (record.type === 'byok') return errJson('BYOK licences do not use the managed proxy', 403)
  if (record.creditBalance <= 0) return errJson('Credits exhausted — top up to continue', 402)

  // Optimistic deduction before upstream call to avoid races; refund on failure.
  const deducted: LicenceRecord = { ...record, creditBalance: Math.max(0, record.creditBalance - 1) }
  await env.LICENCES.put(body.licenceKey, JSON.stringify(deducted))

  const upstreamMessages = body.systemPrompt
    ? [{ role: 'system' as const, content: body.systemPrompt }, ...body.messages]
    : body.messages

  const reasoning = buildReasoningParam(reasoningEffortForStage(body.stageId))
  console.log(`[/chat] stage=${body.stageId} reasoning=${reasoning.effort} model=${env.CHAT_MODEL}`)

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
      stream_options: { include_usage: true },
      reasoning,
    }),
  })

  if (!upstream.ok) {
    await env.LICENCES.put(body.licenceKey, JSON.stringify(record))
    const text = await upstream.text()
    return errJson(`Upstream error ${upstream.status}: ${text}`, 502)
  }

  const { readable, writable } = new TransformStream()

  // Parse the SSE stream, forward content, capture usage for analytics.
  const pump = parseAndForwardStream(upstream, writable.getWriter())

  pump.then(usage => {
    if (usage) storeUsageStats(env, body.licenceKey, body.stageId, usage).catch(() => {})
  })

  return new Response(readable, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
}

async function parseAndForwardStream(
  upstream: Response,
  writer: WritableStreamDefaultWriter,
): Promise<OpenRouterUsage | null> {
  const reader = upstream.body!.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  let usage: OpenRouterUsage | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()

        if (data === '[DONE]') {
          // Emit usage sentinel before closing so the extension can display it
          if (usage) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ _usage: usage })}\n\n`))
          }
          await writer.write(encoder.encode('data: [DONE]\n\n'))
          return usage
        }

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>
            usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost?: number }
          }

          // Capture usage when it arrives (final chunk before [DONE])
          if (parsed.usage && !usage) {
            usage = {
              promptTokens: parsed.usage.prompt_tokens,
              completionTokens: parsed.usage.completion_tokens,
              totalTokens: parsed.usage.total_tokens,
              costUsd: parsed.usage.cost ?? null,
            }
          }

          // Only forward chunks that carry content — skip usage-only chunks
          const hasContent = parsed.choices?.some(c => c.delta?.content)
          if (hasContent) {
            await writer.write(encoder.encode(`${line}\n\n`))
          }
        } catch {
          await writer.write(encoder.encode(`${line}\n\n`))
        }
      }
    }
  } finally {
    await writer.close()
  }

  return usage
}

async function storeUsageStats(
  env: Env,
  licenceKey: string,
  stageId: string,
  usage: OpenRouterUsage,
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10)
  const key = `stats:${day}`

  const existing = await env.LICENCES.get<DailyStats>(key, 'json') ?? {
    requests: 0, promptTokens: 0, completionTokens: 0, costUsd: 0,
  }

  const updated: DailyStats = {
    requests: existing.requests + 1,
    promptTokens: existing.promptTokens + usage.promptTokens,
    completionTokens: existing.completionTokens + usage.completionTokens,
    costUsd: existing.costUsd + (usage.costUsd ?? 0),
  }

  await env.LICENCES.put(key, JSON.stringify(updated), {
    expirationTtl: 90 * 24 * 60 * 60, // 90 days
  })

  console.log(`[usage] day=${day} stage=${stageId} key=${licenceKey.slice(0, 8)}… tokens=${usage.totalTokens} cost=$${usage.costUsd?.toFixed(6) ?? 'n/a'}`)
}

export async function handleAdminStats(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('Authorization')
  const adminKey = env.ADMIN_KEY ?? env.OPENROUTER_API_KEY
  if (!auth || auth !== `Bearer ${adminKey}`) {
    return new Response('Unauthorized', { status: 401, headers: CORS })
  }

  const url = new URL(req.url)
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') ?? '30', 10)))

  const results: Record<string, DailyStats & { avgCostPerRequest?: number }> = {}
  let grandTotal: DailyStats = { requests: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 }

  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    const stats = await env.LICENCES.get<DailyStats>(`stats:${d}`, 'json')
    if (stats) {
      results[d] = {
        ...stats,
        avgCostPerRequest: stats.requests > 0 ? stats.costUsd / stats.requests : 0,
      }
      grandTotal.requests += stats.requests
      grandTotal.promptTokens += stats.promptTokens
      grandTotal.completionTokens += stats.completionTokens
      grandTotal.costUsd += stats.costUsd
    }
  }

  return new Response(JSON.stringify({
    period: `last ${days} days`,
    totals: {
      ...grandTotal,
      avgCostPerRequest: grandTotal.requests > 0 ? grandTotal.costUsd / grandTotal.requests : 0,
      avgTokensPerRequest: grandTotal.requests > 0
        ? Math.round(grandTotal.promptTokens + grandTotal.completionTokens) / grandTotal.requests
        : 0,
    },
    daily: results,
  }, null, 2), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function errJson(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
