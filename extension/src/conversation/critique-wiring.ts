// Pure decision logic for the post-save critique flow. Extracted from
// ChatPanel so it's unit-testable without instantiating the panel, the
// provider, the licence manager, or the webview. ChatPanel composes these
// helpers with its actual fetch + post + log side-effects.

export const NO_CRITIQUE_STAGES: ReadonlySet<string> = new Set<string>([
  // No content to critique
  'mode',
  // Auto-generated synthesis output — already validated upstream
  'masterDoc',
  'pa-master',
  'pb-master',
  'pc-master',
  // Validate-tier stages — schema-level nags that disrupt conversational
  // flow. Required fields are already enforced by gateStageSave; the
  // structural/synthesis tiers on later stages provide the real editorial
  // critique. Original /storyline ran these silently; we suppress them
  // entirely in the chat panel.
  'genre',
  'premise',
  'characters',
  'plotThreads',
])

export type ProviderKind = 'managed' | 'byok' | 'ollama' | 'unknown'

export type CritiqueSkipReason =
  | 'deny-listed'
  | 'unmanaged-provider'
  | 'no-licence-key'

export type ShouldSkipResult =
  | { skip: true; reason: CritiqueSkipReason; detail: string }
  | { skip: false }

/**
 * Decide whether the post-save critique should run for this stage given
 * the current provider and licence state. Returns a structured reason on
 * skip so callers can log honestly.
 */
export function shouldSkipCritique(opts: {
  stageId: string
  providerKind: ProviderKind
  hasLicenceKey: boolean
}): ShouldSkipResult {
  if (NO_CRITIQUE_STAGES.has(opts.stageId)) {
    return {
      skip: true,
      reason: 'deny-listed',
      detail: `stage ${opts.stageId} is in the no-critique deny list`,
    }
  }
  if (opts.providerKind !== 'managed') {
    return {
      skip: true,
      reason: 'unmanaged-provider',
      detail: `provider is ${opts.providerKind} — managed backend required for critique`,
    }
  }
  if (!opts.hasLicenceKey) {
    return {
      skip: true,
      reason: 'no-licence-key',
      detail: 'no licence key available',
    }
  }
  return { skip: false }
}

export type CritiqueResponseAction =
  | { action: 'card'; findings: string; tier: string }
  | { action: 'no-findings' }
  | { action: 'silent-credits-exhausted' }
  | { action: 'stream-error'; message: string }

/**
 * Interpret a successful (status 200–299) backend response. Returns the
 * action ChatPanel should take based on the parsed body.
 */
export function interpretCritiqueOk(parsed: { findings?: string; tier?: string }): CritiqueResponseAction {
  if (parsed.findings) {
    return { action: 'card', findings: parsed.findings, tier: parsed.tier ?? 'structural' }
  }
  return { action: 'no-findings' }
}

/**
 * Interpret a non-2xx HTTP response. 402 (credits exhausted) is silent
 * because the streaming flow's credit handling will surface it on the
 * next chat turn — pelting the user with critique-specific errors on
 * every save would be noise. 4xx/5xx everything else surfaces as an
 * honest streamError.
 */
export function interpretCritiqueHttpError(opts: {
  status: number
  bodyText?: string
}): CritiqueResponseAction {
  if (opts.status === 402) {
    return { action: 'silent-credits-exhausted' }
  }
  return {
    action: 'stream-error',
    message: `Critique unavailable (${opts.status}) — your stage saved, but the AI critic couldn't run.`,
  }
}

/**
 * Interpret a network-level failure (fetch threw before getting a
 * response). Always surfaces as an honest streamError — the writer
 * should know the critique didn't run, not assume silence means "all
 * clear".
 */
export function interpretCritiqueNetworkError(err: unknown): CritiqueResponseAction {
  const msg = err instanceof Error ? err.message : String(err)
  return {
    action: 'stream-error',
    message: `Critique unavailable (network): ${msg}`,
  }
}

/**
 * Detect provider kind from a provider instance. ChatPanel passes
 * `provider?.constructor?.name` — we accept that or undefined and
 * normalize to the ProviderKind union. Loose match by name suffix keeps
 * this robust against minified/renamed class names in production
 * bundles (esbuild renames classes for some configurations).
 */
export function detectProviderKind(constructorName: string | undefined | null): ProviderKind {
  if (!constructorName) return 'unknown'
  const name = constructorName.toLowerCase()
  if (name.includes('managed')) return 'managed'
  if (name.includes('byok')) return 'byok'
  if (name.includes('ollama')) return 'ollama'
  return 'unknown'
}
