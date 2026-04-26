import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { ChatPanel } from './panels/ChatPanel.js'
import { OnboardingPanel, STRIPE_PORTAL_URL } from './panels/OnboardingPanel.js'
import { EditorPanel } from './panels/EditorPanel.js'
import { CompilePanel } from './panels/CompilePanel.js'
import { CoverPanel } from './panels/CoverPanel.js'
import { IllustrationsPanel } from './panels/IllustrationsPanel.js'
import { ResearchPanel } from './panels/ResearchPanel.js'
import { openLivePreview } from './preview/live-preview-command.js'
import { openPreview } from './preview/preview-command.js'
import { WordCountStatusBar } from './editor/word-count.js'
import { shouldShowOnboarding } from './onboarding/first-run.js'
import { initLayout } from './editor/layout-init.js'
import { LicenceManager } from './auth/licence.js'

function getBackendUrl(): string {
  return vscode.workspace.getConfiguration('storyline').get<string>('backendUrl', 'https://api.storyline.app').replace(/\/$/, '')
}

/**
 * Storyline-owned markdown files that should always open in the rich
 * TipTap editor instead of plain text. Covers chapter prose
 * (`manuscript/`) and every planning doc (`docs/` — chapter cards,
 * character notes, beat sheets, etc.). Non-Storyline files (config,
 * .storyline/* state, anything outside these prefixes) open normally.
 */
const RICH_EDITOR_PREFIXES = ['manuscript/', 'manuscript\\', 'docs/', 'docs\\']

function shouldRouteToRichEditor(uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') return false
  if (!/\.(md|markdown)$/i.test(uri.fsPath)) return false
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return false
  const rel = vscode.workspace.asRelativePath(uri, false)
  return RICH_EDITOR_PREFIXES.some(p => rel.startsWith(p))
}

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = new WordCountStatusBar(context)
  const editorPanel = new EditorPanel(context, context.extensionUri, statusBar)
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
    vscode.commands.registerCommand('storyline.openPlanning', () => {
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

    vscode.commands.registerCommand('storyline.manageSubscription', () => {
      vscode.env.openExternal(vscode.Uri.parse(STRIPE_PORTAL_URL))
    }),

    vscode.commands.registerCommand('storyline.changeProvider', () => {
      OnboardingPanel.show(context, context.extensionUri, { initialScreen: 'byok' })
    }),

    vscode.commands.registerCommand('storyline.topUpCredits', () => {
      OnboardingPanel.show(context, context.extensionUri, { initialScreen: 'buy-credits' })
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
  )

  // First-run check — async, non-blocking
  shouldShowOnboarding(context).then(async show => {
    if (show) {
      OnboardingPanel.show(context, context.extensionUri, {
        onScaffolded: () => void initLayout(context),
      })
    } else {
      void initLayout(context)
    }
  })
}

export function deactivate(): void {}
