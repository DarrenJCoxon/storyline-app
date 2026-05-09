// CB-12 — shared transcription helper used by panels that capture audio
// in their webview (planning chat + chapter editor) and need to forward
// to the backend.
//
// Each caller has its own panel-specific post-back contract (different
// message names, different state) so the helper just returns a result
// object — callers handle the UI side.

interface TranscribeResult {
  ok: true
  text: string
}
interface TranscribeFail {
  ok: false
  error: string
}

interface TranscribeOptions {
  licenceKey: string
  audioBase64: string
  mimeType: string
  /** Optional Whisper "prompt" — short context string. Improves
   *  accuracy for character names and setting-specific terms. */
  projectContext?: string
}

export async function transcribeAudio(
  backendUrl: string,
  opts: TranscribeOptions,
): Promise<TranscribeResult | TranscribeFail> {
  const body: Record<string, string> = {
    licenceKey: opts.licenceKey,
    audioBase64: opts.audioBase64,
    mimeType: opts.mimeType,
  }
  if (opts.projectContext) body.projectContext = opts.projectContext

  try {
    const res = await fetch(`${backendUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `Transcription failed (${res.status})${text ? ': ' + text : ''}` }
    }

    const data = await res.json() as { text?: string; error?: string }
    if (data.text) return { ok: true, text: data.text }
    return { ok: false, error: data.error ?? 'Transcription returned no text.' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
