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

export function extractJsonBlock(text: string): Record<string, unknown> | null {
  const match = text.match(/```json\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim()) as Record<string, unknown>
  } catch {
    return null
  }
}
