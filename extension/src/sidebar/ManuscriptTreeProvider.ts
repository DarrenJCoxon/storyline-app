import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { countWords } from '../editor/word-count.js'
import { getChapterTitle, humanizeFilename } from '../editor/chapter-titles.js'
import { readPins } from './research-pins.js'
import type { EditorPanel } from '../panels/EditorPanel.js'

function chapterSortOrder(filename: string): number {
  const m = filename.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 999
}

function formatWords(n: number): string {
  if (n >= 100_000) return `${Math.round(n / 1000)}k`
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

function readProjectName(root: string): string {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(root, '.storyline', 'state.json'), 'utf-8'))
    return (state?.projectName as string | undefined)?.trim() || path.basename(root)
  } catch {
    return path.basename(root)
  }
}

export class ManuscriptItem extends vscode.TreeItem {
  constructor(
    public readonly relPath: string | null,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemKind: 'header' | 'chapter',
    wordCount?: number,
    isActive?: boolean,
    researchCount?: number,
  ) {
    super(label, collapsibleState)

    if (itemKind === 'header') {
      this.contextValue = 'manuscriptHeader'
      this.description = wordCount && wordCount > 0 ? formatWords(wordCount) : undefined
    } else {
      this.contextValue = isActive ? 'chapterActive' : 'chapter'
      this.description = wordCount && wordCount > 0 ? formatWords(wordCount) : ''
      if (relPath) {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (root) {
          this.resourceUri = vscode.Uri.file(path.join(root, relPath))
        }
        this.command = {
          command: 'storyline.openEditor',
          title: 'Open',
          arguments: [this.resourceUri],
        }
      }
      if (isActive) {
        this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow'))
      } else {
        this.iconPath = new vscode.ThemeIcon('circle-outline')
      }
      if (researchCount && researchCount > 0) {
        this.tooltip = `${label} · ${researchCount} research note${researchCount !== 1 ? 's' : ''} attached`
      }
    }
  }
}

export class ManuscriptTreeProvider implements vscode.TreeDataProvider<ManuscriptItem> {
  public static readonly viewType = 'storyline.manuscript'

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>()
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private readonly watcher: vscode.FileSystemWatcher
  private activeRelPath: string | undefined

  constructor(
    private readonly editorPanel: EditorPanel,
    context: vscode.ExtensionContext,
  ) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/manuscript/**/*.{md,markdown}')
    this.watcher.onDidChange(() => this._onDidChangeTreeData.fire())
    this.watcher.onDidCreate(() => this._onDidChangeTreeData.fire())
    this.watcher.onDidDelete(() => this._onDidChangeTreeData.fire())
    context.subscriptions.push(this.watcher)

    editorPanel.onDidChangeActiveRichEditor(() => {
      const uri = editorPanel.getActiveRichEditorUri()
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (uri && wsRoot) {
        this.activeRelPath = path.relative(wsRoot, uri.fsPath)
      } else {
        this.activeRelPath = undefined
      }
      this._onDidChangeTreeData.fire()
    })
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  public getTreeItem(element: ManuscriptItem): vscode.TreeItem {
    return element
  }

  public getChildren(element?: ManuscriptItem): ManuscriptItem[] {
    if (element) return []

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) return []

    const manuscriptDir = path.join(root, 'manuscript')
    let files: string[] = []
    try {
      files = fs.readdirSync(manuscriptDir)
        .filter(f => /\.(md|markdown)$/i.test(f))
        .filter(f => !/^readme\.(md|markdown)$/i.test(f))
        .sort((a, b) => chapterSortOrder(a) - chapterSortOrder(b))
    } catch { /* no manuscript dir yet */ }

    const { chapterScoped } = readPins(root)

    let totalWords = 0
    const chapters = files.map((filename, i) => {
      const relPath = path.join('manuscript', filename)
      const absPath = path.join(root, relPath)
      let content = ''
      try { content = fs.readFileSync(absPath, 'utf-8') } catch { /* */ }
      const wc = countWords(content)
      totalWords += wc
      const title = getChapterTitle(root, relPath) ?? humanizeFilename(filename)
      const isActive = this.activeRelPath ? relPath === this.activeRelPath : false
      const researchCount = (chapterScoped[relPath] ?? []).length
      const item = new ManuscriptItem(relPath, title, vscode.TreeItemCollapsibleState.None, 'chapter', wc, isActive, researchCount)
      return item
    })

    const projectName = readProjectName(root)
    const header = new ManuscriptItem(null, projectName.toUpperCase(), vscode.TreeItemCollapsibleState.None, 'header', totalWords)

    return [header, ...chapters]
  }
}
