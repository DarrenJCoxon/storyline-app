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
import { PurchasesPanel } from './panels/PurchasesPanel.js'
import { openLivePreview } from './preview/live-preview-command.js'
import { openPreview } from './preview/preview-command.js'
import { WordCountStatusBar } from './editor/word-count.js'
import { shouldShowOnboarding } from './onboarding/first-run.js'
import { checkLicencePrompt } from './onboarding/licence-prompt.js'
import { ensureResearchFolder, ensurePlanningFolder } from './onboarding/project-scaffold.js'
import { postActivateOpenWorkspace } from './onboarding/post-activate.js'
import { initLayout } from './editor/layout-init.js'
import { LicenceManager } from './auth/licence.js'
import { initDiagnosticLog, logInfo, showLog } from './diagnostic-log.js'
import { LocalStore } from './state/local-store.js'
import { checkForUpdate } from './update/auto-updater.js'
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

function shouldRouteToRichEditor(uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') return false
  if (!/\.(md|markdown)$/i.test(uri.fsPath)) return false
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return false
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
  if (wsRoot && fs.existsSync(path.join(wsRoot, '.storyline', 'state.json'))) {
    try { ensureResearchFolder(wsRoot) } catch (e) { bootLogError('ensureResearchFolder', e) }
    try { ensurePlanningFolder(wsRoot) } catch (e) { bootLogError('ensurePlanningFolder', e) }
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
        if (!rawKey || !rawKey.startsWith('SL-')) {
          void vscode.window.showErrorMessage(
            'Storyline activation failed — the link didn\'t contain a valid key. Email darren@coxon.ai if this persists.',
          )
          return
        }
        const manager = new LicenceManager(context, getBackendUrl())
        await manager.setLicenceKey(rawKey)
        const info = await manager.validate({})
        if (info.valid) {
          // Activated key is paid (credits) — clear any stale freePlan flag.
          if (info.type !== 'free') {
            await context.globalState.update('storyline.freePlan', undefined)
          }
          void vscode.window.showInformationMessage(
            `Storyline activated — ${info.creditBalance.toLocaleString()} credits ready.`,
          )
          await postActivateOpenWorkspace(context, context.extensionUri)
        } else {
          await manager.clearLicenceKey()
          void vscode.window.showErrorMessage(
            'Storyline activation failed — that key isn\'t recognised. Email darren@coxon.ai.',
          )
        }
      },
    }),
  )
  bootLog('activate: URI handler registered')

  const statusBar = new WordCountStatusBar(context)
  bootLog('activate: WordCountStatusBar constructed')
  const editorPanel = new EditorPanel(context, context.extensionUri, statusBar)
  bootLog('activate: EditorPanel constructed')
  void statusBar.start(context)

  const planningStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  planningStatusBar.text = '$(comment-discussion) Storyline'
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
  bootLog('activate: status bar items registered')

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
    vscode.commands.registerCommand('storyline.startNew', () => {
      // Always-available entry point — works in any workspace including
      // empty folders that have no .storyline/state.json yet. Opens the
      // onboarding wizard which scaffolds the project layout, then runs
      // initLayout so the rich editor + chat panel come up.
      OnboardingPanel.show(context, context.extensionUri, {
        onScaffolded: () => void initLayout(context),
      })
    }),

    vscode.commands.registerCommand('storyline.openPlanning', () => {
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

    vscode.commands.registerCommand('storyline.openEditor', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri
      if (!target) {
        vscode.window.showWarningMessage('Storyline: no file to open — activate a markdown file first.')
        return
      }
      await editorPanel.openForUri(target, vscode.ViewColumn.One)
    }),

    vscode.commands.registerCommand('storyline.openToSide', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri
      if (!target) {
        vscode.window.showWarningMessage('Storyline: no file to open — activate a markdown file first.')
        return
      }
      await editorPanel.openForUri(target, vscode.ViewColumn.Beside)
    }),

    vscode.commands.registerCommand('storyline.newChapter', async () => {
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

    vscode.commands.registerCommand('storyline.compileEpub', () => {
      CompilePanel.show(context, context.extensionUri, 'epub')
    }),

    vscode.commands.registerCommand('storyline.compilePdf', () => {
      CompilePanel.show(context, context.extensionUri, 'print-pdf')
    }),

    vscode.commands.registerCommand('storyline.generateCover', () => {
      CoverPanel.show(context, context.extensionUri)
    }),

    vscode.commands.registerCommand('storyline.illustrations', () => {
      IllustrationsPanel.show(context, context.extensionUri, editorPanel)
    }),

    vscode.commands.registerCommand('storyline.research', () => {
      ResearchPanel.show(context, context.extensionUri, editorPanel)
    }),

    vscode.commands.registerCommand('storyline.openLivePreview', () => {
      void openLivePreview(context, editorPanel)
    }),

    vscode.commands.registerCommand('storyline.openPreview', () => {
      void openPreview()
    }),

    vscode.commands.registerCommand('storyline.openOutputFolder', () => {
      const folder = vscode.workspace.workspaceFolders?.[0]
      if (!folder) return
      const outputDir = path.join(folder.uri.fsPath, 'output')
      fs.mkdirSync(outputDir, { recursive: true })
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputDir))
    }),

    vscode.commands.registerCommand('storyline.changeProvider', () => {
      OnboardingPanel.show(context, context.extensionUri, { initialScreen: 'byok' })
    }),

    vscode.commands.registerCommand('storyline.topUpCredits', () => {
      OnboardingPanel.show(context, context.extensionUri, { initialScreen: 'buy-credits' })
    }),

    vscode.commands.registerCommand('storyline.checkForUpdate', () => {
      // Force-check from the command palette. Bypasses the 4h throttle
      // and any "Later" snooze, and surfaces a toast either way so the
      // user knows the check actually ran.
      return checkForUpdate(context, { force: true })
    }),

    vscode.commands.registerCommand('storyline.viewPurchases', () => {
      PurchasesPanel.show(context, context.extensionUri, getBackendUrl())
    }),

    vscode.commands.registerCommand('storyline.enterLicenceKey', async () => {
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
      } else {
        vscode.window.showErrorMessage('Storyline: invalid or expired key.')
      }
    }),

    vscode.commands.registerCommand('storyline.showLog', () => {
      showLog(false)
    }),

    vscode.commands.registerCommand('storyline.viewTerms', () => {
      void vscode.env.openExternal(vscode.Uri.parse('https://api.storyline.my/terms'))
    }),

    vscode.commands.registerCommand('storyline.viewPrivacy', () => {
      void vscode.env.openExternal(vscode.Uri.parse('https://api.storyline.my/privacy'))
    }),

    vscode.commands.registerCommand('storyline.resetActivation', async () => {
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

    vscode.commands.registerCommand('storyline.doctor', async () => {
      const store = LocalStore.fromWorkspace()
      if (!store) { vscode.window.showWarningMessage('Storyline: open a project folder first.'); return }
      const state = await store.read()
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!projectDir) return

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – lib/*.js are plain JS with no declaration files
      const { runDoctor, formatDoctorReport } = await import('../../lib/doctor.js')
      const report = await runDoctor(state, projectDir)

      const panel = vscode.window.createWebviewPanel('storyline.doctor', 'Storyline Doctor', vscode.ViewColumn.Beside, { enableScripts: false })
      panel.webview.html = doctorHtml(report, formatDoctorReport(report))
    }),

    vscode.commands.registerCommand('storyline.generateMasterDoc', async () => {
      const store = LocalStore.fromWorkspace()
      if (!store) { vscode.window.showWarningMessage('Storyline: open a project folder first.'); return }
      const state = await store.read()
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!projectDir) return

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Storyline: generating master document…' },
        async () => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore – lib/*.js are plain JS with no declaration files
          const { generateMasterDocument } = await import('../../lib/output/master-doc.js')
          const origCwd = process.cwd()
          try {
            process.chdir(projectDir)
            const result = await generateMasterDocument(state)
            vscode.window.showInformationMessage(`Master document generated: ${result.path}`)
            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result.path))
          } finally {
            process.chdir(origCwd)
          }
        }
      )
    }),

    vscode.commands.registerCommand('storyline.notes', async () => {
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!projectDir) { vscode.window.showWarningMessage('Storyline: open a project folder first.'); return }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – lib/*.js are plain JS with no declaration files
      const { scanManuscriptNotes, formatNotesReport } = await import('../../lib/manuscript/notes.js')
      const notes = await scanManuscriptNotes(projectDir)
      const report = formatNotesReport(notes)

      const panel = vscode.window.createWebviewPanel('storyline.notes', `Storyline Notes (${notes.length})`, vscode.ViewColumn.Beside, { enableScripts: false })
      panel.webview.html = notesHtml(notes.length, report)
    }),

    vscode.commands.registerCommand('storyline.snapshotDraft', async () => {
      const projectDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!projectDir) return

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Storyline: creating draft snapshot…' },
        async () => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore – lib/*.js are plain JS with no declaration files
          const { snapshotManuscript } = await import('../../lib/manuscript/snapshot.js')
          const snapshot = await snapshotManuscript(projectDir)
          vscode.window.showInformationMessage(
            `Snapshot: ${snapshot.chapterCount} chapters, ${snapshot.totalWords.toLocaleString()} words`
          )
        }
      )
    }),

    vscode.commands.registerCommand('storyline.compareToPlan', async () => {
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
          const { compareManuscriptToPlan } = await import('../../lib/manuscript/compare.js')
          const report = await compareManuscriptToPlan(state, projectDir)
          const panel = vscode.window.createWebviewPanel('storyline.compare', 'Storyline: Compare to Plan', vscode.ViewColumn.Beside, { enableScripts: false })
          const findings = report.findings.map((f: Record<string,unknown>) => `${f.severity === 'error' ? '✗' : f.severity === 'warning' ? '⚠' : 'ℹ'} ${f.message}`).join('\n')
          panel.webview.html = compareHtml(report.findings.length, findings)
        }
      )
    }),

    vscode.commands.registerCommand('storyline.editBookInfo', async () => {
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

    vscode.commands.registerCommand('storyline.backupNow', async () => {
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

  // First-run check — async, non-blocking
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

  // Update check — once per 24h, non-blocking
  bootLog('activate: dispatching checkForUpdate')
  Promise.resolve(checkForUpdate(context)).catch(e => bootLogError('checkForUpdate', e))

  // Licence prompt — show on startup if no key or snooze expired
  bootLog('activate: dispatching checkLicencePrompt')
  Promise.resolve(checkLicencePrompt(context, getBackendUrl())).catch(e => bootLogError('checkLicencePrompt', e))
}

export function deactivate(): void {}
