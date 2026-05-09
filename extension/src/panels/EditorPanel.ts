import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { WordCountStatusBar, countWords } from '../editor/word-count.js'
import { classifyDocumentRole } from '../editor/manuscript-path.js'
import { getChapterTitle, setChapterTitle, humanizeFilename } from '../editor/chapter-titles.js'
import { setActiveChapterRelPath } from '../editor/active-chapter.js'
import { logWarn } from '../diagnostic-log.js'
import { transcribeAudio } from '../transcribe-helper.js'
import { LicenceManager } from '../auth/licence.js'

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

  private syncActiveChapter(): void {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (this.activeRichEditorUri && wsRoot) {
      setActiveChapterRelPath(path.relative(wsRoot, this.activeRichEditorUri.fsPath))
    } else {
      setActiveChapterRelPath(undefined)
    }
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
    const bookType = this.readBookType()

    // Set the webview's base URL to the chapter's directory so relative
    // image paths in markdown (e.g. ../assets/foo.png) resolve correctly.
    const chapterDirUri = panel.webview.asWebviewUri(vscode.Uri.file(path.dirname(document.uri.fsPath))).toString()
    panel.webview.html = this.getHtml(panel.webview, chapterDirUri)

    const panelKey = document.uri.toString()
    this.livePanels.set(panelKey, panel)

    if (panel.active) {
      this.activeRichEditorUri = document.uri
      this.syncActiveChapter()
    }

    const scrollKey = `editor-scroll:${panelKey}`
    const savedScrollY = this.context.workspaceState.get<number>(scrollKey) ?? 0
    let initialLoadSent = false

    const wsRootFsPath = workspaceRoot?.fsPath ?? null
    const relPath = wsRootFsPath
      ? path.relative(wsRootFsPath, document.uri.fsPath)
      : path.basename(document.uri.fsPath)
    const chapterTitleDefault = humanizeFilename(path.basename(document.uri.fsPath))

    const pushContent = () => {
      const chapterTitle = wsRootFsPath ? getChapterTitle(wsRootFsPath, relPath) : null
      panel.webview.postMessage({
        type: 'load-content',
        markdown: document.getText(),
        fileName: vscode.workspace.asRelativePath(document.uri),
        restoreScrollY: initialLoadSent ? null : savedScrollY,
        font,
        projectMode,
        bookType,
        chapterTitle,
        chapterTitleDefault,
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

    // Serialize document.replace operations. Multiple flush-save messages can
    // arrive in the same close event (beforeunload + pagehide + visibilitychange
    // all fire the flush handler). The async message handler doesn't naturally
    // serialize: each call captures `document.lineCount` synchronously before
    // awaiting applyEdit, so concurrent calls compute STALE ranges. When the
    // document grew between captures, the second replace overwrites only the
    // first N lines, leaving the tail of the earlier-applied content untouched
    // — that is the source of "tail of last paragraph duplicated" on close+reload.
    // The chain ensures each replace runs against the live document state.
    let editChain: Promise<void> = Promise.resolve()
    const replaceDocumentContent = (markdown: string): Promise<void> => {
      const next = editChain.then(async () => {
        if (markdown === document.getText()) return
        const edit = new vscode.WorkspaceEdit()
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), markdown)
        expectedContent = markdown
        await vscode.workspace.applyEdit(edit)
      }).catch(err => {
        // Don't poison the chain if a single edit throws.
        logWarn('[Storyline] replaceDocumentContent failed:', err)
      })
      editChain = next
      return next
    }

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
        this.syncActiveChapter()
        this._onDidChangeActiveRichEditor.fire()
      } else {
        if (this.activeRichEditorUri?.toString() === panelKey) {
          this.activeRichEditorUri = undefined
          this.statusBar.setActiveFileWords(0)
          this.syncActiveChapter()
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
        this.syncActiveChapter()
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
        const md = msg.markdown
        // Update word count synchronously off the new markdown.
        const wc = countWords(md)
        await this.context.workspaceState.update(`wc:${panelKey}`, wc)
        if (panel.active) this.statusBar.setActiveFileWords(wc)

        await replaceDocumentContent(md)
        scheduleAutoSave()
        return
      }

      if (msg.type === 'save') {
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = undefined }
        if (typeof msg.markdown === 'string') {
          await replaceDocumentContent(msg.markdown)
        }
        void runSave()
        return
      }

      if (msg.type === 'flush-save' && typeof msg.markdown === 'string') {
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = undefined }
        await replaceDocumentContent(msg.markdown)
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

      // CB-12: voice dictation in the editor. Webview captures audio via
      // MediaRecorder, posts here as base64 + mimeType. We forward to
      // /transcribe and post the result back; webview inserts at cursor.
      if (msg.type === 'transcribeAudio'
          && typeof msg.audioBase64 === 'string'
          && typeof msg.mimeType === 'string') {
        const backendUrl = vscode.workspace.getConfiguration('storyline')
          .get<string>('backendUrl', 'https://api.storyline.my')
          .replace(/\/$/, '')
        const licenceManager = new LicenceManager(this.context, backendUrl)
        const licenceKey = await licenceManager.getLicenceKey()
        if (!licenceKey) {
          panel.webview.postMessage({ type: 'transcribeError', message: 'No licence key — activate Storyline first.' })
          return
        }
        const result = await transcribeAudio(backendUrl, {
          licenceKey,
          audioBase64: msg.audioBase64,
          mimeType: msg.mimeType,
        })
        if (result.ok) {
          panel.webview.postMessage({ type: 'transcribeResult', text: result.text })
        } else {
          panel.webview.postMessage({ type: 'transcribeError', message: result.error })
        }
        return
      }

      // CB-12 (cont): permission-denied toast with deep-link to OS settings.
      // Mirrors ChatPanel's handler — kept inline here rather than extracted
      // because the surface is small and panels evolve at different rates.
      if (msg.type === 'micPermissionDenied') {
        const platform = process.platform
        const settingsUrl =
          platform === 'darwin' ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
          : platform === 'win32' ? 'ms-settings:privacy-microphone'
          : 'about:blank'
        const action = platform === 'linux' ? undefined : 'Open System Settings'
        const message = platform === 'darwin'
          ? 'Microphone access is blocked. Open System Settings → Privacy & Security → Microphone, enable Visual Studio Code, then restart VS Code.'
          : platform === 'win32'
          ? 'Microphone access is blocked. Open Windows Settings → Privacy & security → Microphone, enable apps, then restart VS Code.'
          : 'Microphone access is blocked. Enable mic access for VS Code in your system settings, then restart VS Code.'
        const picked = action
          ? await vscode.window.showErrorMessage(message, action)
          : (vscode.window.showErrorMessage(message), undefined)
        if (picked === action && action) {
          await vscode.env.openExternal(vscode.Uri.parse(settingsUrl))
        }
        return
      }

      if (msg.type === 'save-chapter-title' && typeof msg.title === 'string' && wsRootFsPath) {
        setChapterTitle(wsRootFsPath, relPath, msg.title)
        return
      }

      if (msg.type === 'importImageFromEditor' && typeof msg.dataBase64 === 'string') {
        // Webview can't write to disk, so we accept the image bytes here,
        // strip EXIF, save into assets/illustrations/, and reply with the
        // chapter-relative markdown reference for the editor to insert.
        const projectDir = wsRootFsPath
        if (!projectDir) return
        try {
          const ext = (typeof msg.ext === 'string' ? msg.ext.toLowerCase() : '.png').replace(/^\.jpeg$/, '.jpg')
          const safeExt = /^\.(jpg|png|webp)$/.test(ext) ? ext : '.png'
          const buf = Buffer.from(msg.dataBase64 as string, 'base64')
          const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8)
          const baseName = (typeof msg.suggestedName === 'string' ? msg.suggestedName : 'pasted')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'pasted'
          const filename = `${Date.now()}-${baseName}-${hash}${safeExt}`
          const targetDir = path.join(projectDir, 'assets', 'illustrations')
          fs.mkdirSync(targetDir, { recursive: true })
          const targetPath = path.join(targetDir, filename)

          // Strip EXIF + downscale, falling back to a raw write if sharp
          // isn't available on this platform.
          try {
            const { default: sharp } = await import('sharp') as { default: typeof import('sharp') }
            const meta = await sharp(buf).metadata()
            const longest = Math.max(meta.width ?? 0, meta.height ?? 0)
            const pipe = sharp(buf, { failOn: 'none' }).rotate()
            if (longest > 4000) {
              const fit = (meta.width ?? 0) >= (meta.height ?? 0) ? { width: 4000 } : { height: 4000 }
              pipe.resize(fit)
            }
            if (safeExt === '.png') await pipe.png().toFile(targetPath)
            else if (safeExt === '.webp') await pipe.webp({ quality: 92 }).toFile(targetPath)
            else await pipe.jpeg({ quality: 92, mozjpeg: true }).toFile(targetPath)
          } catch {
            fs.writeFileSync(targetPath, buf)
          }

          const chapterDir = path.dirname(document.uri.fsPath)
          const relImg = path.relative(chapterDir, targetPath).split(path.sep).join('/')
          panel.webview.postMessage({
            type: 'imageImported',
            requestId: msg.requestId,
            src: relImg,
            absolutePath: targetPath,
            filename,
          })
        } catch (err) {
          panel.webview.postMessage({
            type: 'imageImportFailed',
            requestId: msg.requestId,
            error: err instanceof Error ? err.message : String(err),
          })
        }
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

  private readBookType(): 'novel' | 'picture-book' {
    const folders = vscode.workspace.workspaceFolders
    if (!folders?.length) return 'novel'
    try {
      const cfgPath = path.join(folders[0].uri.fsPath, 'compile.config.json')
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
      return cfg?.bookType === 'picture-book' ? 'picture-book' : 'novel'
    } catch {
      return 'novel'
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
