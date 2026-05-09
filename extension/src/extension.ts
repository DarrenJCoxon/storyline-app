import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { ChatPanel } from './panels/ChatPanel.js'
import { GitHubAuth } from './github/auth.js'
import { GitHubSyncService } from './github/sync.js'
import { GitHubSyncStatusBar } from './github/status-bar.js'
import { registerGitHubCommands, maybeOfferConnect } from './github/commands.js'
import { OnboardingPanel } from './panels/OnboardingPanel.js'
import { EditorPanel } from './panels/EditorPanel.js'
import { CompilePanel } from './panels/CompilePanel.js'
import { CoverPanel } from './panels/CoverPanel.js'
import { IllustrationsPanel } from './panels/IllustrationsPanel.js'
import { ResearchPanel } from './panels/ResearchPanel.js'
import { FilesTreeProvider, FileNode } from './sidebar/FilesTreeProvider.js'
import { PurchasesPanel } from './panels/PurchasesPanel.js'
import { openLivePreview } from './preview/live-preview-command.js'
import { openPreview } from './preview/preview-command.js'
import { safeCommand } from './safe-command.js'
import { WordCountStatusBar } from './editor/word-count.js'
import { shouldShowOnboarding } from './onboarding/first-run.js'
import { checkLicencePrompt } from './onboarding/licence-prompt.js'
import { ensureResearchFolder, ensurePlanningFolder, ensureWorkspaceFile } from './onboarding/project-scaffold.js'
import { postActivateOpenWorkspace } from './onboarding/post-activate.js'
import { initLayout } from './editor/layout-init.js'
import { LicenceManager } from './auth/licence.js'
import { issueFreePlan } from './auth/free-plan-issue.js'
import { initDiagnosticLog, logInfo, showLog } from './diagnostic-log.js'
import { initCreditDisplay, refreshAndDisplayCredits, updateCreditBalance } from './credits/credit-display.js'
import { LocalStore } from './state/local-store.js'
import { registerStageMdWatcher, resetStageDoc, backfillAllStageDocs } from './state/stage-md-watcher.js'
import { saveAsVersion, listVersions } from './manuscript/versions.js'
import { registerResearchPrewarm } from './research/prewarm.js'
import { checkForUpdate, disposeUpdateStatusBar } from './update/auto-updater.js'
import { secretsDelete } from './utils/secrets-timeout.js'
import { bootLogInit, bootLog, bootLogError, bootLogPath } from './utils/boot-log.js'

// Module-load checkpoint. Runs as soon as the extension host requires the
// bundle — before activate() is invoked. If the host hangs in transitive
// requires, this line still executes; if it doesn't, the bundle itself
// failed to load.
bootLogInit()
bootLog('module-load: bundle evaluated')

function getBackendUrl(): string {
  return vscode.workspace.getConfiguration('storyline').get<string>('backendUrl', 'https://api.storyline.my').replace(/\/$/, '')
}

function doctorHtml(report: unknown, formatted: string): string {
  const r = report as { ok: boolean; drift: boolean }
  const status = r.ok ? '✓ No drift detected' : '✗ Drift detected — review findings below'
  return `<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;background:#1e1e1e;color:#d4d4d4">
<h2>${status}</h2><pre style="white-space:pre-wrap">${formatted.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
</body></html>`
}

function notesHtml(count: number, report: string): string {
  return `<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;background:#1e1e1e;color:#d4d4d4">
<h2>${count} inline note${count === 1 ? '' : 's'} in manuscript</h2>
<pre style="white-space:pre-wrap">${report.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
</body></html>`
}

function compareHtml(count: number, findings: string): string {
  return `<!DOCTYPE html><html><body style="font-family:monospace;padding:20px;background:#1e1e1e;color:#d4d4d4">
<h2>${count} finding${count === 1 ? '' : 's'}</h2>
<pre style="white-space:pre-wrap">${findings.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
</body></html>`
}

async function copyDir(src: string, dest: string, exclude: string[]): Promise<void> {
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      await copyDir(srcPath, destPath, exclude)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * Storyline-owned markdown files that should always open in the rich
 * TipTap editor instead of plain text. Covers chapter prose
 * (`manuscript/`) and every planning doc (`docs/` — chapter cards,
 * character notes, beat sheets, etc.). Non-Storyline files (config,
 * .storyline/* state, anything outside these prefixes) open normally.
 */
// Every Storyline-managed folder routes its .md files through the rich
// TipTap editor — writers shouldn't see raw markdown anywhere we own.
// (Compile output in output/ is .epub/.pdf/.html, no .md to route.)
const RICH_EDITOR_PREFIXES = [
  'manuscript/', 'manuscript\\',
  'planning/',   'planning\\',
  'research/',   'research\\',
  'docs/',       'docs\\',
]

async function pickTargetFolder(node?: FileNode): Promise<string | undefined> {
  if (node?.kind === 'folder') return node.absPath
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!root) {
    void vscode.window.showWarningMessage('Storyline: open a project folder first.')
    return undefined
  }
  // No selection — ask which top-level folder.
  const options: vscode.QuickPickItem[] = ['planning', 'research', 'manuscript', 'output']
    .filter(name => fs.existsSync(path.join(root, name)))
    .map(name => ({ label: name }))
  if (options.length === 0) return root
  const picked = await vscode.window.showQuickPick(options, { title: 'Create in which folder?' })
  if (!picked) return undefined
  return path.join(root, picked.label)
}

async function createNewFile(targetDir: string): Promise<void> {
  const name = await vscode.window.showInputBox({
    title: 'New File',
    prompt: `Create file in ${path.basename(targetDir)}/`,
    placeHolder: 'filename.md',
  })
  if (!name) return
  const cleaned = name.trim().replace(/[/\\]/g, '-')
  if (!cleaned) return
  const filePath = path.join(targetDir, cleaned)
  if (fs.existsSync(filePath)) {
    void vscode.window.showWarningMessage(`File already exists: ${cleaned}`)
    return
  }
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, '', 'utf-8')
    const uri = vscode.Uri.file(filePath)
    await vscode.commands.executeCommand('vscode.open', uri)
  } catch (err) {
    void vscode.window.showErrorMessage(`Could not create file: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function shouldRouteToRichEditor(uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') return false
  if (!/\.(md|markdown)$/i.test(uri.fsPath)) return false
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return false
  // CB-08-followup: only reroute markdowns inside an actual Storyline
  // project. Without this gate, opening any random markdown file under
  // a directory called manuscript/ / planning/ / research/ / docs/ in
  // a non-Storyline workspace got hijacked into the TipTap rich editor
  // — and the editor's first save attempt surfaced an "unsaved changes"
  // toast on a file the user hadn't even meant to edit.
  if (!fs.existsSync(path.join(folder.uri.fsPath, '.storyline', 'state.json'))) return false
  const rel = vscode.workspace.asRelativePath(uri, false)
  return RICH_EDITOR_PREFIXES.some(p => rel.startsWith(p))
}

export function activate(context: vscode.ExtensionContext): void {
  bootLog('activate: entry')
  try {
    activateInner(context)
    bootLog('activate: returned cleanly')
  } catch (err) {
    bootLogError('activate: synchronous throw', err)
    // CB-05: report the activation failure to production error logs so
    // we know the extension is failing to start on certain machines.
    // Imported lazily to avoid a top-level cycle with safe-command.
    void import('./ai/error-reporter.js')
      .then(({ reportException }) => reportException(err, 'activate'))
      .catch(() => { /* swallow */ })
    throw err
  }
}

function activateInner(context: vscode.ExtensionContext): void {
  // Persistent diagnostic log — visible at Output → Storyline. Every
  // [Storyline] log line in the extension flows through here so users
  // and us can read activation + chat lifecycle without dev tools.
  initDiagnosticLog()
  bootLog('activate: diagnostic log initialised')
  logInfo('[Storyline] activate: extension host starting up')
  const logFile = bootLogPath()
  if (logFile) logInfo(`[Storyline] boot log → ${logFile}`)

  // Kill any restored Live Chapter Preview webviews on activation. VS Code
  // restores webview tabs across window reloads, but they hold stale HTML
  // from before the extension update. Force-close them so the user must
  // re-run the command and gets fresh HTML.
  vscode.window.registerWebviewPanelSerializer('storyline.livePreview', {
    async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
      panel.dispose()
    },
  })
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.label === 'Live Chapter Preview') {
        void vscode.window.tabGroups.close(tab)
      }
    }
  }
  bootLog('activate: webview serializer + tab cleanup done')

  // BYOK / Ollama paths are disabled in this build. Wipe any stale flags
  // from earlier testing so resolveProvider doesn't get tripped by them
  // (the dead-endpoint failure messages contain "401" which used to
  // route the user to the misleading "didn't recognise free plan" UI).
  // Idempotent — no-op for users who never had these flags set.
  void context.globalState.update('storyline.byokConfig', undefined)
  void context.globalState.update('storyline.ollamaEnabled', undefined)
  void context.globalState.update('storyline.ollamaUrl', undefined)
  void secretsDelete(context, 'storyline.byokApiKey')
  bootLog('activate: stale-flag cleanup dispatched')

  // One-shot backfill: projects created before research/ existed don't have
  // the folder, so the AI silently has nothing to read. Auto-create on
  // activation if a Storyline project is detected. No-op if already there.
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  bootLog('activate: workspace root resolved', wsRoot ?? '(none)')
  const hasProject = !!(wsRoot && fs.existsSync(path.join(wsRoot, '.storyline', 'state.json')))
  // Drive the `when: storyline.hasProject` clause on the activity-bar view.
  // When false the view container is hidden, so VS Code stops eagerly
  // activating us in workspaces that have nothing to do with Storyline.
  void vscode.commands.executeCommand('setContext', 'storyline.hasProject', hasProject)
  if (hasProject && wsRoot) {
    try { ensureResearchFolder(wsRoot) } catch (e) { bootLogError('ensureResearchFolder', e) }
    try { ensurePlanningFolder(wsRoot) } catch (e) { bootLogError('ensurePlanningFolder', e) }
    try { ensureWorkspaceFile(wsRoot) } catch (e) { bootLogError('ensureWorkspaceFile', e) }
  }
  bootLog('activate: research/planning scaffold checked')

  // Deep-link handler for Stripe → extension auto-activation.
  //
  // /success on the marketing site redirects to a vscode://… link that the OS
  // routes to whichever VS Code instance is running this extension. We pull
  // the licence key out of the query, validate it, store it, and fire the
  // standard one-click activation flow (scaffold + welcome doc + chat).
  // Result: zero copy-paste between the Stripe success page and the working
  // extension state.
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri: async (uri: vscode.Uri) => {
        if (uri.path !== '/activate') return
        const params = new URLSearchParams(uri.query)
        const rawKey = params.get('key')?.trim().toUpperCase()
        const rawRef = params.get('ref')?.trim().toUpperCase()

        // ── Path A: licence-key activation (paid Stripe success flow) ──
        if (rawKey && rawKey.startsWith('SL-')) {
          const manager = new LicenceManager(context, getBackendUrl())
          await manager.setLicenceKey(rawKey)
          const info = await manager.validate({})
          if (info.valid) {
            if (info.type !== 'free') {
              await context.globalState.update('storyline.freePlan', undefined)
            }
            void vscode.window.showInformationMessage(
              `Storyline activated — ${info.creditBalance.toLocaleString()} credits ready.`,
            )
            void updateCreditBalance(info.creditBalance, info.type)
            await postActivateOpenWorkspace(context, context.extensionUri)
          } else {
            await manager.clearLicenceKey()
            void vscode.window.showErrorMessage(
              'Storyline activation failed — that key isn\'t recognised. Email darren@coxon.ai.',
            )
          }
          return
        }

        // ── Path B: ref-only — claim referral bonus on a fresh install ──
        // Triggered from the "Already installed? Claim your bonus" link
        // on storyline.my for users who arrived via /r/<code>. Only fires
        // a fresh free-plan-issue if there's no licence key already
        // (otherwise the existing licence wins; we never overwrite).
        if (rawRef && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(rawRef)) {
          const manager = new LicenceManager(context, getBackendUrl())
          const existing = await manager.getLicenceKey()
          if (existing) {
            void vscode.window.showInformationMessage(
              'Storyline is already activated on this device — referral bonuses only apply to fresh installs.',
            )
            return
          }
          try {
            const issued = await issueFreePlan(getBackendUrl(), rawRef)
            await manager.setLicenceKey(issued.licenceKey)
            const info = await manager.validate({})
            if (info.valid) {
              await context.globalState.update('storyline.freePlan', { active: true })
              void vscode.window.showInformationMessage(
                `Welcome to Storyline — ${info.creditBalance.toLocaleString()} credits ready (includes your referral bonus).`,
              )
              void updateCreditBalance(info.creditBalance, info.type)
              await postActivateOpenWorkspace(context, context.extensionUri)
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            void vscode.window.showErrorMessage(
              `Storyline: couldn't claim referral bonus — ${msg}. You can still start the free plan from the command palette.`,
            )
          }
          return
        }

        void vscode.window.showErrorMessage(
          'Storyline activation failed — the link didn\'t contain a valid key or referral code. Email darren@coxon.ai if this persists.',
        )
      },
    }),
  )
  bootLog('activate: URI handler registered')

  const statusBar = new WordCountStatusBar(context)
  bootLog('activate: WordCountStatusBar constructed')
  const editorPanel = new EditorPanel(context, context.extensionUri, statusBar)
  bootLog('activate: EditorPanel constructed')

  const filesTreeProvider = new FilesTreeProvider(context)
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(FilesTreeProvider.viewType, filesTreeProvider),
  )
  bootLog('activate: FilesTreeProvider registered')

  void statusBar.start(context)

  // CB-08-followup: status bar items are project-scoped. If there's no
  // .storyline/state.json in this workspace the user wasn't doing
  // anything Storyline-related — don't pollute their status bar with
  // five Storyline buttons. Without this gate, ANY VS Code window
  // where the extension activated (including ones where it activated
  // because VS Code restored the Storyline sidebar tab) showed all
  // five status bar entries.
  if (hasProject) {
    const planningStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    planningStatusBar.text = '$(storyline) Storyline'
    planningStatusBar.tooltip = 'Open Storyline Planning Chat'
    planningStatusBar.command = 'storyline.openPlanning'
    planningStatusBar.show()
    context.subscriptions.push(planningStatusBar)

    const previewStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99)
    previewStatusBar.text = '$(eye) Preview'
    previewStatusBar.tooltip = 'Open Live Chapter Preview (paperback / iPad / Kindle)'
    previewStatusBar.command = 'storyline.openLivePreview'
    previewStatusBar.show()
    context.subscriptions.push(previewStatusBar)

    const researchStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98)
    researchStatusBar.text = '$(library) Research'
    researchStatusBar.tooltip = 'Open Research panel — capture and link sources to chapters'
    researchStatusBar.command = 'storyline.research'
    researchStatusBar.show()
    context.subscriptions.push(researchStatusBar)

    const compileStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97)
    compileStatusBar.text = '$(book) Compile'
    compileStatusBar.tooltip = 'Open Compile panel — export manuscript to EPUB or PDF'
    compileStatusBar.command = 'storyline.compileEpub'
    compileStatusBar.show()
    context.subscriptions.push(compileStatusBar)

    const notesStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 96)
    notesStatusBar.text = '$(note) Notes'
    notesStatusBar.tooltip = 'View inline manuscript notes'
    notesStatusBar.command = 'storyline.notes'
    notesStatusBar.show()
    context.subscriptions.push(notesStatusBar)

    // Right-aligned credit indicator at priority 95 (just to the left of
    // Notes). Initial value is seeded from the activation-time validate()
    // and refreshed on every chat-turn / image-gen / refund.
    initCreditDisplay(context)
    bootLog('activate: status bar items registered')
  } else {
    bootLog('activate: status bar items skipped (non-Storyline workspace)')
  }

  // Auto-reroute manuscript/ markdown files to the rich TipTap editor.
  // Workspace-scoped: only fires when this is a Storyline project (the
  // extension activation gate already enforced workspaceContains:.storyline/state.json).
  // We watch active-editor changes — every time a chapter file becomes
  // the focused text editor, we close that text editor and re-open the
  // file in EditorPanel. The TipTap webview becomes the focused tab.
  const recentlyRerouted = new Set<string>()
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async editor => {
      if (!editor) return
      const uri = editor.document.uri
      if (!shouldRouteToRichEditor(uri)) return
      const key = uri.toString()
      // Avoid an infinite loop if the rich editor's underlying TextDocument
      // gets focused again somehow.
      if (recentlyRerouted.has(key)) return
      recentlyRerouted.add(key)
      setTimeout(() => recentlyRerouted.delete(key), 1500)

      // Close the plain text editor tab for this URI, then open in TipTap.
      // Doing it this way (rather than just opening on top) prevents two
      // tabs for the same file from cluttering the tab strip.
      try {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
      } catch { /* tab might already be gone */ }
      await editorPanel.openForUri(uri, vscode.ViewColumn.One)
    }),
  )

  context.subscriptions.push(
    // CB-05: startNew is the discoverable entry point for new users — any
    // exception here breaks the very first interaction. safeCommand
    // surfaces it as a toast + ships the stack to /log-error.
    safeCommand('storyline.startNew', async () => {
      // Always-available entry point. Two paths:
      //
      //   (a) A folder is already open. Hand off to OnboardingPanel which
      //       scaffolds inside that folder and runs initLayout.
      //
      //   (b) No folder is open — the common "I just opened VS Code and
      //       want to start a new book" case. Prompt for name + parent
      //       location, create the folder, scaffold it, and reopen VS
      //       Code at that folder. The extension reactivates in the new
      //       window via workspaceContains:.storyline/state.json. No
      //       drag-folder-into-VS-Code step required.
      const folders = vscode.workspace.workspaceFolders
      if (folders?.length) {
        OnboardingPanel.show(context, context.extensionUri, {
          onScaffolded: () => {
            void initLayout(context)
            // Activity-bar view is gated on storyline.hasProject — flip it
            // on now that a project exists in this workspace, so the
            // sidebar appears without requiring a window reload.
            void vscode.commands.executeCommand('setContext', 'storyline.hasProject', true)
          },
        })
        return
      }

      const name = await vscode.window.showInputBox({
        title: 'Storyline — New Project',
        prompt: 'What\'s the working title of your book?',
        placeHolder: 'My Novel',
        ignoreFocusOut: true,
        validateInput: v => v.trim() ? null : 'Title can\'t be empty',
      })
      if (!name?.trim()) return

      // Default the parent location to ~/Documents/Storyline/ — same
      // place the Tauri installer drops "My First Project". Most users
      // accept; power users can pick anywhere.
      const homeDir = process.env.HOME || process.env.USERPROFILE || ''
      const defaultParent = vscode.Uri.file(path.join(homeDir, 'Documents', 'Storyline'))
      try { fs.mkdirSync(defaultParent.fsPath, { recursive: true }) } catch { /* non-fatal */ }

      const parentChoice = await vscode.window.showOpenDialog({
        title: 'Where should this project live?',
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        defaultUri: defaultParent,
        openLabel: 'Save here',
      })
      if (!parentChoice?.length) return

      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'storyline-project'
      const projectDir = path.join(parentChoice[0].fsPath, slug)
      if (fs.existsSync(projectDir)) {
        const overwrite = await vscode.window.showWarningMessage(
          `A folder named "${slug}" already exists at that location. Open it instead?`,
          'Open Existing', 'Cancel',
        )
        if (overwrite !== 'Open Existing') return
      } else {
        try {
          fs.mkdirSync(projectDir, { recursive: true })
          // Scaffold synchronously so the new window opens populated.
          const { scaffoldProject } = await import('./onboarding/project-scaffold.js')
          scaffoldProject(projectDir, name.trim())
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          void vscode.window.showErrorMessage(`Couldn't create project: ${msg}`)
          return
        }
      }

      // Open the new folder. forceNewWindow=false reuses the current
      // window when it has no folder loaded (the common case here),
      // avoiding a jarring extra window pop.
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectDir), false)
    }),

    safeCommand('storyline.openWelcome', () => {
      // The welcome panel auto-shows once after activation but had no way
      // back. Register it so users can re-open from the command palette
      // when they want to revisit the getting-started steps.
      void import('./panels/WelcomePanel.js').then(({ WelcomePanel }) => {
        WelcomePanel.show(context, context.extensionUri)
      })
    }),

    safeCommand('storyline.openPlanning', () => {
      // If no Storyline project exists in this workspace yet, divert to the
      // onboarding flow so the user has a coherent way in. Without this the
      // chat panel would just sit there showing "Open a Storyline project
      // folder to get started."
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      const hasProject = folder ? fs.existsSync(path.join(folder, '.storyline', 'state.json')) : false
      if (!hasProject) {
        void vscode.commands.executeCommand('storyline.startNew')
        return
      }
      ChatPanel.show(context, context.extensionUri, vscode.ViewColumn.Beside)
    }),

    safeCommand('storyline.openPlanningStage', (stageId: string) => {
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      const hasProject = folder ? fs.existsSync(path.join(folder, '.storyline', 'state.json')) : false
      if (!hasProject) { void vscode.commands.executeCommand('storyline.startNew'); return }
      ChatPanel.show(context, context.extensionUri, vscode.ViewColumn.Beside)
      // Give the panel a moment to render before navigating
      setTimeout(() => ChatPanel.current()?.navigateToStage(stageId), 300)
    }),

    safeCommand('storyline.openEditor', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri
      if (!target) {
        vscode.window.showWarningMessage('Storyline: no file to open — activate a markdown file first.')
        return
      }
      await editorPanel.openForUri(target, vscode.ViewColumn.One)
    }),

    safeCommand('storyline.openToSide', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri
      if (!target) {
        vscode.window.showWarningMessage('Storyline: no file to open — activate a markdown file first.')
        return
      }
      await editorPanel.openForUri(target, vscode.ViewColumn.Beside)
    }),

    safeCommand('storyline.newChapter', async () => {
      const folders = vscode.workspace.workspaceFolders
      if (!folders?.length) {
        vscode.window.showWarningMessage('Storyline: open a project folder first.')
        return
      }
      const msDir = path.join(folders[0].uri.fsPath, 'manuscript')
      fs.mkdirSync(msDir, { recursive: true })

      let maxNum = 0
      try {
        const files = fs.readdirSync(msDir)
        for (const f of files) {
          const m = f.match(/^chapter-(\d+)/)
          if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
        }
      } catch { /* empty dir */ }

      const nextNum = maxNum + 1
      const fileName = `chapter-${String(nextNum).padStart(2, '0')}.md`
      const filePath = path.join(msDir, fileName)

      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, `# Chapter ${nextNum}\n\n`, 'utf-8')
      }

      await editorPanel.openForUri(vscode.Uri.file(filePath), vscode.ViewColumn.One)
    }),

    safeCommand('storyline.compileEpub', () => {
      CompilePanel.show(context, context.extensionUri, 'epub')
    }),

    safeCommand('storyline.compilePdf', () => {
      CompilePanel.show(context, context.extensionUri, 'print-pdf')
    }),

    safeCommand('storyline.generateCover', () => {
      CoverPanel.show(context, context.extensionUri)
    }),

    safeCommand('storyline.illustrations', () => {
      IllustrationsPanel.show(context, context.extensionUri, editorPanel)
    }),

    safeCommand('storyline.research', () => {
      ResearchPanel.show(context, context.extensionUri, editorPanel)
    }),

    // CB-05/CB-10: safeCommand wraps the handler with try/catch + toast
    // + reportException — replaces the bespoke try/catch we shipped in
    // v0.2.9 for these two commands. Other commands will be migrated
    // incrementally; the high-traffic discoverability paths land first.
    safeCommand('storyline.openLivePreview', () => openLivePreview(context, editorPanel)),
    safeCommand('storyline.openPreview', () => openPreview()),

    safeCommand('storyline.openOutputFolder', () => {
      const folder = vscode.workspace.workspaceFolders?.[0]
      if (!folder) return
      const outputDir = path.join(folder.uri.fsPath, 'output')
      fs.mkdirSync(outputDir, { recursive: true })
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputDir))
    }),

    // CB-11: regenerate planning/stages/<id>.md from state.json. Used
    // both as a command palette entry ("Storyline: Reset Stage Doc")
    // and from the toast that fires when the watcher detects a manual
    // edit. Optional first argument is the stageId (passed by the
    // watcher); when called from the palette it prompts for one.
    safeCommand('storyline.resetStageDoc', (stageId?: string) => resetStageDoc(stageId)),

    // Walks the active stage order and writes planning/stages/<id>.md for
    // every stage that has captured data — used to repair projects where
    // some stage MDs are missing because earlier writes silently no-op'd
    // (no specific renderer + no generic fallback). Now safe to run any
    // time: stages without data are skipped, stages with data are
    // refreshed from state.json.
    safeCommand('storyline.backfillStageDocs', () => backfillAllStageDocs()),

    // CB-13: writer-language manuscript versioning. saveAsVersion
    // snapshots the current state under a writer-named tag (e.g.
    // "First draft", "Alt ending"). listVersions shows them in a
    // quick-pick and switches between them. Implementation rides on
    // isomorphic-git but the words "branch" and "commit" are hidden
    // from the UI — writers see "version" and "switch to this version".
    safeCommand('storyline.saveAsVersion', () => saveAsVersion()),
    safeCommand('storyline.listVersions', () => listVersions()),

    safeCommand('storyline.files.refresh', () => {
      filesTreeProvider.refresh()
    }),

    safeCommand('storyline.files.newFile', async (node?: FileNode) => {
      const target = await pickTargetFolder(node)
      if (!target) return
      await createNewFile(target)
    }),

    safeCommand('storyline.files.newFileHere', async (node?: FileNode) => {
      if (!node || node.kind !== 'folder') return
      await createNewFile(node.absPath)
    }),

    safeCommand('storyline.files.newFolder', async (node?: FileNode) => {
      const target = await pickTargetFolder(node)
      if (!target) return
      const name = await vscode.window.showInputBox({
        title: 'New Folder',
        prompt: `Create folder in ${path.basename(target)}/`,
        placeHolder: 'folder name',
      })
      if (!name) return
      const cleaned = name.trim().replace(/[/\\]/g, '-')
      if (!cleaned) return
      const dir = path.join(target, cleaned)
      try {
        fs.mkdirSync(dir, { recursive: false })
        filesTreeProvider.refresh()
      } catch (err) {
        vscode.window.showErrorMessage(`Could not create folder: ${err instanceof Error ? err.message : String(err)}`)
      }
    }),

    safeCommand('storyline.changeProvider', () => {
      OnboardingPanel.show(context, context.extensionUri, { initialScreen: 'byok' })
    }),

    safeCommand('storyline.topUpCredits', () => {
      OnboardingPanel.show(context, context.extensionUri, { initialScreen: 'buy-credits' })
    }),

    safeCommand('storyline.checkForUpdate', () => {
      // Force-check from the command palette. Bypasses the 4h throttle
      // and any "Later" snooze, and surfaces a toast either way so the
      // user knows the check actually ran.
      return checkForUpdate(context, { force: true })
    }),

    safeCommand('storyline.viewPurchases', () => {
      PurchasesPanel.show(context, context.extensionUri, getBackendUrl())
    }),

    safeCommand('storyline.enterLicenceKey', async () => {
      const key = await vscode.window.showInputBox({
        title: 'Storyline — Enter Licence Key',
        placeHolder: 'SL-XXXX-XXXX-XXXX-XXXX',
        ignoreFocusOut: true,
      })
      if (!key?.trim()) return
      const manager = new LicenceManager(context, getBackendUrl())
      await manager.setLicenceKey(key.trim())
      const info = await manager.validate({})
      if (info.valid) {
        vscode.window.showInformationMessage(`Storyline: key activated — ${info.creditBalance} credits`)
        void updateCreditBalance(info.creditBalance, info.type)
      } else {
        vscode.window.showErrorMessage('Storyline: invalid or expired key.')
      }
    }),

    safeCommand('storyline.showLog', () => {
      showLog(false)
    }),

    safeCommand('storyline.viewTerms', () => {
      void vscode.env.openExternal(vscode.Uri.parse('https://api.storyline.my/terms'))
    }),

    safeCommand('storyline.viewPrivacy', () => {
      void vscode.env.openExternal(vscode.Uri.parse('https://api.storyline.my/privacy'))
    }),

    safeCommand('storyline.resetActivation', async () => {
      const manager = new LicenceManager(context, getBackendUrl())
      await manager.clearLicenceKey()
      await manager.clearCache()
      await context.globalState.update('storyline.freePlan', undefined)
      await context.globalState.update('storyline.byokConfig', undefined)
      await context.globalState.update('storyline.ollamaEnabled', undefined)
      await context.globalState.update('storyline.ollamaUrl', undefined)
      await secretsDelete(context, 'storyline.byokApiKey')
      vscode.window.showInformationMessage('Storyline: activation cleared. Run "Storyline: Start a New Story" to start over.')
    }),

    safeCommand('storyline.doctor', async () => {
      const store = LocalStore.fromWorkspace()
      if (!store) { vscode.window.showWarningMessage('Storyline: open a project folder first.'); return }
      const state = await store.read()
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!projectDir) return

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – lib/*.js are plain JS with no declaration files
      const { runDoctor, formatDoctorReport } = await import('@storyline/runtime/doctor.js')
      const report = await runDoctor(state, projectDir)

      const panel = vscode.window.createWebviewPanel('storyline.doctor', 'Storyline Doctor', vscode.ViewColumn.Beside, { enableScripts: false })
      panel.webview.html = doctorHtml(report, formatDoctorReport(report))
    }),

    safeCommand('storyline.generateMasterDoc', async () => {
      const store = LocalStore.fromWorkspace()
      if (!store) { vscode.window.showWarningMessage('Storyline: open a project folder first.'); return }
      const state = await store.read()
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!projectDir) return

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Storyline: generating master document…' },
        async () => {
          // CB-01: switched from `lib/output/master-doc.js` (which used
          // process.cwd() and required us to chdir the whole extension
          // host) to the bundled @storyline/core version that takes
          // projectPath as an explicit parameter. Removes a real
          // concurrency hazard — two parallel commands can no longer
          // race on process.cwd().
          const { generateMasterDocument } = await import('@storyline/core')
          const result = await generateMasterDocument(state, projectDir)
          vscode.window.showInformationMessage(`Master document generated: ${result.path}`)
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result.path))
        }
      )
    }),

    safeCommand('storyline.rebuildWiki', async () => {
      const store = LocalStore.fromWorkspace()
      if (!store) { vscode.window.showWarningMessage('Storyline: open a project folder first.'); return }
      const state = await store.read()
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!projectDir) { vscode.window.showWarningMessage('Storyline: no workspace folder.'); return }

      const manager = new LicenceManager(context, getBackendUrl())

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Storyline: rebuilding wiki…', cancellable: false },
        async (progress) => {
          const { compileAllWikiArticles } = await import('./wiki/article-compiler.js')
          const result = await compileAllWikiArticles(
            state,
            projectDir,
            getBackendUrl(),
            () => manager.getLicenceKey(),
            (msg) => progress.report({ message: msg }),
          )

          const parts: string[] = []
          if (result.compiled.length > 0) parts.push(`Compiled: ${result.compiled.join(', ')}`)
          if (result.skipped.length > 0) parts.push(`Skipped (no data): ${result.skipped.join(', ')}`)
          if (result.errors.length > 0) {
            parts.push(`Errors: ${result.errors.join('; ')}`)
            logInfo('[Storyline] rebuildWiki errors:', result.errors.join('; '))
          }

          const summary = parts.join(' | ')
          if (result.errors.length > 0) {
            vscode.window.showWarningMessage(`Storyline wiki rebuilt with errors. ${summary}`)
          } else {
            vscode.window.showInformationMessage(`Storyline wiki rebuilt. ${summary}`)
          }
        }
      )
    }),

    safeCommand('storyline.notes', async () => {
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!projectDir) { vscode.window.showWarningMessage('Storyline: open a project folder first.'); return }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – lib/*.js are plain JS with no declaration files
      const { scanManuscriptNotes, formatNotesReport } = await import('@storyline/runtime/manuscript/notes.js')
      const notes = await scanManuscriptNotes(projectDir)
      const report = formatNotesReport(notes)

      const panel = vscode.window.createWebviewPanel('storyline.notes', `Storyline Notes (${notes.length})`, vscode.ViewColumn.Beside, { enableScripts: false })
      panel.webview.html = notesHtml(notes.length, report)
    }),

    safeCommand('storyline.snapshotDraft', async () => {
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!projectDir) return

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Storyline: creating draft snapshot…' },
        async () => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore – lib/*.js are plain JS with no declaration files
          const { snapshotManuscript } = await import('@storyline/runtime/manuscript/snapshot.js')
          const snapshot = await snapshotManuscript(projectDir)
          vscode.window.showInformationMessage(
            `Snapshot: ${snapshot.chapterCount} chapters, ${snapshot.totalWords.toLocaleString()} words`
          )
        }
      )
    }),

    safeCommand('storyline.compareToPlan', async () => {
      const store = LocalStore.fromWorkspace()
      if (!store) return
      const state = await store.read()
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!projectDir) return

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Storyline: comparing manuscript to plan…' },
        async () => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore – lib/*.js are plain JS with no declaration files
          const { compareManuscriptToPlan } = await import('@storyline/runtime/manuscript/compare.js')
          const report = await compareManuscriptToPlan(state, projectDir)
          const panel = vscode.window.createWebviewPanel('storyline.compare', 'Storyline: Compare to Plan', vscode.ViewColumn.Beside, { enableScripts: false })
          const findings = report.findings.map((f: Record<string,unknown>) => `${f.severity === 'error' ? '✗' : f.severity === 'warning' ? '⚠' : 'ℹ'} ${f.message}`).join('\n')
          panel.webview.html = compareHtml(report.findings.length, findings)
        }
      )
    }),

    safeCommand('storyline.editBookInfo', async () => {
      const store = LocalStore.fromWorkspace()
      if (!store) return
      const state = await store.read()
      const meta = (state as unknown as Record<string,unknown>)._meta as Record<string,unknown> | undefined ?? {}

      const title = await vscode.window.showInputBox({
        title: 'Storyline — Book Title',
        value: String(meta.projectTitle ?? ''),
        placeHolder: 'My Novel',
        ignoreFocusOut: true,
      })
      if (title === undefined) return

      const author = await vscode.window.showInputBox({
        title: 'Storyline — Author Name',
        value: String(meta.author ?? ''),
        placeHolder: 'Author Name',
        ignoreFocusOut: true,
      })
      if (author === undefined) return

      const isbn = await vscode.window.showInputBox({
        title: 'Storyline — ISBN (optional)',
        value: String(meta.isbn ?? ''),
        placeHolder: '978-...',
        ignoreFocusOut: true,
      })

      await store.merge({ _meta: { ...meta, projectTitle: title, author, isbn: isbn ?? meta.isbn } } as unknown as Parameters<typeof store.merge>[0])
      vscode.window.showInformationMessage(`Book info saved: "${title}" by ${author}`)
    }),

    safeCommand('storyline.backupNow', async () => {
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!projectDir) return

      const dest = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: 'Choose backup folder',
      })
      if (!dest?.length) return

      const backupDir = path.join(dest[0].fsPath, `storyline-backup-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}`)

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Storyline: backing up project…' },
        async () => {
          fs.mkdirSync(backupDir, { recursive: true })
          await copyDir(projectDir, backupDir, ['node_modules', '.git', 'output'])
          vscode.window.showInformationMessage(`Backup complete: ${backupDir}`)
        }
      )
    }),
  )

  bootLog('activate: command registrations complete')

  // GitHub auto-sync subsystem
  const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
  if (workspaceUri) {
    bootLog('activate: github subsystem starting')
    const githubAuth = new GitHubAuth(context)
    const githubSync = new GitHubSyncService(workspaceUri, githubAuth)
    const githubStatusBar = new GitHubSyncStatusBar(context, githubSync, githubAuth)
    registerGitHubCommands(context, githubAuth, githubSync, githubStatusBar)
    context.subscriptions.push(githubSync, githubStatusBar)
    bootLog('activate: github subsystem registered')

    // Silently offer connect on first open (only if user hasn't dismissed)
    maybeOfferConnect(context, githubAuth, githubSync).catch(e => bootLogError('maybeOfferConnect', e))
  } else {
    bootLog('activate: no workspace, skipping github subsystem')
  }

  // CB-08-followup: every async startup task below is project-scoped.
  // Onboarding only makes sense if the user is in (or just landed in) a
  // Storyline workspace; same for the licence prompt and credit refresh.
  // The auto-update check is global, but pinning it to Storyline
  // workspaces keeps non-Storyline VS Code instances genuinely silent.
  // Without this gate the extension activated, fired the licence
  // prompt + credit refresh + update check, and then went dormant —
  // user-visible noise in workspaces that have nothing to do with us.
  if (hasProject) {
    bootLog('activate: dispatching shouldShowOnboarding')
    shouldShowOnboarding(context).then(async show => {
      bootLog('async: shouldShowOnboarding resolved', show ? 'true' : 'false')
      if (show) {
        OnboardingPanel.show(context, context.extensionUri, {
          onScaffolded: () => void initLayout(context),
        })
      } else {
        void initLayout(context)
      }
    }).catch(e => bootLogError('shouldShowOnboarding', e))

    // Update check — once per 24h, non-blocking, deferred 30s after
    // activation so the user's first interaction (open chapter, click chat,
    // run a stage save) isn't competing with a background network call.
    // CB-06 from docs/backlog/codebase-improvements.md.
    bootLog('activate: scheduling deferred checkForUpdate (30s)')
    const updateTimer = setTimeout(() => {
      bootLog('activate: dispatching deferred checkForUpdate')
      Promise.resolve(checkForUpdate(context)).catch(e => bootLogError('checkForUpdate', e))
    }, 30_000)
    context.subscriptions.push({ dispose: () => clearTimeout(updateTimer) })

    // Licence prompt — show on startup if no key or snooze expired
    bootLog('activate: dispatching checkLicencePrompt')
    Promise.resolve(checkLicencePrompt(context, getBackendUrl())).catch(e => bootLogError('checkLicencePrompt', e))

    // Seed the credit status bar from /validate so users see their balance
    // without needing to send a chat turn first. Silent on failure — the
    // status bar is hidden until validate succeeds rather than showing
    // an inaccurate value.
    Promise.resolve(refreshAndDisplayCredits(context, getBackendUrl())).catch(e => bootLogError('refreshAndDisplayCredits', e))
  } else {
    bootLog('activate: skipping onboarding/update/licence/credits (non-Storyline workspace)')
  }

  // Force the Storyline sidebar (Files view) to be the visible one whenever
  // a Storyline project is opened. Other extensions sometimes claim focus
  // during their own activation; the delayed retry runs after their work
  // settles. Activation event `workspaceContains:.storyline/state.json`
  // already gates this to real Storyline projects only.
  if (wsRoot && fs.existsSync(path.join(wsRoot, '.storyline', 'state.json'))) {
    const revealStorylineSidebar = (): void => {
      void vscode.commands.executeCommand('workbench.view.extension.storyline-sidebar')
        .then(() => vscode.commands.executeCommand('storyline.files.focus'), () => { /* non-fatal */ })
    }
    // Run after the current activation tick so the view container is fully
    // registered, and again after a short delay to override any later
    // reveal from another extension activating second.
    setTimeout(revealStorylineSidebar, 0)
    setTimeout(revealStorylineSidebar, 800)

    // CB-11: detect manual edits to planning/stages/*.md and warn the
    // user (once per session) that they'll be overwritten. Provides
    // storyline.resetStageDoc to regenerate a stage doc from state.
    registerStageMdWatcher(context)

    // CB-20: parse PDF/DOCX/EPUB drops into research/ into plain-text
    // cache files so the synchronous system-prompt builder can include
    // them in the AI context. First pass fires immediately; the watcher
    // re-runs whenever the writer adds or replaces a binary file.
    registerResearchPrewarm(context)
  }
}

export function deactivate(): void {
  disposeUpdateStatusBar()
}
