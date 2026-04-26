import * as fs from 'fs'
import * as path from 'path'

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export class TurnHistory {
  private history: Map<string, Turn[]> = new Map()
  private storePath: string | null = null

  setStorePath(filePath: string): void {
    this.storePath = filePath
    this.load()
  }

  getForStage(stageId: string): Turn[] {
    return this.history.get(stageId) ?? []
  }

  append(stageId: string, turn: Turn): void {
    const existing = this.history.get(stageId) ?? []
    this.history.set(stageId, [...existing, turn])
    this.persist()
  }

  allForStage(stageId: string): Turn[] {
    return this.getForStage(stageId)
  }

  clear(stageId: string): void {
    this.history.delete(stageId)
    this.persist()
  }

  clearAll(): void {
    this.history.clear()
    this.persist()
  }

  private load(): void {
    if (!this.storePath) return
    try {
      const raw = fs.readFileSync(this.storePath, 'utf-8')
      const data = JSON.parse(raw) as Record<string, Turn[]>
      this.history = new Map(Object.entries(data))
    } catch {
      this.history = new Map()
    }
  }

  private persist(): void {
    if (!this.storePath) return
    try {
      const dir = path.dirname(this.storePath)
      fs.mkdirSync(dir, { recursive: true })
      const data: Record<string, Turn[]> = {}
      for (const [k, v] of this.history) data[k] = v
      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch {
      /* non-fatal */
    }
  }
}
