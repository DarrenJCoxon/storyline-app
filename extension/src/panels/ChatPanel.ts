import * as vscode from 'vscode'
import * as path from 'path'
import { deriveCurrentStage, stageOrderFor, type ProjectState, runStoryTraps, detectSeriesPotential, getDownstreamImpacts, writeStageDoc } from '@storyline/core'
import { writeAllChapterCards } from '../editor/chapter-cards.js'
import { buildSystemPrompt } from '../conversation/system-prompt.js'
import { TurnHistory } from '../conversation/turn-history.js'
import { LocalStore, extractJsonBlock } from '../state/local-store.js'
import { pushToMemory } from '../state/memory.js'
import { LicenceManager } from '../auth/licence.js'
import { ManagedProvider } from '../ai/managed-provider.js'
import { BYOKProvider } from '../ai/byok-provider.js'
import { OllamaProvider } from '../ai/ollama-provider.js'
import type { AIProvider, Message } from '../ai/provider.js'
import { getQualityMode } from '../ai/quality-config.js'

function getBackendUrl(): string {
  return vscode.workspace.getConfiguration('storyline').get<string>('backendUrl', 'https://api.storyline.app').replace(/\/$/, '')
}

export class ChatPanel {
  public static readonly viewType = 'storyline.chat'
  private static instance: ChatPanel | undefined

  private readonly panel: vscode.WebviewPanel
  private readonly turnHistory = new TurnHistory()
  private readonly licenceManager: LicenceManager
  private store: LocalStore | null = null
  private provider: AIProvider | null = null
  private initialised = false

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
    column: vscode.ViewColumn,
  ) {
    this.licenceManager = new LicenceManager(context, getBackendUrl())

    this.panel = vscode.window.createWebviewPanel(
      ChatPanel.viewType,
      'Storyline — Planning',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    )

    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg')
    this.panel.webview.html = this.getHtml(this.panel.webview)
    this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg))
    this.panel.onDidDispose(() => { ChatPanel.instance = undefined })

    // Webview script loads async — defer init so the first 'init' post isn't dropped
    setTimeout(() => { void this.init() }, 200)
  }

  public static show(
    context: vscode.ExtensionContext,
    extensionUri: vscode.Uri,
    column: vscode.ViewColumn = vscode.ViewColumn.Beside,
  ): void {
    if (ChatPanel.instance) {
      ChatPanel.instance.panel.reveal(column, true)
      return
    }
    ChatPanel.instance = new ChatPanel(context, extensionUri, column)
  }

  public static current(): ChatPanel | undefined {
    return ChatPanel.instance
  }

  private async init(): Promise<void> {
    if (this.initialised) return
    this.initialised = true

    this.store = LocalStore.fromWorkspace()
    if (!this.store) {
      this.post({ type: 'error', message: 'Open a Storyline project folder to get started.' })
      return
    }

    // Wire conversation persistence to .storyline/conversation.json
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (workspaceFolder) {
      this.turnHistory.setStorePath(path.join(workspaceFolder, '.storyline', 'conversation.json'))
    }

    // Force a fresh /validate call on panel open so the displayed credit
    // balance is what the backend will actually accept on /chat — never a
    // stale cache from a previous session or a wrangler KV reset.
    const licenceInfo = await this.licenceManager.validate({ useCache: false })
    this.provider = await this.resolveProvider(licenceInfo)

    const state = await this.store.read()
    const currentStage = deriveCurrentStage(state)

    const stages = stageOrderFor(state).map(s => ({
      id: s.id,
      name: s.name,
      completed: !!state.stages?.[s.id]?.completed,
      active: currentStage?.id === s.id,
    }))

    this.post({
      type: 'init',
      stages,
      creditBalance: licenceInfo.creditBalance,
      licenceType: licenceInfo.type,
      providerName: this.getProviderName(licenceInfo),
    })

    if (currentStage) {
      const priorTurns = this.turnHistory.allForStage(currentStage.id)
      if (priorTurns.length > 0) {
        // Restore prior conversation — skip the opening prompt
        this.post({ type: 'restoreMessages', turns: priorTurns })
      } else {
        await this.fireOpeningPrompt(currentStage.id, state)
      }
    }
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type) {
      case 'send':
        await this.handleUserMessage(msg.text as string)
        break
      case 'save':
        await this.handleSaveIntent()
        break
      case 'setTheme':
        await this.context.globalState.update('storyline.theme', msg.theme)
        await this.applyVSCodeTheme(msg.theme as 'light' | 'dark' | 'auto')
        break
      case 'setRailCollapsed':
        await this.context.globalState.update('storyline.railCollapsed', msg.collapsed)
        break
      case 'topUpCredits':
        await vscode.commands.executeCommand('storyline.topUpCredits')
        break
    }
  }

  private async handleUserMessage(text: string): Promise<void> {
    if (!this.provider || !this.store) return

    const state = await this.store.read()
    const currentStage = deriveCurrentStage(state)
    if (!currentStage) return

    this.turnHistory.append(currentStage.id, { role: 'user', content: text })
    this.post({ type: 'userMessage', text })

    const systemPrompt = buildSystemPrompt(currentStage.id, state)
    const messages: Message[] = this.turnHistory.allForStage(currentStage.id)

    const full = await this.streamResponse(currentStage.id, systemPrompt, messages, state)
    await this.applyEmittedPatches(full, currentStage.id)
  }

  private async handleSaveIntent(): Promise<void> {
    if (!this.provider || !this.store) return

    const state = await this.store.read()
    const currentStage = deriveCurrentStage(state)
    if (!currentStage) return

    const savePrompt = 'Please emit the save block for this stage now.'
    this.turnHistory.append(currentStage.id, { role: 'user', content: savePrompt })

    const systemPrompt = buildSystemPrompt(currentStage.id, state)
    const messages: Message[] = this.turnHistory.allForStage(currentStage.id)

    const full = await this.streamResponse(currentStage.id, systemPrompt, messages, state)
    await this.applyEmittedPatches(full, currentStage.id)
  }

  private async applyEmittedPatches(aiText: string, stageId: string): Promise<void> {
    if (!this.store) return
    const patch = extractJsonBlock(aiText)
    if (!patch) return

    let normalizedPatch: Partial<ProjectState>
    if (stageId === 'mode' && (patch as Record<string, unknown>).mode) {
      const modeBlock = (patch as { mode: { value?: string } }).mode
      const value = modeBlock?.value === 'nonfiction' ? 'nonfiction' : 'fiction'
      normalizedPatch = { mode: value } as Partial<ProjectState>
    } else {
      normalizedPatch = patch as Partial<ProjectState>
    }

    const newState = await this.store.merge(normalizedPatch)

    const stagesPatch = {
      stages: { ...newState.stages, [stageId]: { completed: true } },
    }
    const finalState = await this.store.merge(stagesPatch)

    pushToMemory(stageId, normalizedPatch).catch(() => { /* non-fatal */ })

    const stageName = stageOrderFor(finalState).find(s => s.id === stageId)?.name ?? stageId
    this.post({
      type: 'stageComplete',
      stageId,
      stageName,
      statePath: this.store.path,
    })

    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (projectDir) {
      writeAllChapterCards(finalState, projectDir).catch(() => { /* non-fatal */ })
    }

    // 1. Story traps check
    const trapResults = runStoryTraps(finalState)
    if (trapResults.length > 0) {
      this.post({ type: 'findingsCard', findings: trapResults.map(t => ({
        id: t.id,
        name: t.name,
        severity: t.severity,
        description: t.description,
        details: t.details,
        fixProtocol: t.fixProtocol,
      })) })
    }

    // 2. Series detector (fiction only, after premise)
    if (stageId === 'premise' && finalState.mode === 'fiction') {
      const seriesResult = detectSeriesPotential(finalState.premise ?? {}, finalState.genre ?? {})
      if (seriesResult.detected && seriesResult.suggestion) {
        this.post({ type: 'seriesDetected', suggestion: seriesResult.suggestion, indicators: seriesResult.indicators })
      }
    }

    // 3. Downstream impacts warning
    const impacts = getDownstreamImpacts(stageId)
    if (impacts.length > 0) {
      this.post({ type: 'downstreamImpacts', stageId, impacts })
    }

    // 4. Write stage doc
    if (projectDir) {
      writeStageDoc(stageId, finalState, projectDir).catch(() => { /* non-fatal */ })
    }

    // 5. Tier-routed critique via backend /critique endpoint (managed provider only)
    this.runCritique(stageId, finalState).catch(() => { /* non-fatal */ })

    const nextStage = deriveCurrentStage(finalState)
    if (nextStage) {
      this.post({
        type: 'stageAdvance',
        stages: stageOrderFor(finalState).map(s => ({
          id: s.id,
          name: s.name,
          completed: !!finalState.stages?.[s.id]?.completed,
          active: nextStage.id === s.id,
        })),
      })
      await this.fireOpeningPrompt(nextStage.id, finalState)
    }
  }

  private async fireOpeningPrompt(stageId: string, state: ProjectState): Promise<void> {
    if (!this.provider) return

    const systemPrompt = buildSystemPrompt(stageId, state)
    const messages: Message[] = []

    // Mode gate has no canned opener — the AI emits it from the system prompt.
    if (stageId === 'mode') {
      await this.streamResponse(stageId, systemPrompt, messages, state)
      return
    }

    // Pick the right harness for the project mode. NF projects walk Book
    // DNA → chosen pipeline (A/B/C); fiction projects walk Save the Cat.
    // getNfStageGuide spans DNA + all three pipelines, so we don't have
    // to know which phase the writer is in.
    const core = await import('@storyline/core')
    const seed = state.mode === 'nonfiction'
      ? core.getNfStageGuide(stageId)?.opening
      : core.getStageGuide(stageId)?.opening

    await this.streamResponse(stageId, systemPrompt, messages, state, seed)
  }

  private async streamResponse(
    stageId: string,
    systemPrompt: string,
    messages: Message[],
    _state: ProjectState,
    seedContent?: string,
  ): Promise<string> {
    if (!this.provider) return ''

    this.post({ type: 'streamStart' })

    let full = seedContent ?? ''
    if (seedContent) {
      this.post({ type: 'streamChunk', text: seedContent })
    }

    try {
      const stream = this.provider.chat(messages, {
        model: '',
        systemPrompt,
        stageId,
      } as Parameters<typeof this.provider.chat>[1] & { stageId: string })

      for await (const chunk of stream) {
        full += chunk
        this.post({ type: 'streamChunk', text: chunk })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('402') || /credit|quota|exhausted/i.test(msg)) {
        this.post({ type: 'creditsExhausted' })
      } else if (msg.includes('401') || /invalid licence|invalid license/i.test(msg)) {
        // Stale cached credit balance was masking a backend rejection.
        // Drop the cache so the next validate hits /validate fresh, then
        // tell the user they need to re-activate.
        await this.licenceManager.clearCache()
        this.post({
          type: 'streamError',
          message: 'Your licence key is no longer recognised by the backend. Run "Storyline: Enter Licence Key" to re-activate (the credits shown above were cached from a previous session).',
        })
      } else {
        this.post({ type: 'streamError', message: msg })
      }
    }

    this.post({ type: 'streamEnd' })
    this.turnHistory.append(stageId, { role: 'assistant', content: full })
    return full
  }

  private getProviderName(licence: { type: string }): string | undefined {
    if (licence.type !== 'byok') return undefined
    const byok = this.context.globalState.get<{ kind: string }>('storyline.byokConfig')
    const ollama = this.context.globalState.get<boolean>('storyline.ollamaEnabled')
    if (ollama) return 'Ollama'
    if (byok?.kind === 'anthropic') return 'Anthropic'
    if (byok?.kind === 'openai') return 'OpenAI-compatible'
    return 'Custom'
  }

  private async resolveProvider(licence?: { type: string; valid: boolean }): Promise<AIProvider> {
    const info = licence ?? await this.licenceManager.validate({ useCache: true })

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
      const ollamaUrl = this.context.globalState.get<string>('storyline.ollamaUrl') ?? 'http://localhost:11434'
      return new OllamaProvider(ollamaUrl)
    }

    return new ManagedProvider(getBackendUrl(), () => this.licenceManager.getLicenceKey())
  }

  private async runCritique(stageId: string, state: ProjectState): Promise<void> {
    if (!(this.provider instanceof ManagedProvider)) return
    const licenceKey = await this.licenceManager.getLicenceKey()
    if (!licenceKey) return

    const response = await fetch(`${getBackendUrl()}/critique`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenceKey,
        stageId,
        state,
        qualityMode: getQualityMode(),
      }),
    })

    if (!response.ok) return
    const data = await response.json() as { findings?: string; tier?: string }
    if (data.findings) {
      this.post({ type: 'critiqueCard', findings: data.findings, tier: data.tier ?? 'sonnet', stageId })
    }
  }

  private post(msg: Record<string, unknown>): void {
    this.panel.webview.postMessage(msg)
  }

  private async applyVSCodeTheme(mode: 'light' | 'dark' | 'auto'): Promise<void> {
    const config = vscode.workspace.getConfiguration()
    try {
      if (mode === 'auto') {
        await config.update('window.autoDetectColorScheme', true, vscode.ConfigurationTarget.Global)
      } else {
        await config.update('window.autoDetectColorScheme', false, vscode.ConfigurationTarget.Global)
        const themeName = mode === 'light' ? 'Default Light Modern' : 'Default Dark Modern'
        await config.update('workbench.colorTheme', themeName, vscode.ConfigurationTarget.Global)
      }
    } catch {
      /* User may not have permission to write user settings */
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'planning.js'))
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'tokens.css'))
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
