import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

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

export interface MemoryHit {
  key: string
  value: string
  score?: number
  namespace?: string
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
