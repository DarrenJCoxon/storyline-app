import type { AIProvider, Message, ChatOptions } from './provider.js'
import { reportError } from './error-reporter.js'

/**
 * Calls our Cloudflare Worker `/chat` endpoint.
 * The extension never holds the OpenRouter key — it only sends the licence key.
 */
export class ManagedProvider implements AIProvider {
  readonly id = 'managed'

  constructor(
    private readonly backendUrl: string,
    private readonly getLicenceKey: () => Promise<string | undefined>,
  ) {}

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<string> {
    const licenceKey = await this.getLicenceKey()
    if (!licenceKey) throw new Error('No licence key — activate Storyline first')

    // stageId is passed via options so the backend can log it; model is ignored
    // (routing is server-side)
    const stageId = (options as ChatOptions & { stageId?: string }).stageId ?? 'unknown'

    // Cloudflare KV is eventually consistent across colos. A freshly-issued
    // free-tier licence record sometimes isn't visible to the colo serving
    // /chat for several seconds, even though /validate (which we ran in the
    // activation flow) already saw it. If we get a 401 on a SL-FREE-* key,
    // wait briefly and retry once — that absorbs the propagation window.
    const isFree = licenceKey.startsWith('SL-FREE-')
    let response = await this.postChat(licenceKey, messages, stageId, options.systemPrompt)
    if (response.status === 401 && isFree) {
      console.log('[Storyline] /chat 401 on free key — assuming KV propagation race, retrying in 3s')
      await new Promise(r => setTimeout(r, 3000))
      response = await this.postChat(licenceKey, messages, stageId, options.systemPrompt)
      if (response.status === 401) {
        console.log('[Storyline] /chat 401 persists after retry, waiting 7s and retrying once more')
        await new Promise(r => setTimeout(r, 7000))
        response = await this.postChat(licenceKey, messages, stageId, options.systemPrompt)
      }
    }

    // 402 (credits exhausted) is an expected user-facing state, not a bug —
    // skip telemetry. Same for 401 with no key. Everything else is an
    // operational failure worth surfacing.
    if (response.status === 402) {
      throw new Error('Credits exhausted — top up to continue')
    }
    if (response.status === 401) {
      reportError({ endpoint: 'chat', statusCode: 401, message: 'Invalid licence key', licenceKey, stageId })
      throw new Error('Invalid licence key')
    }
    if (response.status === 503) {
      reportError({ endpoint: 'chat', statusCode: 503, message: 'Server restart mid-request', licenceKey, stageId })
      throw new Error('The server restarted mid-request — please try again')
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      reportError({ endpoint: 'chat', statusCode: response.status, message: text || `HTTP ${response.status}`, licenceKey, stageId })
      throw new Error(`Backend error ${response.status}: ${text}`)
    }

    yield* readSSEStream(response, options.onUsage)
  }

  private postChat(
    licenceKey: string,
    messages: Message[],
    stageId: string,
    systemPrompt: string | undefined,
  ): Promise<Response> {
    return fetch(`${this.backendUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenceKey, messages, stageId, systemPrompt }),
    })
  }

  async isAvailable(): Promise<boolean> {
    try {
      const key = await this.getLicenceKey()
      if (!key) return false
      const r = await fetch(`${this.backendUrl}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenceKey: key }),
      })
      return r.ok
    } catch {
      return false
    }
  }
}

async function* readSSEStream(
  response: Response,
  onUsage?: ChatOptions['onUsage'],
): AsyncIterable<string> {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return

      try {
        const parsed = JSON.parse(data)

        // Usage sentinel emitted by the backend before [DONE]
        if (parsed._usage && onUsage) {
          onUsage(parsed._usage as { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number | null })
          continue
        }

        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }
}
