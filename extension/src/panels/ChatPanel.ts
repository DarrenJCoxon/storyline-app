import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { spawn, type ChildProcess, execSync } from 'child_process'
import { deriveCurrentStage, stageOrderFor, type ProjectState, runStoryTraps, detectSeriesPotential, getDownstreamImpacts, writeStageDoc, gateStageSave, seedManuscriptFromPlan, getWritingPlan, generatePromisePayoffLedger, findFictionPromiseGaps, generateStoryBible, generateCharacterArcMatrix, generateNfMasterDocument, generateAcademicMasterDocument, generateResearchTodo, generateClaimEvidenceLedger, generateFigureRegistry, seedSyllabiFolder, inferPipelineFromCategory } from '@storyline/core'
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
import { triggerWikiCompilation } from '../wiki/article-compiler.js'
import { LicenceManager } from '../auth/licence.js'
import { offerReactivation } from '../auth/reactivate-prompt.js'
import { promptOnCreditsExhausted } from '../onboarding/licence-prompt.js'
import { updateCreditBalance } from '../credits/credit-display.js'
// Free-tier keys are minted server-side per install and all begin with
// SL-FREE- (legacy shared key SL-FREE-0000-0000-FREE also matches).
const isFreeKey = (key: string | undefined): boolean => !!key && key.startsWith('SL-FREE-')
import { ManagedProvider } from '../ai/managed-provider.js'
import { logInfo, logWarn, logError } from '../diagnostic-log.js'
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
  private webviewReadyFired = false
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
    setTimeout(() => {
      if (!this.webviewReadyFired) void this.handleWebviewReady()
    }, 2000)
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

  public dispose(): void {
    this.panel.dispose()
  }

  // Called every time the webview signals it is ready (including after reloads).
  // One-time setup (provider, store, turn history paths) is guarded by
  // this.initialised so it only runs once per panel lifetime. State delivery
  // to the webview always runs so a reloaded webview is never stuck.
  private async handleWebviewReady(): Promise<void> {
    if (this.webviewReadyFired) return
    this.webviewReadyFired = true
    try {
      await this._handleWebviewReady()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError('[Storyline] handleWebviewReady threw:', err)
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

      const storedKey = await this.licenceManager.getLicenceKey()
      logInfo('[Storyline] ChatPanel.init: stored key prefix =', storedKey?.slice(0, 12) ?? '(none)')
      // Trust the cached validate from the activation flow — useFree (and
      // the toast / deep-link paths) all run validate({}) just before opening
      // chat. Re-validating here would force a backend round-trip that races
      // KV propagation for a freshly-minted free key. Cache hit means the
      // activation was confirmed seconds ago and the in-panel /chat retry
      // logic can absorb any remaining colo lag.
      const licenceInfo = await this.licenceManager.validate({ useCache: true })
      logInfo('[Storyline] ChatPanel.init: validate =', licenceInfo)
      this.provider = await this.resolveProvider(licenceInfo)

      // If validation returned invalid AND the user has a stored key, the key
      // needs re-activation (expired, backend reset, etc.). Surface a friendly
      // prompt here rather than letting the opening AI call fail with a 401.
      if (!licenceInfo.valid && storedKey) {
        const isFree = isFreeKey(storedKey)
        this.post({
          type: 'streamError',
          message: isFree
            ? 'Couldn\'t reach your free plan. A "Reset & start over" prompt is at the bottom right of VS Code — click it to re-mint your free credits. (No email needed for the free plan.)'
            : 'Couldn\'t verify your licence. A reactivation prompt is at the bottom right of VS Code — click "Paste key from email" to enter the licence key from your purchase email.',
        })
        void offerReactivation(this.context, getBackendUrl(), { isFree })
        return
      }
    }

    if (!this.store) { this.post({ type: 'error', message: 'No workspace folder is open. Open your project folder and try again.' }); return }
    if (!this.provider) { this.post({ type: 'error', message: 'Licence validation failed. Try running Storyline: Activate Licence from the command palette.' }); return }

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

    logInfo('[Storyline] ready: stage =', currentStage?.id, 'mode =', state.mode, 'provider =', this.provider?.id)

    if (!currentStage) {
      this.post({ type: 'error', message: `No active stage found. Try restarting the Storyline panel.` })
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
          logError('[Storyline] handleUserMessage threw:', err)
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
      case 'getReferralStats':
        void this.handleGetReferralStats()
        break
      case 'openExternal': {
        const url = msg.url as string | undefined
        if (url && /^https?:|^mailto:/.test(url)) {
          void vscode.env.openExternal(vscode.Uri.parse(url))
        }
        break
      }
      case 'clipboardWrite': {
        const text = msg.text as string | undefined
        if (text) {
          await vscode.env.clipboard.writeText(text)
        }
        break
      }
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
      logWarn('[Storyline] postPlanningCompleteCard failed', err)
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
        // Mirror the new balance to the persistent status-bar item +
        // low-credit-warning logic. Webview header shows it inline; the
        // status bar shows it everywhere across the workspace.
        void updateCreditBalance(info.creditBalance, info.type)
      }
    }).catch(() => { /* ignore */ })
  }

  /** Fetch /referral/stats and post it back to the share modal. Silent
   *  on network failure — the modal stays in its loading state, which
   *  is acceptable for a non-essential UI surface. */
  private async handleGetReferralStats(): Promise<void> {
    const key = await this.licenceManager.getLicenceKey()
    if (!key) return
    try {
      const res = await fetch(`${getBackendUrl()}/referral/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenceKey: key }),
      })
      if (!res.ok) return
      const stats = await res.json() as {
        code: string; referralCount: number; creditsEarned: number; capRemaining: number
      }
      this.post({ type: 'referralStats', ...stats })
    } catch {
      /* leave modal in loading state */
    }
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
      await this.handleTranscribe(audioBuffer.toString('base64'), 'audio/wav')
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
        logInfo('[Storyline] dna-category: academic — setting pipeline → academic, bookType →', bookType)
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
        logInfo('[Storyline] dna-consolidate: setting pipeline →', confirmed)
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
        logWarn('[Storyline] Save gated — incomplete fields for', stageId, ':', gate.missing)
        this.post({ type: 'saveGated', stageId, missing: gate.missing })
        // Stage not yet complete — stay on the same stage. But keep docs and
        // memory in sync with state.json so all three stores remain consistent
        // even for partial AI updates. Without this, a mid-conversation update
        // would leave state.json ahead of both memory and the stage-doc files.
        const pd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (pd) {
          writeStageDoc(stageId, newState, pd)
            .catch(err => logWarn('[Storyline] writeStageDoc (partial) failed', err))
        }
        pushToMemory(stageId, normalizedPatch as Record<string, unknown>)
          .then(r => logInfo(`[Storyline] memory (partial): ${stageId} → ${r.method}`))
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
      logInfo(`[Storyline] memory: ${stageId} → ${result.method}${result.error ? ' (' + result.error + ')' : ''}`)
      this.post({ type: 'memoryStored', stageId, method: result.method, error: result.error })
    }).catch(err => logWarn('[Storyline] pushToMemory threw', err))

    const stageName = stageOrderFor(finalState).find(s => s.id === stageId)?.name ?? stageId
    logInfo(`[Storyline] stage SAVED: ${stageId} (${stageName}) — state.json updated`)
    this.post({
      type: 'stageComplete',
      stageId,
      stageName,
      statePath: this.store.path,
    })

    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (projectDir) {
      // Artefact regeneration runs in the background — never block the next-
      // stage opening prompt on it. These generators read the project state,
      // walk chapters/scenes/beats, and write large markdown files via sync
      // fs.writeFileSync. Inlining them here used to add 3-8s of blocked
      // main thread between stageComplete and stageAdvance — the user saw
      // a long silence after locking a stage. Deferring to the next
      // microtask via Promise.resolve().then() lets the synchronous flow
      // proceed to fireOpeningPrompt immediately; artefacts catch up after.
      const plan = getWritingPlan(finalState)
      const defer = (label: string, fn: () => unknown): void => {
        void Promise.resolve().then(() => {
          try { fn() } catch (err) { logWarn(`[Storyline] ${label} failed`, err) }
        })
      }

      writeAllChapterCards(finalState, projectDir).catch(err => logWarn('[Storyline] writeAllChapterCards failed', err))
      defer('seedManuscriptFromPlan', () => seedManuscriptFromPlan(plan, projectDir))

      // Regenerate promise/payoff ledger after any chapter-outline or plot-thread save.
      if (finalState.mode === 'fiction' && (stageId === 'chapterOutline' || stageId === 'plotThreads')) {
        defer('generatePromisePayoffLedger', () => generatePromisePayoffLedger(plan, projectDir))
      }
      // Regenerate story bible after cast / relationship / chapter / beat saves.
      const STORY_BIBLE_STAGES = ['characters', 'relationships', 'chapterOutline', 'beatSheet']
      if (finalState.mode === 'fiction' && STORY_BIBLE_STAGES.includes(stageId)) {
        defer('generateStoryBible', () => generateStoryBible(plan, projectDir))
      }
      // Regenerate arc matrix after protagonist / cast / chapter / beat saves.
      const ARC_MATRIX_STAGES = ['protagonist', 'characters', 'chapterOutline', 'beatSheet']
      if (finalState.mode === 'fiction' && ARC_MATRIX_STAGES.includes(stageId)) {
        defer('generateCharacterArcMatrix', () => generateCharacterArcMatrix(plan, projectDir))
      }
      // Wiki article compilation — synthesises each completed stage into a
      // short prose article in .storyline/wiki/ for injection into future
      // prompts. Async, fire-and-forget, never blocks stage advance.
      triggerWikiCompilation(stageId, finalState, projectDir, getBackendUrl(), () => this.licenceManager.getLicenceKey())

      // NF artefacts — regenerate after relevant stage saves.
      if (finalState.mode === 'nonfiction') {
        if (stageId === 'ac-master' && plan.academic) {
          defer('generateAcademicMasterDocument', () => generateAcademicMasterDocument(plan, finalState, projectDir))
        } else if (stageId === 'pa-master' || stageId === 'pb-master' || stageId === 'pc-master') {
          defer('generateNfMasterDocument', () => generateNfMasterDocument(plan, finalState, projectDir))
        }
        const RESEARCH_TODO_STAGES = ['pa-chapters', 'pb-chapters', 'pc-lessons', 'pa-evidence', 'pb-evidence']
        if (RESEARCH_TODO_STAGES.includes(stageId)) {
          defer('generateResearchTodo', () => generateResearchTodo(plan, projectDir))
        }
        const CLAIM_LEDGER_STAGES = ['pa-evidence', 'pb-sourcing', 'pa-master', 'pb-master', 'pc-master']
        if (CLAIM_LEDGER_STAGES.includes(stageId)) {
          defer('generateClaimEvidenceLedger', () => generateClaimEvidenceLedger(plan, projectDir))
        }
        const FIGURE_REGISTRY_STAGES = ['pa-chapters', 'pb-chapters', 'pc-lessons']
        if (FIGURE_REGISTRY_STAGES.includes(stageId)) {
          defer('generateFigureRegistry', () => generateFigureRegistry(plan, projectDir))
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
      logWarn('[Storyline] runStoryTraps failed', err)
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
      logWarn('[Storyline] findFictionPromiseGaps failed', err)
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
      logWarn('[Storyline] detectSeriesPotential failed', err)
    }

    // 3. Downstream impacts warning
    try {
      const impacts = getDownstreamImpacts(stageId)
      if (impacts.length > 0) {
        this.post({ type: 'downstreamImpacts', stageId, impacts })
      }
    } catch (err) {
      logWarn('[Storyline] getDownstreamImpacts failed', err)
    }

    // 4. Write stage doc
    if (projectDir) {
      writeStageDoc(stageId, finalState, projectDir)
        .then(filePath => logInfo(`[Storyline] stage doc: ${stageId} → ${filePath ?? '(no renderer)'}`))
        .catch(err => logWarn('[Storyline] writeStageDoc failed', err))
    }

    // 5. Model-backed critique (fire-and-forget — never blocks stage advance).
    // Stages in NO_CRITIQUE_STAGES are deliberately suppressed (validate-tier
    // schema nags + auto-generated master-docs). Everything else fires the
    // backend critique endpoint at the tier the backend picks.
    void this.runCritique(stageId, finalState).catch(err => {
      logWarn('[Storyline] runCritique threw', err)
    })

    // ── Stage advance — MUST run, regardless of side-effect errors above.
    let nextStage: ReturnType<typeof deriveCurrentStage> = null
    try {
      nextStage = deriveCurrentStage(finalState)
    } catch (err) {
      logError('[Storyline] deriveCurrentStage failed after save — aborting advance', err)
      this.post({ type: 'streamError', message: 'Could not determine next stage. Please reload the planning panel.' })
      return
    }

    logInfo('[Storyline] advance:', stageId, '→', nextStage?.id ?? '(none)')

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
      logWarn('[Storyline] file_read: max depth reached, stopping')
      return false
    }

    const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!projectDir) return false
    const requests = extractFileReadRequests(aiText)
    if (requests.length === 0) return false

    const parts: string[] = []
    for (const relPath of requests) {
      if (path.isAbsolute(relPath) || relPath.split('/').includes('..')) {
        logWarn('[Storyline] file_read rejected (unsafe path):', relPath)
        continue
      }
      const absPath = path.join(projectDir, relPath)
      if (!absPath.startsWith(projectDir + path.sep) && absPath !== projectDir) {
        logWarn('[Storyline] file_read rejected (outside project):', relPath)
        continue
      }
      try {
        const content = fs.readFileSync(absPath, 'utf-8')
        parts.push(`[File: ${relPath}]\n\n${content}`)
        logInfo('[Storyline] file_read injected:', relPath, `(depth=${depth})`)
      } catch (err) {
        parts.push(`[File: ${relPath}]\n\n(File not found or unreadable)`)
        logWarn('[Storyline] file_read failed:', relPath, err)
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
        logWarn('[Storyline] file_write rejected (unsafe path):', relPath)
        continue
      }
      const absPath = path.join(projectDir, relPath)
      if (!absPath.startsWith(projectDir + path.sep) && absPath !== projectDir) {
        logWarn('[Storyline] file_write rejected (outside project):', relPath)
        continue
      }

      // Guard: manuscript writes always require explicit writer confirmation.
      // This is enforced in code — not in the prompt — so the model cannot
      // bypass it. Planning docs (docs/, output/) are unrestricted.
      const decision = guardFileWrite(relPath, absPath, content)
      if (!decision.allowed) {
        logWarn('[Storyline] file_write guarded:', relPath, '—', decision.reason)
        this.post({ type: 'fileWriteBlocked', path: relPath, reason: decision.reason })
        const approved = await confirmWrite(relPath, decision.stats)
        if (!approved) {
          logInfo('[Storyline] file_write blocked by writer:', relPath)
          continue
        }
      }

      try {
        await fs.promises.mkdir(path.dirname(absPath), { recursive: true })
        await fs.promises.writeFile(absPath, content, 'utf-8')
        logInfo('[Storyline] file written:', relPath)
        this.post({ type: 'fileWritten', path: relPath })
      } catch (err) {
        logWarn('[Storyline] file_write failed:', relPath, err)
      }
    }
  }

  private async fireOpeningPrompt(stageId: string, state: ProjectState): Promise<void> {
    if (!this.provider) {
      this.post({ type: 'error', message: `Storyline isn't connected yet. Try running Storyline: Activate Licence from the command palette.` })
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

    // For any stage AFTER the first, prepend the tail of the cross-stage
    // display log so the AI knows what the user just said. Without this,
    // the new stage's opening question is asked cold and ignores anything
    // the user told the previous stage — e.g. naming the book's subject
    // during mode-detection, then being asked for the subject again at
    // the start of dna-category. We cap the tail at PRIOR_CONTEXT_TURNS
    // so token cost stays bounded.
    const PRIOR_CONTEXT_TURNS = 4
    const prior = stageId === 'mode'
      ? []
      : this.turnHistory.allDisplay().slice(-PRIOR_CONTEXT_TURNS)
    const messages: Message[] = [...prior, ...this.turnHistory.allForStage(stageId)]

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
      logError('[Storyline] streamResponse failed:', msg)
      if (msg.includes('402') || /credit|quota|exhausted/i.test(msg)) {
        this.post({ type: 'creditsExhausted' })
        void promptOnCreditsExhausted(this.context, getBackendUrl())
      } else if (msg.includes('401') || /invalid licence|invalid license/i.test(msg)) {
        await this.licenceManager.clearCache()
        const key = await this.licenceManager.getLicenceKey()
        const isFree = isFreeKey(key)
        logError('[Storyline] /chat returned 401 for stored key prefix =', key?.slice(0, 12) ?? '(none)')

        // KV is eventually consistent across Cloudflare colos. A freshly
        // minted free-tier key occasionally takes a few seconds to be
        // visible to the colo serving /chat, even after /validate already
        // saw it. Re-validate against the backend, and if it now reports
        // valid, retry the opening prompt once before surfacing the error.
        if (isFree && key) {
          await new Promise(r => setTimeout(r, 2500))
          const recheck = await this.licenceManager.validate({ useCache: false })
          logInfo('[Storyline] /chat 401 recheck validate =', recheck)
          if (recheck.valid) {
            this.post({ type: 'streamError', message: 'One moment — syncing your free plan…' })
            // Caller is already inside fireOpeningPrompt; surfacing this
            // hint is enough. The next user send will go through cleanly.
            return full
          }
        }

        this.post({
          type: 'streamError',
          message: isFree
            ? 'The AI didn\'t recognise your free plan. A "Reset & start over" prompt is at the bottom right — click it to re-mint your free credits.'
            : 'The AI couldn\'t verify your licence. A "Paste key from email" prompt is at the bottom right.',
        })
        void offerReactivation(this.context, getBackendUrl(), { isFree })
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

  private async resolveProvider(_licence?: { type: string; valid: boolean }): Promise<AIProvider> {
    // BYOK and Ollama paths are disabled in this build — every chat call
    // routes through the managed Cloudflare Worker. Stale BYOK/Ollama
    // flags from earlier testing were silently sending chat to dead
    // local endpoints whose failure messages happen to contain "401",
    // tripping the "didn't recognise your free plan" error path. This
    // forces the only known-good code path.
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
      logInfo(`[Storyline] critique: skipped — ${skip.detail}`)
      return
    }

    // Preflight: skip critique silently if the user has zero credits
    // (and isn't on BYOK). The chat-input gate already blocks the next
    // user turn; we don't want a critique to fire 402 in the background
    // and re-trigger the exhausted-credits modal for what is just an
    // automatic post-stage analysis.
    if (providerKind === 'managed') {
      try {
        const info = await this.licenceManager.validate({ useCache: true })
        if (info.valid && info.type !== 'byok' && info.creditBalance === 0) {
          logInfo(`[Storyline] critique: skipped — credits exhausted`)
          return
        }
      } catch {
        /* validate failure — fall through, backend's 402 handler covers it */
      }
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
      logWarn(`[Storyline] critique: network error for ${stageId}`, err)
      if (action.action === 'stream-error') {
        this.post({ type: 'streamError', message: action.message })
      }
      return
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      logWarn(`[Storyline] critique: backend ${response.status} for ${stageId}${bodyText ? ' — ' + bodyText : ''}`)
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
      logInfo(`[Storyline] critique: ${stageId} → ${action.tier} (${action.findings.length} chars)`)
      this.post({ type: 'critiqueCard', findings: action.findings, tier: action.tier, stageId })
    } else {
      logInfo(`[Storyline] critique: ${stageId} returned no findings`)
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
        .catch(err => logWarn('[Storyline] repair writeStageDoc failed:', stageId, err))

      // Backfill memory only for stages not already logged.
      if (!memorisedIds.has(stageId)) {
        const stageData = (state as unknown as Record<string, unknown>)[stageId]
        if (stageData && typeof stageData === 'object') {
          await pushToMemory(stageId, stageData as Record<string, unknown>)
            .then(r => logInfo(`[Storyline] repair memory: ${stageId} → ${r.method}`))
            .catch(err => logWarn('[Storyline] repair pushToMemory failed:', stageId, err))
          backfilled++
        }
      }
    }

    if (backfilled > 0) {
      logInfo(`[Storyline] repairStateSync: backfilled memory for ${backfilled} stage(s)`)
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

