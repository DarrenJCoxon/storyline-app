import type { Env, LicenceRecord } from './types.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

interface TranscribeBody {
  licenceKey: string
  audioBase64: string
  mimeType: string
  projectContext?: string
}

export async function handleTranscribe(req: Request, env: Env): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    return errJson('Transcription not configured on this server', 503)
  }

  let body: TranscribeBody
  try {
    body = await req.json()
  } catch {
    return errJson('Invalid JSON', 400)
  }

  if (!body.licenceKey || !body.audioBase64 || !body.mimeType) {
    return errJson('licenceKey, audioBase64, and mimeType are required', 400)
  }

  const record = await env.LICENCES.get<LicenceRecord>(body.licenceKey, 'json')
  if (!record || !record.valid) {
    return errJson('Invalid licence key', 401)
  }
  if (record.type === 'byok') {
    return errJson('BYOK licences do not use the managed transcription proxy', 403)
  }
  if (record.creditBalance <= 0) {
    return errJson('Credits exhausted — top up to continue', 402)
  }

  // Optimistic credit deduction before upstream call
  const deducted: LicenceRecord = { ...record, creditBalance: Math.max(0, record.creditBalance - 1) }
  await env.LICENCES.put(body.licenceKey, JSON.stringify(deducted))

  // Decode base64 audio and build multipart for OpenAI
  const binaryStr = atob(body.audioBase64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  const audioBlob = new Blob([bytes], { type: body.mimeType })

  const oaiForm = new FormData()
  const ext = body.mimeType.includes('wav') ? 'wav'
    : body.mimeType.includes('mp4') || body.mimeType.includes('m4a') ? 'm4a'
    : body.mimeType.includes('ogg') ? 'ogg'
    : 'webm'
  oaiForm.append('file', audioBlob, `audio.${ext}`)
  oaiForm.append('model', 'gpt-4o-mini-transcribe')
  oaiForm.append('response_format', 'json')
  if (body.projectContext) {
    oaiForm.append('prompt', body.projectContext)
  }

  const oaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: oaiForm,
  })

  if (!oaiRes.ok) {
    // Refund credit on upstream failure
    await env.LICENCES.put(body.licenceKey, JSON.stringify(record))
    const text = await oaiRes.text()
    return errJson(`OpenAI transcription error ${oaiRes.status}: ${text}`, 502)
  }

  const result = await oaiRes.json() as { text: string }
  return new Response(JSON.stringify({ text: result.text }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function errJson(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
