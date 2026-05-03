import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

type GitHubStatus = 'connected' | 'paused' | 'disconnected'

function readGitHubStatus(root: string): GitHubStatus {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.storyline', 'github.json'), 'utf-8')) as { paused?: boolean; remote?: string }
    if (!cfg.remote) return 'disconnected'
    return cfg.paused ? 'paused' : 'connected'
  } catch {
    return 'disconnected'
  }
}

const GROUPS: Array<{
  label: string
  icon: string
  items: Array<{ label: string; icon: string; command: string; description?: string }>
}> = [
  {
    label: 'Compile',
    icon: 'book',
    items: [
      { label: 'Export to EPUB',       icon: 'file-zip',    command: 'storyline.compileEpub' },
      { label: 'Export to PDF',         icon: 'file-pdf',    command: 'storyline.compilePdf' },
      { label: 'Live preview',          icon: 'eye',         command: 'storyline.openLivePreview' },
      { label: 'Print preview',         icon: 'preview',     command: 'storyline.openPreview' },
      { label: 'Open output folder',    icon: 'folder-opened', command: 'storyline.openOutputFolder' },
    ],
  },
  {
    label: 'Cover & illustrations',
    icon: 'paintcan',
    items: [
      { label: 'Generate cover',        icon: 'symbol-color', command: 'storyline.generateCover' },
      { label: 'Illustrations',         icon: 'image',        command: 'storyline.illustrations' },
      { label: 'Edit book info',        icon: 'info',         command: 'storyline.editBookInfo' },
    ],
  },
  {
    label: 'Backup & sync',
    icon: 'cloud-upload',
    items: [
      { label: 'Back up now',           icon: 'save',         command: 'storyline.backupNow' },
      { label: 'Connect to GitHub',     icon: 'github',       command: 'storyline.github.connect' },
      { label: 'Sync now',              icon: 'sync',         command: 'storyline.github.syncNow' },
      { label: 'Open repo in browser',  icon: 'link-external', command: 'storyline.github.openInBrowser' },
    ],
  },
  {
    label: 'Settings',
    icon: 'settings-gear',
    items: [
      { label: 'Top up credits',        icon: 'credit-card',  command: 'storyline.topUpCredits' },
      { label: 'View purchases',        icon: 'tag',          command: 'storyline.viewPurchases' },
      { label: 'Enter licence key',     icon: 'key',          command: 'storyline.enterLicenceKey' },
      { label: 'Check for updates',     icon: 'cloud-download', command: 'storyline.checkForUpdate' },
    ],
  },
]

export class ProjectItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    iconId?: string,
    description?: string,
  ) {
    super(label, collapsibleState)
    if (iconId) this.iconPath = new vscode.ThemeIcon(iconId)
    if (description) this.description = description
  }
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<ProjectItem> {
  public static readonly viewType = 'storyline.actions'

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ProjectItem | undefined | void>()
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private readonly watcher: vscode.FileSystemWatcher

  constructor(private readonly context: vscode.ExtensionContext) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/.storyline/github.json')
    this.watcher.onDidChange(() => this._onDidChangeTreeData.fire())
    this.watcher.onDidCreate(() => this._onDidChangeTreeData.fire())
    this.watcher.onDidDelete(() => this._onDidChangeTreeData.fire())
    context.subscriptions.push(this.watcher)
  }

  public getTreeItem(element: ProjectItem): vscode.TreeItem {
    return element
  }

  public getChildren(element?: ProjectItem): ProjectItem[] {
    if (!element) {
      return GROUPS.map(g => new ProjectItem(g.label, vscode.TreeItemCollapsibleState.Collapsed, undefined, g.icon))
    }

    const group = GROUPS.find(g => g.label === element.label)
    if (!group) return []

    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath

    return group.items
      .filter(item => {
        // Hide GitHub items (except Connect) when there's no git repo
        if (item.command === 'storyline.github.syncNow' || item.command === 'storyline.github.openInBrowser') {
          if (!root) return false
          return readGitHubStatus(root) !== 'disconnected'
        }
        return true
      })
      .map(item => {
        let description: string | undefined
        if (item.command === 'storyline.github.connect' && root) {
          const status = readGitHubStatus(root)
          if (status === 'connected') description = 'connected'
          else if (status === 'paused') description = 'paused'
        }
        return new ProjectItem(
          item.label,
          vscode.TreeItemCollapsibleState.None,
          { title: item.label, command: item.command },
          item.icon,
          description,
        )
      })
  }
}
