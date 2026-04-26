import type { AIProvider, Message, ChatOptions } from './provider.js'

export class OllamaProvider implements AIProvider {
  readonly id = 'ollama'

  constructor(private readonly baseUrl = 'http://localhost:11434') {}

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: options.systemPrompt },
          ...messages,
        ],
        stream: true,
        options: {
          num_predict: options.maxTokens,
          temperature: options.temperature,
        },
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Ollama ${response.status}: ${text}`)
    }

    yield* readSSEStream(response)
  }

  async isAvailable(): Promise<boolean> {
    try {
      const r = await fetch(`${this.baseUrl}/api/tags`)
      return r.ok
    } catch {
      return false
    }
  }
}

async function* readSSEStream(response: Response): AsyncIterable<string> {
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
