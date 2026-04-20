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

  // Track the "source of truth" document — the .md file currently visible
  // in the editor column we're previewing. Changes as the writer switches
  // between chapter files.
  let sourceDoc: vscode.TextDocument | undefined;

  const updatePreview = () => {
    if (!sourceDoc) {
      panel.webview.postMessage({ type: 'update', html: emptyStateHtml() });
      return;
    }
    const markdown = sourceDoc.getText();
    const bodyHtml = md.render(markdown);
    // Mark first paragraph for drop cap styling (same transform the
    // compile theme phase applies).
    const withFirst = bodyHtml.replace('<p>', '<p class="first">');
    panel.webview.postMessage({
      type: 'update',
      html: withFirst,
      fileName: vscode.workspace.asRelativePath(sourceDoc.uri),
    });
  };

  // Debounced update so rapid typing doesn't thrash the webview.
  let debounceTimer: NodeJS.Timeout | undefined;
  const scheduleUpdate = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updatePreview, DEBOUNCE_MS);
  };

  const attachToActiveDoc = () => {
    const active = vscode.window.activeTextEditor?.document;
    if (active && isManuscriptMarkdown(active.uri, folder.uri)) {
      sourceDoc = active;
      updatePreview();
    }
  };

  // Initial content from whatever's active right now.
  attachToActiveDoc();

  // React to active editor changes — writer flips between chapter files.
  const activeChangeSubscription = vscode.window.onDidChangeActiveTextEditor(() => {
    const active = vscode.window.activeTextEditor?.document;
    if (active && isManuscriptMarkdown(active.uri, folder.uri)) {
      sourceDoc = active;
      updatePreview();
    }
  });

  // React to text edits — including edits via our custom editor, because
  // those go through applyEdit which emits didChangeTextDocument too.
  const textChangeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
    if (sourceDoc && e.document.uri.toString() === sourceDoc.uri.toString()) {
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
    activeChangeSubscription.dispose();
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

    /* ─── Live preview shell overrides ───────────────────────────── */
    html, body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100%;
      overflow-y: auto;
    }
    body {
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 40px 120px;
    }
    .preview-header {
      position: sticky;
      top: 0;
      background: var(--vscode-editor-background);
      padding: 8px 0 12px;
      margin: 0 0 24px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      font-family: var(--vscode-font-family);
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .preview-header .label { letter-spacing: 0.08em; text-transform: uppercase; }
    .preview-header .filename { font-family: var(--vscode-editor-font-family), monospace; }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-font-family);
    }
    /* The theme CSS targets .ProseMirror for editor; we re-target .preview-content
       so the same typography rules apply to the rendered chapter. */
    .preview-content {
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 17px;
      line-height: 1.7;
    }
    .preview-content p {
      text-indent: 1.5em;
      margin: 0;
    }
    .preview-content > p:first-child,
    .preview-content h1 + p,
    .preview-content h2 + p,
    .preview-content h3 + p,
    .preview-content hr.scene-break + p,
    .preview-content li p,
    .preview-content td p,
    .preview-content th p,
    .preview-content blockquote p {
      text-indent: 0;
    }
    .preview-content h1 {
      font-family: Georgia, serif;
      font-style: italic;
      font-weight: normal;
      font-size: 1.6em;
      text-align: center;
      margin: 2em 0 1em;
    }
    .preview-content h2, .preview-content h3 {
      font-weight: bold;
      margin: 1.5em 0 0.4em;
    }
    .preview-content p.first::first-letter {
      float: left;
      font-size: 3.2em;
      line-height: 0.85;
      margin: 0.02em 0.08em 0 0;
      font-weight: bold;
    }
    .preview-content hr.scene-break {
      border: none;
      text-align: center;
      margin: 2em 0;
    }
    .preview-content hr.scene-break::before {
      content: "* * *";
      display: block;
      letter-spacing: 0.5em;
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
    }
    .preview-content table {
      border-collapse: collapse;
      width: 100%;
      margin: 1.2em 0;
      font-size: 0.95em;
    }
    .preview-content th, .preview-content td {
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.35));
      padding: 0.45em 0.75em;
      text-align: left;
    }
    .preview-content th {
      background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.12));
    }
    .preview-content blockquote {
      margin: 1em 2em;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="preview-header">
    <span class="label">Live Chapter Preview</span>
    <span class="filename" id="filename">—</span>
  </div>
  <div class="preview-content" id="content">
    <div class="empty-state"><p><em>Loading…</em></p></div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const content = document.getElementById('content');
    const filename = document.getElementById('filename');

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
