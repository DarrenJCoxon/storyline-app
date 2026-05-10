import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { deriveCurrentStage, stageOrderFor, type ProjectState, runStoryTraps, detectSeriesPotential, getDownstreamImpacts, writeStageDoc, gateStageSave, seedManuscriptFromPlan, getWritingPlan, generatePromisePayoffLedger, findFictionPromiseGaps, generateStoryBible, generateCharacterArcMatrix, generateNfMasterDocument, generateAcademicMasterDocument, generateResearchTodo, generateClaimEvidenceLedger, generateFigureRegistry, seedSyllabiFolder, inferPipelineFromCategory } from '@storyline/core'
import { writeAllChapterCards } from '../editor/chapter-cards.js'
import { transcribeAudio } from '../transcribe-helper.js'
import { guardFileWrite, confirmWrite } from '../editor/file-write-guard.js'
import { buildSystemPrompt } from '../conversation/system-prompt.js'
import { buildSemanticContextBlock } from '../conversation/semantic-context.js'
import { getActiveChapterRelPath } from '../editor/active-chapter.js'
import { TurnHistory } from '../conversation/turn-history.js'
import { compressTurnsForApi } from '../conversation/turn-compressor.js'
import {
  shouldSkipCritique,
  interpretCritiqueOk,
  interpretCritiqueHttpError,
  interpretCritiqueNetworkError,
  detectProviderKind,
} from '../conversation/critique-wiring.js'
import { discoverPlanningArtefacts } from '../conversation/planning-complete.js'
import { LocalStore, extractJsonBlock, extractFileWrites, extractFileReadRequests } from '../state/local-store.js'
import { markStageDocSelfWrite } from '../state/stage-md-watcher.js'
import { pushToMemory, retrieveRelevantMemory, retrieveMemoryEntry } from '../state/memory.js'
import { triggerWikiCompilation, STAGE_TO_ARTICLES, NF_STAGE_TO_ARTICLES } from '../wiki/article-compiler.js'
import { checkWikiIntegrity, type IntegrityWarning } from '../wiki/integrity-check.js'
import { compileSeriesArticles, compareProtagonistToSeriesArticle } from '../wiki/series-compiler.js'
import { LicenceManager } from '../auth/licence.js'
import { offerReactivation } from '../auth/reactivate-prompt.js'
import { promptOnCreditsExhausted } from '../onboarding/licence-prompt.js'
import { updateCreditBalance, refreshAndDisplayCredits } from '../credits/credit-display.js'
// Free-tier keys are minted server-side per install and all begin with
// SL-FREE- (legacy shared key SL-FREE-0000-0000-FREE also matches).
const isFreeKey = (key: string | undefined): boolean => !!key && key.startsWith('SL-FREE-')
import { ManagedProvider } from '../ai/managed-provider.js'
import { logInfo, logVerbose, logWarn, logError } from '../diagnostic-log.js'
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
      logVerbose('[Storyline] ChatPanel.init: stored key prefix =', storedKey?.slice(0, 12) ?? '(none)')
      // Trust the cached validate from the activation flow — useFree (and
      // the toast / deep-link paths) all run validate({}) just before opening
      // chat. Re-validating here would force a backend round-trip that races
      // KV propagation for a freshly-minted free key. Cache hit means the
      // activation was confirmed seconds ago and the in-panel /chat retry
      // logic can absorb any remaining colo lag.
      const licenceInfo = await this.licenceManager.validate({ useCache: true })
      logVerbose('[Storyline] ChatPanel.init: validate =', licenceInfo)
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
      case 'transcribeAudio': {
        // Webview now records audio in-browser via MediaRecorder and posts
        // the encoded blob here as base64. No subprocess, no sox/ffmpeg
        // dependency, browser handles AEC/NS/AGC for free.
        const audioBase64 = msg.audioBase64 as string
        const mimeType = msg.mimeType as string
        if (audioBase64 && mimeType) {
          await this.handleTranscribe(audioBase64, mimeType)
        }
        break
      }
      case 'pickMicFromList': {
        // Webview enumerated audio inputs via mediaDevices.enumerateDevices
        // and sent us the list. Show a native VS Code QuickPick and persist
        // the chosen deviceId so subsequent recordings use it.
        const devices = (msg.devices ?? []) as Array<{ deviceId: string; label: string }>
        if (devices.length === 0) {
          void vscode.window.showWarningMessage('No microphones found.')
          break
        }
        const current = this.context.globalState.get<string>('storyline.micDevice')
        const picked = await vscode.window.showQuickPick(
          devices.map(d => ({ label: d.label, description: d.deviceId === current ? '● active' : undefined, deviceId: d.deviceId })),
          { placeHolder: 'Select microphone for dictation', title: 'Storyline — Choose Microphone' },
        )
        if (!picked) break
        await this.context.globalState.update('storyline.micDevice', picked.deviceId)
        this.post({ type: 'micDeviceChanged', device: picked.deviceId })
        break
      }
      case 'getMicDevice':
        this.post({ type: 'micDeviceChanged', device: this.context.globalState.get<string>('storyline.micDevice') ?? null })
        break
      case 'micPermissionDenied': {
        // Deep-link straight to the OS pane that controls mic access for
        // the host app (VS Code/Cursor/etc — the OS sees that, not us).
        // After flipping the toggle the user must restart VS Code for the
        // permission grant to apply, so the toast says so.
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
        break
      }
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

    // Snapshot the cross-stage display tail BEFORE clearing it. fireOpeningPrompt
    // is designed to prepend this tail so the AI inherits narrative context from
    // the previous chat (e.g. the writer's actual book topic). Without the
    // snapshot, allDisplay() returns [] inside fireOpeningPrompt and the model
    // hallucinates against a generic stage brief.
    const carryOver: Message[] = this.turnHistory.allDisplay().slice(-4) as Message[]

    this.turnHistory.clearAll()
    this.turnHistory.clearDisplay()
    this.post({ type: 'clearMessages' })
    if (!this.store) return
    const state = await this.store.read()
    const currentStage = deriveCurrentStage(state)
    if (currentStage) await this.fireOpeningPrompt(currentStage.id, state, carryOver)
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

    const [memoryBlock, semanticBlock] = await Promise.all([
      retrieveRelevantMemory(currentStage.id),
      this.semanticContextFor(currentStage.id),
    ])
    const systemPrompt = buildSystemPrompt(currentStage.id, state, memoryBlock, getActiveChapterRelPath(), semanticBlock)
    const messages = await this.buildMessages(currentStage.id)

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

    const [memoryBlock, semanticBlock] = await Promise.all([
      retrieveRelevantMemory(currentStage.id),
      this.semanticContextFor(currentStage.id),
    ])
    const systemPrompt = buildSystemPrompt(currentStage.id, state, memoryBlock, getActiveChapterRelPath(), semanticBlock)
    const messages = await this.buildMessages(currentStage.id)

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

  private async handleTranscribe(audioBase64: string, mimeType: string): Promise<void> {
    const licenceKey = await this.licenceManager.getLicenceKey()
    if (!licenceKey) {
      this.post({ type: 'transcribeError', message: 'No licence key — activate Storyline first.' })
      return
    }
    const state = this.store ? await this.store.read() : null
    const projectContext = state ? this.buildProjectContext(state) : ''

    const result = await transcribeAudio(getBackendUrl(), { licenceKey, audioBase64, mimeType, projectContext })
    if (result.ok) {
      this.post({ type: 'transcribeResult', text: result.text })
    } else {
      this.post({ type: 'transcribeError', message: result.error })
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

    // Drift safeguard: as conversations lengthen the AI sometimes wraps a
    // stage in pure prose ("Great, captured — ready to move on?") and
    // forgets the JSON save block. If state already meets the gate from
    // earlier partial captures, we still want to advance instead of
    // getting stuck. `mode` is the one stage that requires an explicit
    // save block — never auto-advance from there.
    if (!patch && stageId === 'mode') return

    let normalizedPatch: Partial<ProjectState>
    if (!patch) {
      // Empty patch — proceed through the gate check below; if state
      // already passes, advance silently.
      normalizedPatch = {}
    } else if (stageId === 'mode' && (patch as Record<string, unknown>).mode) {
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
        // No JSON in this turn AND gate doesn't pass yet — the writer is
        // mid-conversation, not trying to save. Stay quiet (don't surface
        // a saveGated card, don't re-write the partial doc/memory for
        // unchanged state).
        if (!patch) return

        logWarn('[Storyline] Save gated — incomplete fields for', stageId, ':', gate.missing)
        this.post({ type: 'saveGated', stageId, missing: gate.missing })
        // Stage not yet complete — stay on the same stage. But keep docs and
        // memory in sync with state.json so all three stores remain consistent
        // even for partial AI updates. Without this, a mid-conversation update
        // would leave state.json ahead of both memory and the stage-doc files.
        const pd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (pd) {
          writeStageDoc(stageId, newState, pd)
            .then(p => { if (p) markStageDocSelfWrite(p) })
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
    // Skip when we're auto-advancing without a patch — there's nothing new
    // to record; memory was already pushed on the partial save that filled
    // the last required field.
    if (patch) {
      pushToMemory(stageId, normalizedPatch).then(result => {
        logInfo(`[Storyline] memory: ${stageId} → ${result.method}${result.error ? ' (' + result.error + ')' : ''}`)
        this.post({ type: 'memoryStored', stageId, method: result.method, error: result.error })
      }).catch(err => logWarn('[Storyline] pushToMemory threw', err))
    }

    const stageName = stageOrderFor(finalState).find(s => s.id === stageId)?.name ?? stageId
    logInfo(`[Storyline] stage ${patch ? 'SAVED' : 'AUTO-ADVANCE'}: ${stageId} (${stageName}) — state.json updated`)
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

      // Series wiki compilation — when this project is part of a series,
      // compile series-level articles (arc, world, character end-states)
      // and store them to .storyline/wiki/series/ + odd-flow for cross-book
      // retrieval. Fire-and-forget.
      if (finalState.mode === 'fiction') {
        void (async () => {
          await new Promise(r => setTimeout(r, 600))
          try {
            compileSeriesArticles(finalState, projectDir)
          } catch (err) {
            logWarn('[Storyline] series compilation failed', err)
          }
        })()
      }

      // Cross-book continuity check — when Book 2+ saves its protagonist stage,
      // compare the new protagonist data against the previous book's end-state
      // character article stored in odd-flow. Surface drift as findings cards.
      if (finalState.mode === 'fiction' && stageId === 'protagonist') {
        void (async () => {
          await new Promise(r => setTimeout(r, 800))
          try {
            const raw = finalState as unknown as Record<string, unknown>
            const seriesCtx = (raw['premise'] as Record<string, unknown> | undefined)?.['seriesContext'] as Record<string, unknown> | undefined
            const currentBook = (seriesCtx?.['currentBookNumber'] as number) ?? 1
            if (currentBook > 1 && seriesCtx?.['seriesTitle']) {
              const seriesSlug = (seriesCtx['seriesTitle'] as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
              const protagonist = raw['protagonist'] as Record<string, unknown> | undefined
              const name = protagonist?.['name'] as string | undefined
              if (name) {
                const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
                const prevKey = `series:${seriesSlug}:book${currentBook - 1}:characters/${slug}`
                const prevArticle = await retrieveMemoryEntry(prevKey)
                if (prevArticle) {
                  const drift = compareProtagonistToSeriesArticle(protagonist, prevArticle, currentBook)
                  if (drift.length > 0) {
                    this.post({
                      type: 'findingsCard',
                      findings: drift.map(d => ({
                        id: `series-drift-${d.field}`,
                        name: 'Series continuity note',
                        severity: 'warning' as const,
                        description: d.description,
                        details: `Book ${currentBook - 1} end-state vs current draft`,
                        fixProtocol: d.suggestion ? [d.suggestion] : undefined,
                      })),
                    })
                  }
                }
              }
            }
          } catch (err) {
            logWarn('[Storyline] cross-book continuity check failed', err)
          }
        })()
      }

      // Wiki integrity check — compare the article just compiled against its
      // semantically related articles for contradictions, drift, or gaps.
      // Fire-and-forget; runs ~500ms after compilation so the file is written.
      const isNf = finalState.mode === 'nonfiction'
      const compiledArticles = isNf
        ? NF_STAGE_TO_ARTICLES[stageId]
        : STAGE_TO_ARTICLES[stageId]
      if (compiledArticles?.length) {
        void (async () => {
          await new Promise(r => setTimeout(r, 500))
          const licenceKey = await this.licenceManager.getLicenceKey().catch(() => undefined)
          if (!licenceKey) return
          for (const article of compiledArticles) {
            try {
              const warnings = await checkWikiIntegrity(article, projectDir, getBackendUrl(), licenceKey)
              if (warnings.length > 0) {
                this.post({
                  type: 'findingsCard',
                  findings: warnings.map(w => ({
                    id: `integrity-${article}-${w.kind}`,
                    name: 'Consistency note',
                    severity: w.kind === 'contradiction' ? 'error' : w.kind === 'drift' ? 'warning' : 'suggestion' as const,
                    description: w.description,
                    details: `Related article: ${w.relatedArticle}`,
                    fixProtocol: w.suggestion ? [w.suggestion] : undefined,
                  })),
                })
              }
            } catch { /* non-fatal */ }
          }
        })()
      }

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
        .then(filePath => {
          if (filePath) markStageDocSelfWrite(filePath)
          logInfo(`[Storyline] stage doc: ${stageId} → ${filePath ?? '(no renderer)'}`)
        })
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
    for (const { path: relPath, offset = 0 } of requests) {
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
        // Heavy research formats (PDF / DOCX / EPUB) live as binary on
        // disk — reading them directly returns garbled bytes. The
        // research file-parser pre-warms a plain-text cache at
        // .storyline/research-cache/research_<basename>.txt; redirect
        // there transparently so the AI can request research/foo.pdf
        // and get the extracted prose. .md/.txt/.markdown read through
        // unchanged.
        const ext = path.extname(relPath).toLowerCase()
        let readPath = absPath
        if (relPath.startsWith('research/') && (ext === '.pdf' || ext === '.docx' || ext === '.epub')) {
          const base = path.basename(relPath)
          const cacheFile = path.join(projectDir, '.storyline', 'research-cache', `research_${base}.txt`)
          if (fs.existsSync(cacheFile)) {
            readPath = cacheFile
          } else {
            parts.push(`[File: ${relPath}]\n\n(Heavy-format research file is still being indexed. Try again in a few seconds, or open the research panel to trigger a re-parse.)`)
            logWarn('[Storyline] file_read: research cache missing for', relPath)
            continue
          }
        }
        const raw = fs.readFileSync(readPath, 'utf-8')
        // Cap per-read injection so chained reads can't blow the 256 KB
        // backend limit when the content lands in the messages array. With
        // MAX_READ_DEPTH=3 chunked reads, the AI can fetch up to ~180 KB
        // of a single research file across three turns — enough to read a
        // whole textbook chapter, interview transcript, or comp-title sample.
        const FILE_READ_MAX_BYTES = 60_000
        const totalBytes = Buffer.byteLength(raw, 'utf8')
        const startByte = Math.min(offset, totalBytes)
        const endByte = Math.min(startByte + FILE_READ_MAX_BYTES, totalBytes)
        // raw.slice operates on JS code units — close enough for ASCII-heavy
        // research text. UTF-8 multi-byte boundaries can produce a single
        // mojibake char at the slice edge, which the AI ignores cleanly.
        const slice = raw.slice(startByte, endByte)
        let footer = ''
        if (endByte < totalBytes) {
          // Tell the AI EXACTLY how to fetch the next chunk — no guessing
          // about offset, no "file too large" dead-end. The runtime will
          // honour the offset on the next turn, up to MAX_READ_DEPTH chained
          // reads from the same response.
          footer = `\n\n*(showing bytes ${startByte}–${endByte} of ${totalBytes}. To read more, request:\n` +
            '```json\n' +
            JSON.stringify({ file_read: { path: relPath, offset: endByte } }) +
            '\n```\n)*'
        } else if (startByte > 0) {
          footer = `\n\n*(end of file — bytes ${startByte}–${endByte} of ${totalBytes})*`
        }
        const header = startByte > 0
          ? `[File: ${relPath}, bytes ${startByte}–${endByte}]`
          : `[File: ${relPath}]`
        parts.push(`${header}\n\n${slice}${footer}`)
        logInfo('[Storyline] file_read injected:', relPath, `(depth=${depth}, ${startByte}–${endByte} / ${totalBytes})`)
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

    const [memoryBlock, semanticBlock] = await Promise.all([
      retrieveRelevantMemory(stageId),
      this.semanticContextFor(stageId),
    ])
    const systemPrompt = buildSystemPrompt(stageId, state, memoryBlock, getActiveChapterRelPath(), semanticBlock)
    const messages = await this.buildMessages(stageId)
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

  private async fireOpeningPrompt(stageId: string, state: ProjectState, carryOver?: Message[]): Promise<void> {
    if (!this.provider) {
      this.post({ type: 'error', message: `Storyline isn't connected yet. Try running Storyline: Activate Licence from the command palette.` })
      return
    }

    const [memoryBlock, semanticBlock] = await Promise.all([
      retrieveRelevantMemory(stageId),
      this.semanticContextFor(stageId),
    ])
    const systemPrompt = buildSystemPrompt(stageId, state, memoryBlock, getActiveChapterRelPath(), semanticBlock)

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
    //
    // `carryOver` is supplied by handleNewChat — a snapshot taken before
    // the displayLog was cleared, so a fresh chat still hands the AI the
    // recent narrative thread. For non-new-chat callers (handleBeginPlanning,
    // stage transitions) we fall back to the live displayLog tail.
    const PRIOR_CONTEXT_TURNS = 4
    const prior = stageId === 'mode'
      ? []
      : (carryOver && carryOver.length > 0
          ? carryOver.slice(-PRIOR_CONTEXT_TURNS)
          : this.turnHistory.allDisplay().slice(-PRIOR_CONTEXT_TURNS))
    const stageMessages = await this.buildMessages(stageId)
    const messages: Message[] = [...prior, ...stageMessages]

    // No seed — the AI generates the opener fresh from the stage brief in
    // the system prompt. Pre-seeding the canned `opening` caused
    // duplication (AI re-stated the same line) and let the harness's
    // SKILL.md persona blurb leak verbatim into the chat. The thinking
    // indicator now covers the reasoning delay.
    const full = await this.streamResponse(stageId, systemPrompt, messages, state)
    // Save the AI's opener to the display log (synthetic kickoff is intentionally excluded).
    if (full) this.turnHistory.appendDisplay({ role: 'assistant', content: full })
  }

  /**
   * NT-21: build the per-turn semantic context block. Uses the most
   * recent user message in this stage as the retrieval query (falls back
   * to stage-level retrieval for synthetic / empty messages). Returns ''
   * cleanly when semantic memory is disabled.
   */
  private async semanticContextFor(stageId: string): Promise<string> {
    const turns = this.turnHistory.getForStage(stageId)
    let lastUserMessage = ''
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === 'user' && turns[i].content) {
        lastUserMessage = turns[i].content
        break
      }
    }
    return buildSemanticContextBlock({ userMessage: lastUserMessage, stageId })
  }

  /**
   * Build the message array for an API call, compressing old turns when a
   * stage exceeds the threshold. Uses the same provider for summarisation
   * (single DeepSeek model — no model switching needed).
   */
  private async buildMessages(stageId: string): Promise<Message[]> {
    const rawTurns = this.turnHistory.allForStage(stageId)
    const existingSummary = this.turnHistory.getCompressionSummary(stageId)

    if (!this.provider || rawTurns.length <= 12) {
      return rawTurns as Message[]
    }

    const result = await compressTurnsForApi(
      rawTurns,
      existingSummary,
      stageId,
      this.provider,
    )

    if (result.summary && result.summary !== existingSummary) {
      this.turnHistory.setCompressionSummary(stageId, result.summary)
    }

    return result.turns
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

    // Tick the credit counter down after every successful chat turn
    // (managed-provider only — BYOK/Ollama don't use credits). One /validate
    // call per turn is cheap and the user sees the indicator move in real
    // time. Fire-and-forget; transient failures keep the last-known balance.
    if (this.provider?.id === 'managed') {
      void refreshAndDisplayCredits(this.context, getBackendUrl())
    }
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

  public navigateToStage(stageId: string): void {
    this.panel.reveal(undefined, false)
    this.post({ type: 'navigateToStage', stageId })
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
        .then(p => { if (p) markStageDocSelfWrite(p) })
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

