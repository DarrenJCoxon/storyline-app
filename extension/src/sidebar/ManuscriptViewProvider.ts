import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { countWords } from '../editor/word-count.js'
import { getChapterTitle, humanizeFilename } from '../editor/chapter-titles.js'
import { readPins } from './research-pins.js'
import type { EditorPanel } from '../panels/EditorPanel.js'

export interface ChapterItem {
  filename: string
  relPath: string
  title: string
  wordCount: number
  isActive: boolean
  sortOrder: number
  researchCount: number
}

function readProjectName(root: string): string {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(root, '.storyline', 'state.json'), 'utf-8'))
    return (state?.projectName as string | undefined)?.trim() || path.basename(root)
  } catch {
    return path.basename(root)
  }
}

function chapterSortOrder(filename: string): number {
  const m = filename.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 999
}

function loadChapters(root: string, activeRelPath: string | undefined): { chapters: ChapterItem[]; totalWords: number } {
  const manuscriptDir = path.join(root, 'manuscript')
  let files: string[] = []
  try {
    files = fs.readdirSync(manuscriptDir)
      .filter(f => /\.(md|markdown)$/i.test(f))
      .filter(f => !/^readme\.(md|markdown)$/i.test(f))
      .sort((a, b) => chapterSortOrder(a) - chapterSortOrder(b))
  } catch { /* manuscript dir doesn't exist yet */ }

  const { chapterScoped } = readPins(root)

  let totalWords = 0
  const chapters: ChapterItem[] = files.map(filename => {
    const relPath = path.join('manuscript', filename)
    const absPath = path.join(root, relPath)
    let content = ''
    try { content = fs.readFileSync(absPath, 'utf-8') } catch { /* */ }
    const wc = countWords(content)
    totalWords += wc
    const title = getChapterTitle(root, relPath) ?? humanizeFilename(filename)
    return {
      filename,
      relPath,
      title,
      wordCount: wc,
      isActive: activeRelPath ? relPath === activeRelPath : false,
      sortOrder: chapterSortOrder(filename),
      researchCount: (chapterScoped[relPath] ?? []).length,
    }
  })

  return { chapters, totalWords }
}

export class ManuscriptViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'storyline.manuscript'

  private view: vscode.WebviewView | undefined
  private readonly watcher: vscode.FileSystemWatcher
  private activeRelPath: string | undefined

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly editorPanel: EditorPanel,
    private readonly context: vscode.ExtensionContext,
  ) {
    // Watch manuscript folder for changes
    this.watcher = vscode.workspace.createFileSystemWatcher('**/manuscript/**/*.{md,markdown}')
    this.watcher.onDidChange(() => this.refresh())
    this.watcher.onDidCreate(() => this.refresh())
    this.watcher.onDidDelete(() => this.refresh())
    context.subscriptions.push(this.watcher)

    // Track active editor changes from EditorPanel
    editorPanel.onDidChangeActiveRichEditor(() => {
      const uri = editorPanel.getActiveRichEditorUri()
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (uri && wsRoot) {
        this.activeRelPath = path.relative(wsRoot, uri.fsPath)
      } else {
        this.activeRelPath = undefined
      }
      this.postActiveChapter()
    })
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    }
    webviewView.webview.html = this.getHtml(webviewView.webview)

    webviewView.webview.onDidReceiveMessage(msg => {
      switch (msg.type) {
        case 'ready':
          this.refresh()
          break
        case 'openChapter': {
          const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          if (!root) return
          const absPath = path.join(root, msg.relPath as string)
          void vscode.commands.executeCommand('storyline.openEditor', vscode.Uri.file(absPath))
          break
        }
        case 'newChapter':
          void vscode.commands.executeCommand('storyline.newChapter')
          break
        case 'renameChapter': {
          const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          if (!root) return
          void this.renameChapter(root, msg.relPath as string)
          break
        }
        case 'deleteChapter': {
          const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          if (!root) return
          void this.deleteChapter(root, msg.relPath as string)
          break
        }
        case 'reorderChapters': {
          const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          if (!root) return
          void this.reorderChapters(root, msg.orderedRelPaths as string[])
          break
        }
      }
    })

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.refresh()
    })
  }

  private refresh(): void {
    if (!this.view?.visible) return
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) return
    const { chapters, totalWords } = loadChapters(root, this.activeRelPath)
    const projectName = readProjectName(root)
    this.view.webview.postMessage({ type: 'chapters', chapters, totalWords, projectName })
  }

  private postActiveChapter(): void {
    this.view?.webview.postMessage({ type: 'activeChapter', relPath: this.activeRelPath ?? null })
  }

  private async renameChapter(root: string, relPath: string): Promise<void> {
    const current = getChapterTitle(root, relPath) ?? humanizeFilename(path.basename(relPath))
    const next = await vscode.window.showInputBox({
      title: 'Rename chapter',
      value: current,
      validateInput: v => v.trim() ? null : 'Title cannot be empty',
    })
    if (!next?.trim()) return
    const { setChapterTitle } = await import('../editor/chapter-titles.js')
    setChapterTitle(root, relPath, next.trim())
    this.refresh()
  }

  private async deleteChapter(root: string, relPath: string): Promise<void> {
    const title = getChapterTitle(root, relPath) ?? humanizeFilename(path.basename(relPath))
    const choice = await vscode.window.showWarningMessage(
      `Delete "${title}"? This cannot be undone.`,
      { modal: true },
      'Delete',
    )
    if (choice !== 'Delete') return
    try {
      fs.unlinkSync(path.join(root, relPath))
    } catch (err) {
      vscode.window.showErrorMessage(`Could not delete chapter: ${err instanceof Error ? err.message : err}`)
    }
    this.refresh()
  }

  private async reorderChapters(root: string, orderedRelPaths: string[]): Promise<void> {
    const msDir = path.join(root, 'manuscript')

    // Read current titles so we can remap keys after renaming
    const { readChapterTitles, setChapterTitle } = await import('../editor/chapter-titles.js')
    const oldTitles = readChapterTitles(root)

    // Step 1: rename every file to a collision-safe temp name
    const tempMap: { from: string; temp: string; finalName: string }[] = []
    orderedRelPaths.forEach((relPath, i) => {
      const filename = path.basename(relPath)
      const finalName = `chapter-${String(i + 1).padStart(2, '0')}.md`
      const tempName = `__sl_tmp_${i}__${filename}`
      tempMap.push({ from: path.join(msDir, filename), temp: path.join(msDir, tempName), finalName })
    })

    try {
      for (const { from, temp } of tempMap) {
        fs.renameSync(from, temp)
      }
      for (const { temp, finalName } of tempMap) {
        fs.renameSync(temp, path.join(msDir, finalName))
      }
    } catch (err) {
      // Attempt to roll back temp renames
      for (const { from, temp } of tempMap) {
        try { if (fs.existsSync(temp)) fs.renameSync(temp, from) } catch { /* best-effort */ }
      }
      vscode.window.showErrorMessage(`Storyline: chapter reorder failed — ${err instanceof Error ? err.message : err}`)
      this.refresh()
      return
    }

    // Step 2: remap chapter-titles.json to new filenames
    orderedRelPaths.forEach((oldRelPath, i) => {
      const newRelPath = path.join('manuscript', `chapter-${String(i + 1).padStart(2, '0')}.md`)
      const title = oldTitles[oldRelPath]
      if (title) setChapterTitle(root, newRelPath, title)
    })

    // Update activeRelPath if the active chapter was moved
    if (this.activeRelPath) {
      const oldIndex = orderedRelPaths.indexOf(this.activeRelPath)
      if (oldIndex !== -1) {
        this.activeRelPath = path.join('manuscript', `chapter-${String(oldIndex + 1).padStart(2, '0')}.md`)
      }
    }

    this.refresh()
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'manuscript.js'),
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'manuscript.css'),
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
