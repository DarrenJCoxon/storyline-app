export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface RequestUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number | null
}

export interface ChatOptions {
  model: string
  systemPrompt: string
  maxTokens?: number
  temperature?: number
  onUsage?: (usage: RequestUsage) => void
}

export interface AIProvider {
  readonly id: string
  chat(messages: Message[], options: ChatOptions): AsyncIterable<string>
  isAvailable(): Promise<boolean>
}
