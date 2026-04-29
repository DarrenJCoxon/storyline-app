import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { WordCountStatusBar, countWords } from '../editor/word-count.js'
import { classifyDocumentRole } from '../editor/manuscript-path.js'

const AUTOSAVE_IDLE_MS = 1500

export class EditorPanel {
  public static readonly viewType = 'storyline.editor'

  private readonly livePanels = new Map<string, vscode.WebviewPanel>()
  private activeRichEditorUri: vscode.Uri | undefined
  private readonly statusBar: WordCountStatusBar
  private readonly _onDidChangeActiveRichEditor = new vscode.EventEmitter<void>()
  public readonly onDidChangeActiveRichEditor = this._onDidChangeActiveRichEditor.event

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
    statusBar: WordCountStatusBar,
  ) {
    this.statusBar = statusBar
  }

  public getActiveRichEditorUri(): vscode.Uri | undefined {
    return this.activeRichEditorUri
  }

  public async openForUri(uri: vscode.Uri, viewColumn?: vscode.ViewColumn): Promise<void> {
    const key = uri.toString()
    const existing = this.livePanels.get(key)
    if (existing) {
      existing.reveal(viewColumn ?? existing.viewColumn)
      return
    }

    let document: vscode.TextDocument
    try {
      document = await vscode.workspace.openTextDocument(uri)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      vscode.window.showErrorMessage(`Storyline: could not open ${uri.fsPath} — ${message}`)
      return
    }

    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri
    const panel = vscode.window.createWebviewPanel(
      EditorPanel.viewType,
      vscode.workspace.asRelativePath(uri),
      viewColumn ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: wsRoot ? [this.extensionUri, wsRoot] : [this.extensionUri],
      },
    )

    await this.attachToPanel(document, panel)
  }

  public async flushAll(): Promise<void> {
    for (const panel of this.livePanels.values()) {
      try { panel.webview.postMessage({ type: 'request-flush' }) } catch { /* disposed */ }
    }
    await new Promise(r => setTimeout(r, 200))
    const dirty = vscode.workspace.textDocuments.filter(d => d.isDirty && /\.(md|markdown)$/i.test(d.uri.fsPath))
    await Promise.all(dirty.map(d => d.save().then(() => undefined, () => undefined)))
  }

  private async attachToPanel(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
    const editorRole: 'manuscript' | 'supporting' = workspaceRoot
      ? await classifyDocumentRole(document.uri, workspaceRoot)
      : 'supporting'

    const font = this.context.globalState.get<'serif' | 'sans'>('storyline.editorFont', 'serif')
    const projectMode = this.readProjectMode()

    // Set the webview's base URL to the chapter's directory so relative
    // image paths in markdown (e.g. ../assets/foo.png) resolve correctly.
    const chapterDirUri = panel.webview.asWebviewUri(vscode.Uri.file(path.dirname(document.uri.fsPath))).toString()
    panel.webview.html = this.getHtml(panel.webview, chapterDirUri)

    const panelKey = document.uri.toString()
    this.livePanels.set(panelKey, panel)

    if (panel.active) {
      this.activeRichEditorUri = document.uri
    }

    const scrollKey = `editor-scroll:${panelKey}`
    const savedScrollY = this.context.workspaceState.get<number>(scrollKey) ?? 0
    let initialLoadSent = false

    const pushContent = () => {
      panel.webview.postMessage({
        type: 'load-content',
        markdown: document.getText(),
        fileName: vscode.workspace.asRelativePath(document.uri),
        restoreScrollY: initialLoadSent ? null : savedScrollY,
        font,
        projectMode,
      })
      initialLoadSent = true
    }

    let expectedContent: string | null = null
    // Per-line normalisation so VS Code's save-time whitespace cleanup
    // (files.trimTrailingWhitespace / files.insertFinalNewline) doesn't
    // look like a fresh edit and re-dirty the doc after the close-save
    // dialog has already accepted.
    const normalise = (s: string) =>
      s.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n+$/, '')

    let autoSaveTimer: ReturnType<typeof setTimeout> | undefined
    let saveInFlight = false
    let rerunAfterSave = false

    const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() !== panelKey) return
      // Don't push back during save — format-on-save reflows the doc and
      // would otherwise race the user's typing. Post-save we accept the new
      // text as the baseline (see runSave below).
      if (saveInFlight) return
      if (expectedContent !== null && normalise(document.getText()) === normalise(expectedContent)) return
      pushContent()
    })

    const runSave = async (): Promise<void> => {
      if (saveInFlight) { rerunAfterSave = true; return }
      saveInFlight = true
      panel.webview.postMessage({ type: 'saving' })
      try {
        // Truth is `document.isDirty`, not save()'s boolean. VS Code's
        // save() returns false for BOTH "save failed" AND "nothing to
        // save", so we can't use it as an error signal — that produced
        // false-positive "Save failed" banners on docs that had actually
        // saved. Drive everything off isDirty instead.
        if (document.isDirty) {
          await document.save()
          if (document.isDirty) {
            await new Promise(r => setTimeout(r, 100))
          }
          if (document.isDirty) {
            await document.save()
            if (document.isDirty) {
              await new Promise(r => setTimeout(r, 100))
            }
          }
          if (document.isDirty) {
            throw new Error('Save did not complete — the file may be read-only or locked.')
          }
        }
        // Adopt post-save text (after any format-on-save reflow) as the new baseline
        expectedContent = document.getText()
        panel.webview.postMessage({ type: 'saved' })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        panel.webview.postMessage({ type: 'save-failed', error: message })
      } finally {
        saveInFlight = false
        if (rerunAfterSave) { rerunAfterSave = false; setTimeout(runSave, 0) }
      }
    }

    const scheduleAutoSave = () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer)
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = undefined
        if (document.isDirty) void runSave()
      }, AUTOSAVE_IDLE_MS)
    }

    const viewStateSubscription = panel.onDidChangeViewState(() => {
      if (panel.active) {
        this.activeRichEditorUri = document.uri
        this.statusBar.setActiveFileWords(this.context.workspaceState.get<number>(`wc:${panelKey}`) ?? 0)
        this._onDidChangeActiveRichEditor.fire()
      } else {
        if (this.activeRichEditorUri?.toString() === panelKey) {
          this.activeRichEditorUri = undefined
          this.statusBar.setActiveFileWords(0)
          this._onDidChangeActiveRichEditor.fire()
        }
      }
    })

    panel.onDidDispose(() => {
      changeSubscription.dispose()
      viewStateSubscription.dispose()
      if (autoSaveTimer) clearTimeout(autoSaveTimer)
      this.livePanels.delete(panelKey)
      if (this.activeRichEditorUri?.toString() === panelKey) {
        this.activeRichEditorUri = undefined
        this.statusBar.setActiveFileWords(0)
      }
    })

    panel.webview.onDidReceiveMessage(async (msg: Record<string, unknown>) => {
      if (msg.type === 'ready') {
        expectedContent = document.getText()
        pushContent()
        panel.webview.postMessage({ type: 'editor-role', role: editorRole })
        return
      }

      if (msg.type === 'content-changed' && typeof msg.markdown === 'string') {
        if (msg.markdown === document.getText()) return
        const edit = new vscode.WorkspaceEdit()
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), msg.markdown)
        expectedContent = msg.markdown

        // Update word count
        const wc = countWords(msg.markdown)
        await this.context.workspaceState.update(`wc:${panelKey}`, wc)
        if (panel.active) this.statusBar.setActiveFileWords(wc)

        await vscode.workspace.applyEdit(edit)
        scheduleAutoSave()
        return
      }

      if (msg.type === 'save') {
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = undefined }
        if (typeof msg.markdown === 'string' && msg.markdown !== document.getText()) {
          const edit = new vscode.WorkspaceEdit()
          edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), msg.markdown)
          expectedContent = msg.markdown
          await vscode.workspace.applyEdit(edit)
        }
        void runSave()
        return
      }

      if (msg.type === 'flush-save' && typeof msg.markdown === 'string') {
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = undefined }
        if (msg.markdown !== document.getText()) {
          const edit = new vscode.WorkspaceEdit()
          edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), msg.markdown)
          expectedContent = msg.markdown
          await vscode.workspace.applyEdit(edit)
        }
        void runSave()
        return
      }

      if (msg.type === 'scroll-changed' && typeof msg.scrollY === 'number') {
        const clamped = Math.max(0, Math.round(msg.scrollY))
        if (this.context.workspaceState.get<number>(scrollKey) !== clamped) {
          await this.context.workspaceState.update(scrollKey, clamped)
        }
        return
      }

      if (msg.type === 'font-changed' && (msg.font === 'serif' || msg.font === 'sans')) {
        await this.context.globalState.update('storyline.editorFont', msg.font)
        return
      }

      if (msg.type === 'compose-mode') {
        try {
          await vscode.commands.executeCommand('workbench.action.toggleZenMode')
          if (msg.enabled) panel.reveal(panel.viewColumn, false)
        } catch { /* zen-mode unavailable */ }
        return
      }

      if (msg.type === 'openIllustrations') {
        await vscode.commands.executeCommand('storyline.illustrations')
        return
      }
    })
  }

  private readProjectMode(): 'fiction' | 'nonfiction' {
    const folders = vscode.workspace.workspaceFolders
    if (!folders?.length) return 'fiction'
    try {
      const statePath = path.join(folders[0].uri.fsPath, '.storyline', 'state.json')
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
      return state?.mode === 'nonfiction' ? 'nonfiction' : 'fiction'
    } catch {
      return 'fiction'
    }
  }

  private getHtml(webview: vscode.Webview, chapterDirUri: string): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'editor.js'))
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'editor.css'))
    const nonce = getNonce()
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} https:`,
    ].join('; ')

    // The trailing slash on <base> matters — relative image paths resolve
    // against the directory, not the file.
    const baseHref = chapterDirUri.endsWith('/') ? chapterDirUri : `${chapterDirUri}/`

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="${baseHref}">
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
