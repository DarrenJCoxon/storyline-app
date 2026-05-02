import type { Env, LicenceRecord } from './types.js'
import { getDevLicenceRecord } from './dev-bypass.js'

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

  let record = await env.LICENCES.get<LicenceRecord>(body.licenceKey, 'json')
  if (!record) record = getDevLicenceRecord(body.licenceKey, req.url, env)
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

  const ext = body.mimeType.includes('wav') ? 'wav'
    : body.mimeType.includes('mp4') || body.mimeType.includes('m4a') ? 'm4a'
    : body.mimeType.includes('ogg') ? 'ogg'
    : 'webm'

  // Decode base64 → binary using the fast single-pass form
  const audioBlob = new Blob(
    [Uint8Array.from(atob(body.audioBase64), c => c.charCodeAt(0))],
    { type: body.mimeType },
  )

  const oaiForm = new FormData()
  oaiForm.append('file', audioBlob, `audio.${ext}`)
  oaiForm.append('model', 'whisper-1')
  oaiForm.append('response_format', 'text')
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

  // whisper-1 with response_format:'text' returns plain text directly
  const text = await oaiRes.text()
  return new Response(JSON.stringify({ text }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function errJson(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
