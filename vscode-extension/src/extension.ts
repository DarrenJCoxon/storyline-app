import * as vscode from 'vscode';
import { openNovelEditor } from './webview-panel';
import { StorylineEditorProvider } from './storyline-editor-provider';
import { WordCountStatusBar } from './status-bar';
import { ActiveFileTracker } from './active-file-tracker';
import { compileToEpub, compileToPrintPdf } from './compile-command';
import { editBookInfo } from './book-info-command';
import { openPreview } from './preview-command';
import { openLivePreview } from './live-preview-command';
import { BackupService } from './backup-service';
import { readBackupSettings, writeBackupPath } from './backup-settings';
import { ResearchPanel } from './research-panel';

// Module-scoped so deactivate() can reach them for the final flush.
let backupService: BackupService | null = null;
let editorProvider: StorylineEditorProvider | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // The customEditors contribution adds an implicit onCustomEditor activation
  // event, so opening any .md file in any workspace wakes this extension —
  // even in non-Storyline projects. Gate all side effects on an actual
  // Storyline workspace so the tiptap editor, backup service, and status
  // nags stay out of unrelated projects.
  if (!(await isStorylineWorkspace())) {
    console.log('Storyline extension: no .storyline/state.json in workspace — staying inert');
    return;
  }

  console.log('Storyline extension activated');

  // Set the workspace-scoped context key that gates every Storyline
  // menu item, command palette entry, and keybinding. Without this
  // gate, Cmd+Shift+Enter (compose mode), the explorer right-click
  // entries, and every "Storyline: …" command would surface in EVERY
  // VS Code window — even ones with no Storyline project open. The
  // key flips on here only after we've confirmed this workspace has a
  // .storyline/state.json, so non-Storyline windows stay clean.
  await vscode.commands.executeCommand('setContext', 'storyline.active', true);

  // The customEditors contribution that used to claim *.md system-wide
  // has been removed entirely (it was breaking .md opening in non-
  // Storyline projects and showing a "Storyline Rich Editor" entry in
  // every Open With submenu globally). The rich editor is now opened
  // exclusively via the storyline.openEditor command (right-click in
  // the explorer, or Cmd+Enter on a selected .md file). No global
  // file-association side effects remain.
  // Earlier-version cleanup: remove a stale workbench.editorAssociations
  // entry pointing at the now-deleted custom editor viewType. If we
  // leave it in place, VS Code tries to open .md files with a viewType
  // that no longer exists and shows "no provider available".
  await clearStaleEditorAssociations();

  // Status bar word count — created first so the rich editor provider
  // can notify it of focus changes (needed because custom editors aren't
  // text editors and don't flip vscode.window.activeTextEditor).
  const statusBar = new WordCountStatusBar(context);
  await statusBar.start();

  // Active-file breadcrumb — writes .storyline/active-file.txt on focus
  // change so the /follow-up skill (running in a separate Claude Code
  // process) can scope its scan to the chapter the writer is actually
  // looking at. Raw-text-editor path handled here; custom-editor path
  // handled in StorylineEditorProvider.
  const activeFileTracker = new ActiveFileTracker();
  activeFileTracker.attachTextEditorListener(context);

  // Backup service — snapshots the whole project to an external folder
  // on chapter close and project close. Only active once the writer has
  // picked a backup location; until then, a status-bar item nags them.
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (workspaceRoot) {
    backupService = new BackupService(workspaceRoot, context);
    await ensureBackupConfigured(workspaceRoot, context);
  }

  // Rich editor — command-driven now, no static customEditors
  // contribution. The provider exposes openForUri(uri) which creates
  // a fresh WebviewPanel (or reveals an existing one) for a markdown
  // file. Stored module-scoped so deactivate() can call flushAll().
  editorProvider = new StorylineEditorProvider(context, statusBar, activeFileTracker, backupService);

  context.subscriptions.push(
    vscode.commands.registerCommand('storyline.hello', () => {
      vscode.window.showInformationMessage('Storyline — active');
    }),
    vscode.commands.registerCommand('storyline.openEditor', async (uri?: vscode.Uri) => {
      if (uri) {
        await editorProvider!.openForUri(uri);
        return;
      }
      // No URI passed — fall back to the existing file picker flow.
      return openNovelEditor(context);
    }),
    // Open a file in the right-hand editor column (ViewColumn.Beside).
    // Writers use this to pin a supporting doc next to their manuscript
    // without affecting the Explorer sidebar. VS Code creates column 2
    // the first time and persists the layout per-workspace — no
    // extension-side enforcement required.
    vscode.commands.registerCommand('storyline.openToSide', async (uri?: vscode.Uri) => {
      let target = uri;
      if (!target) {
        const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
        const input = activeTab?.input;
        if (input instanceof vscode.TabInputText) target = input.uri;
        else if (input instanceof vscode.TabInputCustom) target = input.uri;
        else if (input instanceof vscode.TabInputWebview) {
          // Webview tab — could be one of our rich editor panels.
          // Recover the .md URI from the editor provider's tracking.
          target = editorProvider?.getActiveRichEditorUri();
        }
      }
      if (!target) {
        vscode.window.showInformationMessage(
          'Storyline: select a .md file in the explorer or focus one in the editor first.',
        );
        return;
      }
      await editorProvider!.openForUri(target, vscode.ViewColumn.Beside);
    }),
    vscode.commands.registerCommand('storyline.compileEpub', () => compileToEpub()),
    vscode.commands.registerCommand('storyline.compilePrintPdf', () => compileToPrintPdf()),
    vscode.commands.registerCommand('storyline.openPreview', () => openPreview()),
    vscode.commands.registerCommand('storyline.openLivePreview', () => openLivePreview(context, editorProvider!)),
    vscode.commands.registerCommand('storyline.editBookInfo', () => editBookInfo(context)),
    vscode.commands.registerCommand('storyline.setBackupFolder', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!root) return;
      await promptForBackupFolder(root);
    }),
    vscode.commands.registerCommand('storyline.openBackupFolder', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!root) return;
      const settings = await readBackupSettings(root);
      if (!settings) {
        vscode.window.showWarningMessage('Storyline: no backup folder configured.');
        return;
      }
      await vscode.env.openExternal(vscode.Uri.file(settings.path));
    }),
    vscode.commands.registerCommand('storyline.showBackupLog', () => {
      backupService?.showLog();
    }),
    vscode.commands.registerCommand('storyline.toggleComposeMode', async () => {
      // VS Code consumes Cmd/Ctrl+Shift+Enter before the webview's own
      // keydown listener can see it (registered keybindings always
      // win), so the round-trip is: host receives the keystroke →
      // posts request-compose-toggle to the active editor → editor
      // flips local state and replies with compose-mode → host fires
      // Zen Mode. If no Storyline editor is open, the command is a
      // no-op (Zen Mode would toggle without the prose surface
      // changing — confusing). Surface a hint in that case.
      const panel = editorProvider?.getActiveOrVisiblePanel();
      if (!panel) {
        vscode.window.showInformationMessage(
          'Storyline: open a chapter in the rich editor first to use compose mode.',
        );
        return;
      }
      panel.webview.postMessage({ type: 'request-compose-toggle' });
    }),
    vscode.commands.registerCommand('storyline.showResearch', async () => {
      const researchPanel = ResearchPanel.create(context);
      await researchPanel.show(context);
    }),
    vscode.commands.registerCommand('storyline.showWordCountBreakdown', async () => {
      const breakdown = statusBar.getBreakdown();
      if (!breakdown.length) {
        vscode.window.showInformationMessage('Storyline: no markdown files found in the workspace');
        return;
      }
      const total = statusBar.getTotal();
      const target = statusBar.getTarget();
      const title = target > 0
        ? `Total: ${total.toLocaleString()} / ${target.toLocaleString()} words (${Math.round(total / target * 100)}%)`
        : `Total: ${total.toLocaleString()} words`;

      interface BreakdownItem extends vscode.QuickPickItem {
        uri: vscode.Uri;
      }

      const items: BreakdownItem[] = breakdown.map(b => ({
        label: b.label,
        description: `${b.count.toLocaleString()} words`,
        uri: b.uri,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title,
        placeHolder: 'Select a file to open it',
        matchOnDescription: true,
      });
      if (picked) {
        await vscode.window.showTextDocument(picked.uri);
      }
    }),
  );
}

export async function deactivate(): Promise<void> {
  // Two-stage shutdown flush:
  //   1. Pull any in-flight webview content (still sitting in the 500ms
  //      debounce) through to the underlying TextDocuments, and save
  //      every dirty markdown doc. This is the safety net for the
  //      "typed then immediately quit" data-loss case — without it,
  //      content in the debounce window silently vanishes.
  //   2. Take a final project snapshot into the external backup folder.
  //
  // Order matters: flushAll first so the backup picks up the just-saved
  // content. VS Code awaits deactivate() before killing the extension
  // host, so both awaits have time to complete.
  if (editorProvider) {
    try { await editorProvider.flushAll(); } catch { /* non-fatal */ }
  }
  if (backupService) {
    try { await backupService.flushBackup('project-close'); } catch { /* non-fatal */ }
  }
  // Other disposables registered on context.subscriptions are cleaned up by VS Code.
}

// Removes any leftover *.md / *.markdown → storyline.editor entries from
// workbench.editorAssociations (workspace AND user scope). Earlier
// extension versions wrote these to make double-click open the rich
// editor; now that the customEditors contribution has been removed
// entirely, those entries point at a viewType that doesn't exist and
// VS Code complains "no provider available" when opening .md files.
// Strip them on activation so existing projects recover automatically.
//
// Other associations the user/extensions added are left intact.
async function clearStaleEditorAssociations(): Promise<void> {
  const stripStorylineEntries = async (target: vscode.ConfigurationTarget) => {
    try {
      const config = vscode.workspace.getConfiguration('workbench');
      const inspect = config.inspect<Record<string, string>>('editorAssociations');
      const current =
        target === vscode.ConfigurationTarget.Workspace
          ? inspect?.workspaceValue
          : inspect?.globalValue;
      if (!current) return;
      const cleaned: Record<string, string> = {};
      let modified = false;
      for (const [pattern, viewType] of Object.entries(current)) {
        if ((pattern === '*.md' || pattern === '*.markdown') && viewType === 'storyline.editor') {
          modified = true;
          continue;
        }
        cleaned[pattern] = viewType;
      }
      if (!modified) return;
      await config.update(
        'editorAssociations',
        Object.keys(cleaned).length ? cleaned : undefined,
        target,
      );
    } catch {
      /* non-fatal */
    }
  };
  await stripStorylineEntries(vscode.ConfigurationTarget.Workspace);
  await stripStorylineEntries(vscode.ConfigurationTarget.Global);
}

async function isStorylineWorkspace(): Promise<boolean> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return false;
  for (const folder of folders) {
    const stateFile = vscode.Uri.joinPath(folder.uri, '.storyline', 'state.json');
    try {
      await vscode.workspace.fs.stat(stateFile);
      return true;
    } catch {
      /* not this folder */
    }
  }
  return false;
}

// --- backup configuration prompt ---

// Status-bar item prodding the writer to configure a backup folder.
// Lives for the session — cleared once they pick one.
let unconfiguredStatusItem: vscode.StatusBarItem | null = null;

async function ensureBackupConfigured(
  workspaceRoot: vscode.Uri,
  context: vscode.ExtensionContext,
): Promise<void> {
  const existing = await readBackupSettings(workspaceRoot);
  if (existing) return;

  // Non-blocking status-bar nag — writer doesn't get blocked by a modal.
  unconfiguredStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
  unconfiguredStatusItem.text = '$(warning) Storyline backup not set';
  unconfiguredStatusItem.tooltip = 'Click to pick a folder where Storyline will snapshot your project on every chapter and project close.';
  unconfiguredStatusItem.command = 'storyline.setBackupFolder';
  unconfiguredStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  unconfiguredStatusItem.show();
  context.subscriptions.push(unconfiguredStatusItem);

  // Also surface a one-shot notification so writers who don't watch the
  // status bar discover this exists. Non-modal — if they dismiss, the
  // status-bar item stays lit until they configure.
  const CHOOSE = 'Choose Backup Folder…';
  const LATER = 'Later';
  vscode.window.showInformationMessage(
    'Storyline can back up your entire project to an external folder on every chapter and project close. Pick a backup location (external drive, iCloud, Dropbox) to enable this safety net.',
    CHOOSE,
    LATER,
  ).then(async choice => {
    if (choice === CHOOSE) {
      await promptForBackupFolder(workspaceRoot);
    }
  });
}

async function promptForBackupFolder(workspaceRoot: vscode.Uri): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Set as Storyline backup folder',
    title: 'Choose a folder for Storyline backups',
  });
  if (!picked || picked.length === 0) return;
  const folder = picked[0].fsPath;
  await writeBackupPath(workspaceRoot, folder);
  vscode.window.showInformationMessage(
    `Storyline: backups will be written to ${folder}`,
  );
  if (unconfiguredStatusItem) {
    unconfiguredStatusItem.hide();
    unconfiguredStatusItem.dispose();
    unconfiguredStatusItem = null;
  }
}
