import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

const PLAN_FOLDERS = ['planning', 'docs']

export class PlanningItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly absPath: string,
    public readonly isFile: boolean,
  ) {
    super(label, collapsibleState)
    this.resourceUri = vscode.Uri.file(absPath)

    if (isFile) {
      this.iconPath = vscode.ThemeIcon.File
      this.command = {
        command: 'storyline.openEditor',
        title: 'Open',
        arguments: [vscode.Uri.file(absPath)],
      }
    } else {
      this.iconPath = vscode.ThemeIcon.Folder
    }
  }
}

function scanDir(dir: string, depth = 0): PlanningItem[] {
  const items: PlanningItem[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return items
  }

  const dirs = entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
  const files = entries
    .filter(e => e.isFile() && /\.(md|markdown)$/i.test(e.name) && !/^readme\.(md|markdown)$/i.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const d of dirs) {
    const absPath = path.join(dir, d.name)
    const children = scanDir(absPath, depth + 1)
    if (children.length > 0) {
      const label = d.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      items.push(new PlanningItem(label, vscode.TreeItemCollapsibleState.Collapsed, absPath, false))
    }
  }

  for (const f of files) {
    const absPath = path.join(dir, f.name)
    const label = f.name.replace(/\.(md|markdown)$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    items.push(new PlanningItem(label, vscode.TreeItemCollapsibleState.None, absPath, true))
  }

  return items
}

export class PlanningTreeProvider implements vscode.TreeDataProvider<PlanningItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>()
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private readonly watcher: vscode.FileSystemWatcher

  constructor(context: vscode.ExtensionContext) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/{planning,docs}/**/*.{md,markdown}')
    this.watcher.onDidChange(() => this._onDidChangeTreeData.fire())
    this.watcher.onDidCreate(() => this._onDidChangeTreeData.fire())
    this.watcher.onDidDelete(() => this._onDidChangeTreeData.fire())
    context.subscriptions.push(this.watcher)
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(item: PlanningItem): vscode.TreeItem {
    return item
  }

  getChildren(element?: PlanningItem): PlanningItem[] {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!root) return []

    // Expanding a directory node
    if (element && !element.isFile) {
      return scanDir(element.absPath)
    }

    // Top-level: merge contents of planning/ and docs/ — if both exist,
    // show each as a named folder; if only one, show its contents directly
    const existing = PLAN_FOLDERS.filter(f => {
      try { return fs.statSync(path.join(root, f)).isDirectory() } catch { return false }
    })

    if (existing.length === 0) return []

    if (existing.length === 1) {
      // Single folder — show contents directly, no wrapper node
      return scanDir(path.join(root, existing[0]))
    }

    // Both exist — show as top-level folder nodes
    return existing.map(f => {
      const absPath = path.join(root, f)
      const label = f.charAt(0).toUpperCase() + f.slice(1)
      return new PlanningItem(label, vscode.TreeItemCollapsibleState.Expanded, absPath, false)
    })
  }
}
