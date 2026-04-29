import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { spawn, type ChildProcess, execSync } from 'child_process'
import { deriveCurrentStage, stageOrderFor, type ProjectState, runStoryTraps, detectSeriesPotential, getDownstreamImpacts, writeStageDoc, gateStageSave, seedManuscriptFromPlan, getWritingPlan, generatePromisePayoffLedger, findFictionPromiseGaps, generateStoryBible, generateCharacterArcMatrix, generateNfMasterDocument, generateResearchTodo, generateClaimEvidenceLedger, generateFigureRegistry, seedSyllabiFolder, inferPipelineFromCategory } from '@storyline/core'
import { writeAllChapterCards } from '../editor/chapter-cards.js'
import { guardFileWrite, confirmWrite } from '../editor/file-write-guard.js'
import { buildSystemPrompt } from '../conversation/system-prompt.js'
import { TurnHistory } from '../conversation/turn-history.js'
import {
  shouldSkipCritique,
  interpretCritiqueOk,
  interpretCritiqueHttpError,
  interpretCritiqueNetworkError,
  detectProviderKind,
} from '../conversation/critique-wiring.js'
import { discoverPlanningArtefacts } from '../conversation/planning-complete.js'
import { LocalStore, extractJsonBlock, extractFileWrites, extractFileReadRequests } from '../state/local-store.js'
import { pushToMemory } from '../state/memory.js'
import { LicenceManager } from '../auth/licence.js'
import { promptOnCreditsExhausted } from '../onboarding/licence-prompt.js'
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
  private streamCancelled = false
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

    // Fallback: if the webview's 'ready' signal is somehow missed, init after 2s.
    setTimeout(() => { void this.handleWebviewReady() }, 2000)
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

  // Called every time the webview signals it is ready (including after reloads).
  // One-time setup (provider, store, turn history paths) is guarded by
  // this.initialised so it only runs once per panel lifetime. State delivery
  // to the webview always runs so a reloaded webview is never stuck.
  private async handleWebviewReady(): Promise<void> {
    try {
      await this._handleWebviewReady()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Storyline] handleWebviewReady threw:', err)
      this.post({ type: 'streamError', message: `Startup error: ${msg}` })
    }
  }

  private async _handleWebviewReady(): Promise<void> {
    if (!this.initialised) {
      this.initialised = true

      this.store = LocalStore.fromWorkspace()
      if (!this.store) {
        this.post({ type: 'error', message: 'Open a Storyline project folder to get started.' })
        return
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (workspaceFolder) {
        this.turnHistory.setStorePath(path.join(workspaceFolder, '.storyline', 'conversation.json'))
        this.turnHistory.setDisplayStorePath(path.join(workspaceFolder, '.storyline', 'chat-display.json'))
      }

      const licenceInfo = await this.licenceManager.validate({ useCache: false })
      this.provider = await this.resolveProvider(licenceInfo)

      // If validation returned invalid AND the user has a stored key, the key
      // needs re-activation (expired, backend reset, etc.). Surface a friendly
      // prompt here rather than letting the opening AI call fail with a 401.
      if (!licenceInfo.valid && await this.licenceManager.getLicenceKey()) {
        this.post({
          type: 'streamError',
          message: 'Unable to verify your Storyline licence. Run "Storyline: Enter Licence Key" to re-activate.',
        })
        return
      }
    }

    if (!this.store) { this.post({ type: 'error', message: 'DEBUG: store is null — no workspace folder open' }); return }
    if (!this.provider) { this.post({ type: 'error', message: 'DEBUG: provider is null — licence validation failed' }); return }

    const licenceInfo = await this.licenceManager.validate({ useCache: true })
    const state = await this.store.read()
    const currentStage = deriveCurrentStage(state)

    // Repair: backfill memory and regenerate docs for any completed stages
    // that are missing from the memory log. Runs async so it never delays
    // the opening prompt. Covers older projects saved before memory push was
    // introduced, and any partial saves that previously skipped this step.
    void this.repairStateSync(state)

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

    console.log('[Storyline] ready: stage =', currentStage?.id, 'mode =', state.mode, 'provider =', this.provider?.id)

    if (!currentStage) {
      this.post({ type: 'error', message: `DEBUG: no active stage (mode=${state.mode ?? 'unset'})` })
      return
    }

    const displayTurns = this.turnHistory.allDisplay()
    if (displayTurns.length > 0) {
      this.post({ type: 'restoreMessages', turns: displayTurns })
      if (this.turnHistory.allForStage(currentStage.id).length === 0) {
        await this.fireOpeningPrompt(currentStage.id, state)
      }
    } else {
      await this.fireOpeningPrompt(currentStage.id, state)
    }
  }

  private async init(): Promise<void> {
    await this.handleWebviewReady()
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type) {
      case 'send':
        try {
          await this.handleUserMessage(msg.text as string)
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err)
          console.error('[Storyline] handleUserMessage threw:', err)
          this.post({ type: 'streamError', message: m })
        }
        break
      case 'ready':
        void this.handleWebviewReady()
        break
      case 'beginPlanning':
        await this.handleBeginPlanning()
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
      case 'openProjectFile': {
        // FIC-A.6: open an artefact path (relative to project root) from
        // the planning-complete card.
        const rel = msg.path as string
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (rel && root) {
          const uri = vscode.Uri.file(path.join(root, rel))
          await vscode.commands.executeCommand('vscode.open', uri)
        }
        break
      }
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
      case 'stop':
        this.streamCancelled = true
        break
      case 'newChat':
        await this.handleNewChat()
        break
      case 'listSessions':
        this.handleListSessions()
        break
      case 'loadSession':
        await this.handleLoadSession(msg.id as string)
        break
    }
  }

  private getSessionsDir(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspaceFolder) return null
    return path.join(workspaceFolder, '.storyline', 'sessions')
  }

  private async handleNewChat(): Promise<void> {
    const sessionsDir = this.getSessionsDir()
    if (sessionsDir) this.turnHistory.archiveCurrentSession(sessionsDir)
    this.turnHistory.clearAll()
    this.turnHistory.clearDisplay()
    this.post({ type: 'clearMessages' })
    if (!this.store) return
    const state = await this.store.read()
    const currentStage = deriveCurrentStage(state)
    if (currentStage) await this.fireOpeningPrompt(currentStage.id, state)
  }

  private handleListSessions(): void {
    const sessionsDir = this.getSessionsDir()
    if (!sessionsDir) { this.post({ type: 'sessionsLoaded', sessions: [] }); return }
    const sessions = this.turnHistory.listSessions(sessionsDir)
    this.post({ type: 'sessionsLoaded', sessions })
  }

  private async handleLoadSession(id: string): Promise<void> {
    const sessionsDir = this.getSessionsDir()
    if (!sessionsDir) return
    const session = this.turnHistory.loadSession(sessionsDir, id)
    if (!session) return
    this.turnHistory.archiveCurrentSession(sessionsDir)
    this.turnHistory.restoreFromSession(session.displayTurns, session.stageHistory)
    this.post({ type: 'restoreMessages', turns: session.displayTurns })
  }

  private async handleBeginPlanning(): Promise<void> {
    if (!this.provider || !this.store) return
    const state = await this.store.read()
    const currentStage = deriveCurrentStage(state)
    if (!currentStage) {
      this.postPlanningCompleteCard(state)
      return
    }
    await this.fireOpeningPrompt(currentStage.id, state)
  }

  /** Walk the project dir for existing artefacts and post a
   *  `planningComplete` card. Replaces the silent null-stage return
   *  with a concrete handoff into drafting. */
  private postPlanningCompleteCard(state: ProjectState): void {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) {
      this.post({ type: 'streamError', message: 'All planning stages are complete — time to start writing the book.' })
      return
    }
    try {
      const plan = getWritingPlan(state)
      const artefacts = discoverPlanningArtefacts(state, plan, projectDir)
      this.post({ type: 'planningComplete', artefacts })
    } catch (err) {
      console.warn('[Storyline] postPlanningCompleteCard failed', err)
      this.post({ type: 'streamError', message: 'All planning stages are complete — time to start writing the book.' })
    }
  }

  private async handleUserMessage(text: string): Promise<void> {
    if (!this.provider || !this.store) return

    const state = await this.store.read()
    const currentStage = deriveCurrentStage(state)
    if (!currentStage) {
      this.postPlanningCompleteCard(state)
      return
    }

    this.turnHistory.append(currentStage.id, { role: 'user', content: text })
    this.turnHistory.appendDisplay({ role: 'user', content: text })
    this.post({ type: 'userMessage', text })

    // Ensure syllabi/ folder exists the first time the writer reaches ac-syllabus
    if (currentStage.id === 'ac-syllabus') {
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (projectDir) seedSyllabiFolder(projectDir)
    }

    const systemPrompt = buildSystemPrompt(currentStage.id, state)
    const messages: Message[] = this.turnHistory.allForStage(currentStage.id)

    const full = await this.streamResponse(currentStage.id, systemPrompt, messages, state)
    // Stop button: if the writer cancelled mid-stream, do not run any of the
    // post-stream side effects (stage save, file writes, file reads). Without
    // this guard the cancelled stream's partial output still triggers a
    // stage-save chain and chained file reads, which feels like the stop
    // button "didn't work".
    if (this.streamCancelled) {
      this.refreshCreditBalance()
      return
    }
    if (full) this.turnHistory.appendDisplay({ role: 'assistant', content: full })
    await this.applyEmittedPatches(full, currentStage.id)
    await this.applyFileWrites(full)
    const reloaded = await this.store.read()
    const activeStage = deriveCurrentStage(reloaded)
    if (activeStage) await this.applyFileReads(full, activeStage.id, reloaded)
    this.refreshCreditBalance()
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
    await this.applyFileWrites(full)
    this.refreshCreditBalance()
  }

  private refreshCreditBalance(): void {
    this.licenceManager.validate({ useCache: false }).then(info => {
      if (typeof info.creditBalance === 'number') {
        this.post({ type: 'creditUpdate', balance: info.creditBalance })
      }
    }).catch(() => { /* ignore */ })
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

    // 500ms is ample for sox/ffmpeg to flush the WAV header on a clean SIGINT.
    // The old 2000ms cap was the dominant source of perceived latency.
    await new Promise<void>(resolve => {
      const done = () => resolve()
      proc.once('close', done)
      setTimeout(done, 500)
    })

    try {
      const audioBuffer = fs.readFileSync(tmpFile)
      fs.unlinkSync(tmpFile)
      await this.handleTranscribe(audioBuffer, 'audio/wav')
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

  private async handleTranscribe(audioBuffer: Buffer, mimeType: string): Promise<void> {
    const licenceKey = await this.licenceManager.getLicenceKey()
    if (!licenceKey) {
      this.post({ type: 'transcribeError', message: 'No licence key — activate Storyline first.' })
      return
    }

    const state = this.store ? await this.store.read() : null
    const projectContext = state ? this.buildProjectContext(state) : ''

    try {
      // Send raw binary multipart — no base64 encode/decode overhead
      const form = new FormData()
      form.append('licenceKey', licenceKey)
      form.append('audio', new Blob([audioBuffer], { type: mimeType }), 'audio.wav')
      if (projectContext) form.append('projectContext', projectContext)

      const res = await fetch(`${getBackendUrl()}/transcribe`, {
        method: 'POST',
        body: form,
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

    // dna-category: if the writer's category infers academic, set pipeline + bookType
    // immediately so stageOrderFor switches to NF_ACADEMIC_DNA_STAGE_ORDER from the
    // very next stage. Without this fix the trimmed academic DNA (skipping dna-comps
    // and dna-voice, adding dna-ac-level/spec/assessment) is never reached.
    if (stageId === 'dna-category') {
      const catData = (normalizedPatch as Record<string, unknown>)?.['dna-category'] as Record<string, unknown> | undefined
      const category = catData?.primaryCategory as string | undefined
      const inferred = category ? inferPipelineFromCategory(category) : null
      if (inferred === 'academic') {
        const rawBookType = catData?.bookType as string | undefined
        const bookType = rawBookType === 'textbook' || rawBookType === 'revision-guide' ? rawBookType : undefined
        normalizedPatch = {
          ...normalizedPatch,
          pipeline: 'academic',
          ...(bookType ? { bookType } : {}),
        } as Partial<ProjectState>
        console.log('[Storyline] dna-category: academic — setting pipeline → academic, bookType →', bookType)
      }
    }

    // dna-consolidate: extract confirmedPipeline → state.pipeline so that
    // stageOrderFor returns the chosen Phase 1 pipeline stages. Without this,
    // pipeline stays 'novel', stageOrderFor returns only Phase 0, and the
    // planner gets stuck after all DNA stages complete.
    if (stageId === 'dna-consolidate') {
      const stageData = (normalizedPatch as Record<string, unknown>)?.['dna-consolidate'] as Record<string, unknown> | undefined
      const confirmed = stageData?.confirmedPipeline as string | undefined
      if (confirmed === 'A' || confirmed === 'B' || confirmed === 'C' || confirmed === 'academic') {
        normalizedPatch = { ...normalizedPatch, pipeline: confirmed } as Partial<ProjectState>
        console.log('[Storyline] dna-consolidate: setting pipeline →', confirmed)
      }
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
        // Stage not yet complete — stay on the same stage. But keep docs and
        // memory in sync with state.json so all three stores remain consistent
        // even for partial AI updates. Without this, a mid-conversation update
        // would leave state.json ahead of both memory and the stage-doc files.
        const pd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (pd) {
          writeStageDoc(stageId, newState, pd)
            .catch(err => console.warn('[Storyline] writeStageDoc (partial) failed', err))
        }
        pushToMemory(stageId, normalizedPatch as Record<string, unknown>)
          .then(r => console.log(`[Storyline] memory (partial): ${stageId} → ${r.method}`))
          .catch(() => { /* non-fatal */ })
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
      const plan = getWritingPlan(finalState)
      try {
        seedManuscriptFromPlan(plan, projectDir)
      } catch (err) {
        console.warn('[Storyline] seedManuscriptFromPlan failed', err)
      }
      // Regenerate promise/payoff ledger after any chapter-outline or plot-thread save.
      if (finalState.mode === 'fiction' && (stageId === 'chapterOutline' || stageId === 'plotThreads')) {
        try {
          generatePromisePayoffLedger(plan, projectDir)
        } catch (err) {
          console.warn('[Storyline] generatePromisePayoffLedger failed', err)
        }
      }
      // Regenerate story bible after cast / relationship / chapter / beat saves.
      const STORY_BIBLE_STAGES = ['characters', 'relationships', 'chapterOutline', 'beatSheet']
      if (finalState.mode === 'fiction' && STORY_BIBLE_STAGES.includes(stageId)) {
        try {
          generateStoryBible(plan, projectDir)
        } catch (err) {
          console.warn('[Storyline] generateStoryBible failed', err)
        }
      }
      // Regenerate arc matrix after protagonist / cast / chapter / beat saves.
      const ARC_MATRIX_STAGES = ['protagonist', 'characters', 'chapterOutline', 'beatSheet']
      if (finalState.mode === 'fiction' && ARC_MATRIX_STAGES.includes(stageId)) {
        try {
          generateCharacterArcMatrix(plan, projectDir)
        } catch (err) {
          console.warn('[Storyline] generateCharacterArcMatrix failed', err)
        }
      }
      // NF artefacts — regenerate after relevant stage saves.
      if (finalState.mode === 'nonfiction') {
        // NF master doc after any master stage.
        if (stageId === 'pa-master' || stageId === 'pb-master' || stageId === 'pc-master') {
          try {
            generateNfMasterDocument(plan, finalState, projectDir)
          } catch (err) {
            console.warn('[Storyline] generateNfMasterDocument failed', err)
          }
        }
        // Research todo after chapter-plan or evidence-map saves.
        const RESEARCH_TODO_STAGES = ['pa-chapters', 'pb-chapters', 'pc-lessons', 'pa-evidence', 'pb-evidence']
        if (RESEARCH_TODO_STAGES.includes(stageId)) {
          try {
            generateResearchTodo(plan, projectDir)
          } catch (err) {
            console.warn('[Storyline] generateResearchTodo failed', err)
          }
        }
        // NF-12: Claim/evidence ledger after evidence or sourcing stage saves.
        const CLAIM_LEDGER_STAGES = ['pa-evidence', 'pb-sourcing', 'pa-master', 'pb-master', 'pc-master']
        if (CLAIM_LEDGER_STAGES.includes(stageId)) {
          try {
            generateClaimEvidenceLedger(plan, projectDir)
          } catch (err) {
            console.warn('[Storyline] generateClaimEvidenceLedger failed', err)
          }
        }
        // NF-13: Figure registry after chapter-plan saves.
        const FIGURE_REGISTRY_STAGES = ['pa-chapters', 'pb-chapters', 'pc-lessons']
        if (FIGURE_REGISTRY_STAGES.includes(stageId)) {
          try {
            generateFigureRegistry(plan, projectDir)
          } catch (err) {
            console.warn('[Storyline] generateFigureRegistry failed', err)
          }
        }
      }
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

    // 2. Promise/payoff gaps (fiction only, after chapter-outline or plot-threads)
    try {
      if (finalState.mode === 'fiction' && (stageId === 'chapterOutline' || stageId === 'plotThreads')) {
        const gaps = findFictionPromiseGaps(getWritingPlan(finalState))
        if (gaps.length > 0) {
          const ledgerPath = 'output/promise-payoff-ledger.md'
          const summary = gaps.slice(0, 3).map(g => `**${g.promise.description}**: ${g.gapDescription}`).join('; ')
          this.post({
            type: 'findingsCard',
            findings: [{
              id: 'promise-payoff-gaps',
              name: 'Promise / Payoff Gaps',
              severity: 'warning',
              description: `${gaps.length} setup${gaps.length !== 1 ? 's' : ''} have no planned payoff: ${summary}`,
              details: gaps.map(g => g.gapDescription),
              fixProtocol: [`Open ${ledgerPath} for the full ledger`, 'Add a resolution plan to each flagged plot thread in the Plot Thread Registry stage'],
            }],
          })
        }
      }
    } catch (err) {
      console.warn('[Storyline] findFictionPromiseGaps failed', err)
    }

    // 3. Series detector (fiction only, after premise)
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

    // 5. Model-backed critique (fire-and-forget — never blocks stage advance).
    // Stages in NO_CRITIQUE_STAGES are deliberately suppressed (validate-tier
    // schema nags + auto-generated master-docs). Everything else fires the
    // backend critique endpoint at the tier the backend picks.
    void this.runCritique(stageId, finalState).catch(err => {
      console.warn('[Storyline] runCritique threw', err)
    })

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
      await this.fireOpeningPrompt(nextStage.id, finalState)
    } else {
      // FIC-A.6: planning is complete — post the handoff card listing
      // the artefacts the writer can open. Replaces the previous silent
      // dead-end after the last master stage saves.
      this.postPlanningCompleteCard(finalState)
    }
  }

  /**
   * Read requested files and re-run the AI with their contents injected.
   *
   * Design contract:
   * - File reads are INFORMATION GATHERING. They never trigger a stage save or
   *   stage advance — that would hijack the conversation context mid-read.
   *   Stage saves only happen on explicit user turns via applyEmittedPatches.
   * - If the AI's response after reading ALSO requests a file read (chained
   *   reads), we recurse up to MAX_READ_DEPTH times so the AI can gather
   *   everything it needs before generating a final response.
   * - File WRITES (to non-manuscript planning docs) are still applied after
   *   each read so the AI can update docs it just read.
   */
  private static readonly MAX_READ_DEPTH = 3

  private async applyFileReads(
    aiText: string,
    stageId: string,
    state: ProjectState,
    depth = 0,
  ): Promise<boolean> {
    if (depth >= ChatPanel.MAX_READ_DEPTH) {
      console.warn('[Storyline] file_read: max depth reached, stopping')
      return false
    }

    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) return false
    const requests = extractFileReadRequests(aiText)
    if (requests.length === 0) return false

    const parts: string[] = []
    for (const relPath of requests) {
      if (path.isAbsolute(relPath) || relPath.split('/').includes('..')) {
        console.warn('[Storyline] file_read rejected (unsafe path):', relPath)
        continue
      }
      const absPath = path.join(projectDir, relPath)
      if (!absPath.startsWith(projectDir + path.sep) && absPath !== projectDir) {
        console.warn('[Storyline] file_read rejected (outside project):', relPath)
        continue
      }
      try {
        const content = fs.readFileSync(absPath, 'utf-8')
        parts.push(`[File: ${relPath}]\n\n${content}`)
        console.log('[Storyline] file_read injected:', relPath, `(depth=${depth})`)
      } catch (err) {
        parts.push(`[File: ${relPath}]\n\n(File not found or unreadable)`)
        console.warn('[Storyline] file_read failed:', relPath, err)
      }
    }

    if (parts.length === 0) return false

    // Add file content to the AI turn history (internal context only — don't
    // dump the raw markdown into the display log or the chat UI).
    const injected = parts.join('\n\n---\n\n')
    this.turnHistory.append(stageId, { role: 'user', content: injected })

    const systemPrompt = buildSystemPrompt(stageId, state)
    const messages = this.turnHistory.allForStage(stageId)
    const full = await this.streamResponse(stageId, systemPrompt, messages, state)
    if (this.streamCancelled) return true
    if (full) this.turnHistory.appendDisplay({ role: 'assistant', content: full })

    // Apply file writes (e.g. AI updates a planning doc after reading it).
    // Do NOT call applyEmittedPatches here — stage saves belong to explicit
    // user turns only. Calling it mid-read triggers a stage advance and
    // fireOpeningPrompt which hijacks the conversational context.
    await this.applyFileWrites(full)

    // Recurse: if the AI's response requests another file read, handle it
    // before returning control to the user.
    await this.applyFileReads(full, stageId, state, depth + 1)
    return true
  }

  private async applyFileWrites(aiText: string): Promise<void> {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) return
    const writes = extractFileWrites(aiText)
    for (const { path: relPath, content } of writes) {
      if (path.isAbsolute(relPath) || relPath.split('/').includes('..')) {
        console.warn('[Storyline] file_write rejected (unsafe path):', relPath)
        continue
      }
      const absPath = path.join(projectDir, relPath)
      if (!absPath.startsWith(projectDir + path.sep) && absPath !== projectDir) {
        console.warn('[Storyline] file_write rejected (outside project):', relPath)
        continue
      }

      // Guard: manuscript writes always require explicit writer confirmation.
      // This is enforced in code — not in the prompt — so the model cannot
      // bypass it. Planning docs (docs/, output/) are unrestricted.
      const decision = guardFileWrite(relPath, absPath, content)
      if (!decision.allowed) {
        console.warn('[Storyline] file_write guarded:', relPath, '—', decision.reason)
        this.post({ type: 'fileWriteBlocked', path: relPath, reason: decision.reason })
        const approved = await confirmWrite(relPath, decision.stats)
        if (!approved) {
          console.log('[Storyline] file_write blocked by writer:', relPath)
          continue
        }
      }

      try {
        await fs.promises.mkdir(path.dirname(absPath), { recursive: true })
        await fs.promises.writeFile(absPath, content, 'utf-8')
        console.log('[Storyline] file written:', relPath)
        this.post({ type: 'fileWritten', path: relPath })
      } catch (err) {
        console.warn('[Storyline] file_write failed:', relPath, err)
      }
    }
  }

  private async fireOpeningPrompt(stageId: string, state: ProjectState): Promise<void> {
    if (!this.provider) {
      this.post({ type: 'error', message: `DEBUG: fireOpeningPrompt — provider null at stage ${stageId}` })
      return
    }

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
    const full = await this.streamResponse(stageId, systemPrompt, messages, state)
    // Save the AI's opener to the display log (synthetic kickoff is intentionally excluded).
    if (full) this.turnHistory.appendDisplay({ role: 'assistant', content: full })
  }

  private async streamResponse(
    stageId: string,
    systemPrompt: string,
    messages: Message[],
    _state: ProjectState,
    seedContent?: string,
  ): Promise<string> {
    if (!this.provider) return ''

    this.streamCancelled = false
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
        onUsage: (usage) => { this.post({ type: 'requestUsage', ...usage }) },
      } as Parameters<typeof this.provider.chat>[1] & { stageId: string })

      for await (const chunk of stream) {
        if (this.streamCancelled) break
        full += chunk
        this.post({ type: 'streamChunk', text: chunk })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Storyline] streamResponse failed:', err)
      if (msg.includes('402') || /credit|quota|exhausted/i.test(msg)) {
        this.post({ type: 'creditsExhausted' })
        void promptOnCreditsExhausted(this.context, getBackendUrl())
      } else if (msg.includes('401') || /invalid licence|invalid license/i.test(msg)) {
        await this.licenceManager.clearCache()
        this.post({
          type: 'streamError',
          message: 'Licence verification failed. Run "Storyline: Enter Licence Key" to re-activate.',
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
    // Decide whether to skip via the pure helper. Reasons surface to the log
    // so silent skips are still visible during debugging, but no UI noise.
    const providerKind = detectProviderKind(this.provider?.constructor?.name)
    const licenceKey = providerKind === 'managed'
      ? await this.licenceManager.getLicenceKey()
      : null
    const skip = shouldSkipCritique({
      stageId,
      providerKind,
      hasLicenceKey: !!licenceKey,
    })
    if (skip.skip) {
      console.log(`[Storyline] critique: skipped — ${skip.detail}`)
      return
    }

    let response: Response
    try {
      response = await fetch(`${getBackendUrl()}/critique`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenceKey,
          stageId,
          state,
          qualityMode: getQualityMode(),
        }),
      })
    } catch (err) {
      const action = interpretCritiqueNetworkError(err)
      console.warn(`[Storyline] critique: network error for ${stageId}`, err)
      if (action.action === 'stream-error') {
        this.post({ type: 'streamError', message: action.message })
      }
      return
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      console.warn(`[Storyline] critique: backend ${response.status} for ${stageId}${bodyText ? ' — ' + bodyText : ''}`)
      const action = interpretCritiqueHttpError({ status: response.status, bodyText })
      if (action.action === 'stream-error') {
        this.post({ type: 'streamError', message: action.message })
      }
      // silent-credits-exhausted: streamResponse path will surface 402 on
      // the next chat turn — no card here.
      return
    }

    const data = await response.json() as { findings?: string; tier?: string }
    const action = interpretCritiqueOk(data)
    if (action.action === 'card') {
      console.log(`[Storyline] critique: ${stageId} → ${action.tier} (${action.findings.length} chars)`)
      this.post({ type: 'critiqueCard', findings: action.findings, tier: action.tier, stageId })
    } else {
      console.log(`[Storyline] critique: ${stageId} returned no findings`)
    }
  }

  private post(msg: Record<string, unknown>): void {
    this.panel.webview.postMessage(msg)
  }

  /**
   * Backfill memory and regenerate stage docs for completed stages that are
   * missing from `.storyline/memory.jsonl`. Runs once per project open,
   * async, non-blocking. Covers:
   *  - Projects saved before memory push was introduced
   *  - Stages where pushToMemory previously failed silently
   *  - Partial saves that previously skipped doc/memory sync
   */
  private async repairStateSync(state: ProjectState): Promise<void> {
    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) return

    const completedStageIds = Object.entries(state.stages ?? {})
      .filter(([, s]) => (s as { completed?: boolean })?.completed)
      .map(([id]) => id)
    if (completedStageIds.length === 0) return

    // Determine which stage IDs already have a memory.jsonl entry.
    const logPath = path.join(projectDir, '.storyline', 'memory.jsonl')
    const memorisedIds = new Set<string>()
    try {
      const raw = fs.readFileSync(logPath, 'utf-8')
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line) as { stageId?: string }
          if (entry.stageId) memorisedIds.add(entry.stageId)
        } catch { /* skip malformed line */ }
      }
    } catch { /* memory.jsonl doesn't exist yet */ }

    let backfilled = 0
    for (const stageId of completedStageIds) {
      // Regenerate the stage doc unconditionally — cheap file write, ensures
      // the doc always reflects the current state.json.
      writeStageDoc(stageId, state, projectDir)
        .catch(err => console.warn('[Storyline] repair writeStageDoc failed:', stageId, err))

      // Backfill memory only for stages not already logged.
      if (!memorisedIds.has(stageId)) {
        const stageData = (state as unknown as Record<string, unknown>)[stageId]
        if (stageData && typeof stageData === 'object') {
          await pushToMemory(stageId, stageData as Record<string, unknown>)
            .then(r => console.log(`[Storyline] repair memory: ${stageId} → ${r.method}`))
            .catch(err => console.warn('[Storyline] repair pushToMemory failed:', stageId, err))
          backfilled++
        }
      }
    }

    if (backfilled > 0) {
      console.log(`[Storyline] repairStateSync: backfilled memory for ${backfilled} stage(s)`)
    }
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

