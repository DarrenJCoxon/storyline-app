import * as vscode from 'vscode';
import type { WordCountStatusBar } from './status-bar';
import type { ActiveFileTracker } from './active-file-tracker';
import type { BackupService } from './backup-service';
import { classifyDocumentRole } from './manuscript-path';

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

export class StorylineEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'storyline.editor';

  // Registry of currently-open Storyline webview panels, keyed by the
  // document URI they're editing. Populated on resolveCustomTextEditor,
  // cleaned up on onDidDispose. Used by flushAll() to pull pending
  // content out of every webview on quit — bypassing the 500ms
  // debounce that would otherwise swallow in-flight keystrokes.
  private readonly livePanels = new Map<string, vscode.WebviewPanel>();

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

  // Quit-time drain. Called from deactivate(). For every open webview,
  // asks it to post its latest markdown synchronously (bypassing the
  // 500ms debounce), waits for the messages to arrive and applyEdit to
  // settle, then saves every dirty markdown document in the workspace.
  //
  // The live save pipeline is NOT touched — this is a one-shot shutdown
  // flush that only runs during deactivate, where VS Code will actually
  // await async extension work before killing the host.
  public async flushAll(): Promise<void> {
    // 1. Ask every live webview to post its current markdown immediately.
    for (const panel of this.livePanels.values()) {
      try {
        // Fire-and-forget — webview responds via content-changed which
        // the existing onDidReceiveMessage handler applies to the doc.
        panel.webview.postMessage({ type: 'request-flush' });
      } catch { /* panel may already be disposed */ }
    }
    // 2. Give the webview → host round-trip time. 200ms is generous —
    // the postMessage and applyEdit are both fast, but VS Code's
    // message bus can have jitter during shutdown.
    await new Promise(resolve => setTimeout(resolve, 200));
    // 3. Save every dirty markdown document. This covers BOTH dirtied-
    // by-flush docs AND docs that were dirty before the flush (autosave
    // hadn't fired yet).
    const dirtyDocs = vscode.workspace.textDocuments.filter(
      d => d.isDirty && /\.(md|markdown)$/i.test(d.uri.fsPath),
    );
    await Promise.all(dirtyDocs.map(d => d.save().then(() => undefined, () => undefined)));
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };

    // Classify the document so the webview can render the role badge
    // ("Manuscript" vs "Supporting") in its toolbar. No routing happens
    // here — VS Code places the tab wherever the open command targeted.
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    const editorRole: 'manuscript' | 'supporting' = workspaceRoot
      ? await classifyDocumentRole(document.uri, workspaceRoot)
      : 'supporting';

    webviewPanel.webview.html = buildWebviewHtml(webviewPanel.webview, this.context.extensionUri);

    // Register this panel for quit-time flushing. Key by document URI
    // so a re-open of the same chapter replaces the stale entry (VS
    // Code may call resolve again for a document that was previously
    // disposed if the writer closes and reopens the tab).
    const panelKey = document.uri.toString();
    this.livePanels.set(panelKey, webviewPanel);

    // Status bar word count — custom editors aren't text editors, so
    // vscode.window.activeTextEditor is always undefined for us. We
    // notify the status bar explicitly when we gain/lose focus.
    // Breadcrumb write fires on every resolve (including window restore,
    // when webviewPanel.active can be false even though the writer is
    // about to see this tab). Writing a stale breadcrumb for an inactive
    // editor is harmless — /follow-up just reads whichever file was most
    // recently focused, and the common case is that the restored tab IS
    // the one the writer wants. The active-based branch below still
    // updates it on real focus changes.
    this.activeFileTracker.setActive(document.uri);

    if (webviewPanel.active) {
      this.statusBar.setActiveCustomEditor(document.uri);
    }
    const viewStateSubscription = webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        this.statusBar.setActiveCustomEditor(document.uri);
        this.activeFileTracker.setActive(document.uri);
      } else {
        this.statusBar.clearActiveCustomEditorIfMatches(document.uri);
      }
    });

    // Per-document scroll position — writers reopening a long supporting
    // doc (a 20k-word planning note, a character bible) want to land
    // where they were last reading, not at the top or wherever TipTap's
    // setContent leaves the caret. Persisted in workspaceState so it
    // survives VS Code restarts. Only sent on the INITIAL load; later
    // load-content pushes (external file changes, git pull) don't
    // re-scroll, since the writer may have moved since opening.
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

    // Content-based sync guard.
    //
    // The webview IS the source of truth while the writer is editing.
    // `expectedContent` tracks the markdown we most recently asked the
    // TextDocument to hold (via applyEdit) — the last state the webview
    // and document were known-aligned.
    //
    // On any onDidChangeTextDocument, if the document's current text
    // matches expectedContent (modulo trailing whitespace / newlines —
    // the touch points of files.insertFinalNewline and
    // files.trimTrailingWhitespace), the change is one we caused or a
    // save-time normalisation. Either way, the webview doesn't need
    // re-syncing — pushing would replace the user's in-flight typing.
    //
    // If the document diverges materially (git pull, another editor,
    // external tool modified the file), we push — the webview's content
    // is genuinely stale and needs refreshing.
    //
    // This replaces the earlier timing-based guards (suppressNextDocChange
    // + saveInFlight) which worked most of the time but could miss edge
    // cases where VS Code fired the normalisation event on a tick where
    // both flags had flipped back to false.
    let expectedContent: string | null = null;
    const normaliseForCompare = (s: string) => s.replace(/\s+$/, '');

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

    const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (expectedContent !== null
          && normaliseForCompare(document.getText()) === normaliseForCompare(expectedContent)) {
        // Either our own applyEdit's echo or a save-time normalisation.
        // Webview already has this content (or a trivially different
        // whitespace variant of it) — do not clobber in-flight typing.
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
      // Deregister — but only if this panel is still the one we have
      // tracked. If a newer resolve for the same URI replaced us, leave
      // the newer entry alone.
      if (this.livePanels.get(panelKey) === webviewPanel) {
        this.livePanels.delete(panelKey);
      }
      // Chapter close → snapshot the whole project. Debounced inside
      // the service so closing five tabs in a row produces one
      // snapshot, not five.
      this.backupService?.scheduleBackup('chapter-close');
    });

    webviewPanel.webview.onDidReceiveMessage(async (msg: { type: string; markdown?: string; scrollY?: number; enabled?: boolean }) => {
      if (msg.type === 'compose-mode') {
        // Compose mode toggle from the editor — flip VS Code Zen Mode in
        // sync so the activity bar, side bar, panel and tabs all collapse
        // (or restore) alongside the in-webview compose surface. Zen Mode
        // is a toggle command (no explicit on/off variant), so we detect
        // current state by reading the workbench config and only fire if
        // it differs from what the webview is asking for. This keeps
        // toggling idempotent: pressing the shortcut twice in quick
        // succession can't desynchronise the two layers.
        try {
          const wantZen = msg.enabled === true;
          // Best-effort check: VS Code doesn't expose isZenMode publicly,
          // so we infer from `workbench.action.toggleZenMode` semantics —
          // any time the webview's compose state changes we fire the
          // toggle, accepting that out-of-band Zen toggles by the user
          // (Cmd+K Z) can drift. The trade-off is acceptable because the
          // common case is the writer using only our shortcut.
          await vscode.commands.executeCommand('workbench.action.toggleZenMode');
          // After toggling, push focus back to the webview so the writer
          // doesn't have to click into the prose to keep typing.
          if (wantZen) {
            webviewPanel.reveal(webviewPanel.viewColumn, false);
          }
        } catch { /* zen-mode unavailable in some hosts; silent */ }
        return;
      }
      if (msg.type === 'scroll-changed' && typeof msg.scrollY === 'number' && Number.isFinite(msg.scrollY)) {
        // Webview debounces scroll events; we persist every one that
        // arrives. No-op if it matches what's already saved (workspaceState
        // still writes to disk, so skip the round-trip when possible).
        const clamped = Math.max(0, Math.round(msg.scrollY));
        const current = this.context.workspaceState.get<number>(scrollStateKey);
        if (current !== clamped) {
          await this.context.workspaceState.update(scrollStateKey, clamped);
        }
        return;
      }

      if (msg.type === 'ready') {
        // Anchor the content-based guard at whatever the document holds
        // at mount time. The webview is about to render this exact text,
        // so subsequent change events that still match it (e.g. the
        // opening load itself) won't trigger a redundant push.
        expectedContent = document.getText();
        pushContentToWebview();
        // Post the editor-role AFTER the webview is ready — not during
        // resolveCustomTextEditor, because at that point the webview's
        // message listener isn't mounted yet and the message is dropped.
        webviewPanel.webview.postMessage({ type: 'editor-role', role: editorRole });
        // The webview has now rendered and the writer is looking at this
        // chapter — refresh the breadcrumb so /follow-up picks the
        // freshest target.
        this.activeFileTracker.setActive(document.uri);
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
        // Set BEFORE applyEdit so the change event (fired synchronously
        // inside applyEdit on some VS Code versions) sees the updated
        // expectation. If applyEdit reports failure we'd still have
        // moved expectedContent forward — but applyEdit failures are
        // vanishingly rare and at worst cost us one redundant push.
        expectedContent = msg.markdown;
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
          expectedContent = msg.markdown;
          await vscode.workspace.applyEdit(edit);
        }
        void runSave();
        return;
      }

      if (msg.type === 'flush-save' && typeof msg.markdown === 'string') {
        // Webview is about to lose state (tab close, window hidden,
        // pagehide). Apply the pending content and route through
        // runSave() — fire-and-forget so we don't block the webview's
        // teardown path.
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
