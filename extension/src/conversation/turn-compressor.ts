import type { Message } from '../ai/provider.js'
import type { Turn } from './turn-history.js'

export interface CompressionResult {
  turns: Message[]
  wasCompressed: boolean
  summary: string | null
}

const COMPRESSION_THRESHOLD = 12
const TURNS_TO_COMPRESS = 8
const SUMMARY_MAX_TOKENS = 400

const SUMMARY_SYSTEM = `You are a conversation summarizer for a book-planning AI.

Summarize the conversation into dense prose. Preserve:
- Every decision the writer made (what they agreed to, what they rejected)
- Key questions and the AI's answers
- Unresolved items
- Changes of mind or clarifications

Write in third person ("The writer decided…"). No bullet points. No headers.
Target 250–300 tokens. Every sentence must carry meaning.`

/**
 * Compress the oldest turns into a summary when a stage exceeds the threshold.
 * Returns the full message list ready for the API call — either original turns
 * (if below threshold) or a summary system message + recent turns.
 *
 * Uses the same backend endpoint as regular chat (DeepSeek via OpenRouter).
 * This is a single blocking call before streaming begins; it adds ~1–2s of
 * latency every time the threshold is crossed, then zero overhead until the
 * next batch fills up.
 */
export async function compressTurnsForApi(
  stageTurns: Turn[],
  existingSummary: string | null,
  stageId: string,
  provider: { chat: (messages: Message[], options: { model: string; systemPrompt: string; stageId: string; maxTokens?: number; temperature?: number }) => AsyncIterable<string> },
): Promise<CompressionResult> {
  if (stageTurns.length <= COMPRESSION_THRESHOLD) {
    return {
      turns: stageTurns as Message[],
      wasCompressed: false,
      summary: existingSummary,
    }
  }

  // If we already have a summary, just prepend it and trim the oldest raw turns
  if (existingSummary) {
    const recentTurns = stageTurns.slice(-(COMPRESSION_THRESHOLD - 2)) // keep ~10 raw turns
    return {
      turns: [
        { role: 'system', content: `[Earlier conversation summary]\n\n${existingSummary}` },
        ...recentTurns as Message[],
      ],
      wasCompressed: false,
      summary: existingSummary,
    }
  }

  // First time crossing threshold — generate a summary
  const toCompress = stageTurns.slice(0, TURNS_TO_COMPRESS)
  const recentTurns = stageTurns.slice(TURNS_TO_COMPRESS)

  const summary = await generateSummary(toCompress, stageId, provider)
  if (!summary) {
    // Compression failed — fall back to raw turns (rare)
    return { turns: stageTurns as Message[], wasCompressed: false, summary: null }
  }

  return {
    turns: [
      { role: 'system', content: `[Earlier conversation summary]\n\n${summary}` },
      ...recentTurns as Message[],
    ],
    wasCompressed: true,
    summary,
  }
}

async function generateSummary(
  turns: Turn[],
  stageId: string,
  provider: { chat: (messages: Message[], options: { model: string; systemPrompt: string; stageId: string; maxTokens?: number; temperature?: number }) => AsyncIterable<string> },
): Promise<string | null> {
  const userPrompt = `Summarize this book-planning conversation. Preserve all decisions, agreements, rejections, and unresolved questions.

${turns.map(t => `${t.role === 'user' ? 'Writer' : 'AI'}: ${t.content.slice(0, 600)}`).join('\n\n')}`

  try {
    const stream = provider.chat(
      [{ role: 'user', content: userPrompt }],
      {
        model: '',
        systemPrompt: SUMMARY_SYSTEM,
        stageId: `compress-${stageId}`,
        maxTokens: SUMMARY_MAX_TOKENS,
        temperature: 0.3,
      },
    )

    let summary = ''
    for await (const chunk of stream) {
      summary += chunk
    }

    return summary.trim() || null
  } catch {
    return null
  }
}
