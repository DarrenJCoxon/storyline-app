export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  model: string
  systemPrompt: string
  maxTokens?: number
  temperature?: number
}

export interface AIProvider {
  readonly id: string
  chat(messages: Message[], options: ChatOptions): AsyncIterable<string>
  isAvailable(): Promise<boolean>
}
