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

  // Custom-editor priority is "option" globally (so .md files in non-
  // Storyline workspaces keep opening with VS Code's built-in markdown
  // editor — without this the extension's static customEditors
  // contribution would claim every .md file system-wide and break
  // any workspace where activate() doesn't register the provider).
  // For Storyline workspaces we restore the "always open in the rich
  // editor" behaviour by writing a workspace-scoped editorAssociations
  // entry. Idempotent — only writes if the association is missing or
  // pointing somewhere else, so we don't churn .vscode/settings.json
  // on every activation.
  await ensureRichEditorAssociation();

  // Status bar word count — created first so the custom editor provider
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

  // Custom editor for .md files. Only registered here so non-novel workspaces
  // (where extension doesn't activate) get VS Code's default markdown editor.
  editorProvider = new StorylineEditorProvider(context, statusBar, activeFileTracker, backupService);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      StorylineEditorProvider.viewType,
      editorProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('storyline.hello', () => {
      vscode.window.showInformationMessage('Storyline — active');
    }),
    vscode.commands.registerCommand('storyline.openEditor', (uri?: vscode.Uri) => {
      if (uri) {
        return vscode.commands.executeCommand('vscode.openWith', uri, StorylineEditorProvider.viewType);
      }
      return openNovelEditor(context);
    }),
    // Open a file in the right-hand editor column (ViewColumn.Beside).
    // Writers use this to pin a supporting doc next to their manuscript
    // without affecting the Explorer sidebar. VS Code creates column 2
    // the first time and persists the layout per-workspace — no
    // extension-side enforcement required. Replaces the failed
    // Inspector-view approach from v0.16.x.
    vscode.commands.registerCommand('storyline.openToSide', async (uri?: vscode.Uri) => {
      let target = uri;
      if (!target) {
        const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
        const input = activeTab?.input;
        if (input instanceof vscode.TabInputText) target = input.uri;
        else if (input instanceof vscode.TabInputCustom) target = input.uri;
      }
      if (!target) {
        vscode.window.showInformationMessage(
          'Storyline: select a .md file in the explorer or focus one in the editor first.',
        );
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        target,
        StorylineEditorProvider.viewType,
        vscode.ViewColumn.Beside,
      );
    }),
    vscode.commands.registerCommand('storyline.compileEpub', () => compileToEpub()),
    vscode.commands.registerCommand('storyline.compilePrintPdf', () => compileToPrintPdf()),
    vscode.commands.registerCommand('storyline.openPreview', () => openPreview()),
    vscode.commands.registerCommand('storyline.openLivePreview', () => openLivePreview(context)),
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

// Writes the workspace-scoped editor association so .md files in this
// Storyline project default to opening in the rich Storyline editor
// (TipTap surface) rather than VS Code's built-in markdown editor.
//
// Why a workspace setting and not a "default" priority on the custom
// editor contribution: making the contribution global-default broke
// .md files in EVERY workspace — even non-Storyline ones — because
// VS Code routed them to storyline.editor before our extension could
// say "we shouldn't be active here". Per-workspace association keeps
// the rich editor as the default exactly where it belongs.
//
// Idempotent: reads the current setting and only writes if either of
// the two extensions (md, markdown) is missing or pointing elsewhere.
// Writes through ConfigurationTarget.Workspace so the value lands in
// the workspace's .vscode/settings.json (committed alongside project
// state — the rich editor is part of the project's intended setup).
async function ensureRichEditorAssociation(): Promise<void> {
  try {
    const config = vscode.workspace.getConfiguration('workbench');
    const current = config.get<Record<string, string>>('editorAssociations') || {};
    const desiredViewType = 'storyline.editor';
    const needsUpdate =
      current['*.md'] !== desiredViewType ||
      current['*.markdown'] !== desiredViewType;
    if (!needsUpdate) return;
    await config.update(
      'editorAssociations',
      { ...current, '*.md': desiredViewType, '*.markdown': desiredViewType },
      vscode.ConfigurationTarget.Workspace,
    );
  } catch (err) {
    // Non-fatal: if the workspace is read-only or the user has chosen
    // to manage editorAssociations themselves, the explicit "Storyline:
    // Open in Rich Editor" command remains a fallback.
    console.warn('Storyline: could not set workbench.editorAssociations', err);
  }
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
