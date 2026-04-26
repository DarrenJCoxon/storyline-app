import type { AIProvider, Message, ChatOptions } from './provider.js'

export type BYOKConfig =
  | { kind: 'anthropic';  apiKey: string }
  | { kind: 'openai';     apiKey: string; baseUrl: string }

/**
 * Direct provider for BYOK licence holders.
 * Calls the writer's own AI provider — no Storyline backend involved.
 */
export class BYOKProvider implements AIProvider {
  readonly id = 'byok'

  constructor(private readonly config: BYOKConfig) {}

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<string> {
    if (this.config.kind === 'anthropic') {
      yield* this.callAnthropic(messages, options)
    } else {
      yield* this.callOpenAICompat(messages, options)
    }
  }

  private async *callAnthropic(messages: Message[], options: ChatOptions): AsyncIterable<string> {
    if (this.config.kind !== 'anthropic') return

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        system: options.systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Anthropic ${response.status}: ${text}`)
    }

    yield* readAnthropicStream(response)
  }

  private async *callOpenAICompat(messages: Message[], options: ChatOptions): AsyncIterable<string> {
    if (this.config.kind !== 'openai') return

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: options.systemPrompt },
          ...messages,
        ],
        stream: true,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`${this.config.baseUrl} ${response.status}: ${text}`)
    }

    yield* readOpenAIStream(response)
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (this.config.kind === 'anthropic') {
        const r = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': this.config.apiKey, 'anthropic-version': '2023-06-01' },
        })
        return r.ok
      } else {
        const r = await fetch(`${this.config.baseUrl}/models`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}` },
        })
        return r.ok
      }
    } catch {
      return false
    }
  }
}

async function* readOpenAIStream(response: Response): AsyncIterable<string> {
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
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch { /* ignore */ }
    }
  }
}

async function* readAnthropicStream(response: Response): AsyncIterable<string> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''

  function* processBuffer(): Iterable<string> {
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      try {
        const parsed = JSON.parse(data)
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          yield parsed.delta.text
        }
      } catch { /* ignore */ }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      // Flush any remaining buffered data
      if (buffer.trim()) {
        buffer += '\n'
        yield* processBuffer()
      }
      break
    }
    buffer += decoder.decode(value, { stream: true })
    yield* processBuffer()
  }
}
