import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { getSemanticMemoryService } from './semantic-memory-service.js'
import { bookScopePrefix, getBookScopeId } from './semantic-memory.js'

// Resolve the bundled odd-flow CLI path relative to this compiled module.
// In dev: <repo>/extension/dist/state/memory.js → ../../node_modules/odd-flow/bin/cli.js
// In VSIX: <ext-install>/dist/state/memory.js → ../../node_modules/odd-flow/bin/cli.js
// (vsce keeps node_modules/odd-flow because we whitelist it in .vscodeignore)
function resolveOddFlowCli(): string | null {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'node_modules', 'odd-flow', 'bin', 'cli.js'),
    path.resolve(__dirname, '..', 'node_modules', 'odd-flow', 'bin', 'cli.js'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

/**
 * Push a save event to durable memory via odd-flow.
 *
 * Strategy:
 *   1. Spawn `npx odd-flow memory store -k <stage> -v <json> --namespace <project>`.
 *      odd-flow handles all persistence (SQLite, vector embeddings, semantic search).
 *   2. If odd-flow is unavailable, fall back to `.storyline/memory.jsonl` so
 *      the entry persists locally and can be synced later.
 */
export async function pushToMemory(
  stageId: string,
  patch: Record<string, unknown>,
): Promise<{ method: 'odd-flow' | 'jsonl' | 'skipped'; error?: string }> {
  const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!projectDir) return { method: 'skipped', error: 'no workspace' }

  const namespace = projectNamespace(projectDir)

  // NT-05: parallel write to NuVector semantic memory. Fire-and-forget
  // (never blocks the save), no-ops cleanly when the writer hasn't opted
  // in. The markdown audit trail and odd-flow remain the operational
  // sources of truth — the vector index is best-effort search overlay.
  void upsertStageToSemanticMemory(stageId, patch).catch(() => { /* logged inside */ })

  try {
    await runOddFlowStore(projectDir, namespace, stageId, patch)
    console.log(`[Storyline] memory: ${stageId} → odd-flow (namespace=${namespace})`)
    // Always also append to the local jsonl, so the writer has a
    // human-readable audit log of every save (and a fallback if odd-flow
    // ever has to be rebuilt).
    await appendMemoryLog(projectDir, stageId, patch).catch(() => { /* non-fatal */ })
    return { method: 'odd-flow' }
  } catch (err) {
    console.warn(`[Storyline] memory: odd-flow unavailable, falling back to jsonl —`, err instanceof Error ? err.message : err)
  }

  try {
    await appendMemoryLog(projectDir, stageId, patch)
    console.log(`[Storyline] memory: ${stageId} → .storyline/memory.jsonl`)
    return { method: 'jsonl' }
  } catch (err) {
    console.error('[Storyline] memory: failed to persist to jsonl —', err)
    return { method: 'skipped', error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Store an arbitrary key/value pair to odd-flow memory. Used for wiki articles
 * and other compiled context that should be retrievable via semantic search.
 */
export async function storeMemoryEntry(
  key: string,
  value: string,
  tags?: string[],
): Promise<{ method: 'odd-flow' | 'skipped'; error?: string }> {
  const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!projectDir) return { method: 'skipped', error: 'no workspace' }

  const namespace = projectNamespace(projectDir)

  try {
    await runOddFlowStoreRaw(projectDir, namespace, key, value, tags)
    return { method: 'odd-flow' }
  } catch (err) {
    return { method: 'skipped', error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Search memory for a query — used by the writing assistant when the writer
 * asks plan-consistency questions ("did this character already meet X?").
 */
export async function searchMemory(query: string, limit = 10): Promise<MemoryHit[]> {
  const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!projectDir) return []

  const namespace = projectNamespace(projectDir)

  try {
    const json = await runOddFlowSearch(projectDir, namespace, query, limit)
    return parseSearchResults(json)
  } catch {
    return []
  }
}

/**
 * Retrieve relevant prior decisions from memory for the active planning stage.
 * Runs stage-specific semantic queries against odd-flow, deduplicates, and
 * returns a formatted markdown block ready for injection into the system prompt.
 */
export async function retrieveRelevantMemory(stageId: string, limit = 3): Promise<string> {
  const queries = STAGE_QUERIES[stageId]
  if (!queries?.length) return ''

  // Run all queries in parallel, deduplicate by key, take top N by score
  const results = await Promise.all(queries.map(q => searchMemory(q, 5)))
  const flat = results.flat().filter(h => h.value && h.value.trim())
  const deduped = deduplicateHits(flat)
  if (!deduped.length) return ''

  const lines = deduped
    .slice(0, limit)
    .map(h => `**${h.key}**: ${h.value}`)
    .join('\n\n')

  return `# Prior decisions (retrieved from memory)\n\n${lines}`
}

export interface MemoryHit {
  key: string
  value: string
  score?: number
  namespace?: string
}

// Stage-specific semantic queries. Each stage gets 2–4 queries that target the
// decisions most likely to affect its work. Retrieval runs against odd-flow
// which stores compiled wiki articles (dense prose) — not raw JSON patches.
const STAGE_QUERIES: Readonly<Record<string, string[]>> = {
  // Fiction
  beatSheet:     ['protagonist motivation', 'story premise hook', 'antagonist'],
  bStory:        ['protagonist flaw', 'protagonist need', 'B story character'],
  subplots:      ['protagonist arc', 'supporting cast roles'],
  sceneOutline:  ['beat sheet structure', 'protagonist', 'antagonist', 'B story'],
  plotThreads:   ['scene outline', 'chapter groupings', 'promises and payoffs'],
  chapterOutline:['scene outline', 'chapter groupings', 'plot thread resolution'],
  critique:      ['all decisions', 'protagonist', 'beats', 'themes'],
  masterDoc:     ['all decisions', 'protagonist', 'beats', 'themes', 'scenes'],

  // Non-fiction DNA
  'dna-promise':    ['reader avatar', 'reader transformation'],
  'dna-comps':      ['book category', 'big idea', 'author angle'],
  'dna-voice':      ['comparable titles', 'voice and register'],
  'dna-consolidate':['reader avatar', 'book category', 'author angle', 'voice'],

  // Pipeline A — Prescriptive
  'pa-thesis':     ['reader transformation', 'central thesis', 'book promise'],
  'pa-objections': ['reader transformation', 'central thesis', 'objections'],
  'pa-framework':  ['central thesis', 'framework model', 'reader transformation'],
  'pa-principles': ['framework model', 'principles', 'evidence'],
  'pa-evidence':   ['framework model', 'evidence', 'application'],
  'pa-application':['framework model', 'evidence', 'application'],
  'pa-braid':      ['framework model', 'narrative braid', 'evidence'],
  'pa-chapters':   ['framework model', 'chapter sequence', 'reader journey'],
  'pa-opener':     ['chapter sequence', 'opener strategy', 'hook'],
  'pa-critique':   ['reader transformation', 'thesis', 'framework', 'chapters'],
  'pa-master':     ['reader transformation', 'thesis', 'framework', 'chapters'],

  // Pipeline B — Narrative NF
  'pb-thesis':   ['reader transformation', 'narrative arc', 'central thesis'],
  'pb-cast':     ['narrative arc', 'cast of figures', 'reader transformation'],
  'pb-timeline': ['narrative arc', 'timeline', 'cast of figures'],
  'pb-fork':     ['narrative arc', 'idea-led vs event-led', 'reader transformation'],
  'pb-scenes':   ['narrative arc', 'key scenes', 'sourcing'],
  'pb-sourcing': ['key scenes', 'sourcing strategy', 'evidence'],
  'pb-theme':    ['narrative arc', 'theme', 'reader transformation'],
  'pb-chapters': ['narrative arc', 'chapter sequence', 'reader journey'],
  'pb-critique': ['reader transformation', 'narrative arc', 'scenes', 'chapters'],
  'pb-master':   ['reader transformation', 'narrative arc', 'scenes', 'chapters'],

  // Pipeline C — How-To
  'pc-skill':       ['reader transformation', 'skill being taught', 'starting level'],
  'pc-start-level':['skill being taught', 'starting level', 'end state'],
  'pc-end-state':  ['skill being taught', 'end state', 'sub-skills'],
  'pc-decompose':  ['skill being taught', 'sub-skills', 'prerequisites'],
  'pc-prereqs':    ['skill being taught', 'prerequisites', 'sub-skills'],
  'pc-lessons':    ['skill being taught', 'lesson plan', 'pedagogy'],
  'pc-drills':     ['lesson plan', 'drills', 'common mistakes'],
  'pc-milestones': ['lesson plan', 'milestones', 'assessments'],
  'pc-examples':   ['lesson plan', 'worked examples', 'common mistakes'],
  'pc-critique':   ['reader transformation', 'skill', 'lessons', 'drills'],
  'pc-master':     ['reader transformation', 'skill', 'lessons', 'drills'],

  // Academic
  'ac-syllabus':  ['reader transformation', 'curriculum level', 'assessment shape'],
  'ac-chapters':  ['syllabus outcomes', 'chapter plan', 'curriculum coverage'],
  'ac-critique':  ['syllabus outcomes', 'chapter plan', 'curriculum coverage'],
  'ac-master':    ['syllabus outcomes', 'chapter plan', 'curriculum coverage'],
}

function deduplicateHits(hits: MemoryHit[]): MemoryHit[] {
  const seen = new Set<string>()
  const out: MemoryHit[] = []
  for (const h of hits) {
    if (seen.has(h.key)) continue
    seen.add(h.key)
    out.push(h)
  }
  return out
}

function projectNamespace(projectDir: string): string {
  const slug = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  return `storyline:${slug}`
}

// Mirrors /storyline's odd-flow-push.js auto-recovery: if the DB hasn't
// been initialised yet, the first `memory store` call fails with
// "Database not initialized". We run `memory init` once and retry. If the
// DB file exists but is corrupt (rare), `memory init --force` rebuilds it.
const DB_NOT_INIT_RX = /database not initialized|run:\s*odd-flow memory init/i
const FILE_NOT_DB_RX = /file is not a database|not a database|SQLITE_NOTADB/i

// Cache: have we already initialised odd-flow's DB in this project this session?
const initialisedProjects = new Set<string>()

async function runOddFlowStore(
  cwd: string,
  namespace: string,
  stageId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const cli = resolveOddFlowCli()
  if (!cli) throw new Error('odd-flow CLI not bundled with extension')

  const key = `${stageId}:${Date.now()}`
  const value = JSON.stringify(patch)
  const storeArgs = [cli, 'memory', 'store', '-k', key, '-v', value, '--namespace', namespace, '--tags', `stage:${stageId}`]

  // Eager init on first save in this project (per session). Cheaper than
  // parsing the error string from a failed store call.
  if (!initialisedProjects.has(cwd)) {
    await runOddFlow(cwd, [cli, 'memory', 'init'])
    // odd-flow's init mirrors the DB to .claude/memory.db for Claude Code
    // interop. We're not running inside Claude Code, so the mirror is
    // dead weight; remove it (and the .claude/ dir if it's now empty).
    // Subsequent `memory store` calls don't recreate it.
    await pruneClaudeMirror(cwd)
    initialisedProjects.add(cwd)
  }

  let result = await runOddFlow(cwd, storeArgs)
  if (result.code === 0) return

  // Defensive retry if the eager init didn't take (rare — but keeps the
  // original /storyline harness's recovery semantics intact).
  if (DB_NOT_INIT_RX.test(result.stderr)) {
    await runOddFlow(cwd, [cli, 'memory', 'init'])
    result = await runOddFlow(cwd, storeArgs)
    if (result.code === 0) return
  } else if (FILE_NOT_DB_RX.test(result.stderr)) {
    await runOddFlow(cwd, [cli, 'memory', 'init', '--force'])
    result = await runOddFlow(cwd, storeArgs)
    if (result.code === 0) return
  }
  throw new Error(`odd-flow exited ${result.code}: ${result.stderr}`)
}

async function runOddFlowStoreRaw(
  cwd: string,
  namespace: string,
  key: string,
  value: string,
  tags?: string[],
): Promise<void> {
  const cli = resolveOddFlowCli()
  if (!cli) throw new Error('odd-flow CLI not bundled with extension')

  const storeArgs = [cli, 'memory', 'store', '-k', key, '-v', value, '--namespace', namespace]
  if (tags && tags.length) {
    storeArgs.push('--tags', tags.join(','))
  }

  if (!initialisedProjects.has(cwd)) {
    await runOddFlow(cwd, [cli, 'memory', 'init'])
    await pruneClaudeMirror(cwd)
    initialisedProjects.add(cwd)
  }

  let result = await runOddFlow(cwd, storeArgs)
  if (result.code === 0) return

  if (DB_NOT_INIT_RX.test(result.stderr)) {
    await runOddFlow(cwd, [cli, 'memory', 'init'])
    result = await runOddFlow(cwd, storeArgs)
    if (result.code === 0) return
  } else if (FILE_NOT_DB_RX.test(result.stderr)) {
    await runOddFlow(cwd, [cli, 'memory', 'init', '--force'])
    result = await runOddFlow(cwd, storeArgs)
    if (result.code === 0) return
  }
  throw new Error(`odd-flow exited ${result.code}: ${result.stderr}`)
}

async function pruneClaudeMirror(cwd: string): Promise<void> {
  const dir = path.join(cwd, '.claude')
  const dbFile = path.join(dir, 'memory.db')
  try {
    await fs.unlink(dbFile)
  } catch { /* not present */ }
  try {
    const remaining = await fs.readdir(dir)
    if (remaining.length === 0) await fs.rmdir(dir)
  } catch { /* dir not present or non-empty */ }
}

function runOddFlow(cwd: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise(resolve => {
    // Spawn `node <bundled-cli.js> <subcommand>` — no npx, no PATH lookup,
    // no npm registry resolution, no stale-package-lock interference.
    const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 })
    let stderr = ''
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', err => resolve({ code: -1, stderr: err.message }))
    child.on('close', code => resolve({ code, stderr }))
  })
}

function runOddFlowSearch(
  cwd: string,
  namespace: string,
  query: string,
  limit: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const cli = resolveOddFlowCli()
    if (!cli) return reject(new Error('odd-flow CLI not bundled with extension'))
    const child = spawn(
      process.execPath,
      [cli, 'memory', 'search', '-q', query, '--namespace', namespace, '--limit', String(limit), '--json'],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 },
    )

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`odd-flow exited ${code}: ${stderr}`))
    })
  })
}

/**
 * Retrieve a single memory entry by exact key. Returns null if not found.
 * Used for cross-book series continuity checks (retrieve previous book's
 * character state from odd-flow).
 */
export async function retrieveMemoryEntry(key: string): Promise<string | null> {
  const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!projectDir) return null

  const namespace = projectNamespace(projectDir)
  const cli = resolveOddFlowCli()
  if (!cli) return null

  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [cli, 'memory', 'retrieve', '-k', key, '--namespace', namespace],
      { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 },
    )

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', () => resolve(null))
    child.on('close', code => {
      if (code === 0) {
        const trimmed = stdout.trim()
        resolve(trimmed || null)
      } else {
        resolve(null)
      }
    })
  })
}

function parseSearchResults(jsonOutput: string): MemoryHit[] {
  try {
    const parsed = JSON.parse(jsonOutput)
    if (Array.isArray(parsed)) return parsed as MemoryHit[]
    if (parsed && Array.isArray(parsed.results)) return parsed.results as MemoryHit[]
    if (parsed && Array.isArray(parsed.hits)) return parsed.hits as MemoryHit[]
    return []
  } catch {
    return []
  }
}

async function appendMemoryLog(
  projectDir: string,
  stageId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const memDir = path.join(projectDir, '.storyline')
  await fs.mkdir(memDir, { recursive: true })
  const logPath = path.join(memDir, 'memory.jsonl')
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    stageId,
    patch,
    synced: false,
  })
  await fs.appendFile(logPath, entry + '\n', 'utf-8')
}

/**
 * NT-05: push a stage save into the local NuVector semantic memory.
 * Fire-and-forget — failures are logged inside the service and never
 * surface to the caller. Skipped silently when semantic memory is
 * disabled or no service singleton is registered yet.
 *
 * Exported so NT-06's reindex can rebuild stage chunks from the current
 * state in bulk; the live save path keeps using the local wrapper above.
 */
export async function upsertStageToSemanticMemory(
  stageId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const service = getSemanticMemoryService()
  if (!service) return
  const text = renderStagePatchAsText(stageId, patch)
  if (!text) return
  const bookId = getBookScopeId()
  const bookScope = bookScopePrefix()
  await service.upsert({
    id: `${bookScope}/stage:${stageId}`,
    kind: 'nuwiki_section',
    text,
    metadata: {
      // NuVector NuWiki shape — see docs/design/nuos-memory-schema.md §5.2.
      articleId: `${bookScope}/book:summary`,
      documentType: 'storyline_stage',
      subject: { kind: 'stage', id: stageId },
      version: new Date().toISOString(),
      sectionKey: stageId,
      sectionHeading: stageId,
      citationCount: 0,
      parentArticleSummary: '',
      position: 0,
      // Storyline extensions
      bookId,
      stageId,
      kind: 'planning',
    },
  })
}

/**
 * NT-05: push a research item into the semantic memory. Reads the item
 * file directly so callers don't have to provide the rendered text.
 * Fire-and-forget — no failure surfaces to the writer.
 */
export async function upsertResearchItemToSemanticMemory(
  projectDir: string,
  itemId: string,
): Promise<void> {
  const service = getSemanticMemoryService()
  if (!service) return
  const itemPath = path.join(projectDir, '.storyline', 'research', `${itemId}.md`)
  let raw: string
  try {
    raw = await fs.readFile(itemPath, 'utf-8')
  } catch {
    // Item file vanished or never landed — nothing to embed.
    return
  }
  const { meta, body } = parseFrontmatter(raw)
  const text = renderResearchItemAsText(itemId, meta, body)
  const bookId = getBookScopeId()
  const bookScope = bookScopePrefix()
  await service.upsert({
    id: `${bookScope}/research:${itemId}`,
    kind: 'nuwiki_citation',
    text,
    metadata: {
      // schema doc §5.3 — research item shape
      articleId: `${bookScope}/book:summary`,
      documentType: 'storyline_research',
      subject: { kind: 'research', id: itemId },
      version: typeof meta.updatedAt === 'string' ? meta.updatedAt : new Date().toISOString(),
      citationId: `research:${itemId}`,
      sourceRef: {
        kind: 'document',
        ref: typeof meta.source === 'string' ? meta.source : itemPath,
      },
      confidence: confidenceForReliability(meta.reliability),
      sectionKey: 'research',
      bookId,
      subtype: meta.subtype ?? 'note',
      reliabilityTier: meta.reliability ?? null,
      verificationState: meta.verification ?? null,
      legacyLinks: Array.isArray(meta.links) ? meta.links : [],
    },
  })
}

/**
 * NT-05: drop a research item from the semantic memory after removal.
 */
export async function deleteResearchItemFromSemanticMemory(itemId: string): Promise<void> {
  const service = getSemanticMemoryService()
  if (!service) return
  await service.deleteByIds([`${bookScopePrefix()}/research:${itemId}`])
}

/**
 * NT-08: emit a `links-to-research` edge when the existing research
 * linker creates a research-item-to-target link. The link itself stays
 * in the item's frontmatter (existing behaviour); this gives the edge
 * first-class graph membership so retrieval can find "everything that
 * links to research item X" or "all research backing chapter 5".
 *
 * `target` follows the existing linker format: `chapter:N` /
 * `scene:chN-sM` / `stage:X` / `claim:Y`.
 */
export async function emitResearchLinkEdge(itemId: string, target: string): Promise<void> {
  const service = getSemanticMemoryService()
  if (!service) return
  // Translate the legacy linker target shape into NuVector chunk ids.
  const targetChunkId = legacyLinkerTargetToChunkId(target)
  if (!targetChunkId) return
  await service.addEdge({
    from: targetChunkId,
    to: `book:default/research:${itemId}`,
    kind: 'links-to-research',
    createdBy: 'linker',
  })
}

function legacyLinkerTargetToChunkId(target: string): string | null {
  // chapter:5 → book:<scope>/chapter:5  (scope = 'default' or series-derived bookId)
  // scene:ch5-s2 → book:<scope>/scene:ch5-s2
  // stage:protagonist → book:<scope>/stage:protagonist
  // claim:abc → book:<scope>/claim:abc (no live mapping today, but reserve the path)
  const m = /^(chapter|scene|stage|claim):(.+)$/.exec(target)
  if (!m) return null
  return `${bookScopePrefix()}/${m[1]}:${m[2]}`
}

/** Lightweight YAML frontmatter parser — bounded to flat key/value + simple lists. */
function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const fmMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw)
  if (!fmMatch) return { meta: {}, body: raw }
  const meta: Record<string, unknown> = {}
  for (const line of fmMatch[1].split(/\n/)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1]
    const valueRaw = m[2].trim()
    if (valueRaw.startsWith('[') && valueRaw.endsWith(']')) {
      meta[key] = valueRaw
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(s => s.length > 0)
    } else {
      meta[key] = valueRaw.replace(/^['"]|['"]$/g, '')
    }
  }
  return { meta, body: fmMatch[2] }
}

function renderResearchItemAsText(
  itemId: string,
  meta: Record<string, unknown>,
  body: string,
): string {
  const title = typeof meta.title === 'string' ? meta.title : itemId
  return `# ${title}\n\n${body.trim()}`
}

function confidenceForReliability(tier: unknown): number {
  switch (tier) {
    case 'primary': return 1.0
    case 'peer-reviewed': return 0.9
    case 'secondary': return 0.7
    case 'anecdotal': return 0.5
    default: return 0.6
  }
}

/**
 * Render a stage's patch as a single text block suitable for embedding.
 * Strategy: prepend the stage id, then JSON-stringify the patch with
 * 2-space indentation. The shape isn't user-facing — the embedding
 * captures semantic content; structure helps the model relate similar
 * patterns across stages.
 */
function renderStagePatchAsText(stageId: string, patch: Record<string, unknown>): string {
  try {
    const body = JSON.stringify(patch, null, 2)
    return `# ${stageId}\n\n${body}`
  } catch {
    return ''
  }
}
