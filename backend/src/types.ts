export interface Env {
  LICENCES: KVNamespace
  OPENROUTER_API_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  CHAT_MODEL: string
  IMAGE_MODEL: string
  /** When set, image generation goes direct to OpenAI's /v1/images/generations
   *  endpoint, where size/quality are strictly enforced. When absent we fall
   *  back to routing through OpenRouter (which has been silently dropping
   *  these params on the chat-completions translation). */
  OPENAI_API_KEY?: string
  /** Image-gen model used when OPENAI_API_KEY is set. Defaults to
   *  "gpt-image-2" — strict size/quality enforcement, any aspect ratio
   *  up to 3:1. THIS IS THE CORRECT NAME PER OPENAI'S COOKBOOK — do not
   *  substitute gpt-image-1, gpt-image-1.5, dall-e-3, etc. */
  OPENAI_IMAGE_MODEL?: string
  DEV_MODE?: string
}

export interface IllustrateRequest {
  licenceKey: string
  prompt: string
  width?: number
  height?: number
  /** Image-model size parameter in "WxH" form (e.g. "1024x1536"). Caller computes it. */
  size?: string
  /** Aspect ratio hint for models that take it (e.g. "2:3", "1:1"). */
  aspectRatio?: string
  /** Quality tier — controls model spend. low ≈ $0.011, medium ≈ $0.042, high ≈ $0.17 per image. */
  quality?: 'low' | 'medium' | 'high'
  /** Single reference image (e.g. front cover used as ref for the back cover). */
  referenceImageBase64?: string
  /** Multiple character/style reference images for consistency across an
   *  illustrated book — passed to /v1/images/edits as image[]. Each entry
   *  is a base64-encoded JPEG with optional purpose label. */
  referenceImages?: Array<{ base64: string; label?: 'character' | 'style' | 'scene' }>
  /** "high" tells gpt-image-2 to preserve reference-image features tightly
   *  — essential for character consistency in illustrated books. Defaults
   *  to "low" (the model takes more creative liberty). */
  inputFidelity?: 'high' | 'low'
}

export type LicenceType = 'free' | 'credits' | 'byok'

export interface LicenceRecord {
  type: LicenceType
  valid: boolean
  creditBalance: number
  totalPurchased: number
  stripeCustomerId: string
}

export interface ValidateRequest {
  licenceKey: string
}

export interface ValidateResponse {
  valid: boolean
  type: LicenceType
  creditBalance: number
}

export interface ChatRequest {
  licenceKey: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  stageId: string
  systemPrompt?: string
}

export interface CritiqueRequest {
  licenceKey: string
  stageId: string
  state: Record<string, unknown>
  tier?: 'haiku' | 'sonnet' | 'opus' | 'draft'
  qualityMode?: 'economy' | 'balanced' | 'premium'
  brief?: Record<string, unknown>
}

export interface CritiqueResponse {
  findings: string
  modelUsed: string
  tier: string
  tokensUsed?: number
}
