import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import { spawn } from 'child_process'

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
    return { method: 'odd-flow' }
  } catch {
    // Fall through to local jsonl
  }

  try {
    await appendMemoryLog(projectDir, stageId, patch)
    return { method: 'jsonl' }
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

function runOddFlowStore(
  cwd: string,
  namespace: string,
  stageId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const key = `${stageId}:${Date.now()}`
    const value = JSON.stringify(patch)
    const child = spawn(
      'npx',
      ['-y', 'odd-flow', 'memory', 'store', '-k', key, '-v', value, '--namespace', namespace, '--tags', `stage:${stageId}`],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 },
    )

    let stderr = ''
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`odd-flow exited ${code}: ${stderr}`))
    })
  })
}

function runOddFlowSearch(
  cwd: string,
  namespace: string,
  query: string,
  limit: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      ['-y', 'odd-flow', 'memory', 'search', '-q', query, '--namespace', namespace, '--limit', String(limit), '--json'],
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
