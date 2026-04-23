import * as vscode from 'vscode';
import type { WordCountStatusBar } from './status-bar';
import type { ActiveFileTracker } from './active-file-tracker';
import type { BackupService } from './backup-service';
import { classifyDocumentRole } from './manuscript-path';

// Storyline rich editor — command-driven WebviewPanel.
//
// Was previously a CustomTextEditorProvider with a static customEditors
// contribution in package.json claiming all .md files. That made the
// extension intrude on every VS Code instance — even non-Storyline
// workspaces saw the "Storyline Rich Editor" entry in their right-click
// "Open With" submenu, and a stale registration broke .md opening
// outright in some cases. The fix was to drop the customEditors
// contribution entirely and re-route this surface through an explicit
// command (storyline.openEditor) that's only visible when the
// `storyline.active` context key is set (workspaces with a
// .storyline/state.json).
//
// Save model is unchanged from the prior CustomTextEditor implementation:
// autosave on idle. Every content change the webview posts applies to
// the underlying TextDocument immediately; a debounced background save
// flushes to disk ~1.5s after the writer stops typing. Cmd+S is also
// wired (via the webview's 'save' message) as a "save right now" hook
// for power users who want explicit control.

const AUTOSAVE_IDLE_MS = 1500;
const VIEW_TYPE = 'storyline.editor';

export class StorylineEditorProvider {
  // Webview viewType — used both for createWebviewPanel and for the
  // tab-detection logic in live-preview-command (so it can recognise
  // when the active tab is a Storyline rich editor and pick up the
  // chapter URI from getActiveRichEditorUri()).
  public static readonly viewType = VIEW_TYPE;

  // Registry of currently-open Storyline webview panels, keyed by the
  // document URI they're editing. Populated on openForUri, cleaned up
  // on onDidDispose. Used by flushAll() to pull pending content out of
  // every webview on quit — bypassing the 500ms debounce that would
  // otherwise swallow in-flight keystrokes.
  private readonly livePanels = new Map<string, vscode.WebviewPanel>();

  // Tracks which rich editor panel (if any) is currently the active
  // tab. Live-preview reads this to know which chapter to render when
  // the active tab is one of our webviews (which don't appear in
  // vscode.window.activeTextEditor).
  private activeRichEditorUri: vscode.Uri | undefined;
  private readonly _onDidChangeActiveRichEditor = new vscode.EventEmitter<vscode.Uri | undefined>();
  public readonly onDidChangeActiveRichEditor = this._onDidChangeActiveRichEditor.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly statusBar: WordCountStatusBar,
    private readonly activeFileTracker: ActiveFileTracker,
    private readonly backupService: BackupService | null,
  ) {}

  // Returns the currently focused Storyline editor webview, or any
  // visible one as a fallback. Used by the toggle-compose-mode command
  // (palette + keyboard) so it can post the toggle into the editor the
  // writer is actually looking at, even if the keybinding fired with
  // focus on the explorer or status bar.
  public getActiveOrVisiblePanel(): vscode.WebviewPanel | undefined {
    let visibleFallback: vscode.WebviewPanel | undefined;
    for (const panel of this.livePanels.values()) {
      if (panel.active) return panel;
      if (panel.visible && !visibleFallback) visibleFallback = panel;
    }
    return visibleFallback;
  }

  // Live-preview reads this to know which chapter the rich editor is
  // currently focused on. Returns undefined when no rich editor is
  // active (writer is on a text-editor tab, the live-preview itself,
  // or a non-Storyline tab).
  public getActiveRichEditorUri(): vscode.Uri | undefined {
    return this.activeRichEditorUri;
  }

  // Quit-time drain. Called from deactivate(). For every open webview,
  // asks it to post its latest markdown synchronously (bypassing the
  // 500ms debounce), waits for the messages to arrive and applyEdit to
  // settle, then saves every dirty markdown document in the workspace.
  //
  // The live save pipeline is NOT touched — this is a one-shot shutdown
  // flush that only runs during deactivate, where VS Code will actually
  // await async extension work before killing the host.
  public async flushAll(): Promise<void> {
    for (const panel of this.livePanels.values()) {
      try {
        panel.webview.postMessage({ type: 'request-flush' });
      } catch { /* panel may already be disposed */ }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
    const dirtyDocs = vscode.workspace.textDocuments.filter(
      d => d.isDirty && /\.(md|markdown)$/i.test(d.uri.fsPath),
    );
    await Promise.all(dirtyDocs.map(d => d.save().then(() => undefined, () => undefined)));
  }

  // Public entry point — called from the storyline.openEditor and
  // storyline.openToSide commands. If a panel for this URI is already
  // open, reveal it in its existing column rather than spawning a
  // duplicate. Otherwise, open the document, create a fresh
  // WebviewPanel, and wire the same content-sync / autosave / flush
  // logic the previous CustomTextEditor implementation used.
  public async openForUri(uri: vscode.Uri, viewColumn?: vscode.ViewColumn): Promise<void> {
    const key = uri.toString();
    const existing = this.livePanels.get(key);
    if (existing) {
      existing.reveal(viewColumn ?? existing.viewColumn);
      return;
    }

    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(uri);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Storyline: could not open ${uri.fsPath} — ${message}`);
      return;
    }

    const fileName = vscode.workspace.asRelativePath(uri);
    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      fileName,
      viewColumn ?? vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
      },
    );

    await this.attachToPanel(document, panel);
  }

  // Wires a freshly created WebviewPanel to a TextDocument. Lifted
  // verbatim from the prior resolveCustomTextEditor body — only the
  // panel-creation step moved out (now done by openForUri above).
  private async attachToPanel(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    // Classify the document so the webview can render the role badge
    // ("Manuscript" vs "Supporting") in its toolbar.
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    const editorRole: 'manuscript' | 'supporting' = workspaceRoot
      ? await classifyDocumentRole(document.uri, workspaceRoot)
      : 'supporting';

    webviewPanel.webview.html = buildWebviewHtml(webviewPanel.webview, this.context.extensionUri);

    const panelKey = document.uri.toString();
    this.livePanels.set(panelKey, webviewPanel);

    // Status bar word count — webview panels aren't text editors, so
    // vscode.window.activeTextEditor is always undefined for us. We
    // notify the status bar explicitly when we gain/lose focus.
    this.activeFileTracker.setActive(document.uri);

    if (webviewPanel.active) {
      this.statusBar.setActiveCustomEditor(document.uri);
      this.activeRichEditorUri = document.uri;
      this._onDidChangeActiveRichEditor.fire(document.uri);
    }
    const viewStateSubscription = webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        this.statusBar.setActiveCustomEditor(document.uri);
        this.activeFileTracker.setActive(document.uri);
        this.activeRichEditorUri = document.uri;
        this._onDidChangeActiveRichEditor.fire(document.uri);
      } else {
        this.statusBar.clearActiveCustomEditorIfMatches(document.uri);
        if (this.activeRichEditorUri?.toString() === document.uri.toString()) {
          this.activeRichEditorUri = undefined;
          this._onDidChangeActiveRichEditor.fire(undefined);
        }
      }
    });

    // Per-document scroll position — writers reopening a long supporting
    // doc want to land where they were last reading. Persisted in
    // workspaceState so it survives VS Code restarts. Only sent on the
    // INITIAL load; later load-content pushes (external file changes,
    // git pull) don't re-scroll.
    const scrollStateKey = `editor-scroll:${document.uri.toString()}`;
    const savedScrollY = this.context.workspaceState.get<number>(scrollStateKey) ?? 0;
    let initialLoadSent = false;

    const pushContentToWebview = () => {
      webviewPanel.webview.postMessage({
        type: 'load-content',
        markdown: document.getText(),
        fileName: vscode.workspace.asRelativePath(document.uri),
        restoreScrollY: initialLoadSent ? null : savedScrollY,
      });
      initialLoadSent = true;
    };

    // Content-based sync guard — see prior implementation comment for
    // the "expectedContent vs document.getText()" rationale.
    let expectedContent: string | null = null;
    const normaliseForCompare = (s: string) => s.replace(/\s+$/, '');

    let autoSaveTimer: NodeJS.Timeout | undefined;
    let saveInFlight = false;
    let rerunAfterSave = false;

    const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (expectedContent !== null
          && normaliseForCompare(document.getText()) === normaliseForCompare(expectedContent)) {
        return;
      }
      pushContentToWebview();
    });

    const runSave = async (): Promise<void> => {
      if (saveInFlight) {
        rerunAfterSave = true;
        return;
      }
      saveInFlight = true;
      webviewPanel.webview.postMessage({ type: 'saving' });
      try {
        let saved = await document.save();
        if (!saved && document.isDirty) {
          await new Promise(resolve => setTimeout(resolve, 80));
          if (!document.isDirty) {
            saved = true;
          } else {
            saved = await document.save();
          }
        }
        if (!saved && document.isDirty) {
          throw new Error(
            'document.save() failed twice — the file may be read-only, ' +
            'locked by another process, or on a cloud-synced folder ' +
            'with sync conflicts.',
          );
        }
        webviewPanel.webview.postMessage({ type: 'saved' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        webviewPanel.webview.postMessage({ type: 'save-failed', error: message });
      } finally {
        saveInFlight = false;
        if (rerunAfterSave) {
          rerunAfterSave = false;
          setTimeout(() => runSave(), 0);
        }
      }
    };

    const scheduleAutoSave = () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = undefined;
        if (document.isDirty) void runSave();
      }, AUTOSAVE_IDLE_MS);
    };

    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
      viewStateSubscription.dispose();
      this.statusBar.clearActiveCustomEditorIfMatches(document.uri);
      if (this.activeRichEditorUri?.toString() === document.uri.toString()) {
        this.activeRichEditorUri = undefined;
        this._onDidChangeActiveRichEditor.fire(undefined);
      }
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      if (this.livePanels.get(panelKey) === webviewPanel) {
        this.livePanels.delete(panelKey);
      }
      this.backupService?.scheduleBackup('chapter-close');
    });

    webviewPanel.webview.onDidReceiveMessage(async (msg: { type: string; markdown?: string; scrollY?: number; enabled?: boolean }) => {
      if (msg.type === 'compose-mode') {
        try {
          const wantZen = msg.enabled === true;
          await vscode.commands.executeCommand('workbench.action.toggleZenMode');
          if (wantZen) {
            webviewPanel.reveal(webviewPanel.viewColumn, false);
          }
        } catch { /* zen-mode unavailable in some hosts; silent */ }
        return;
      }
      if (msg.type === 'scroll-changed' && typeof msg.scrollY === 'number' && Number.isFinite(msg.scrollY)) {
        const clamped = Math.max(0, Math.round(msg.scrollY));
        const current = this.context.workspaceState.get<number>(scrollStateKey);
        if (current !== clamped) {
          await this.context.workspaceState.update(scrollStateKey, clamped);
        }
        return;
      }

      if (msg.type === 'ready') {
        expectedContent = document.getText();
        pushContentToWebview();
        webviewPanel.webview.postMessage({ type: 'editor-role', role: editorRole });
        this.activeFileTracker.setActive(document.uri);
        return;
      }

      if (msg.type === 'content-changed' && typeof msg.markdown === 'string') {
        if (msg.markdown === document.getText()) return;
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          msg.markdown,
        );
        expectedContent = msg.markdown;
        await vscode.workspace.applyEdit(edit);
        scheduleAutoSave();
        return;
      }

      if (msg.type === 'save') {
        if (autoSaveTimer) {
          clearTimeout(autoSaveTimer);
          autoSaveTimer = undefined;
        }
        if (typeof msg.markdown === 'string' && msg.markdown !== document.getText()) {
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            msg.markdown,
          );
          expectedContent = msg.markdown;
          await vscode.workspace.applyEdit(edit);
        }
        void runSave();
        return;
      }

      if (msg.type === 'flush-save' && typeof msg.markdown === 'string') {
        if (autoSaveTimer) {
          clearTimeout(autoSaveTimer);
          autoSaveTimer = undefined;
        }
        if (msg.markdown !== document.getText()) {
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            msg.markdown,
          );
          expectedContent = msg.markdown;
          await vscode.workspace.applyEdit(edit);
        }
        void runSave();
        return;
      }
    });
  }
}

function buildWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.css'));
  const nonce = randomNonce();
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `script-src 'nonce-${nonce}'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Storyline</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function randomNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
