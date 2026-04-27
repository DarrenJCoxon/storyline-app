import * as fs from 'fs'
import * as path from 'path'

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export class TurnHistory {
  private history: Map<string, Turn[]> = new Map()
  private storePath: string | null = null

  // Flat cross-stage log of turns the user should see on restore.
  // Does NOT include synthetic AI-kickoff user messages.
  private displayLog: Turn[] = []
  private displayStorePath: string | null = null

  setStorePath(filePath: string): void {
    this.storePath = filePath
    this.load()
  }

  setDisplayStorePath(filePath: string): void {
    this.displayStorePath = filePath
    this.loadDisplay()
  }

  getForStage(stageId: string): Turn[] {
    return this.history.get(stageId) ?? []
  }

  append(stageId: string, turn: Turn): void {
    const existing = this.history.get(stageId) ?? []
    this.history.set(stageId, [...existing, turn])
    this.persist()
  }

  appendDisplay(turn: Turn): void {
    if (!turn.content) return
    this.displayLog.push(turn)
    this.persistDisplay()
  }

  allForStage(stageId: string): Turn[] {
    return this.getForStage(stageId)
  }

  allDisplay(): Turn[] {
    return [...this.displayLog]
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

  private loadDisplay(): void {
    if (!this.displayStorePath) return
    try {
      const raw = fs.readFileSync(this.displayStorePath, 'utf-8')
      this.displayLog = JSON.parse(raw) as Turn[]
    } catch {
      this.displayLog = []
    }
  }

  private persistDisplay(): void {
    if (!this.displayStorePath) return
    try {
      const dir = path.dirname(this.displayStorePath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.displayStorePath, JSON.stringify(this.displayLog, null, 2), 'utf-8')
    } catch {
      /* non-fatal */
    }
  }
}
