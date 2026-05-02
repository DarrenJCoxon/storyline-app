import type { Env, IllustrateRequest, LicenceRecord } from './types.js'
import { getDevLicenceRecord } from './dev-bypass.js'
import { consumeCredits, InsufficientCreditsError } from './credit-batches.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

// Credit costs sized for ~80% gross margin against Pack A post-Stripe
// revenue (£9.99 / 1,000 credits, ~1.5%+£0.20 fees ≈ $0.0121/credit net),
// which is the more common pack. Cost basis is OpenAI's per-image price
// for the aspect ratios we actually generate at — 1024×1536 / 1536×1024,
// NOT square 1024×1024 — so these are the realistic worst-case costs.
//   Low    cost ~$0.016 → revenue $0.097 (8 cr × $0.0121)  → 84% margin
//   Medium cost ~$0.063 → revenue $0.387 (32 cr × $0.0121) → 84% margin
//   High   cost ~$0.250 → revenue $1.210 (100 cr × $0.0121) → 80% margin
// Note: a full book-cover generation fires TWO /illustrate calls (front +
// back), so a complete cover at "high" actually charges 200 credits ≈
// $2.42 against $0.50 of OpenAI cost — same 80% margin, larger envelope.
// Pack B buyers (lower revenue per credit) get ~74-75% on these tiers.
const CREDITS_BY_QUALITY: Record<'low' | 'medium' | 'high', number> = {
  low: 8,       // ~$0.016 raw — character portraits, refs, ornaments
  medium: 32,   // ~$0.063 raw — chapter headers, maps, in-book illustrations
  high: 100,    // ~$0.25 raw  — single cover face (front or back)
}
const IMAGE_CREDIT_COST = 100 // default for backward compat (cover)

export async function handleIllustrate(req: Request, env: Env): Promise<Response> {
  let body: IllustrateRequest
  try {
    body = await req.json()
  } catch {
    return errJson('Invalid JSON', 400)
  }

  if (!body.licenceKey || !body.prompt) {
    return errJson('licenceKey and prompt are required', 400)
  }

  let record = await env.LICENCES.get<LicenceRecord>(body.licenceKey, 'json')
  if (!record) record = getDevLicenceRecord(body.licenceKey, req.url, env)
  if (!record || !record.valid) return errJson('Invalid licence key', 401)
  if (record.type === 'byok') return errJson('BYOK licences use your own API key for image generation', 403)

  // Free tier covers chat + critique for one book plan only — never images.
  // The credit balance on a free record is reserved for planning chat; image
  // generation requires a paid top-up regardless of remaining free credits.
  if (record.type === 'free') {
    return errJson(
      'Image generation is not included in the free book plan. Top up credits to use covers and illustrations.',
      402,
    )
  }

  const quality: 'low' | 'medium' | 'high' = body.quality ?? 'high'
  const creditCost = CREDITS_BY_QUALITY[quality] ?? IMAGE_CREDIT_COST
  if (record.creditBalance < creditCost) {
    return errJson(`Insufficient credits — ${quality} quality image costs ${creditCost} credits`, 402)
  }

  // Optimistic deduction — write decremented balance BEFORE upstream so concurrent
  // requests can't overspend. Restore if upstream fails. FIFO across batches.
  let deducted: LicenceRecord
  try {
    deducted = consumeCredits(record, creditCost)
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      return errJson(`Insufficient credits — ${quality} quality image costs ${creditCost} credits`, 402)
    }
    throw e
  }
  await env.LICENCES.put(body.licenceKey, JSON.stringify(deducted))

  const ar = body.aspectRatio ?? '2:3'

  // ── Path A: OpenAI direct ────────────────────────────────────────────
  // Strict size/quality enforcement, lower latency, and the same model
  // family the user already uses via OpenRouter — but called through
  // /v1/images/generations (no chat-completions translation, no
  // dropped params). Only used when OPENAI_API_KEY is configured.
  let upstream: Response
  if (env.OPENAI_API_KEY) {
    const oaSize = mapSizeToOpenAI(body.size, ar)
    const oaModel = env.OPENAI_IMAGE_MODEL || 'gpt-image-2'

    // Collect every reference image (legacy single + new multi).
    const refs: Array<{ base64: string; label?: string }> = []
    if (body.referenceImages?.length) refs.push(...body.referenceImages)
    if (body.referenceImageBase64) refs.push({ base64: body.referenceImageBase64 })

    const useEdits = refs.length > 0

    if (useEdits) {
      // /v1/images/edits keeps character + style consistent. We pass each
      // reference as image[] (the multi-image form gpt-image-2 supports)
      // plus input_fidelity to lock features. Default to "high" when
      // any reference is provided — that's the whole point of passing one.
      const form = new FormData()
      form.set('model', oaModel)
      form.set('prompt', body.prompt)
      form.set('size', oaSize)
      form.set('quality', quality)
      form.set('n', '1')
      // input_fidelity is only supported by gpt-image-1. The current
      // gpt-image-2 model rejects it with a 400 (`invalid_input_fidelity_model`).
      // Send it conditionally based on the model name.
      if (/gpt-image-1\b/.test(oaModel)) {
        form.set('input_fidelity', body.inputFidelity ?? 'high')
      }
      // OpenAI's edits endpoint accepts repeated `image[]` form fields.
      refs.forEach((ref, i) => {
        const bytes = base64ToBytes(ref.base64)
        form.append('image[]', new Blob([bytes], { type: 'image/jpeg' }), `ref-${i}-${ref.label ?? 'image'}.jpg`)
      })
      upstream = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: form,
      })
    } else {
      upstream = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: oaModel,
          prompt: body.prompt,
          size: oaSize,
          quality,
          n: 1,
          output_format: 'jpeg',
        }),
      })
    }
  } else {
    // ── Path B: OpenRouter fallback ─────────────────────────────────
    // Used only when OPENAI_API_KEY isn't set. Aspect/quality are
    // best-effort here — the chat-completions translation has been
    // observed to drop them.
    type ContentPart =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }

    const orientationWord = (() => {
      if (!ar.includes(':')) return 'portrait'
      const [w, h] = ar.split(':').map(Number)
      if (!w || !h) return 'portrait'
      if (Math.abs(w - h) < 0.01) return 'square'
      return w > h ? 'landscape' : 'portrait'
    })()
    const sizeHint = `\n\nCRITICAL OUTPUT REQUIREMENT: Aspect ratio MUST be exactly ${ar} (${orientationWord}${body.size ? ', ' + body.size + ' pixels' : ''}). The composition must be framed for ${orientationWord} format. DO NOT output a square image unless ratio is 1:1.`
    const userContent: ContentPart[] = [{ type: 'text', text: body.prompt + sizeHint }]
    if (body.referenceImageBase64) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${body.referenceImageBase64}` },
      })
    }

    const model = env.IMAGE_MODEL || 'openai/gpt-5.4-image-2'
    const imageToolConfig: Record<string, unknown> = { type: 'image_generation', output_format: 'jpeg' }
    if (body.size) imageToolConfig.size = body.size
    if (quality) imageToolConfig.quality = quality
    const extraBody: Record<string, unknown> = { tools: [imageToolConfig] }
    if (body.size) extraBody.size = body.size
    if (body.aspectRatio) extraBody.aspect_ratio = body.aspectRatio
    if (quality) extraBody.quality = quality

    const upstreamBody: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: userContent }],
      modalities: ['image'],
      quality,
      extra_body: extraBody,
    }
    if (body.size) upstreamBody.size = body.size
    if (body.aspectRatio) upstreamBody.aspect_ratio = body.aspectRatio

    upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://storyline.app',
        'X-Title': 'Storyline',
      },
      body: JSON.stringify(upstreamBody),
    })
  }

  if (!upstream.ok) {
    // Refund — upstream failed
    await env.LICENCES.put(body.licenceKey, JSON.stringify(record))
    const text = await upstream.text()
    return errJson(`Image model error ${upstream.status}: ${text}`, 502)
  }

  const rawText = await upstream.text()

  type ImageContentPart = { type: string; image_url?: { url: string }; text?: string }
  type ImageMessage = { content?: ImageContentPart[] | string; images?: Array<{ image_url?: { url: string }; type?: string }> }
  type ImageResponse = {
    choices?: Array<{ message?: ImageMessage }>
    data?: Array<{ url?: string; b64_json?: string }>
    error?: { message?: string; code?: string }
  }

  let result: ImageResponse
  try {
    result = JSON.parse(rawText) as ImageResponse
  } catch {
    await env.LICENCES.put(body.licenceKey, JSON.stringify(record))
    return errJson(`Upstream returned non-JSON: ${rawText.slice(0, 200)}`, 502)
  }

  if (result.error) {
    await env.LICENCES.put(body.licenceKey, JSON.stringify(record))
    return errJson(`Model error: ${result.error.message ?? result.error.code ?? 'unknown'}`, 502)
  }

  // Try every known image response shape:
  //   1. OpenRouter chat-completions multimodal: choices[0].message.content[].image_url.url
  //   2. OpenRouter chat-completions with images array: choices[0].message.images[].image_url.url
  //   3. OpenAI Images API: data[0].url or data[0].b64_json
  let imageUrl: string | undefined

  const message = result.choices?.[0]?.message
  if (message?.content && Array.isArray(message.content)) {
    imageUrl = message.content.find(p => p.type === 'image_url' && p.image_url?.url)?.image_url?.url
  }
  if (!imageUrl && message?.images?.length) {
    imageUrl = message.images[0].image_url?.url
  }
  if (!imageUrl && result.data?.length) {
    const d = result.data[0]
    if (d.url) imageUrl = d.url
    else if (d.b64_json) imageUrl = `data:image/jpeg;base64,${d.b64_json}`
  }

  if (!imageUrl) {
    await env.LICENCES.put(body.licenceKey, JSON.stringify(record))
    return errJson(`No image in model response. Raw: ${rawText.slice(0, 500)}`, 502)
  }

  return new Response(JSON.stringify({ imageDataUrl: imageUrl }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function errJson(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/**
 * gpt-image-1.5 / gpt-image-2 supported sizes via /v1/images/generations:
 *   1024x1024 (square), 1024x1536 (portrait 2:3), 1536x1024 (landscape 3:2), auto
 *
 * Caller may pass any of those exact strings; otherwise we infer from
 * the requested aspect ratio.
 */
function mapSizeToOpenAI(requestedSize: string | undefined, aspect: string): '1024x1024' | '1024x1536' | '1536x1024' | 'auto' {
  if (requestedSize === '1024x1024' || requestedSize === '1024x1536' || requestedSize === '1536x1024') {
    return requestedSize
  }
  if (!aspect || !aspect.includes(':')) return 'auto'
  const [w, h] = aspect.split(':').map(Number)
  if (!w || !h) return 'auto'
  const ratio = w / h
  if (Math.abs(ratio - 1) < 0.05) return '1024x1024'
  return ratio > 1 ? '1536x1024' : '1024x1536'
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '')
  const bin = atob(clean)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

