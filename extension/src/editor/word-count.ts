import * as vscode from 'vscode'

export function countWords(markdown: string): number {
  if (!markdown) return 0
  const withoutCode = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
  const stripped = withoutCode
    .replace(/[*_~#>|[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) return 0
  return stripped.split(' ').filter(tok => /[\p{L}\p{N}]/u.test(tok)).length
}

function formatWordCount(n: number): string {
  if (n >= 100000) return `${Math.round(n / 1000)}k`
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

export class WordCountStatusBar {
  private readonly item: vscode.StatusBarItem
  private perFile = new Map<string, number>()
  private activeFileCount = 0
  private manuscriptPath = 'manuscript'

  constructor(context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    this.item.text = '$(book) Manuscript'
    context.subscriptions.push(this.item)
  }

  async start(context: vscode.ExtensionContext): Promise<void> {
    await this.rescan()
    this.updateDisplay()
    this.item.show()

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(doc => {
        if (this.isManuscriptUri(doc.uri)) {
          this.perFile.set(doc.uri.toString(), countWords(doc.getText()))
          this.updateDisplay()
        }
      }),
      vscode.workspace.onDidDeleteFiles(e => {
        for (const uri of e.files) {
          if (this.perFile.delete(uri.toString())) this.updateDisplay()
        }
      }),
      vscode.workspace.onDidCreateFiles(() => this.rescan().then(() => this.updateDisplay())),
    )
  }

  setActiveFileWords(count: number): void {
    this.activeFileCount = count
    this.updateDisplay()
  }

  private async rescan(): Promise<void> {
    const files = await vscode.workspace.findFiles(`${this.manuscriptPath}/**/*.{md,markdown}`)
    this.perFile.clear()
    for (const uri of files) {
      try {
        const buf = await vscode.workspace.fs.readFile(uri)
        this.perFile.set(uri.toString(), countWords(new TextDecoder().decode(buf)))
      } catch { /* skip */ }
    }
  }

  private isManuscriptUri(uri: vscode.Uri): boolean {
    const rel = vscode.workspace.asRelativePath(uri, false)
    return rel.startsWith(`${this.manuscriptPath}/`)
  }

  private get total(): number {
    let t = 0
    for (const n of this.perFile.values()) t += n
    return t
  }

  private updateDisplay(): void {
    const parts: string[] = []
    if (this.activeFileCount > 0) parts.push(`File: ${formatWordCount(this.activeFileCount)}`)
    const t = this.total
    parts.push(`Book: ${formatWordCount(t)}`)
    this.item.text = `$(book) ${parts.join(' · ')}`
    this.item.tooltip = `Manuscript total: ${t.toLocaleString()} words\nClick to refresh`
  }
}
