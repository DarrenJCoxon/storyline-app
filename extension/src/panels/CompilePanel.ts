import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { ensureCompileConfig, writeCompileConfig, type CompileConfig } from '../compile/compile-config.js'
import { runCompile, type CompileFormat } from '../compile/compile-runner.js'

export class CompilePanel {
  public static readonly viewType = 'storyline.compile'
  private static instance: CompilePanel | undefined

  private readonly panel: vscode.WebviewPanel
  private compiling = false

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
    initialFormat?: CompileFormat,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      CompilePanel.viewType,
      'Storyline — Compile',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    )

    this.panel.webview.html = this.getHtml(this.panel.webview)
    this.panel.webview.onDidReceiveMessage((msg: Record<string, unknown>) => this.handleMessage(msg))
    this.panel.onDidDispose(() => { CompilePanel.instance = undefined })

    // Send init after a tick so webview has time to mount
    setTimeout(() => this.sendInit(initialFormat), 200)
  }

  public static show(
    context: vscode.ExtensionContext,
    extensionUri: vscode.Uri,
    initialFormat?: CompileFormat,
  ): void {
    if (CompilePanel.instance) {
      CompilePanel.instance.panel.reveal(vscode.ViewColumn.One)
      if (initialFormat) {
        CompilePanel.instance.post({ type: 'setFormat', format: initialFormat })
      }
      return
    }
    CompilePanel.instance = new CompilePanel(context, extensionUri, initialFormat)
  }

  private sendInit(initialFormat?: CompileFormat): void {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) {
      this.post({ type: 'error', message: 'Open a Storyline project folder first.' })
      return
    }

    const config = ensureCompileConfig(projectDir)
    const projectMode = this.readProjectMode(projectDir)
    const chapters = this.listChapters(projectDir, config)

    this.post({ type: 'init', config, projectMode, chapters, initialFormat })
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type) {
      case 'compile':
        await this.handleCompile(msg)
        break
      case 'pickCoverImage':
        await this.handlePickCoverImage()
        break
      case 'openOutput': {
        const p = msg.outputPath as string
        if (p) await vscode.env.openExternal(vscode.Uri.file(p))
        break
      }
      case 'revealOutput': {
        const p = msg.outputPath as string
        if (p) await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(p))
        break
      }
      case 'openOutputFolder': {
        const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (projectDir) {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.join(projectDir, 'output')))
        }
        break
      }
    }
  }

  private async handleCompile(msg: Record<string, unknown>): Promise<void> {
    if (this.compiling) return
    this.compiling = true

    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) {
      this.post({ type: 'compileDone', success: false, error: 'No project folder open.' })
      this.compiling = false
      return
    }

    // Persist metadata changes before compiling
    const savedConfig = msg.config as CompileConfig | undefined
    if (savedConfig) {
      try { writeCompileConfig(projectDir, savedConfig) } catch { /* non-fatal */ }
    }

    const format = (msg.format as CompileFormat) ?? 'epub'

    this.post({ type: 'compileStart', format })

    try {
      const result = await runCompile({
        projectPath: projectDir,
        format,
        onProgress: phase => this.post({ type: 'compileProgress', phase }),
      })

      this.post({
        type: 'compileDone',
        success: true,
        outputPath: result.outputPath,
        bytes: result.bytes,
        warnings: result.warnings,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.post({ type: 'compileDone', success: false, error: message })
    } finally {
      this.compiling = false
    }
  }

  private async handlePickCoverImage(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { Images: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
      title: 'Select Cover Image',
    })
    if (uris?.length) {
      this.post({ type: 'coverImagePicked', coverPath: uris[0].fsPath })
    }
  }

  private listChapters(projectDir: string, config: CompileConfig): string[] {
    const msDir = path.join(projectDir, config.manuscript?.path ?? 'manuscript')
    try {
      return fs.readdirSync(msDir)
        .filter(f => /\.(md|markdown)$/i.test(f) && !f.startsWith('_') && f !== 'README.md')
        .sort()
    } catch {
      return []
    }
  }

  private readProjectMode(projectDir: string): 'fiction' | 'nonfiction' {
    try {
      const state = JSON.parse(fs.readFileSync(path.join(projectDir, '.storyline', 'state.json'), 'utf-8'))
      return state?.mode === 'nonfiction' ? 'nonfiction' : 'fiction'
    } catch {
      return 'fiction'
    }
  }

  private post(msg: Record<string, unknown>): void {
    this.panel.webview.postMessage(msg)
  }

  private getHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'compile.js'))
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'compile.css'))
    const nonce = getNonce()

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource} https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
