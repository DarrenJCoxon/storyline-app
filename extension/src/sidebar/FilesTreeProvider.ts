import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

const ROOT_FOLDERS = ['planning', 'research', 'manuscript', 'output'] as const

export class FileNode extends vscode.TreeItem {
  constructor(
    public readonly absPath: string,
    public readonly kind: 'folder' | 'file',
    public readonly isRoot: boolean,
  ) {
    const name = path.basename(absPath)
    const label = isRoot ? name : name
    super(
      label,
      kind === 'folder' ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    )
    this.resourceUri = vscode.Uri.file(absPath)
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

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(element.absPath, { withFileTypes: true })
    } catch {
      return []
    }

    return entries
      .filter(e => !e.name.startsWith('.'))
      .sort((a, b) => {
        // Folders first, then files; alphabetical within each group
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      })
      .map(e => new FileNode(
        path.join(element.absPath, e.name),
        e.isDirectory() ? 'folder' : 'file',
        false,
      ))
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire()
  }
}

function safeExists(p: string): boolean {
  try { return fs.existsSync(p) } catch { return false }
}
