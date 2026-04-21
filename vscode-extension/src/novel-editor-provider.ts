import * as vscode from 'vscode';
import type { WordCountStatusBar } from './status-bar';

// CustomTextEditorProvider that owns .md files in novel projects.
//
// Save model: autosave on idle. Every content change the webview posts
// applies to the TextDocument immediately; a debounced background save
// flushes to disk ~1.5s after the writer stops typing. Cmd+S is also
// wired (via the webview's 'save' message) as a "save right now" hook
// for power users who want explicit control.
//
// The previous manual save button approach created a brittle surface
// where a user could click Save during a race condition and see a
// cryptic error toast. Autosave sidesteps the entire class: users see
// VS Code's native tab-dirty dot while a save is pending, and the
// webview shows a simple Saved / Saving… status indicator.

const AUTOSAVE_IDLE_MS = 1500;

export class NovelEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'novelWriter.editor';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly statusBar: WordCountStatusBar,
  ) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };

    webviewPanel.webview.html = buildWebviewHtml(webviewPanel.webview, this.context.extensionUri);

    // Status bar word count — custom editors aren't text editors, so
    // vscode.window.activeTextEditor is always undefined for us. We
    // notify the status bar explicitly when we gain/lose focus.
    if (webviewPanel.active) {
      this.statusBar.setActiveCustomEditor(document.uri);
    }
    const viewStateSubscription = webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        this.statusBar.setActiveCustomEditor(document.uri);
      } else {
        this.statusBar.clearActiveCustomEditorIfMatches(document.uri);
      }
    });

    const pushContentToWebview = () => {
      webviewPanel.webview.postMessage({
        type: 'load-content',
        markdown: document.getText(),
        fileName: vscode.workspace.asRelativePath(document.uri),
      });
    };

    // State used by the change subscription below AND by the save
    // handler. Declared together so both closures share the same refs.
    let suppressNextDocChange = false;
    // Autosave timer — scheduled after every content-changed applyEdit;
    // cancelled if a new edit arrives before it fires (so fast typists
    // get exactly one save at the end of their burst, not one per edit).
    let autoSaveTimer: NodeJS.Timeout | undefined;
    // Guard against overlapping saves when an autosave flush is already
    // in flight and Cmd+S or another autosave fires. If a save is in
    // flight, callers set rerunAfterSave so we re-fire once the current
    // one completes.
    let saveInFlight = false;
    let rerunAfterSave = false;

    // Keep the webview in sync if the document changes externally (git
    // pull, another editor, find/replace). Two cases we specifically do
    // NOT push back to the webview:
    //   1. Our own applyEdit fired the event — suppressNextDocChange
    //      is set immediately before the call and cleared here.
    //   2. A save is in flight. VS Code's on-save normalisation
    //      (files.insertFinalNewline, files.trimTrailingWhitespace,
    //      "format on save" extensions) fires onDidChangeTextDocument
    //      after document.save() commits. If we pushed that back to
    //      the webview, editor.commands.setContent would clobber
    //      whatever the user has typed since the save was scheduled —
    //      losing their last ~2 seconds of work. The webview is the
    //      source of truth during the save window; the next content-
    //      changed it posts will re-sync cleanly.
    const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (suppressNextDocChange) {
        suppressNextDocChange = false;
        return;
      }
      if (saveInFlight) return;
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
        // document.save() returns false in several benign cases:
        //   - autoSave (VS Code's own) fired first, doc is already clean
        //   - the save was coalesced into one already in flight
        //   - filesystem (iCloud / Dropbox / Time Machine) lagged
        // A real failure is: returned false AND the doc is still dirty
        // after a beat. Retry once before reporting it.
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
          // Run the queued save on a fresh tick so we don't re-enter
          // the `saveInFlight` guard synchronously.
          setTimeout(() => runSave(), 0);
        }
      }
    };

    const scheduleAutoSave = () => {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = undefined;
        // Don't save a clean doc. If the user typed and undid before
        // the timer fired, VS Code already cleared isDirty and there's
        // nothing to flush.
        if (document.isDirty) void runSave();
      }, AUTOSAVE_IDLE_MS);
    };

    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
      viewStateSubscription.dispose();
      this.statusBar.clearActiveCustomEditorIfMatches(document.uri);
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
    });

    webviewPanel.webview.onDidReceiveMessage(async (msg: { type: string; markdown?: string }) => {
      if (msg.type === 'ready') {
        pushContentToWebview();
        return;
      }

      if (msg.type === 'content-changed' && typeof msg.markdown === 'string') {
        if (msg.markdown === document.getText()) return; // no-op
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          msg.markdown,
        );
        suppressNextDocChange = true;
        await vscode.workspace.applyEdit(edit);
        scheduleAutoSave();
        return;
      }

      if (msg.type === 'save') {
        // Explicit save request (Cmd+S power-user shortcut). Cancel any
        // pending autosave, sync any late content, save now.
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
          suppressNextDocChange = true;
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
  <title>Novel Writer</title>
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
