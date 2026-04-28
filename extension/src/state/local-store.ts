import * as vscode from 'vscode'
import * as fs from 'fs/promises'
import * as path from 'path'
import { DEFAULT_STATE, type ProjectState } from '@storyline/core'

const STATE_FILE = '.storyline/state.json'

export class LocalStore {
  private statePath: string

  constructor(workspaceRoot: string) {
    this.statePath = path.join(workspaceRoot, STATE_FILE)
  }

  static fromWorkspace(): LocalStore | null {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) return null
    return new LocalStore(root)
  }

  async read(): Promise<ProjectState> {
    try {
      const raw = await fs.readFile(this.statePath, 'utf-8')
      return { ...DEFAULT_STATE, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULT_STATE }
    }
  }

  async write(state: ProjectState): Promise<void> {
    const dir = path.dirname(this.statePath)
    await fs.mkdir(dir, { recursive: true })
    const updated: ProjectState = {
      ...state,
      _meta: {
        ...state._meta,
        updatedAt: new Date().toISOString(),
      },
    }
    await fs.writeFile(this.statePath, JSON.stringify(updated, null, 2), 'utf-8')
  }

  async merge(patch: Partial<ProjectState>): Promise<ProjectState> {
    const current = await this.read()
    const merged = deepMerge(current, patch) as ProjectState
    await this.write(merged)
    return merged
  }

  get path(): string {
    return this.statePath
  }
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (typeof source !== 'object' || source === null) return source
  if (Array.isArray(source)) return source
  const result = { ...(target as Record<string, unknown>) }
  for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
    result[k] = deepMerge(result[k], v)
  }
  return result
}

export interface FileWrite {
  path: string
  content: string
}

/** Extract ```file:path/to/file.md``` fenced blocks from AI text. */
export function extractFileWrites(text: string): FileWrite[] {
  const results: FileWrite[] = []
  const re = /```file:([^\s`\n]+)\n([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    results.push({ path: m[1].trim(), content: m[2] })
  }
  return results
}

/** Extract file-read requests from AI text. Supports `{ "file_read": "path" }` or `{ "file_read": ["p1","p2"] }`. */
export function extractFileReadRequests(text: string): string[] {
  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>
    const req = parsed['file_read']
    if (!req) return []
    if (typeof req === 'string') return [req]
    if (Array.isArray(req)) return req.filter((r): r is string => typeof r === 'string')
  } catch { /* ignore */ }
  return []
}

export function extractJsonBlock(text: string): Record<string, unknown> | null {
  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>
    // Reject schema-demo blocks where every value is null/empty/placeholder.
    // The AI sometimes regurgitates the save-block shape (with `null` or
    // "..." placeholders) inside its conversational opener — that should
    // not be treated as a real save.
    if (isPlaceholderOnly(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function isPlaceholderOnly(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' || trimmed === '...' || trimmed === 'null'
  }
  if (typeof value === 'number' || typeof value === 'boolean') return false
  if (Array.isArray(value)) return value.every(isPlaceholderOnly)
  if (typeof value === 'object') {
    const entries = Object.values(value as Record<string, unknown>)
    if (entries.length === 0) return true
    return entries.every(isPlaceholderOnly)
  }
  return false
}
