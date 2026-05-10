import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { getSemanticMemoryService } from './semantic-memory-service.js'
import { bookScopePrefix, getBookScopeId } from './semantic-memory.js'
import { logVerbose, logError } from '../diagnostic-log.js'

/**
 * NT-11 — typed decision log. `.storyline/decisions.jsonl` is the
 * permanent record of every meaningful change to the project's
 * planning state, with the *why* attached. NT-12 wires the stage-save
 * flow to emit one of these per non-trivial save; NT-13 surfaces them
 * via search; NT-14 renders them as a timeline.
 *
 * The shape is intentionally simple — JSONL so humans can `cat` it,
 * one record per line, append-only. Atomic append via tmpfile + rename
 * keeps partial writes from corrupting the file under crash.
 */

export const DECISIONS_REL_PATH = path.join('.storyline', 'decisions.jsonl')

export type DecisionKind = 'created' | 'revised' | 'cut' | 'reordered' | 'gated'

export interface DecisionRecord {
  id: string
  timestamp: string                 // ISO 8601
  stage: string                     // stageId at time of decision
  kind: DecisionKind
  /** State slice before the change. Stored compactly (path → JSON). */
  before: Record<string, unknown> | null
  /** State slice after the change. */
  after: Record<string, unknown> | null
  /** Plain-English reason. The AI's chat-turn reasoning if available;
   *  the writer's prompt entry otherwise; or "" when neither was provided. */
  why: string
  /** ISO timestamp when the decision was mirrored into NuVector. Optional. */
  embeddedAt?: string
  /** Chunk ids touched by the decision (NT-08 cross-reference). */
  touchedChunks?: string[]
}

interface AppendInput {
  stage: string
  kind: DecisionKind
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  why?: string
  touchedChunks?: string[]
}

/**
 * Append a new decision atomically. Returns the full record.
 * Errors are logged and swallowed — the decision log is best-effort.
 */
export async function appendDecision(
  projectRoot: string,
  input: AppendInput,
): Promise<DecisionRecord | null> {
  const record: DecisionRecord = {
    id: newDecisionId(),
    timestamp: new Date().toISOString(),
    stage: input.stage,
    kind: input.kind,
    before: input.before,
    after: input.after,
    why: (input.why ?? '').trim(),
    touchedChunks: input.touchedChunks,
  }

  try {
    const dir = path.join(projectRoot, '.storyline')
    await fs.mkdir(dir, { recursive: true })
    const file = path.join(projectRoot, DECISIONS_REL_PATH)
    const line = JSON.stringify(record) + '\n'
    await fs.appendFile(file, line, 'utf-8')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logError(`[Storyline] decisions: append failed: ${msg}`)
    return null
  }

  // Mirror into semantic memory so /why can find it.
  await mirrorDecisionToSemanticMemory(record).catch(err => {
    const msg = err instanceof Error ? err.message : String(err)
    logVerbose(`[Storyline] decisions: NuVector mirror failed (non-fatal): ${msg}`)
  })

  return record
}

async function mirrorDecisionToSemanticMemory(record: DecisionRecord): Promise<void> {
  const service = getSemanticMemoryService()
  if (!service) return
  const text = renderDecisionAsText(record)
  if (!text) return
  await service.upsert({
    id: `${bookScopePrefix()}/decision:${record.id}`,
    kind: 'document_chunk',
    text,
    metadata: {
      documentType: 'storyline_decision',
      bookId: getBookScopeId(),
      decisionId: record.id,
      decisionKind: record.kind,
      stage: record.stage,
      timestamp: record.timestamp,
      why: record.why,
      touchedChunks: record.touchedChunks ?? [],
    },
  })
  record.embeddedAt = new Date().toISOString()
}

function renderDecisionAsText(record: DecisionRecord): string {
  const lines: string[] = []
  lines.push(`Decision ${record.id} (${record.kind}) at stage ${record.stage}`)
  if (record.why) {
    lines.push('')
    lines.push(`Why: ${record.why}`)
  }
  if (record.before && Object.keys(record.before).length > 0) {
    lines.push('')
    lines.push('Before:')
    lines.push(JSON.stringify(record.before, null, 2))
  }
  if (record.after && Object.keys(record.after).length > 0) {
    lines.push('')
    lines.push('After:')
    lines.push(JSON.stringify(record.after, null, 2))
  }
  return lines.join('\n')
}

function newDecisionId(): string {
  // dec-YYYY-MM-DD-<6 hex>
  const d = new Date().toISOString().slice(0, 10)
  const rnd = crypto.randomBytes(3).toString('hex')
  return `dec-${d}-${rnd}`
}

/**
 * Read every decision in the project. Returns most-recent first.
 * Tolerates malformed lines — a single bad line shouldn't break the
 * whole timeline view.
 */
export function readDecisions(projectRoot: string): DecisionRecord[] {
  const file = path.join(projectRoot, DECISIONS_REL_PATH)
  if (!fsSync.existsSync(file)) return []
  let raw: string
  try {
    raw = fsSync.readFileSync(file, 'utf-8')
  } catch {
    return []
  }
  const out: DecisionRecord[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as DecisionRecord)
    } catch {
      /* skip malformed line */
    }
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

/**
 * Compute a kind for a state-slice diff. Heuristic — not exhaustive,
 * but better than the writer typing the kind by hand.
 */
export function inferKind(before: unknown, after: unknown): DecisionKind {
  if (before == null && after != null) return 'created'
  if (before != null && after == null) return 'cut'
  if (Array.isArray(before) && Array.isArray(after) &&
      before.length === after.length &&
      JSON.stringify([...before].sort()) === JSON.stringify([...after].sort())) {
    return 'reordered'
  }
  return 'revised'
}
