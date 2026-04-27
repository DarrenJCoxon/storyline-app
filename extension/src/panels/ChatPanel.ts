import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { spawn, type ChildProcess, execSync } from 'child_process'
import { deriveCurrentStage, stageOrderFor, type ProjectState, runStoryTraps, detectSeriesPotential, getDownstreamImpacts, writeStageDoc, gateStageSave } from '@storyline/core'
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
  return vscode.workspace.getConfiguration('storyline').get<string>('backendUrl', 'https://api.storyline.my').replace(/\/$/, '')
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
  private recordingProcess: ChildProcess | null = null
  private recordingTempFile: string | null = null

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

    console.log('[Storyline] init: stage =', currentStage?.id, 'mode =', state.mode, 'provider =', this.provider?.id)

    if (currentStage) {
      const priorTurns = this.turnHistory.allForStage(currentStage.id)
      if (priorTurns.length > 0) {
        // Restore prior conversation — skip the opening prompt
        this.post({ type: 'restoreMessages', turns: priorTurns })
      } else {
        await this.fireOpeningPrompt(currentStage.id, state)
      }
    } else {
      console.warn('[Storyline] init: no current stage derived — harness will not start')
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
      case 'startRecording':
        void this.handleStartRecording()
        break
      case 'stopRecording':
        void this.handleStopRecording()
        break
      case 'cancelRecording':
        this.handleCancelRecording()
        break
      case 'selectMic':
        void this.handleSelectMic()
        break
      case 'getMicDevice':
        this.post({ type: 'micDeviceChanged', device: this.context.globalState.get<string>('storyline.micDevice') ?? null })
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

  private listAudioInputDevices(): string[] {
    try {
      const raw = execSync('system_profiler SPAudioDataType -json 2>/dev/null', { encoding: 'utf8', timeout: 5000 })
      const data = JSON.parse(raw) as { SPAudioDataType?: Array<{ _items?: Array<Record<string, string>> }> }
      const devices: string[] = []
      for (const group of data.SPAudioDataType ?? []) {
        for (const item of group._items ?? []) {
          if ('coreaudio_device_input' in item && item._name) {
            devices.push(item._name)
          }
        }
      }
      return devices
    } catch {
      return []
    }
  }

  private async handleSelectMic(): Promise<void> {
    const devices = this.listAudioInputDevices()
    if (devices.length === 0) {
      void vscode.window.showWarningMessage('No audio input devices found.')
      return
    }
    const current = this.context.globalState.get<string>('storyline.micDevice')
    const picked = await vscode.window.showQuickPick(
      devices.map(d => ({ label: d, description: d === current ? '● active' : undefined })),
      { placeHolder: 'Select microphone for dictation', title: 'Storyline — Choose Microphone' },
    )
    if (!picked) return
    await this.context.globalState.update('storyline.micDevice', picked.label)
    this.post({ type: 'micDeviceChanged', device: picked.label })
  }

  private findRecorder(): { cmd: string; args: (file: string) => string[] } | null {
    const candidates = [
      { bin: 'rec', paths: ['/opt/homebrew/bin/rec', '/usr/local/bin/rec'], args: (f: string) => ['-q', '-t', 'wav', '-r', '16000', '-c', '1', f] },
      { bin: 'ffmpeg', paths: ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'], args: (f: string) => ['-y', '-f', 'avfoundation', '-i', ':0', '-ar', '16000', '-ac', '1', f] },
    ]
    for (const c of candidates) {
      for (const p of c.paths) {
        if (fs.existsSync(p)) return { cmd: p, args: c.args }
      }
      try { const found = execSync(`which ${c.bin}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); if (found) return { cmd: found, args: c.args } } catch { /* not found */ }
    }
    return null
  }

  private async handleStartRecording(): Promise<void> {
    if (this.recordingProcess) return

    const recorder = this.findRecorder()
    if (!recorder) {
      this.post({ type: 'recordingFailed', message: 'No audio recorder found — install sox: brew install sox' })
      return
    }

    const tmpFile = path.join(os.tmpdir(), `storyline-rec-${Date.now()}.wav`)
    this.recordingTempFile = tmpFile

    const selectedDevice = this.context.globalState.get<string>('storyline.micDevice')
    const spawnEnv = selectedDevice ? { ...process.env, AUDIODEV: selectedDevice } : process.env
    const proc = spawn(recorder.cmd, recorder.args(tmpFile), { stdio: ['ignore', 'pipe', 'pipe'], env: spawnEnv })

    proc.on('error', (err) => {
      this.recordingProcess = null
      this.recordingTempFile = null
      this.post({ type: 'recordingFailed', message: `Recorder error: ${err.message}` })
    })

    // Brief pause to detect immediate exit (command not found / device busy)
    await new Promise(r => setTimeout(r, 150))

    if (proc.exitCode !== null) {
      this.recordingProcess = null
      this.recordingTempFile = null
      this.post({ type: 'recordingFailed', message: `Recorder exited immediately — check microphone access for Terminal/VS Code` })
      return
    }

    this.recordingProcess = proc
    this.post({ type: 'recordingStarted' })
  }

  private async handleStopRecording(): Promise<void> {
    const proc = this.recordingProcess
    const tmpFile = this.recordingTempFile
    this.recordingProcess = null
    this.recordingTempFile = null

    if (!proc || !tmpFile) return

    proc.kill('SIGINT')

    await new Promise<void>(resolve => {
      const done = () => resolve()
      proc.once('close', done)
      setTimeout(done, 2000)
    })

    try {
      const audioBuffer = fs.readFileSync(tmpFile)
      fs.unlinkSync(tmpFile)
      const audioBase64 = audioBuffer.toString('base64')
      await this.handleTranscribe(audioBase64, 'audio/wav')
    } catch (err) {
      this.post({ type: 'transcribeError', message: `Failed to read recording: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  private handleCancelRecording(): void {
    const proc = this.recordingProcess
    const tmpFile = this.recordingTempFile
    this.recordingProcess = null
    this.recordingTempFile = null
    if (proc) proc.kill('SIGKILL')
    if (tmpFile) { try { fs.unlinkSync(tmpFile) } catch { /* ignore */ } }
  }

  private async handleTranscribe(audioBase64: string, mimeType: string): Promise<void> {
    const licenceKey = await this.licenceManager.getLicenceKey()
    if (!licenceKey) {
      this.post({ type: 'transcribeError', message: 'No licence key — activate Storyline first.' })
      return
    }

    const state = this.store ? await this.store.read() : null
    const projectContext = state ? this.buildProjectContext(state) : ''

    try {
      const body: Record<string, string> = { licenceKey, audioBase64, mimeType }
      if (projectContext) body.projectContext = projectContext

      const res = await fetch(`${getBackendUrl()}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        this.post({ type: 'transcribeError', message: `Transcription failed (${res.status})${text ? ': ' + text : ''}` })
        return
      }

      const data = await res.json() as { text?: string; error?: string }
      if (data.text) {
        this.post({ type: 'transcribeResult', text: data.text })
      } else {
        this.post({ type: 'transcribeError', message: data.error ?? 'Transcription returned no text.' })
      }
    } catch (err) {
      this.post({ type: 'transcribeError', message: err instanceof Error ? err.message : String(err) })
    }
  }

  private buildProjectContext(state: ProjectState): string {
    const parts: string[] = ['Storyline planning session.']
    const logline = state.premise?.rawLogline ?? state.premise?.conceptHook
    if (logline) parts.push(`Story: "${logline.slice(0, 100)}".`)
    const genre = state.genre?.primaryGenre
    if (genre) parts.push(`Genre: ${genre}.`)
    const protagonist = state.protagonist?.name
    if (protagonist) parts.push(`Protagonist: ${protagonist}.`)
    const castNames = (state.characters ?? []).map(c => c.name).filter(Boolean).slice(0, 5).join(', ')
    if (castNames) parts.push(`Characters: ${castNames}.`)
    return parts.join(' ')
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

    // Gate: every declarative requirement for this stage must be satisfied
    // before we mark it complete and advance. Mirrors the original
    // harness's `verify-stage` exit-non-zero behaviour. The captured
    // (partial) values stay in state so the AI can build on them; we just
    // don't advance the stage marker.
    if (stageId !== 'mode') {
      const gate = gateStageSave(stageId, newState)
      if (!gate.complete) {
        console.warn('[Storyline] Save gated — incomplete fields for', stageId, ':', gate.missing)
        this.post({ type: 'saveGated', stageId, missing: gate.missing })
        // Stay on the same stage. The writer's next turn carries the
        // conversation forward — no synthetic re-prompt loop. Same shape
        // as the original /storyline harness when verify-stage exits non-zero.
        return
      }
    }

    const stagesPatch = {
      stages: { ...newState.stages, [stageId]: { completed: true } },
    }
    const finalState = await this.store.merge(stagesPatch)

    // Await the memory push so we can surface the result to the webview.
    // pushToMemory itself never throws — it returns { method, error? }.
    pushToMemory(stageId, normalizedPatch).then(result => {
      console.log(`[Storyline] memory: ${stageId} → ${result.method}${result.error ? ' (' + result.error + ')' : ''}`)
      this.post({ type: 'memoryStored', stageId, method: result.method, error: result.error })
    }).catch(err => console.warn('[Storyline] pushToMemory threw', err))

    const stageName = stageOrderFor(finalState).find(s => s.id === stageId)?.name ?? stageId
    console.log(`[Storyline] stage SAVED: ${stageId} (${stageName}) — state.json updated`)
    this.post({
      type: 'stageComplete',
      stageId,
      stageName,
      statePath: this.store.path,
    })

    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (projectDir) {
      writeAllChapterCards(finalState, projectDir).catch(err => console.warn('[Storyline] writeAllChapterCards failed', err))
    }

    // ── Post-save side-effects — every step is wrapped so a single failure
    // can NEVER block the stage advance. The advance is the user-visible
    // contract; everything else is best-effort.

    // 1. Story traps check
    try {
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
    } catch (err) {
      console.warn('[Storyline] runStoryTraps failed', err)
    }

    // 2. Series detector (fiction only, after premise)
    try {
      if (stageId === 'premise' && finalState.mode === 'fiction') {
        const seriesResult = detectSeriesPotential(finalState.premise ?? {}, finalState.genre ?? {})
        if (seriesResult.detected && seriesResult.suggestion) {
          this.post({ type: 'seriesDetected', suggestion: seriesResult.suggestion, indicators: seriesResult.indicators })
        }
      }
    } catch (err) {
      console.warn('[Storyline] detectSeriesPotential failed', err)
    }

    // 3. Downstream impacts warning
    try {
      const impacts = getDownstreamImpacts(stageId)
      if (impacts.length > 0) {
        this.post({ type: 'downstreamImpacts', stageId, impacts })
      }
    } catch (err) {
      console.warn('[Storyline] getDownstreamImpacts failed', err)
    }

    // 4. Write stage doc
    if (projectDir) {
      writeStageDoc(stageId, finalState, projectDir)
        .then(filePath => console.log(`[Storyline] stage doc: ${stageId} → ${filePath ?? '(no renderer)'}`))
        .catch(err => console.warn('[Storyline] writeStageDoc failed', err))
    }

    // ── Stage advance — MUST run, regardless of side-effect errors above.
    let nextStage: ReturnType<typeof deriveCurrentStage> = null
    try {
      nextStage = deriveCurrentStage(finalState)
    } catch (err) {
      console.error('[Storyline] deriveCurrentStage failed after save — aborting advance', err)
      this.post({ type: 'streamError', message: 'Could not determine next stage. Please reload the planning panel.' })
      return
    }

    console.log('[Storyline] advance:', stageId, '→', nextStage?.id ?? '(none)')

    if (nextStage) {
      this.post({
        type: 'stageAdvance',
        stages: stageOrderFor(finalState).map(s => ({
          id: s.id,
          name: s.name,
          completed: !!finalState.stages?.[s.id]?.completed,
          active: nextStage!.id === s.id,
        })),
      })
      // Do NOT fire the opening prompt here. The user may want to respond to
      // the AI's critique before moving on. The opener fires lazily on their
      // next message via handleUserMessage → fireOpeningPrompt.
    }
  }

  private async fireOpeningPrompt(stageId: string, state: ProjectState): Promise<void> {
    if (!this.provider) return

    const systemPrompt = buildSystemPrompt(stageId, state)

    // OpenRouter / OpenAI-compatible APIs reject zero-message requests, so
    // every kickoff carries a synthetic user turn that nudges the harness
    // to begin. The harness's system prompt drives what the AI says next.
    const kickoffText = stageId === 'mode'
      ? "Hi — I'd like to start planning a book."
      : `Begin the ${stageId} stage.`

    this.turnHistory.append(stageId, { role: 'user', content: kickoffText })
    const messages: Message[] = this.turnHistory.allForStage(stageId)

    // No seed — the AI generates the opener fresh from the stage brief in
    // the system prompt. Pre-seeding the canned `opening` caused
    // duplication (AI re-stated the same line) and let the harness's
    // SKILL.md persona blurb leak verbatim into the chat. The thinking
    // indicator now covers the reasoning delay.
    await this.streamResponse(stageId, systemPrompt, messages, state)
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
      console.error('[Storyline] streamResponse failed:', err)
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
    // Skip stages that have no narrative/structural content to critique.
    // `mode` is a binary fiction/non-fiction gate; the master-doc stages
    // are auto-generated synthesis outputs that already passed critique
    // earlier. Running the structural critic on these produces the
    // unhelpful "populate something first" reply.
    if (NO_CRITIQUE_STAGES.has(stageId)) return
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
      this.post({ type: 'critiqueCard', findings: data.findings, tier: data.tier ?? 'structural', stageId })
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

const NO_CRITIQUE_STAGES = new Set<string>([
  // No content to critique
  'mode',
  // Auto-generated synthesis output — already validated upstream
  'masterDoc',
  'pa-master',
  'pb-master',
  'pc-master',
  // Validate-tier stages — schema-level nags that disrupt conversational
  // flow. Required fields are already enforced by gateStageSave; the
  // structural/synthesis tiers on later stages provide the real editorial
  // critique. Original /storyline ran these silently; we suppress them
  // entirely in the chat panel.
  'genre',
  'premise',
  'characters',
  'plotThreads',
])

