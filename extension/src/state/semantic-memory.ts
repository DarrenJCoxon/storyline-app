import * as vscode from 'vscode'

/**
 * Semantic-memory opt-in gate (NT-04).
 *
 * The single chokepoint every NT-05+ feature must pass through before
 * sending any prose to the embedding service. If the writer hasn't
 * opted in, every dependent feature gracefully no-ops.
 *
 * Why a gate at all? Indexing the manuscript means every chunk gets
 * sent to OpenAI's US servers. That's a real privacy decision the
 * writer must consciously make — see PRIVACY.md §2.5.
 */

const CFG_ENABLED = 'storyline.semanticMemory.enabled'
const CFG_DIALOG_SHOWN = 'storyline.semanticMemory.firstRunDialogShown'
const CFG_SERIES_ID = 'storyline.series.id'

/** Returned by {@link ensureOptIn} so callers can branch cleanly. */
export type OptInOutcome = 'enabled' | 'declined' | 'already-enabled' | 'already-declined'

export interface SemanticMemoryConfig {
  enabled: boolean
  seriesId: string | null
  /** NuVector tenant derived from the above. `default` for standalone books;
   *  `series:<id>` when a series ID is set. */
  tenant: string
}

/**
 * Read the current semantic-memory configuration. Pure function — no
 * side effects, safe to call anywhere.
 */
export function readSemanticMemoryConfig(): SemanticMemoryConfig {
  const cfg = vscode.workspace.getConfiguration()
  const enabled = cfg.get<boolean>(CFG_ENABLED) === true
  const rawSeries = (cfg.get<string>(CFG_SERIES_ID) ?? '').trim()
  const seriesId = rawSeries.length > 0 ? rawSeries : null
  return {
    enabled,
    seriesId,
    tenant: deriveTenant(seriesId),
  }
}

/** Pure helper — derive the NuVector tenant from a (possibly null) series id. */
export function deriveTenant(seriesId: string | null | undefined): string {
  if (!seriesId) return 'default'
  const trimmed = seriesId.trim()
  if (trimmed.length === 0) return 'default'
  return `series:${slugifySeriesId(trimmed)}`
}

/**
 * Slugify a series id for use as part of a NuVector tenant string.
 * Lowercase, alphanumeric + hyphens, collapsed runs, trimmed. Never
 * empty (falls back to `untitled-series`).
 */
export function slugifySeriesId(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return slug.length > 0 ? slug : 'untitled-series'
}

/**
 * Show the first-run opt-in dialog if it hasn't been shown yet for this
 * workspace. Returns the writer's answer (or the previously-recorded
 * decision if the dialog has already run).
 *
 * NT-05+ features should call this before doing any embedding work; if
 * the result is anything other than `enabled` or `already-enabled`, they
 * must no-op.
 */
export async function ensureOptIn(): Promise<OptInOutcome> {
  const cfg = vscode.workspace.getConfiguration()
  const enabled = cfg.get<boolean>(CFG_ENABLED) === true
  const dialogShown = cfg.get<boolean>(CFG_DIALOG_SHOWN) === true

  if (enabled) return 'already-enabled'
  if (dialogShown) return 'already-declined'

  const choice = await vscode.window.showInformationMessage(
    'Storyline can build a semantic memory of your project — every scene, planning stage, and research item indexed so you can search by meaning, not keyword. Enabling this sends your draft to OpenAI to compute embeddings (OpenAI does not train on this data). The resulting index lives locally in .storyline/memory.nv and never leaves your machine. You can disable this and delete the index at any time.',
    { modal: true },
    'Enable',
    'Not now',
  )

  // Mark the dialog as shown so we don't pester on every save.
  await cfg.update(CFG_DIALOG_SHOWN, true, vscode.ConfigurationTarget.Workspace)

  if (choice === 'Enable') {
    await cfg.update(CFG_ENABLED, true, vscode.ConfigurationTarget.Workspace)
    return 'enabled'
  }
  return 'declined'
}

/**
 * Reset the first-run dialog flag so the next call to {@link ensureOptIn}
 * shows the dialog again. Used by the "Disable semantic memory and forget
 * choice" command if we add one later.
 */
export async function resetOptInDialog(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration()
  await cfg.update(CFG_DIALOG_SHOWN, false, vscode.ConfigurationTarget.Workspace)
}
