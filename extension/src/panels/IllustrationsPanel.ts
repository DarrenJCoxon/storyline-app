import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { generateImage, IMAGE_CREDIT_COST } from '../illustration/image-generator.js'
import {
  readStyleBible, writeStyleBible, buildStyleBiblePrompt,
  readRefs, addRef, removeRef, characterIdFor,
  type StyleBible,
} from '../illustration/style-bible.js'
import { LicenceManager } from '../auth/licence.js'
import type { EditorPanel } from './EditorPanel.js'

function getBackendUrl(): string { return vscode.workspace.getConfiguration("storyline").get<string>("backendUrl", "https://api.storyline.app").replace(/\/$/, "") }
const ILLUSTRATIONS_DIR = 'assets/illustrations'

export class IllustrationsPanel {
  public static readonly viewType = 'storyline.illustrations'
  private static instance: IllustrationsPanel | undefined

  private readonly panel: vscode.WebviewPanel
  private readonly licenceManager: LicenceManager
  private generating = false

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
    private readonly editorPanel?: EditorPanel,
  ) {
    this.licenceManager = new LicenceManager(context, getBackendUrl())

    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
    this.panel = vscode.window.createWebviewPanel(
      IllustrationsPanel.viewType,
      'Storyline — Illustrations',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          extensionUri,
          ...(workspaceUri ? [workspaceUri] : []),
        ],
      },
    )

    this.panel.webview.html = this.getHtml(this.panel.webview)
    this.panel.webview.onDidReceiveMessage((msg: Record<string, unknown>) => this.handleMessage(msg))
    this.panel.onDidDispose(() => { IllustrationsPanel.instance = undefined })

    setTimeout(() => this.sendInit(), 200)
  }

  public static show(context: vscode.ExtensionContext, extensionUri: vscode.Uri, editorPanel?: EditorPanel): void {
    if (IllustrationsPanel.instance) {
      IllustrationsPanel.instance.panel.reveal(vscode.ViewColumn.One)
      return
    }
    IllustrationsPanel.instance = new IllustrationsPanel(context, extensionUri, editorPanel)
  }

  private sendInit(): void {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) { this.post({ type: 'error', message: 'Open a Storyline project folder first.' }); return }

    this.post({
      type: 'init',
      illustrations: this.listIllustrations(projectDir),
      creditCost: IMAGE_CREDIT_COST,
      styleBible: readStyleBible(projectDir),
      refs: this.serialiseRefs(projectDir),
    })
  }

  private listIllustrations(projectDir: string): Array<{ filename: string; uri: string; absolutePath: string; isRef?: boolean; refKind?: string }> {
    const dir = path.join(projectDir, ILLUSTRATIONS_DIR)
    const refs = readRefs(projectDir)
    const refByPath = new Map(refs.map(r => [r.absolutePath, r]))
    try {
      return fs.readdirSync(dir)
        .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
        .sort()
        .map(filename => {
          const abs = path.join(dir, filename)
          const ref = refByPath.get(abs)
          return {
            filename,
            uri: this.assetUri(path.join(ILLUSTRATIONS_DIR, filename)),
            absolutePath: abs,
            isRef: !!ref,
            refKind: ref?.kind,
          }
        })
    } catch {
      return []
    }
  }

  private serialiseRefs(projectDir: string): Array<{ filename: string; uri: string; absolutePath: string; kind: string; characterId?: string }> {
    return readRefs(projectDir).map(r => ({
      filename: r.filename,
      uri: this.assetUri(path.relative(projectDir, r.absolutePath).split(path.sep).join('/')),
      absolutePath: r.absolutePath,
      kind: r.kind,
      characterId: r.characterId,
    }))
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type) {
      case 'generate':
        await this.handleGenerate(msg)
        break
      case 'deleteFile': {
        const p = msg.absolutePath as string
        if (p) { try { fs.unlinkSync(p) } catch { /* ignore */ } }
        const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (projectDir) this.post({ type: 'init', illustrations: this.listIllustrations(projectDir), creditCost: IMAGE_CREDIT_COST })
        break
      }
      case 'openFile': {
        const p = msg.absolutePath as string
        if (p && fs.existsSync(p)) await vscode.env.openExternal(vscode.Uri.file(p))
        break
      }
      case 'insertIntoChapter': {
        await this.handleInsertIntoChapter(msg)
        break
      }
      case 'saveStyleBible': {
        const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (!projectDir) return
        const incoming = msg.styleBible as Partial<StyleBible> | undefined
        const next: StyleBible = {
          characters: (incoming?.characters ?? []).map(c => ({
            id: c.id || characterIdFor(c.name),
            name: c.name ?? '',
            description: c.description ?? '',
            isProtagonist: !!c.isProtagonist,
          })).filter(c => c.name.trim() && c.description.trim()),
          artStyle: incoming?.artStyle ?? '',
          palette: incoming?.palette ?? '',
          tone: incoming?.tone ?? '',
        }
        writeStyleBible(projectDir, next)
        this.post({ type: 'styleBibleSaved', styleBible: next })
        break
      }
      case 'setRef': {
        const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (!projectDir) return
        const abs = msg.absolutePath as string
        const filename = msg.filename as string
        const kind = (msg.kind === 'character' || msg.kind === 'style' || msg.kind === 'scene') ? msg.kind : 'character'
        const characterId = typeof msg.characterId === 'string' ? msg.characterId : undefined
        if (!abs || !fs.existsSync(abs)) return
        addRef(projectDir, { absolutePath: abs, filename, kind, characterId })
        this.post({
          type: 'refsUpdated',
          illustrations: this.listIllustrations(projectDir),
          refs: this.serialiseRefs(projectDir),
        })
        break
      }
      case 'unsetRef': {
        const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (!projectDir) return
        const abs = msg.absolutePath as string
        if (!abs) return
        removeRef(projectDir, abs)
        this.post({
          type: 'refsUpdated',
          illustrations: this.listIllustrations(projectDir),
          refs: this.serialiseRefs(projectDir),
        })
        break
      }
    }
  }

  private async handleGenerate(msg: Record<string, unknown>): Promise<void> {
    if (this.generating) return
    this.generating = true

    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) { this.generating = false; return }

    const userPrompt = msg.prompt as string
    const slug = String(msg.slug ?? 'illustration')
    const width = Number(msg.width) || 1024
    const height = Number(msg.height) || 1024
    const generationSize = String(msg.generationSize || `${width}x${height}`)
    const aspectRatio = msg.aspectRatio ? String(msg.aspectRatio) : undefined
    const quality = (msg.quality === 'low' || msg.quality === 'medium' || msg.quality === 'high')
      ? msg.quality
      : 'medium'
    const lockToRefs = msg.lockToRefs !== false  // default true — that's the point of refs
    const filename = `${Date.now()}-${slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}.jpg`

    // Auto-prepend the style bible to every prompt (consistency across the
    // whole illustrated book). User can still override anything in the
    // prompt textarea — bible just provides defaults.
    const bible = readStyleBible(projectDir)
    const prefix = buildStyleBiblePrompt(bible)
    const prompt = prefix ? `${prefix}SCENE: ${userPrompt}` : userPrompt

    // Pass character/style refs to /v1/images/edits when locked.
    const allRefs = readRefs(projectDir)
    const referenceImagePaths = lockToRefs
      ? allRefs.map(r => ({ path: r.absolutePath, label: r.kind as 'character' | 'style' | 'scene' }))
      : []

    this.post({ type: 'progress', phase: `Generating ${quality} illustration${referenceImagePaths.length ? ` with ${referenceImagePaths.length} ref${referenceImagePaths.length === 1 ? '' : 's'}` : ''}…` })
    try {
      await generateImage({
        prompt,
        width, height,
        generationSize,
        aspectRatio,
        quality,
        referenceImagePaths,
        inputFidelity: referenceImagePaths.length > 0 ? 'high' : undefined,
        outputPath: path.join(ILLUSTRATIONS_DIR, filename),
        projectDir,
        backendUrl: getBackendUrl(),
        licenceManager: this.licenceManager,
      })
      this.post({
        type: 'generated',
        illustration: {
          filename,
          uri: this.assetUri(path.join(ILLUSTRATIONS_DIR, filename)),
          absolutePath: path.join(projectDir, ILLUSTRATIONS_DIR, filename),
        },
      })
    } catch (err) {
      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      this.generating = false
    }
  }

  private async handleInsertIntoChapter(msg: Record<string, unknown>): Promise<void> {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) return

    const absolutePath = msg.absolutePath as string
    const filename = msg.filename as string
    if (!absolutePath || !filename) return

    // Resolve the target chapter via several fallbacks so this works regardless
    // of whether the rich editor (webview), a text editor, or nothing is active.
    const chapterUri = await this.resolveTargetChapter()
    if (!chapterUri) return

    // Ask where to place it — native QuickPick keeps the webview clean.
    const placementChoice = await vscode.window.showQuickPick(
      [
        { label: '$(arrow-down) At cursor', description: 'Insert at the current writing position', value: 'cursor' as const },
        { label: '$(book) As chapter opener', description: 'Right after the chapter title (H1)', value: 'opener' as const },
        { label: '$(fold-down) At end of chapter', description: 'Append to the end of the file', value: 'end' as const },
      ],
      { title: `Place ${filename} where?`, placeHolder: 'Pick a position' },
    )
    if (!placementChoice) return
    const placement = placementChoice.value

    const document = await vscode.workspace.openTextDocument(chapterUri)
    const chapterDir = path.dirname(chapterUri.fsPath)
    const relPath = path.relative(chapterDir, absolutePath).split(path.sep).join('/')
    const altText = filename.replace(/\.\w+$/, '').replace(/^[\d-]+/, '').replace(/-/g, ' ').trim() || 'illustration'
    const markdown = `\n![${altText}](${relPath})\n\n`

    let insertPos: vscode.Position
    if (placement === 'opener') {
      // After the first H1 line — common chapter-image placement
      const text = document.getText()
      const h1Match = /^# .+$/m.exec(text)
      if (h1Match) {
        insertPos = document.positionAt(h1Match.index + h1Match[0].length)
      } else {
        insertPos = new vscode.Position(0, 0)
      }
    } else if (placement === 'end') {
      insertPos = new vscode.Position(document.lineCount, 0)
    } else {
      // Cursor: only meaningful when a text editor is open on this file
      const activeEditor = vscode.window.activeTextEditor
      if (activeEditor && activeEditor.document.uri.toString() === chapterUri.toString()) {
        insertPos = activeEditor.selection.active
      } else {
        // Fall back to end of document — rich editor cursor isn't exposed to host
        insertPos = new vscode.Position(document.lineCount, 0)
      }
    }

    const edit = new vscode.WorkspaceEdit()
    edit.insert(chapterUri, insertPos, markdown)
    await vscode.workspace.applyEdit(edit)
    await document.save()

    vscode.window.showInformationMessage(`Inserted ${filename} into ${path.basename(chapterUri.fsPath)}.`)
  }

  private async resolveTargetChapter(): Promise<vscode.Uri | undefined> {
    // 1) Rich-editor active tab (webview) — exposed by EditorPanel
    const richUri = this.editorPanel?.getActiveRichEditorUri()
    if (richUri && /\.md$/i.test(richUri.fsPath)) return richUri

    // 2) Active markdown text editor (plain editor mode)
    const ate = vscode.window.activeTextEditor
    if (ate && /\.md$/i.test(ate.document.fileName)) return ate.document.uri

    // 3) Visible markdown text editor
    const visible = vscode.window.visibleTextEditors.find(e => /\.md$/i.test(e.document.fileName))
    if (visible) return visible.document.uri

    // 4) Quick-pick from manuscript chapters
    const files = await vscode.workspace.findFiles('manuscript/**/*.{md,markdown}')
    if (files.length === 0) {
      vscode.window.showWarningMessage('No chapter files found in manuscript/. Create one first via "Storyline: New Chapter".')
      return undefined
    }
    if (files.length === 1) return files[0]

    const items = files.map(f => ({
      label: path.basename(f.fsPath),
      description: vscode.workspace.asRelativePath(f),
      uri: f,
    }))
    const picked = await vscode.window.showQuickPick(items, {
      title: 'Insert image into which chapter?',
      placeHolder: 'Pick a chapter file',
    })
    return picked?.uri
  }

  private assetUri(relativePath: string): string {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) return ''
    const base = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(projectDir, relativePath))).toString()
    return `${base}?t=${Date.now()}`
  }

  private post(msg: Record<string, unknown>): void {
    this.panel.webview.postMessage(msg)
  }

  private getHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'illustrations.js'))
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'illustrations.css'))
    const nonce = getNonce()
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} data: blob:`,
      `script-src 'nonce-${nonce}' ${webview.cspSource}`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} https:`,
    ].join('; ')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
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
