import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

const ROOT_FOLDERS = ['planning', 'research', 'manuscript', 'output'] as const

// Virtual folders that appear inside `output/` as if they lived there but
// actually map to the real generated-image folders under `assets/`. Keeps
// the on-disk layout untouched while giving the writer a single "all the
// outputs" tree.
const OUTPUT_VIRTUAL_CHILDREN: ReadonlyArray<{ label: string; relPath: string }> = [
  { label: 'Cover Art',     relPath: path.join('assets', 'covers') },
  { label: 'Illustrations', relPath: path.join('assets', 'illustrations') },
]

export class FileNode extends vscode.TreeItem {
  constructor(
    public readonly absPath: string,
    public readonly kind: 'folder' | 'file',
    public readonly isRoot: boolean,
    displayLabel?: string,
  ) {
    const name = displayLabel ?? path.basename(absPath)
    super(
      name,
      kind === 'folder' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    )
    this.resourceUri = vscode.Uri.file(absPath)
    // When a display label is set we still want a folder/file glyph, but the
    // resourceUri-derived label would override our custom one. Keep label
    // explicit and use iconPath instead.
    if (displayLabel) {
      this.iconPath = vscode.ThemeIcon.Folder
    }
    this.contextValue = isRoot ? 'storyline.fileRoot' : kind === 'folder' ? 'storyline.folder' : 'storyline.file'
    if (kind === 'file') {
      this.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [this.resourceUri],
      }
    }
  }
}

export class FilesTreeProvider implements vscode.TreeDataProvider<FileNode> {
  public static readonly viewType = 'storyline.files'

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<FileNode | undefined | void>()
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private readonly watcher: vscode.FileSystemWatcher

  constructor(context: vscode.ExtensionContext) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*')
    const refresh = (): void => this._onDidChangeTreeData.fire()
    this.watcher.onDidCreate(refresh)
    this.watcher.onDidDelete(refresh)
    this.watcher.onDidChange(refresh)
    context.subscriptions.push(this.watcher)
  }

  public getTreeItem(element: FileNode): vscode.TreeItem {
    return element
  }

  public getChildren(element?: FileNode): FileNode[] {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) return []

    if (!element) {
      return ROOT_FOLDERS
        .map(name => path.join(root, name))
        .filter(p => safeExists(p))
        .map(p => new FileNode(p, 'folder', true))
    }

    if (element.kind !== 'folder') return []

    const entries = readDirSafe(element.absPath)
      .filter(e => !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      })
      .map(e => new FileNode(
        path.join(element.absPath, e.name),
        e.isDirectory() ? 'folder' : 'file',
        false,
      ))

    // Inject virtual Cover Art / Illustrations folders at the top of `output/`.
    // Skip any virtual whose backing folder doesn't exist or is empty.
    if (element.isRoot && path.basename(element.absPath) === 'output') {
      const virtuals: FileNode[] = []
      for (const v of OUTPUT_VIRTUAL_CHILDREN) {
        const abs = path.join(root, v.relPath)
        if (!safeExists(abs)) continue
        if (readDirSafe(abs).filter(e => !e.name.startsWith('.')).length === 0) continue
        virtuals.push(new FileNode(abs, 'folder', false, v.label))
      }
      return [...virtuals, ...entries]
    }

    return entries
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire()
  }
}

function readDirSafe(p: string): fs.Dirent[] {
  try { return fs.readdirSync(p, { withFileTypes: true }) } catch { return [] }
}

function safeExists(p: string): boolean {
  try { return fs.existsSync(p) } catch { return false }
}
