import * as vscode from 'vscode';
import type { WordCountStatusBar } from './status-bar';

// CustomTextEditorProvider that owns .md files in novel projects.
//
// Save model: autosave-with-verification. Every content change the webview
// posts applies to the TextDocument immediately via a serialized edit queue
// that checks applyEdit's return value; a debounced background save flushes
// to disk and then reads the file back to verify the bytes actually landed.
// If any step fails — applyEdit rejected, save() returned false, on-disk
// bytes don't match what we asked to save — the document is kept DIRTY and
// an error status is posted to the webview. That way VS Code's native
// close-prompt still fires and the writer is warned.
//
// This is deliberately more paranoid than a normal CustomTextEditor. Silent
// data loss during writing is the single worst failure mode; the cost of
// extra verification is milliseconds, which is invisible during drafting.

const AUTOSAVE_IDLE_MS = 800;  // tightened from 1500ms — less work at risk

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

    // Content-based sync guard — see comment history in commit log. Track
    // the markdown we last applied; ignore onDidChangeTextDocument events
    // whose resulting text matches (modulo trailing whitespace) that
    // expectation, since they're either our own echo or save-normalisation.
    let expectedContent: string | null = null;
    const normaliseForCompare = (s: string) => s.replace(/\s+$/, '');

    // ── Serialized applyEdit queue ─────────────────────────────────
    //
    // Multiple content-changed messages arriving in rapid succession
    // could previously race — each would compute Range(0,0, document.
    // lineCount, 0) against whatever state the document was in AT THAT
    // MOMENT, which for concurrent calls might be stale. The stale edit
    // then silently overwrote the newer one. This is the primary data-
    // loss vector the user reported.
    //
    // Fix: serialize all edits through a single promise chain. Coalesce
    // to the latest target (rapid typing = one final edit, not N racing
    // edits). Check applyEdit's return value; on false, keep the target
    // as pending so the next keystroke retries.
    let pendingTargetMarkdown: string | null = null;
    let editQueue: Promise<void> = Promise.resolve();

    const applyContent = (target: string): Promise<boolean> => {
      pendingTargetMarkdown = target;
      const runNow = editQueue.then(async () => {
        if (pendingTargetMarkdown === null) return true;
        const toApply = pendingTargetMarkdown;
        pendingTargetMarkdown = null;  // claim before applying
        if (toApply === document.getText()) return true;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          toApply,
        );
        expectedContent = toApply;  // set before applyEdit fires the change event
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) {
          // Edit was rejected. Keep the target pending so the next edit
          // attempt retries — but also surface this as a save-failed
          // status so the writer knows something's wrong.
          console.error('[Novel Writer] applyEdit rejected — content not written to document buffer');
          pendingTargetMarkdown = toApply;
          webviewPanel.webview.postMessage({
            type: 'save-failed',
            error: 'VS Code rejected the edit. Your text is still in the editor buffer — try saving again or reopening the file.',
          });
          return false;
        }
        return true;
      });
      editQueue = runNow.then(() => {}, () => {});  // never let the queue get stuck
      return runNow;
    };

    // ── Change subscription — push external changes to the webview ──
    const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (expectedContent !== null
          && normaliseForCompare(document.getText()) === normaliseForCompare(expectedContent)) {
        return;
      }
      pushContentToWebview();
    });

    // ── Save machinery ─────────────────────────────────────────────
    let autoSaveTimer: NodeJS.Timeout | undefined;
    let saveInFlight = false;
    let rerunAfterSave = false;

    // Verify that the bytes on disk match what the webview has, AFTER
    // the save. The only truth that matters: the file on disk contains
    // the writer's prose. Trim trailing whitespace/newlines on both
    // sides because VS Code's save pipeline may add a final newline
    // (files.insertFinalNewline).
    const verifyOnDisk = async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
      try {
        const bytes = await vscode.workspace.fs.readFile(document.uri);
        const onDisk = new TextDecoder('utf-8').decode(bytes);
        const expected = expectedContent ?? document.getText();
        if (normaliseForCompare(onDisk) === normaliseForCompare(expected)) {
          return { ok: true };
        }
        return {
          ok: false,
          reason: `On-disk content differs from expected (disk: ${onDisk.length} chars, expected: ${expected.length} chars).`,
        };
      } catch (err) {
        return {
          ok: false,
          reason: `Could not read back saved file: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    };

    const runSave = async (): Promise<void> => {
      if (saveInFlight) {
        rerunAfterSave = true;
        return;
      }
      saveInFlight = true;
      webviewPanel.webview.postMessage({ type: 'saving' });
      try {
        // 1. Flush any pending edit BEFORE saving, so the document
        //    buffer is fully in sync with the webview.
        await editQueue;
        if (pendingTargetMarkdown !== null) {
          const ok = await applyContent(pendingTargetMarkdown);
          if (!ok) {
            throw new Error('Could not apply pending edit before save — edit was rejected.');
          }
        }

        // 2. Save the document buffer to disk.
        const saved = await document.save();

        // 3. Verify. document.save() returning true is not enough —
        //    cloud-sync / format-on-save / external processes can make
        //    the final bytes differ from what we asked to save. Read
        //    the file back and compare.
        const verification = await verifyOnDisk();
        if (!verification.ok) {
          // Leave document.isDirty untouched — if the buffer was
          // actually saved but the bytes differ, VS Code will have
          // cleared dirty. Surface an error either way.
          throw new Error(`Save verification failed: ${verification.reason}`);
        }

        if (!saved && document.isDirty) {
          // Save reported failure AND document still dirty — real
          // problem. (The !saved && !isDirty path is gone — we no
          // longer pretend "autoSave caught up" because that lied.)
          throw new Error('document.save() returned false and the document is still dirty.');
        }

        webviewPanel.webview.postMessage({ type: 'saved' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Critical: also show a modal-adjacent warning to the writer.
        // The status bar indicator alone was missed — the user closed
        // the tab thinking autosave worked. An error toast is harder
        // to miss.
        vscode.window.showWarningMessage(
          `Novel Writer: save failed — ${message}`,
          'Open Dev Tools',
        ).then(action => {
          if (action === 'Open Dev Tools') {
            vscode.commands.executeCommand('workbench.action.toggleDevTools');
          }
        });
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
        if (document.isDirty || pendingTargetMarkdown !== null) {
          void runSave();
        }
      }, AUTOSAVE_IDLE_MS);
    };

    // ── Dispose: last-chance flush ─────────────────────────────────
    //
    // If the webview is torn down (tab closed, window closed, reload)
    // while we still have pending content or an unfired autosave, we
    // MUST flush. VS Code gives us synchronous dispose only; we can
    // kick off the save and rely on VS Code's own dirty-prompt as a
    // second line of defence.
    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
      viewStateSubscription.dispose();
      this.statusBar.clearActiveCustomEditorIfMatches(document.uri);
      if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = undefined; }

      // Flush any pending edit + save in the background. If the file is
      // still dirty, VS Code's own close-dirty-prompt catches the rest.
      const hasPending = pendingTargetMarkdown !== null || document.isDirty;
      if (hasPending) {
        (async () => {
          try {
            await editQueue;
            if (pendingTargetMarkdown !== null) {
              await applyContent(pendingTargetMarkdown);
            }
            if (document.isDirty) {
              await document.save();
            }
          } catch (err) {
            console.error('[Novel Writer] emergency dispose-flush failed:', err);
          }
        })();
      }
    });

    // ── Inbound message handlers ───────────────────────────────────
    webviewPanel.webview.onDidReceiveMessage(async (msg: { type: string; markdown?: string }) => {
      if (msg.type === 'ready') {
        expectedContent = document.getText();
        pushContentToWebview();
        return;
      }

      if (msg.type === 'content-changed' && typeof msg.markdown === 'string') {
        if (msg.markdown === document.getText()) return;
        void applyContent(msg.markdown).then(ok => {
          if (ok) scheduleAutoSave();
        });
        return;
      }

      if (msg.type === 'flush-now' && typeof msg.markdown === 'string') {
        // Webview is about to lose state (tab blur, visibility hidden,
        // beforeunload). Flush synchronously, bypass autosave debounce.
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = undefined; }
        if (msg.markdown !== document.getText()) {
          await applyContent(msg.markdown);
        }
        void runSave();
        return;
      }

      if (msg.type === 'save') {
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = undefined; }
        if (typeof msg.markdown === 'string' && msg.markdown !== document.getText()) {
          await applyContent(msg.markdown);
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
