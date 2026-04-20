import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import MarkdownIt from 'markdown-it';

// "Novel Writer: Open Live Chapter Preview" — side panel that renders
// the active chapter (markdown) with theme CSS applied, and updates
// 500ms after the writer stops typing. Sister command to Open Preview
// (full-book paginated) but trades pagination for typing responsiveness.
//
// Implementation: pure in-memory render in the extension host.
//   markdown → HTML via markdown-it (same config as CLI)
//   wrap in <section class="chapter"> with .first on first <p>
//   post to webview; webview replaces content div's innerHTML
//
// No Paged.js, no Puppeteer — too slow for per-keystroke updates.
// Live preview is a "galley proof" view: styled prose, no pagination.
// Use "Open Preview" (full-book) for pagination/headers/page numbers.

const CURLY_QUOTES = '\u201c\u201d\u2018\u2019';
const DEBOUNCE_MS = 500;

// Same markdown-it config as lib/compile/markdown-to-html.js — keeps
// preview typography in sync with compile output.
function createRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    breaks: false,
    linkify: false,
    typographer: true,
    quotes: CURLY_QUOTES,
    xhtmlOut: true,
  });
  md.renderer.rules.hr = () => '<hr class="scene-break" />\n';
  return md;
}

export async function openLivePreview(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Novel Writer: open a novel project folder first.');
    return;
  }

  const themeCss = await loadThemeCss(context);
  const md = createRenderer();

  const panel = vscode.window.createWebviewPanel(
    'novelWriter.livePreview',
    'Live Chapter Preview',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  panel.webview.html = buildWebviewHtml(themeCss);

  // Track the "source of truth" URI — the .md file currently focused in
  // VS Code, whether in the default text editor OR our custom TipTap
  // editor. vscode.window.activeTextEditor doesn't see custom editors,
  // so we use vscode.window.tabGroups which covers both.
  let sourceUri: vscode.Uri | undefined;

  const resolveActiveDoc = (): vscode.TextDocument | undefined => {
    if (!sourceUri) return undefined;
    return vscode.workspace.textDocuments.find(
      d => d.uri.toString() === sourceUri!.toString(),
    );
  };

  const updatePreview = () => {
    const doc = resolveActiveDoc();
    if (!doc) {
      panel.webview.postMessage({ type: 'update', html: emptyStateHtml() });
      return;
    }
    const markdown = doc.getText();
    const bodyHtml = md.render(markdown);
    // Mark first paragraph for drop cap styling (same transform the
    // compile theme phase applies).
    const withFirst = bodyHtml.replace('<p>', '<p class="first">');
    panel.webview.postMessage({
      type: 'update',
      html: withFirst,
      fileName: vscode.workspace.asRelativePath(doc.uri),
    });
  };

  // Debounced update so rapid typing doesn't thrash the webview.
  let debounceTimer: NodeJS.Timeout | undefined;
  const scheduleUpdate = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updatePreview, DEBOUNCE_MS);
  };

  // Get the URI of the active tab, whether it's a text editor tab or a
  // custom-editor tab. Returns undefined for terminal tabs, diff tabs,
  // notebooks, webview panels (like our own preview!), etc.
  const getActiveTabUri = (): vscode.Uri | undefined => {
    const tab = vscode.window.tabGroups.activeTabGroup?.activeTab;
    if (!tab) return undefined;
    const input = tab.input;
    if (input instanceof vscode.TabInputText) return input.uri;
    if (input instanceof vscode.TabInputCustom) return input.uri;
    return undefined;
  };

  const refreshSource = () => {
    const uri = getActiveTabUri();
    if (uri && isManuscriptMarkdown(uri, folder.uri)) {
      const changed = !sourceUri || sourceUri.toString() !== uri.toString();
      sourceUri = uri;
      if (changed) updatePreview();
    }
    // Deliberately don't clear sourceUri when focus moves to a non-
    // manuscript tab (e.g. the preview panel itself!) — the writer
    // expects the preview to keep showing the last chapter they were on.
  };

  // Initial content from whatever's active right now.
  refreshSource();

  // React to tab changes — writer flips between chapter files, or
  // switches between our custom editor and default editor. tabGroups
  // events cover both cases; activeTextEditor does not.
  const tabSubscription = vscode.window.tabGroups.onDidChangeTabs(refreshSource);
  const tabGroupSubscription = vscode.window.tabGroups.onDidChangeTabGroups(refreshSource);

  // React to text edits — including edits via our custom editor, because
  // applyEdit there emits onDidChangeTextDocument too.
  const textChangeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
    if (sourceUri && e.document.uri.toString() === sourceUri.toString()) {
      scheduleUpdate();
    }
  });

  panel.webview.onDidReceiveMessage(msg => {
    if (msg?.type === 'ready') {
      // Webview finished booting its inline script — push initial content.
      updatePreview();
    }
  });

  panel.onDidDispose(() => {
    tabSubscription.dispose();
    tabGroupSubscription.dispose();
    textChangeSubscription.dispose();
    if (debounceTimer) clearTimeout(debounceTimer);
  });
}

// ── private helpers ────────────────────────────────────────────

async function loadThemeCss(context: vscode.ExtensionContext): Promise<string> {
  const cssPath = path.join(
    context.extensionPath,
    'resources',
    'themes',
    'classic-serif',
    'theme.css',
  );
  try {
    return await fs.readFile(cssPath, 'utf-8');
  } catch {
    // Fallback: minimal inline typography so the preview isn't styleless
    // if the resource bundle is missing. Shouldn't happen in a properly
    // packaged .vsix.
    return `
      body { font-family: Georgia, serif; line-height: 1.6; }
      p { text-indent: 1.5em; margin: 0; }
    `;
  }
}

function isManuscriptMarkdown(uri: vscode.Uri, workspaceRoot: vscode.Uri): boolean {
  const rel = path.relative(workspaceRoot.fsPath, uri.fsPath);
  // Any .md or .markdown file under manuscript/ is a candidate. We don't
  // require a specific subpath — writers may use `manuscript/chapters/ch01.md`
  // or just `manuscript/ch01.md`.
  return /\.(md|markdown)$/i.test(rel) && rel.startsWith('manuscript' + path.sep);
}

function emptyStateHtml(): string {
  return `
    <div class="empty-state">
      <p><em>Open a chapter file in <code>manuscript/</code> to preview it here.</em></p>
    </div>
  `;
}

function buildWebviewHtml(themeCss: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Chapter Preview</title>
  <style>
    /* ─── Theme CSS (Classic Serif, shared with compile pipeline) ─── */
    ${themeCss}

    /* ─── Panel shell (chrome around the reading surface) ────────── */
    html, body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100%;
      margin: 0;
      padding: 0;
    }
    body {
      overflow-y: auto;
      font-family: var(--vscode-font-family);
    }
    .preview-header {
      position: sticky;
      top: 0;
      background: var(--vscode-editor-background);
      padding: 10px 16px 10px 16px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      z-index: 10;
    }
    .preview-header .left { display: flex; align-items: center; gap: 12px; }
    .preview-header .label { letter-spacing: 0.08em; text-transform: uppercase; }
    .preview-header .filename {
      font-family: var(--vscode-editor-font-family), monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 240px;
    }
    .preview-header select {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
      border-radius: 3px;
      padding: 3px 8px;
      font-family: inherit;
      font-size: 11px;
      cursor: pointer;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--vscode-descriptionForeground);
    }

    /* ─── Device stage (the "room" around the reading surface) ────
     * Horizontal scroll if panel is narrower than the device width —
     * fidelity over responsive shrink. Writers who want a full view
     * resize the panel. */

    .device-stage {
      padding: 24px 16px 120px;
      display: flex;
      justify-content: center;
      overflow-x: auto;
    }

    .device-surface {
      box-sizing: border-box;
      color: #111;
    }

    /* Structural rules applied regardless of device (typography
       details are overridden per-device below). */
    .device-surface p {
      text-indent: 1.5em;
      margin: 0;
    }
    .device-surface > p:first-child,
    .device-surface h1 + p,
    .device-surface h2 + p,
    .device-surface h3 + p,
    .device-surface hr.scene-break + p,
    .device-surface li p,
    .device-surface td p,
    .device-surface th p,
    .device-surface blockquote p {
      text-indent: 0;
    }
    .device-surface h1 {
      font-style: italic;
      font-weight: normal;
      font-size: 1.6em;
      text-align: center;
      margin: 2em 0 1em;
    }
    .device-surface h2, .device-surface h3 { font-weight: bold; margin: 1.5em 0 0.4em; }
    .device-surface p.first::first-letter {
      float: left;
      font-size: 3.2em;
      line-height: 0.85;
      margin: 0.02em 0.08em 0 0;
      font-weight: bold;
    }
    .device-surface hr.scene-break { border: none; text-align: center; margin: 2em 0; }
    .device-surface hr.scene-break::before {
      content: "* * *";
      display: block;
      letter-spacing: 0.5em;
      color: #666;
      opacity: 0.7;
    }
    .device-surface table {
      border-collapse: collapse;
      width: 100%;
      margin: 1.2em 0;
      font-size: 0.95em;
    }
    .device-surface th, .device-surface td {
      border: 1px solid rgba(0,0,0,0.15);
      padding: 0.45em 0.75em;
      text-align: left;
    }
    .device-surface th { background: rgba(0,0,0,0.04); }
    .device-surface blockquote { margin: 1em 2em; font-style: italic; }

    /* ─── Per-device frame styling ──────────────────────────────── *
     *
     * Each device uses its actual page width and body font size.
     *
     *   Print 6×9 — 6" × 9" at 96 DPI = 576px wide. 0.75" margins
     *     (72px) each side. 11pt body, 1.4 line-height — matches the
     *     Classic Serif print theme exactly.
     *   iPad — Apple Books single-page reading surface is roughly 720px
     *     wide with ~80px margins. Palatino 17px, line-height 1.55 —
     *     typical Books.app defaults.
     *   Kindle Paperwhite — 6" display, ~560px wide in-app reading
     *     area with ~60px side margins. Bookerly 16px, line-height
     *     1.55. Slightly reduced text contrast (#2a2824) mimics
     *     e-ink grey-on-cream appearance.
     */

    body.device-print-6x9 .device-stage { background: #eceae4; }
    body.device-print-6x9 .device-surface {
      width: 576px;
      padding: 72px 96px;
      background: #ffffff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.08);
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 11pt;
      line-height: 1.4;
    }

    body.device-ipad .device-stage { background: #1c1c1e; }
    body.device-ipad .device-surface {
      width: 720px;
      padding: 80px 96px;
      background: #f3ece2;
      color: #1a1612;
      border-radius: 2px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      font-family: "Palatino", "Iowan Old Style", Georgia, serif;
      font-size: 17px;
      line-height: 1.55;
    }
    body.device-ipad .device-surface p.first::first-letter { color: #1a1612; }

    body.device-kindle .device-stage { background: #3a3936; }
    body.device-kindle .device-surface {
      width: 560px;
      padding: 60px 72px;
      background: #e9e3d7;
      color: #2a2824;
      font-family: "Bookerly", Georgia, serif;
      font-size: 16px;
      line-height: 1.55;
    }
    body.device-kindle .device-surface p.first::first-letter { color: #2a2824; }
    body.device-kindle .device-surface hr.scene-break::before { color: #645f58; }
  </style>
</head>
<body class="device-print-6x9">
  <div class="preview-header">
    <div class="left">
      <span class="label">Live Chapter Preview</span>
      <span class="filename" id="filename">—</span>
    </div>
    <select id="device-picker" title="Reading device">
      <option value="device-print-6x9">Print 6×9</option>
      <option value="device-ipad">iPad — Apple Books</option>
      <option value="device-kindle">Kindle Paperwhite</option>
    </select>
  </div>
  <div class="device-stage">
    <div class="device-surface" id="content">
      <div class="empty-state"><p><em>Loading…</em></p></div>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const content = document.getElementById('content');
    const filename = document.getElementById('filename');
    const picker = document.getElementById('device-picker');

    // Restore previously-selected device.
    const state = vscode.getState() || {};
    if (state.device) {
      picker.value = state.device;
      document.body.classList.remove('device-print-6x9', 'device-ipad', 'device-kindle');
      document.body.classList.add(state.device);
    }

    picker.addEventListener('change', () => {
      document.body.classList.remove('device-print-6x9', 'device-ipad', 'device-kindle');
      document.body.classList.add(picker.value);
      vscode.setState({ ...vscode.getState(), device: picker.value });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg && msg.type === 'update') {
        content.innerHTML = msg.html || '';
        filename.textContent = msg.fileName || '—';
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
