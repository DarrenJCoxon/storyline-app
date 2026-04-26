import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { readBlurbContext, generateBlurb } from '../illustration/blurb-generator.js'
import { generateImage, compositeWraparound, COVER_W, COVER_H, COVER_GEN_W, COVER_GEN_H, COVER_ASPECT_RATIO, IMAGE_CREDIT_COST } from '../illustration/image-generator.js'
import { readStyleBible, buildStyleBiblePrompt, readRefs } from '../illustration/style-bible.js'
import { spinePx, spineLabel } from '../illustration/spine-calc.js'
import { LicenceManager } from '../auth/licence.js'
import { ManagedProvider } from '../ai/managed-provider.js'
import { BYOKProvider } from '../ai/byok-provider.js'
import { OllamaProvider } from '../ai/ollama-provider.js'
import type { AIProvider } from '../ai/provider.js'

function getBackendUrl(): string {
  return vscode.workspace.getConfiguration('storyline').get<string>('backendUrl', 'https://api.storyline.app').replace(/\/$/, '')
}

export class CoverPanel {
  public static readonly viewType = 'storyline.cover'
  private static instance: CoverPanel | undefined

  private readonly panel: vscode.WebviewPanel
  private readonly licenceManager: LicenceManager
  private generating = false

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.licenceManager = new LicenceManager(context, getBackendUrl())

    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
    this.panel = vscode.window.createWebviewPanel(
      CoverPanel.viewType,
      'Storyline — Cover Generator',
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
    this.panel.onDidDispose(() => { CoverPanel.instance = undefined })

    setTimeout(() => this.sendInit(), 200)
  }

  public static show(context: vscode.ExtensionContext, extensionUri: vscode.Uri): void {
    if (CoverPanel.instance) {
      CoverPanel.instance.panel.reveal(vscode.ViewColumn.One)
      return
    }
    CoverPanel.instance = new CoverPanel(context, extensionUri)
  }

  private sendInit(): void {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) { this.post({ type: 'error', message: 'Open a Storyline project folder first.' }); return }

    const ctx = readBlurbContext(projectDir)
    const wordCount = this.readWordCount(projectDir)
    // Drop any legacy flat-file copies on init so they don't sit alongside
    // the library forever once the user has clicked Use-This at least once.
    if (Object.keys(this.readActiveManifest(projectDir)).length > 0) {
      this.cleanupLegacyFlatFiles(projectDir)
    }

    const frontActive = this.activeCoverPath(projectDir, 'front')
    const backActive = this.activeCoverPath(projectDir, 'back')

    this.post({
      type: 'init',
      title: ctx.title,
      author: ctx.author,
      genre: ctx.genre ?? '',
      wordCount,
      spineLabel: spineLabel(wordCount),
      spineLabelCream: spineLabel(wordCount, 'cream'),
      hasFront: !!frontActive,
      hasBack: !!backActive,
      frontUri: frontActive ? this.assetUri(path.join('assets', 'covers', path.basename(frontActive))) : null,
      backUri: backActive ? this.assetUri(path.join('assets', 'covers', path.basename(backActive))) : null,
      frontGallery: this.listCovers(projectDir, 'front'),
      backGallery: this.listCovers(projectDir, 'back'),
      creditCost: IMAGE_CREDIT_COST,
    })

    // Fire blurb generation async
    void this.startBlurbGeneration(projectDir)
  }

  private async startBlurbGeneration(projectDir: string): Promise<void> {
    try {
      const provider = await this.resolveProvider()
      const ctx = readBlurbContext(projectDir)
      this.post({ type: 'blurbStart' })
      await generateBlurb(provider, ctx, chunk => this.post({ type: 'blurbChunk', text: chunk }))
      this.post({ type: 'blurbDone' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.post({ type: 'blurbError', message })
    }
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type) {
      case 'regenerateBlurb': {
        const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (projectDir) void this.startBlurbGeneration(projectDir)
        break
      }
      case 'generateFront':
        await this.handleGenerateFront(msg)
        break
      case 'generateBack':
        await this.handleGenerateBack(msg)
        break
      case 'useThisCover':
        await this.handleUseThisCover(msg)
        break
      case 'revealFile': {
        const p = msg.path as string
        if (p && fs.existsSync(p)) await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(p))
        break
      }
      case 'selectCover': {
        await this.handleSelectCover(msg)
        break
      }
      case 'deleteCover': {
        await this.handleDeleteCover(msg)
        break
      }
    }
  }

  private async handleSelectCover(msg: Record<string, unknown>): Promise<void> {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) return
    const absolutePath = msg.absolutePath as string
    const kind = msg.kind as 'front' | 'back'
    if (!absolutePath || !fs.existsSync(absolutePath) || (kind !== 'front' && kind !== 'back')) return

    if (kind === 'front') this.setActiveFront(projectDir, absolutePath)
    else this.setActiveBack(projectDir, absolutePath)

    this.post({
      type: kind === 'front' ? 'frontGenerated' : 'backGenerated',
      uri: this.assetUri(path.join('assets', 'covers', path.basename(absolutePath))),
      gallery: this.listCovers(projectDir, kind),
    })
  }

  private async handleDeleteCover(msg: Record<string, unknown>): Promise<void> {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) return
    const absolutePath = msg.absolutePath as string
    const kind = msg.kind as 'front' | 'back'
    if (!absolutePath || (kind !== 'front' && kind !== 'back')) return

    // Don't delete the active cover without confirming — losing it would
    // silently remove the cover from the EPUB / print pipelines.
    const manifest = this.readActiveManifest(projectDir)
    const activeName = kind === 'front' ? manifest.front : manifest.back
    const isActive = activeName === path.basename(absolutePath)
    if (isActive) {
      const ok = await vscode.window.showWarningMessage(
        `This is the active ${kind} cover. Delete anyway?`,
        { modal: true }, 'Delete',
      )
      if (ok !== 'Delete') return
    }

    try { fs.unlinkSync(absolutePath) } catch { /* already gone */ }

    // If we just deleted the active cover, promote the most recent
    // remaining one (if any) so the manifest never points at a ghost file.
    if (isActive) {
      const remaining = this.listCovers(projectDir, kind)
      if (remaining.length) {
        if (kind === 'front') this.setActiveFront(projectDir, remaining[0].absolutePath)
        else this.setActiveBack(projectDir, remaining[0].absolutePath)
      } else {
        // No covers left of this kind — clear the active entry from manifest.
        this.writeActiveManifest(projectDir, { [kind]: undefined } as Record<string, string | undefined>)
      }
    }

    this.post({
      type: kind === 'front' ? 'frontGalleryUpdated' : 'backGalleryUpdated',
      gallery: this.listCovers(projectDir, kind),
    })
  }

  private async handleGenerateFront(msg: Record<string, unknown>): Promise<void> {
    if (this.generating) return
    this.generating = true
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) { this.generating = false; return }

    this.post({ type: 'progress', phase: 'Generating front cover… (~20s)' })
    try {
      // Save each generation under a unique timestamped filename so previous
      // attempts are preserved. The "active" front cover is a copy at
      // assets/cover-front.jpg, which compile / wraparound consume.
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
      const filename = `front-${stamp}.jpg`
      const relPath = path.join('assets', 'covers', filename)
      // Fold the project's Style Bible (characters / art style / palette) into
      // the cover prompt so the cover reads as part of the same visual world
      // as the in-book illustrations. Character refs are also passed so the
      // cover can show the protagonist looking the same as inside.
      const bible = readStyleBible(projectDir)
      const biblePrefix = buildStyleBiblePrompt(bible)
      const userCoverPrompt = msg.prompt as string
      const fullPrompt = biblePrefix ? `${biblePrefix}COVER BRIEF: ${userCoverPrompt}` : userCoverPrompt
      const refs = readRefs(projectDir).map(r => ({ path: r.absolutePath, label: r.kind as 'character' | 'style' | 'scene' }))
      const result = await generateImage({
        prompt: fullPrompt,
        width: COVER_W, height: COVER_H,
        generationSize: `${COVER_GEN_W}x${COVER_GEN_H}`,
        aspectRatio: COVER_ASPECT_RATIO,
        quality: 'high',
        referenceImagePaths: refs.length ? refs : undefined,
        inputFidelity: refs.length ? 'high' : undefined,
        outputPath: relPath,
        projectDir,
        backendUrl: getBackendUrl(),
        licenceManager: this.licenceManager,
      })
      // Mark this generation as the active front + ebook cover
      this.setActiveFront(projectDir, result.absolutePath)
      this.post({
        type: 'frontGenerated',
        uri: this.assetUri(path.join('assets', 'covers', path.basename(result.absolutePath))),
        gallery: this.listCovers(projectDir, 'front'),
      })
    } catch (err) {
      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      this.generating = false
    }
  }

  private async handleGenerateBack(msg: Record<string, unknown>): Promise<void> {
    if (this.generating) return
    this.generating = true
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) { this.generating = false; return }

    this.post({ type: 'progress', phase: 'Generating back cover… (~20s)' })
    try {
      // Use the active front (from the manifest) as the reference image
      // so the back picks up its colour palette, lighting and motifs.
      const frontPath = this.activeCoverPath(projectDir, 'front')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '')
      const filename = `back-${stamp}.jpg`
      const relPath = path.join('assets', 'covers', filename)
      const result = await generateImage({
        prompt: msg.prompt as string,
        width: COVER_W, height: COVER_H,
        generationSize: `${COVER_GEN_W}x${COVER_GEN_H}`,
        aspectRatio: COVER_ASPECT_RATIO,
        quality: 'high',
        referenceImagePath: frontPath ?? undefined,
        outputPath: relPath,
        projectDir,
        backendUrl: getBackendUrl(),
        licenceManager: this.licenceManager,
      })
      this.setActiveBack(projectDir, result.absolutePath)
      this.post({
        type: 'backGenerated',
        uri: this.assetUri(path.join('assets', 'covers', path.basename(result.absolutePath))),
        gallery: this.listCovers(projectDir, 'back'),
      })
    } catch (err) {
      this.post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      this.generating = false
    }
  }

  /**
   * Active-cover manifest at assets/covers/active.json. Tracks which library
   * file is the "active" front + back. The library files in assets/covers/
   * are the source of truth — we don't keep duplicate flat copies in /assets.
   *
   * The single exception is assets/cover.jpg (ebook), which the EPUB packager
   * and other compile steps look up at that fixed path. We copy the active
   * front there on selection so existing pipelines keep working unchanged.
   */
  private readActiveManifest(projectDir: string): { front?: string; back?: string } {
    try {
      const raw = fs.readFileSync(path.join(projectDir, 'assets', 'covers', 'active.json'), 'utf-8')
      return JSON.parse(raw) as { front?: string; back?: string }
    } catch { return {} }
  }

  private writeActiveManifest(projectDir: string, patch: { front?: string; back?: string }): void {
    const dir = path.join(projectDir, 'assets', 'covers')
    fs.mkdirSync(dir, { recursive: true })
    const current = this.readActiveManifest(projectDir)
    fs.writeFileSync(path.join(dir, 'active.json'), JSON.stringify({ ...current, ...patch }, null, 2), 'utf-8')
  }

  /** Migrate away from the old layout: drop cover-front.jpg / cover-back.jpg
   *  flat files once an active manifest exists. assets/cover.jpg stays.       */
  private cleanupLegacyFlatFiles(projectDir: string): void {
    for (const name of ['cover-front.jpg', 'cover-back.jpg']) {
      const p = path.join(projectDir, 'assets', name)
      try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* ignore */ }
    }
  }

  private setActiveFront(projectDir: string, sourceAbsPath: string): void {
    const assetsDir = path.join(projectDir, 'assets')
    fs.mkdirSync(assetsDir, { recursive: true })
    // Update manifest + ebook cover only — no /assets/cover-front.jpg duplicate.
    this.writeActiveManifest(projectDir, { front: path.basename(sourceAbsPath) })
    fs.copyFileSync(sourceAbsPath, path.join(assetsDir, 'cover.jpg'))  // ebook
    this.cleanupLegacyFlatFiles(projectDir)
  }

  private setActiveBack(projectDir: string, sourceAbsPath: string): void {
    this.writeActiveManifest(projectDir, { back: path.basename(sourceAbsPath) })
    this.cleanupLegacyFlatFiles(projectDir)
  }

  /** Returns the absolute path of the active front (or back), if any. */
  private activeCoverPath(projectDir: string, kind: 'front' | 'back'): string | null {
    const manifest = this.readActiveManifest(projectDir)
    const filename = kind === 'front' ? manifest.front : manifest.back
    if (!filename) return null
    const abs = path.join(projectDir, 'assets', 'covers', filename)
    return fs.existsSync(abs) ? abs : null
  }

  private listCovers(projectDir: string, kind: 'front' | 'back'): Array<{ filename: string; uri: string; absolutePath: string; isActive: boolean }> {
    const dir = path.join(projectDir, 'assets', 'covers')
    if (!fs.existsSync(dir)) return []
    const manifest = this.readActiveManifest(projectDir)
    const activeName = kind === 'front' ? manifest.front : manifest.back
    return fs.readdirSync(dir)
      .filter(name => name.startsWith(`${kind}-`) && /\.(jpg|jpeg|png)$/i.test(name))
      .sort()
      .reverse()
      .map(name => ({
        filename: name,
        uri: this.assetUri(path.join('assets', 'covers', name)),
        absolutePath: path.join(dir, name),
        isActive: name === activeName,
      }))
  }

  private async handleUseThisCover(msg: Record<string, unknown>): Promise<void> {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) return

    const title = msg.title as string ?? ''
    const author = msg.author as string ?? ''
    const paperType = msg.paperType as 'white' | 'cream' ?? 'white'
    const wordCount = this.readWordCount(projectDir)

    const frontPath = this.activeCoverPath(projectDir, 'front')
    const backPath = this.activeCoverPath(projectDir, 'back')

    let wraparoundPath: string | null = null
    let wraparoundError: string | null = null

    if (!frontPath) {
      wraparoundError = 'No active front cover — pick one from the front library first.'
    } else if (!backPath) {
      wraparoundError = 'No active back cover — generate or select a back cover to build the full KDP wraparound.'
    } else {
      this.post({ type: 'progress', phase: 'Compositing wraparound…' })
      try {
        wraparoundPath = await compositeWraparound(projectDir, frontPath, backPath, spinePx(wordCount, paperType), title, author)
      } catch (err) {
        wraparoundError = err instanceof Error ? err.message : String(err)
      }
    }

    const activeFrontUri = frontPath
      ? this.assetUri(path.join('assets', 'covers', path.basename(frontPath)))
      : null

    this.post({
      type: 'coverSaved',
      frontUri: activeFrontUri,
      wraparoundUri: wraparoundPath ? this.assetUri('assets/cover-wraparound.jpg') : null,
      wraparoundError,
    })

    if (wraparoundPath) {
      vscode.window.showInformationMessage('Cover saved — ebook (assets/cover.jpg) and KDP print wraparound (assets/cover-wraparound.jpg).')
    } else {
      vscode.window.showInformationMessage('Ebook cover saved (assets/cover.jpg). Wraparound print cover skipped — see panel for details.')
    }
  }

  private readWordCount(projectDir: string): number {
    try {
      const msDir = path.join(projectDir, 'manuscript')
      const files = fs.readdirSync(msDir).filter(f => /\.(md|markdown)$/i.test(f))
      let total = 0
      for (const f of files) {
        const text = fs.readFileSync(path.join(msDir, f), 'utf-8')
        total += text.split(/\s+/).filter(Boolean).length
      }
      return total
    } catch { return 0 }
  }

  private assetUri(relativePath: string): string {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) return ''
    const base = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(projectDir, relativePath))).toString()
    // Cache-bust: cover-front.jpg / cover-back.jpg keep the same path, so
    // without a query the webview re-uses the previously cached bytes.
    return `${base}?t=${Date.now()}`
  }

  private async resolveProvider(): Promise<AIProvider> {
    const info = await this.licenceManager.validate({ useCache: true })
    if (info.type === 'byok') {
      const config = this.context.globalState.get<{ kind: 'anthropic' | 'openai'; baseUrl?: string }>('storyline.byokConfig')
      const apiKey = await this.context.secrets.get('storyline.byokApiKey') ?? ''
      if (config) {
        return new BYOKProvider(
          config.kind === 'anthropic'
            ? { kind: 'anthropic', apiKey }
            : { kind: 'openai', apiKey, baseUrl: config.baseUrl ?? 'https://api.openai.com/v1' },
        )
      }
    }
    const ollamaEnabled = this.context.globalState.get<boolean>('storyline.ollamaEnabled')
    if (ollamaEnabled) {
      const url = this.context.globalState.get<string>('storyline.ollamaUrl') ?? 'http://localhost:11434'
      return new OllamaProvider(url)
    }
    return new ManagedProvider(getBackendUrl(), () => this.licenceManager.getLicenceKey())
  }

  private post(msg: Record<string, unknown>): void {
    this.panel.webview.postMessage(msg)
  }

  private getHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'cover.js'))
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'cover.css'))
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
