import type { Env, LicenceRecord } from './types.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

export async function handleTranscribe(req: Request, env: Env): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    return errJson('Transcription not configured on this server', 503)
  }

  let licenceKey: string
  let audioFile: File
  let projectContext: string | null

  try {
    const form = await req.formData()
    licenceKey = (form.get('licenceKey') ?? '') as string
    audioFile = form.get('audio') as unknown as File
    projectContext = form.get('projectContext') as string | null
  } catch {
    return errJson('Expected multipart/form-data with licenceKey and audio fields', 400)
  }

  if (!licenceKey || !audioFile) {
    return errJson('licenceKey and audio are required', 400)
  }

  const record = await env.LICENCES.get<LicenceRecord>(licenceKey, 'json')
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
  await env.LICENCES.put(licenceKey, JSON.stringify(deducted))

  // Forward the audio file directly to OpenAI — no base64 decode/re-encode
  const oaiForm = new FormData()
  oaiForm.append('file', audioFile, audioFile.name || 'audio.wav')
  oaiForm.append('model', 'whisper-1')
  oaiForm.append('response_format', 'text')
  if (projectContext) {
    oaiForm.append('prompt', projectContext)
  }

  const oaiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: oaiForm,
  })

  if (!oaiRes.ok) {
    // Refund credit on upstream failure
    await env.LICENCES.put(licenceKey, JSON.stringify(record))
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
