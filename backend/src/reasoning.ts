// Per-stage reasoning effort routing for DeepSeek V4 Flash (and any other
// model that accepts OpenRouter's `reasoning` parameter). Stages that
// require careful instruction-walking, deep character psychology, or
// whole-book synthesis get HIGH effort; conversational capture stages get
// MEDIUM; trivial gates get LOW. The user-facing latency cost of "high"
// is acceptable on these stages — they're once-per-stage moments, not
// every chat turn.

export type ReasoningEffort = 'high' | 'medium' | 'low'

const HIGH_EFFORT_STAGES = new Set<string>([
  // Fiction — depth/psychology/cross-stage synthesis
  'protagonist',     // want/need/flaw/coreLie/arcDirection — psychological depth
  'beatSheet',       // 15 beats, midpoint flip, whiff of death, second doorway
  'sceneOutline',    // whole-story scene structure, two-pass critique
  'chapterOutline',  // chapter-level POV, conflict, what-changes
  'critique',        // cross-stage coherence
  'masterDoc',       // synthesis of the whole book

  // Non-fiction — DNA depth and pipeline-master synthesis
  'dna-consolidate',
  'pa-critique', 'pa-master',
  'pb-critique', 'pb-master',
  'pc-critique', 'pc-master',
])

const LOW_EFFORT_STAGES = new Set<string>([
  'mode', // yes/no gate
])

/**
 * Pick the reasoning effort tier for a given planning stage. The default
 * (medium) is a sensible fallback when the stage isn't classified.
 */
export function reasoningEffortForStage(stageId: string): ReasoningEffort {
  if (HIGH_EFFORT_STAGES.has(stageId)) return 'high'
  if (LOW_EFFORT_STAGES.has(stageId)) return 'low'
  return 'medium'
}

/**
 * Pick the reasoning effort for a critique tier. The 4-tier system maps
 * onto reasoning depth — `synthesis` (whole-book) and `prose` (full
 * chapter-vs-plan analysis) need maximum effort; `structural` (story
 * structure pattern critique) gets medium; `validate` (schema-only) needs
 * only low.
 */
export function reasoningEffortForTier(tier: string): ReasoningEffort {
  if (tier === 'synthesis' || tier === 'prose') return 'high'
  if (tier === 'structural') return 'medium'
  return 'low' // validate
}

/**
 * Build the OpenRouter `reasoning` parameter block. We always set
 * `exclude: true` so the model's internal thoughts never leak into the
 * streamed chat output — the writer sees only the final reply.
 */
export function buildReasoningParam(effort: ReasoningEffort): { effort: ReasoningEffort; exclude: boolean } {
  return { effort, exclude: true }
}
