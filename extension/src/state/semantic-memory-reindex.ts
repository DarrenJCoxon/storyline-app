import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { upsertStageToSemanticMemory, upsertResearchItemToSemanticMemory } from './memory.js'
import { embedChapterFile } from './chapter-semantic-watcher.js'
import { getSemanticMemoryService } from './semantic-memory-service.js'
import { ensureOptIn, readSemanticMemoryConfig } from './semantic-memory.js'
import { logInfo, logError, logWarn } from '../diagnostic-log.js'

/**
 * NT-06 — reindex command. Walks every embeddable document in the
 * project and pushes it into the semantic memory. Used:
 *   - after enabling semantic memory mid-project
 *   - after a schema change
 *   - to repair an index that's drifted
 *
 * Cost is bounded by the per-licence daily token budget enforced in
 * NT-02; the upfront estimate gives the writer a sanity check before
 * the first big run.
 */

interface ReindexEstimate {
  stages: number
  chapters: number
  research: number
  estimatedTokens: number
  /** USD, computed at the OpenAI text-embedding-3-small rate of $0.02 / 1M tokens. */
  estimatedCostUsd: number
}

interface ReindexProgress {
  upserted: number
  skippedUnchanged: number
  failed: number
}

/** Tokens-per-character heuristic — close enough for cost messaging. */
const TOKENS_PER_CHAR = 0.25
const COST_PER_MILLION_TOKENS_USD = 0.02

/**
 * Compute a quick cost estimate over the project's embeddable surface.
 * Cheap — just file sizes and stage-data character counts; no embeddings.
 */
export async function estimateReindex(projectRoot: string): Promise<ReindexEstimate> {
  let stageCount = 0
  let chars = 0

  const stagePatches = await collectStagePatches(projectRoot)
  stageCount = stagePatches.length
  for (const { patch } of stagePatches) {
    chars += JSON.stringify(patch).length
  }

  const chapters = await listChapterFiles(projectRoot)
  for (const file of chapters) {
    chars += await fileSizeChars(file)
  }

  const researchIds = await listResearchItemIds(projectRoot)
  for (const id of researchIds) {
    chars += await fileSizeChars(path.join(projectRoot, '.storyline', 'research', `${id}.md`))
  }

  const estimatedTokens = Math.ceil(chars * TOKENS_PER_CHAR)
  const estimatedCostUsd = (estimatedTokens / 1_000_000) * COST_PER_MILLION_TOKENS_USD

  return {
    stages: stageCount,
    chapters: chapters.length,
    research: researchIds.length,
    estimatedTokens,
    estimatedCostUsd,
  }
}

/**
 * Run the full reindex with VS Code progress reporting. No-ops when
 * semantic memory is disabled — caller should ensureOptIn() first.
 */
export async function runReindex(
  projectRoot: string,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token: vscode.CancellationToken,
): Promise<ReindexProgress> {
  const result: ReindexProgress = { upserted: 0, skippedUnchanged: 0, failed: 0 }
  const service = getSemanticMemoryService()
  if (!service) return result

  const stagePatches = await collectStagePatches(projectRoot)
  const chapters = await listChapterFiles(projectRoot)
  const researchIds = await listResearchItemIds(projectRoot)

  const totalSteps = stagePatches.length + chapters.length + researchIds.length
  if (totalSteps === 0) return result
  const stepIncrement = 100 / totalSteps

  const tally = (status: string | null | undefined): void => {
    if (status === 'upserted') result.upserted += 1
    else if (status === 'skipped-unchanged') result.skippedUnchanged += 1
    else result.failed += 1
  }

  // Stages.
  for (const { stageId, patch } of stagePatches) {
    if (token.isCancellationRequested) return result
    progress.report({ message: `Stage: ${stageId}`, increment: stepIncrement })
    try {
      const r = await upsertStageToSemanticMemory(stageId, patch)
      tally(r?.status)
      logInfo(`[Storyline] reindex stage ${stageId}: ${r?.status ?? 'unknown'}`)
    } catch (err) {
      result.failed += 1
      logError(`[Storyline] reindex stage ${stageId} threw: ${err instanceof Error ? err.message : err}`)
    }
  }

  // Chapters (and their scenes).
  for (const file of chapters) {
    if (token.isCancellationRequested) return result
    progress.report({ message: `Chapter: ${path.basename(file)}`, increment: stepIncrement })
    try {
      await embedChapterFile(vscode.Uri.file(file))
      // embedChapterFile fans out to multiple scene upserts and doesn't
      // currently surface per-scene results — treat the whole chapter as
      // one tick. Upsert success/failure for each scene chunk shows in
      // the per-chunk logs from semantic-memory-service.
      result.upserted += 1
      logInfo(`[Storyline] reindex chapter ${path.basename(file)}: dispatched`)
    } catch (err) {
      result.failed += 1
      logError(`[Storyline] reindex chapter ${file} threw: ${err instanceof Error ? err.message : err}`)
    }
  }

  // Research items.
  for (const id of researchIds) {
    if (token.isCancellationRequested) return result
    progress.report({ message: `Research: ${id}`, increment: stepIncrement })
    try {
      await upsertResearchItemToSemanticMemory(projectRoot, id)
      result.upserted += 1
      logInfo(`[Storyline] reindex research ${id}: dispatched`)
    } catch (err) {
      result.failed += 1
      logError(`[Storyline] reindex research ${id} threw: ${err instanceof Error ? err.message : err}`)
    }
  }

  logInfo(
    `[Storyline] reindex complete: ${result.upserted} upserted, ${result.skippedUnchanged} unchanged, ${result.failed} failed`,
  )
  return result
}

/**
 * VS Code command implementation. Confirms cost upfront, runs the
 * reindex with a progress notification, reports outcome.
 */
export async function reindexSemanticMemoryCommand(): Promise<void> {
  logInfo('[Storyline] reindex command invoked')
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    logWarn('[Storyline] reindex: no workspace folder open')
    void vscode.window.showWarningMessage('Reindex needs an open Storyline project.')
    return
  }
  const projectRoot = folder.uri.fsPath
  logInfo(`[Storyline] reindex: projectRoot=${projectRoot}`)

  // Make sure the writer has opted in (or wants to now).
  const outcome = await ensureOptIn()
  logInfo(`[Storyline] reindex: ensureOptIn outcome=${outcome}`)
  if (outcome === 'declined' || outcome === 'already-declined') {
    void vscode.window.showInformationMessage(
      'Semantic memory is off — enable it in settings (storyline.semanticMemory.enabled) before reindexing.',
    )
    return
  }
  const cfg = readSemanticMemoryConfig()
  if (!cfg.enabled) {
    logWarn(`[Storyline] reindex: cfg.enabled=false despite ensureOptIn outcome=${outcome} — aborting`)
    return
  }

  // Confirm with cost estimate.
  let estimate: ReindexEstimate
  try {
    estimate = await estimateReindex(projectRoot)
  } catch (err) {
    logError(`[Storyline] reindex: estimate failed: ${err instanceof Error ? err.message : err}`)
    void vscode.window.showErrorMessage(
      `Could not estimate reindex cost — ${err instanceof Error ? err.message : err}`,
    )
    return
  }
  logInfo(`[Storyline] reindex estimate: stages=${estimate.stages} chapters=${estimate.chapters} research=${estimate.research} tokens=${estimate.estimatedTokens}`)
  if (estimate.stages === 0 && estimate.chapters === 0 && estimate.research === 0) {
    logWarn('[Storyline] reindex: nothing to reindex — empty walk results')
    void vscode.window.showInformationMessage(
      'Nothing to reindex — no completed stages, chapters, or research items found.',
    )
    return
  }

  const cost = formatCost(estimate.estimatedCostUsd)
  const summary =
    `Reindex this project? ` +
    `${estimate.stages} stage(s), ${estimate.chapters} chapter(s), ${estimate.research} research item(s). ` +
    `Roughly ${formatTokens(estimate.estimatedTokens)} tokens — about ${cost}.`
  const confirm = await vscode.window.showInformationMessage(
    summary,
    { modal: true },
    'Reindex',
    'Cancel',
  )
  logInfo(`[Storyline] reindex: confirmation=${confirm ?? 'dismissed'}`)
  if (confirm !== 'Reindex') return

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Storyline — reindexing semantic memory',
      cancellable: true,
    },
    (progress, token) => runReindex(projectRoot, progress, token),
  )

  void vscode.window.showInformationMessage(
    `Reindex complete — ${result.upserted} upserted, ${result.skippedUnchanged} unchanged, ${result.failed} failed.`,
  )
}

// ─── Walk helpers ────────────────────────────────────────────────────────

interface StagePatch {
  stageId: string
  patch: Record<string, unknown>
}

/**
 * Read state.json and return one synthetic "patch" per top-level stage.
 * The save-time hook normally only sees the patch; for reindex we fake
 * each one from the current state slice. Skips stages with empty data
 * so we don't embed default placeholders.
 */
async function collectStagePatches(projectRoot: string): Promise<StagePatch[]> {
  const statePath = path.join(projectRoot, '.storyline', 'state.json')
  let state: Record<string, unknown>
  try {
    const raw = await fs.readFile(statePath, 'utf-8')
    state = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return []
  }
  const out: StagePatch[] = []
  for (const [stageId, value] of Object.entries(state)) {
    if (stageId.startsWith('_')) continue // skip _meta etc.
    if (value == null) continue
    if (Array.isArray(value) && value.length === 0) continue
    if (typeof value === 'object' && value !== null && Object.keys(value as object).length === 0) continue
    out.push({ stageId, patch: { [stageId]: value } })
  }
  return out
}

async function listChapterFiles(projectRoot: string): Promise<string[]> {
  const dir = path.join(projectRoot, 'manuscript')
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  return names
    .filter(n => n.endsWith('.md'))
    .map(n => path.join(dir, n))
    .sort()
}

async function listResearchItemIds(projectRoot: string): Promise<string[]> {
  const dir = path.join(projectRoot, '.storyline', 'research')
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  return names
    .filter(n => n.endsWith('.md'))
    .map(n => n.replace(/\.md$/, ''))
    .sort()
}

async function fileSizeChars(file: string): Promise<number> {
  try {
    const stat = await fs.stat(file)
    return stat.size
  } catch {
    return 0
  }
}

function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

function formatTokens(n: number): string {
  if (n < 1_000) return `${n}`
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}
