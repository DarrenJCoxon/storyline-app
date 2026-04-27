import type { AIProvider, Message, ChatOptions } from './provider.js'

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

    const response = await fetch(`${this.backendUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenceKey,
        messages,
        stageId,
        systemPrompt: options.systemPrompt,
      }),
    })

    if (response.status === 402) {
      throw new Error('Credits exhausted — top up to continue')
    }
    if (response.status === 401) {
      throw new Error('Invalid licence key')
    }
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Backend error ${response.status}: ${text}`)
    }

    yield* readSSEStream(response, options.onUsage)
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
