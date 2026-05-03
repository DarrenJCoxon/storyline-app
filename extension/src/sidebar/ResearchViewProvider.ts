import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { readPins, togglePin, toggleChapterPin } from './research-pins.js'

export interface ResearchNote {
  relPath: string      // research/worldbuilding/magic-system.md
  category: string     // worldbuilding
  title: string        // Magic System
  bodyPreview: string  // first 120 chars of body text
}

export type ResearchCategories = Record<string, ResearchNote[]>

function humanize(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\.(md|markdown)$/i, '')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function bodyPreview(content: string): string {
  // Strip first heading if it matches the title, return first non-empty line of body
  const lines = content.split('\n').filter(l => l.trim())
  const body = lines.find(l => !l.startsWith('#')) ?? ''
  return body.slice(0, 120)
}

function isReadme(filename: string): boolean {
  return /^readme\.(md|markdown)$/i.test(filename)
}

function loadNotes(root: string): ResearchNote[] {
  const researchDir = path.join(root, 'research')
  const notes: ResearchNote[] = []
  try {
    const entries = fs.readdirSync(researchDir, { withFileTypes: true })
    const categories = entries.filter(d => d.isDirectory())

    // Scan subdirectories
    for (const cat of categories) {
      const catDir = path.join(researchDir, cat.name)
      try {
        const files = fs.readdirSync(catDir)
          .filter(f => /\.(md|markdown)$/i.test(f) && !isReadme(f))
          .sort()
        for (const file of files) {
          const relPath = path.join('research', cat.name, file)
          let content = ''
          try { content = fs.readFileSync(path.join(root, relPath), 'utf-8') } catch { /* */ }
          notes.push({
            relPath,
            category: cat.name,
            title: humanize(file),
            bodyPreview: bodyPreview(content),
          })
        }
      } catch { /* empty or unreadable category dir */ }
    }

    // Scan flat files directly in research/ (excluding READMEs), group under "general"
    const flatFiles = entries
      .filter(e => e.isFile() && /\.(md|markdown)$/i.test(e.name) && !isReadme(e.name))
      .map(e => e.name)
      .sort()
    for (const file of flatFiles) {
      const relPath = path.join('research', file)
      let content = ''
      try { content = fs.readFileSync(path.join(root, relPath), 'utf-8') } catch { /* */ }
      notes.push({
        relPath,
        category: 'general',
        title: humanize(file),
        bodyPreview: bodyPreview(content),
      })
    }
  } catch { /* research dir doesn't exist yet */ }
  return notes
}

function groupByCategory(notes: ResearchNote[]): ResearchCategories {
  const groups: ResearchCategories = {}
  for (const note of notes) {
    if (!groups[note.category]) groups[note.category] = []
    groups[note.category].push(note)
  }
  return groups
}

export class ResearchViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'storyline.research'

  private view: vscode.WebviewView | undefined
  private readonly watcher: vscode.FileSystemWatcher

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/research/**/*.{md,markdown}')
    this.watcher.onDidChange(() => this.refresh())
    this.watcher.onDidCreate(() => this.refresh())
    this.watcher.onDidDelete(() => this.refresh())
    context.subscriptions.push(this.watcher)
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    }
    webviewView.webview.html = this.getHtml(webviewView.webview)

    webviewView.webview.onDidReceiveMessage(async msg => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      switch (msg.type) {
        case 'ready':
          this.refresh()
          break
        case 'openNote':
          if (!root) return
          void vscode.commands.executeCommand(
            'storyline.openEditor',
            vscode.Uri.file(path.join(root, msg.relPath as string)),
          )
          break
        case 'newNote':
          if (!root) await this.createNote(root ?? '')
          else await this.createNote(root)
          break
        case 'togglePin': {
          if (!root) return
          const pins = togglePin(root, msg.relPath as string, msg.pinned as boolean)
          this.view?.webview.postMessage({ type: 'pins', pinned: pins.pinned })
          break
        }
        case 'search': {
          if (!root) return
          const query = (msg.query as string).toLowerCase().trim()
          const all = loadNotes(root)
          const filtered = query
            ? all.filter(n =>
                n.title.toLowerCase().includes(query) ||
                n.bodyPreview.toLowerCase().includes(query) ||
                n.category.toLowerCase().includes(query),
              )
            : all
          const { pinned: currentPins, chapterScoped } = readPins(root)
          this.view?.webview.postMessage({
            type: 'notes',
            categories: groupByCategory(filtered),
            pinned: currentPins,
            chapterScoped,
            query,
          })
          break
        }
        case 'deleteNote':
          if (!root) return
          await this.deleteNote(root, msg.relPath as string)
          break
        case 'attachToChapter':
          if (!root) return
          await this.attachToChapter(root, msg.noteRelPath as string)
          break
      }
    })

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.refresh()
    })
  }

  public refresh(): void {
    if (!this.view?.visible) return
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) return
    const notes = loadNotes(root)
    const { pinned, chapterScoped } = readPins(root)
    this.view.webview.postMessage({
      type: 'notes',
      categories: groupByCategory(notes),
      pinned,
      chapterScoped,
      query: '',
    })
  }

  private async createNote(root: string): Promise<void> {
    // Pick or create a category
    const researchDir = path.join(root, 'research')
    let existingCategories: string[] = []
    try {
      existingCategories = fs.readdirSync(researchDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
    } catch { /* */ }

    const categoryItems = [
      ...existingCategories.map(c => ({ label: humanize(c), description: c })),
      { label: '+ New category…', description: '__new__' },
    ]

    const picked = await vscode.window.showQuickPick(categoryItems, {
      title: 'Research note — choose a category',
      placeHolder: existingCategories.length ? 'Pick a category or create new' : 'Name your first category',
    })
    if (!picked) return

    let category: string
    if (picked.description === '__new__') {
      const input = await vscode.window.showInputBox({
        title: 'New category name',
        placeHolder: 'e.g. worldbuilding, characters, plot',
        validateInput: v => v.trim() ? null : 'Category name cannot be empty',
      })
      if (!input?.trim()) return
      category = input.trim().toLowerCase().replace(/\s+/g, '-')
    } else {
      category = picked.description!
    }

    const title = await vscode.window.showInputBox({
      title: 'Note title',
      placeHolder: 'e.g. Magic System Rules',
      validateInput: v => v.trim() ? null : 'Title cannot be empty',
    })
    if (!title?.trim()) return

    const slug = title.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const catDir = path.join(researchDir, category)
    fs.mkdirSync(catDir, { recursive: true })

    const filePath = path.join(catDir, `${slug}.md`)
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, `# ${title.trim()}\n\n`, 'utf-8')
    }

    void vscode.commands.executeCommand('storyline.openEditor', vscode.Uri.file(filePath))
  }

  private async attachToChapter(root: string, noteRelPath: string): Promise<void> {
    // Build chapter list from manuscript/
    const manuscriptDir = path.join(root, 'manuscript')
    let chapterFiles: string[] = []
    try {
      chapterFiles = fs.readdirSync(manuscriptDir)
        .filter(f => /\.(md|markdown)$/i.test(f))
        .sort((a, b) => {
          const na = parseInt(a.match(/(\d+)/)?.[1] ?? '999', 10)
          const nb = parseInt(b.match(/(\d+)/)?.[1] ?? '999', 10)
          return na - nb
        })
    } catch { /* no manuscript dir yet */ }

    if (chapterFiles.length === 0) {
      vscode.window.showInformationMessage('No chapters found. Write some chapters first.')
      return
    }

    const { chapterScoped } = readPins(root)
    const noteBasename = path.basename(noteRelPath, path.extname(noteRelPath))

    const items = chapterFiles.map((f, i) => {
      const relPath = path.join('manuscript', f)
      const attached = (chapterScoped[relPath] ?? []).includes(noteRelPath)
      return {
        label: `${attached ? '$(check) ' : ''}Chapter ${String(i + 1).padStart(2, '0')} — ${f.replace(/\.(md|markdown)$/i, '').replace(/[-_]/g, ' ')}`,
        description: attached ? 'attached' : '',
        relPath,
        attached,
      }
    })

    const picked = await vscode.window.showQuickPick(items, {
      title: `Attach "${noteBasename}" to chapter`,
      placeHolder: 'Select a chapter — picking an attached chapter will detach it',
    })
    if (!picked) return

    toggleChapterPin(root, picked.relPath, noteRelPath, !picked.attached)
    this.refresh()

    const action = picked.attached ? 'Detached from' : 'Attached to'
    void vscode.window.showInformationMessage(`${action} chapter.`)
  }

  private async deleteNote(root: string, relPath: string): Promise<void> {
    const title = humanize(path.basename(relPath))
    const choice = await vscode.window.showWarningMessage(
      `Delete "${title}"? This cannot be undone.`,
      { modal: true },
      'Delete',
    )
    if (choice !== 'Delete') return
    try {
      fs.unlinkSync(path.join(root, relPath))
    } catch (err) {
      vscode.window.showErrorMessage(`Could not delete note: ${err instanceof Error ? err.message : err}`)
    }
    this.refresh()
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'research.js'),
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'research.css'),
    )
    const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('')
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}
