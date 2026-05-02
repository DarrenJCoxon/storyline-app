export interface OpenRouterUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number | null
}

export interface DailyStats {
  requests: number
  promptTokens: number
  completionTokens: number
  costUsd: number
}

export interface Env {
  LICENCES: KVNamespace
  OPENROUTER_API_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  /** Stripe restricted/secret key — required for /refund-batch to call
   *  POST https://api.stripe.com/v1/refunds. Without it the refund endpoint
   *  returns a 503. */
  STRIPE_SECRET_KEY?: string
  CHAT_MODEL: string
  IMAGE_MODEL: string
  ADMIN_KEY?: string
  FALLBACK_MODEL?: string
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
  POSTMARK_API_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  TURNSTILE_SITE_KEY?: string
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

/**
 * One Stripe purchase = one CreditBatch. Each batch carries its own 14-day
 * UK consumer-rights refund window (Consumer Contracts Regulations 2013).
 * Credits are consumed FIFO across batches so the oldest (closest to its
 * window expiry) drains first — that minimises refund liability over time.
 *
 * Free-tier and pre-batch (grandfathered) records lazily materialise a
 * single non-refundable batch on first read so legacy KV records stay
 * compatible without a migration.
 */
export interface CreditBatch {
  /** `batch_<16hex>` — stable identifier used for refund idempotency. */
  id: string
  /** Stripe payment_intent ID. null for free / grandfathered batches that
   *  have no underlying payment to refund. */
  stripePaymentIntentId: string | null
  /** Pence actually paid for THIS batch (Stripe `amount_total` /
   *  `amount_received`). Used pro-rata for partial refunds. */
  pricePaidPence: number
  /** ISO 4217 lowercase, e.g. 'gbp'. */
  currency: string
  /** Credits credited at purchase. Never changes. */
  creditsTotal: number
  /** Credits not yet spent. Decrements on consume. Burned to 0 on refund. */
  creditsRemaining: number
  /** ISO timestamp of the Stripe payment. */
  purchasedAt: string
  /** ISO timestamp of `purchasedAt + 14 days` for purchase batches. Set to
   *  the epoch for free / grandfathered batches so they're never refundable. */
  refundEligibleUntil: string
  /** ISO timestamp when the user (or webhook) refunded the batch. null = active. */
  refundedAt: string | null
  /** Provenance — purchase batches are user-refundable; the others aren't. */
  source: 'free' | 'purchase' | 'grandfathered'
}

export interface LicenceRecord {
  type: LicenceType
  valid: boolean
  /** Sum of `batch.creditsRemaining` across non-refunded batches. Kept as a
   *  flat field for back-compat with clients that read it directly; the
   *  authoritative source is `batches`. Always recomputed on mutation. */
  creditBalance: number
  totalPurchased: number
  stripeCustomerId: string
  /** Optional for back-compat. Lazy-materialised on first read for legacy
   *  records via `ensureBatches()` in credit-batches.ts. */
  batches?: CreditBatch[]
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
  tier?: 'validate' | 'structural' | 'synthesis' | 'prose'
  qualityMode?: 'economy' | 'balanced' | 'premium'
  brief?: Record<string, unknown>
}

export interface CritiqueResponse {
  findings: string
  modelUsed: string
  tier: string
  tokensUsed?: number
}
