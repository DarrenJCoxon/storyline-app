import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import * as path from 'path';
import MarkdownIt from 'markdown-it';

// "Storyline: Open Live Chapter Preview" — side panel that renders
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
// The custom TipTap editor already debounces its content-changed messages
// by 500ms before applyEdit fires onDidChangeTextDocument, so this is the
// *second* debounce in the pipeline. Keep it short so the total typing →
// preview latency stays under ~700ms (perceptibly "live").
const DEBOUNCE_MS = 150;

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
    vscode.window.showErrorMessage('Storyline: open a novel project folder first.');
    return;
  }

  const availableThemes = await discoverThemes(context);
  const initialConfig = await readCompileConfig(folder.uri);
  // Fall back to 'classic-serif' if the config points at a theme that
  // isn't on disk (project carried over from another machine, theme
  // removed, typo in config). Preview keeps working; compile would
  // warn the same way.
  const initialThemeId = availableThemes.some(t => t.id === initialConfig.theme)
    ? initialConfig.theme
    : 'classic-serif';
  const initialThemeCss = await loadThemeCss(context, initialThemeId);
  const md = createRenderer();

  const panel = vscode.window.createWebviewPanel(
    'storyline.livePreview',
    'Live Chapter Preview',
    // Beside the active editor — VS Code handles column creation
    // naturally. The Inspector view (not an editor column) is the
    // fixed "supporting content" region now.
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );

  panel.webview.html = buildWebviewHtml(
    initialThemeCss,
    { ...initialConfig, theme: initialThemeId },
    availableThemes,
  );

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
    // Soft section breaks — a blank paragraph in the editor source
    // renders as visible vertical gap with no ornament, and the next
    // paragraph drops its first-line indent. Writers get a section
    // shift from just pressing Enter twice, without reaching for `---`
    // (which inserts the ornamental `* * *` break).
    //
    // Detection has two layers because tiptap-markdown's serialization
    // of empty paragraphs varies:
    //   1) Pre-render split: any "blank line between paragraphs"
    //      pattern — two or more paragraph breaks separated only by
    //      whitespace — splits the markdown. Matches \n\n\n+,
    //      \n\n \n\n, \n \n\n, etc.
    //   2) Post-render cleanup: an empty <p></p> that markdown-it
    //      happened to emit gets rewritten as the same soft-break HR.
    const SOFT_BREAK = '<hr class="scene-break scene-break--soft" />\n';
    const chunks = markdown.split(/\n[\s\n]*\n[\s\n]*\n/).filter(c => c.trim().length > 0);
    let chunkHtml = chunks.length > 1
      ? chunks.map(c => md.render(c)).join(SOFT_BREAK)
      : md.render(markdown);
    chunkHtml = chunkHtml.replace(/<p>\s*<\/p>\s*/g, SOFT_BREAK);
    // Mark first paragraph for drop cap styling (same transform the
    // compile theme phase applies).
    const withFirst = chunkHtml.replace('<p>', '<p class="first">');
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

  const refreshSource = async () => {
    const uri = getActiveTabUri();
    if (uri && (await isManuscriptMarkdown(uri, folder.uri))) {
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
  // applyEdit there emits onDidChangeTextDocument too. If we haven't yet
  // locked onto a source (e.g. the preview panel was opened before the
  // writer clicked back into the manuscript tab), adopt the first
  // manuscript-markdown change we see. This makes the preview robust even
  // when the initial tab detection misses — any keystroke in a manuscript
  // file will start the preview on that file.
  const textChangeSubscription = vscode.workspace.onDidChangeTextDocument(async e => {
    if (!sourceUri && (await isManuscriptMarkdown(e.document.uri, folder.uri))) {
      sourceUri = e.document.uri;
      scheduleUpdate();
      return;
    }
    if (sourceUri && e.document.uri.toString() === sourceUri.toString()) {
      scheduleUpdate();
    }
  });

  panel.webview.onDidReceiveMessage(async msg => {
    if (msg?.type === 'ready') {
      // Webview finished booting its inline script — push initial content.
      updatePreview();
      return;
    }
    if (msg?.type === 'load-theme') {
      const { theme } = msg as { theme?: string };
      if (typeof theme !== 'string' || !theme.trim()) return;
      const id = theme.trim();
      if (!availableThemes.some(t => t.id === id)) return;
      try {
        const css = await loadThemeCss(context, id);
        panel.webview.postMessage({ type: 'theme-css', id, css });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(
          `Storyline: could not load theme "${id}" — ${message}`,
        );
      }
      return;
    }
    if (msg?.type === 'save-as-default') {
      const { paragraphStyle, theme, bodyFont, sceneBreakOrnament } = msg as {
        paragraphStyle?: string;
        theme?: string;
        bodyFont?: string;
        sceneBreakOrnament?: string;
      };
      try {
        await saveDefaultsToConfig(folder.uri, {
          paragraphStyle,
          theme,
          bodyFont,
          sceneBreakOrnament,
        });
        vscode.window.setStatusBarMessage(
          `Storyline: preview defaults saved to compile.config.json`,
          3000,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Storyline: could not save defaults — ${message}`);
      }
      return;
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

interface LivePreviewConfig {
  paragraphStyle: 'indented' | 'block';
  theme: string;
  // Preview mirrors compile.config.json's themeOverrides for the two
  // keys the preview's dropdowns control. bodyFont/sceneBreakOrnament
  // empty-string means "theme default" (no override).
  bodyFont: string;
  sceneBreakOrnament: string;
}

// Reads compile.config.json to seed the preview dropdowns with the
// writer's current project defaults. Preview overrides these live,
// but we want to start with what their book will actually compile as.
async function readCompileConfig(workspaceRoot: vscode.Uri): Promise<LivePreviewConfig> {
  const configPath = path.join(workspaceRoot.fsPath, 'compile.config.json');
  const defaults: LivePreviewConfig = {
    paragraphStyle: 'indented',
    theme: 'classic-serif',
    bodyFont: '',
    sceneBreakOrnament: '',
  };
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const style = typeof parsed.paragraphStyle === 'string' && parsed.paragraphStyle.trim()
      ? parsed.paragraphStyle.trim() : defaults.paragraphStyle;
    const theme = typeof parsed.theme === 'string' && parsed.theme.trim()
      ? parsed.theme.trim() : defaults.theme;
    const overrides = (parsed.themeOverrides && typeof parsed.themeOverrides === 'object')
      ? parsed.themeOverrides as Record<string, unknown> : {};
    const bodyFont = typeof overrides.bodyFont === 'string' ? overrides.bodyFont : '';
    const sceneBreakOrnament = typeof overrides.sceneBreakOrnament === 'string'
      ? overrides.sceneBreakOrnament : '';
    return {
      paragraphStyle: style === 'block' ? 'block' : 'indented',
      theme,
      bodyFont,
      sceneBreakOrnament,
    };
  } catch {
    return defaults;
  }
}

// "Save as default" — rewrite compile.config.json with the preview
// panel's current paragraphStyle, theme, and themeOverrides (bodyFont +
// sceneBreakOrnament). Preserves every other field the writer has set.
async function saveDefaultsToConfig(
  workspaceRoot: vscode.Uri,
  {
    paragraphStyle,
    theme,
    bodyFont,
    sceneBreakOrnament,
  }: {
    paragraphStyle?: string;
    theme?: string;
    bodyFont?: string;
    sceneBreakOrnament?: string;
  },
): Promise<void> {
  const configPath = path.join(workspaceRoot.fsPath, 'compile.config.json');
  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    existing = JSON.parse(raw);
  } catch {
    // File doesn't exist yet — write a minimal one. The compile pipeline
    // self-heals this case on the next run if we miss anything.
  }
  const updated: Record<string, unknown> = { ...existing };
  if (paragraphStyle === 'indented' || paragraphStyle === 'block') {
    updated.paragraphStyle = paragraphStyle;
  }
  if (typeof theme === 'string' && theme.trim()) {
    updated.theme = theme.trim();
  }

  // themeOverrides — merge into the existing block rather than replacing
  // it. Empty-string = "Theme default" = remove the override. Unspecified
  // (undefined) = leave whatever was there.
  if (bodyFont !== undefined || sceneBreakOrnament !== undefined) {
    const overrides: Record<string, unknown> = (existing.themeOverrides && typeof existing.themeOverrides === 'object')
      ? { ...existing.themeOverrides as Record<string, unknown> }
      : {};
    if (bodyFont !== undefined) {
      if (bodyFont === '') delete overrides.bodyFont;
      else overrides.bodyFont = bodyFont;
    }
    if (sceneBreakOrnament !== undefined) {
      if (sceneBreakOrnament === '') delete overrides.sceneBreakOrnament;
      else overrides.sceneBreakOrnament = sceneBreakOrnament;
    }
    if (Object.keys(overrides).length > 0) {
      updated.themeOverrides = overrides;
    } else {
      delete updated.themeOverrides;
    }
  }
  await fs.writeFile(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
}

interface ThemeDescriptor {
  id: string;
  name: string;
}

// Scan resources/themes/ for every theme the compile pipeline ships
// (copied at build time by scripts/copy-theme-assets.mjs). Each
// directory with a valid theme.json becomes a dropdown entry. The
// name shown in the UI comes from theme.json's `name` field.
//
// Logs diagnostic info to the extension host's console — visible via
// Help → Toggle Developer Tools → Console, filter "Storyline". Read
// errors don't abort discovery; a single broken theme shouldn't hide
// the other two.
async function discoverThemes(context: vscode.ExtensionContext): Promise<ThemeDescriptor[]> {
  const themesRoot = path.join(context.extensionPath, 'resources', 'themes');
  let entries: string[];
  try {
    entries = await fs.readdir(themesRoot);
  } catch (err) {
    console.warn('[Storyline] theme discovery: cannot read', themesRoot, err);
    return [{ id: 'classic-serif', name: 'Classic Serif' }];
  }

  const themes: ThemeDescriptor[] = [];
  for (const name of entries) {
    const themeDir = path.join(themesRoot, name);
    try {
      const stat = await fs.stat(themeDir);
      if (!stat.isDirectory()) continue;
      const metaPath = path.join(themeDir, 'theme.json');
      const raw = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(raw) as { id?: string; name?: string };
      themes.push({
        id: typeof meta.id === 'string' && meta.id.trim() ? meta.id.trim() : name,
        name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : name,
      });
    } catch (err) {
      console.warn(`[Storyline] theme discovery: skipping "${name}"`, err);
    }
  }

  // Stable ordering: classic-serif first (the default), then alphabetical
  // by display name. Writers open the preview and see their current
  // default selected and familiar themes adjacent.
  themes.sort((a, b) => {
    if (a.id === 'classic-serif') return -1;
    if (b.id === 'classic-serif') return 1;
    return a.name.localeCompare(b.name);
  });
  if (themes.length > 0) {
    console.log(`[Storyline] theme discovery: ${themes.map(t => t.id).join(', ')}`);
    return themes;
  }
  console.warn('[Storyline] theme discovery: found no themes — falling back to classic-serif');
  return [{ id: 'classic-serif', name: 'Classic Serif' }];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

async function loadThemeCss(context: vscode.ExtensionContext, themeId: string): Promise<string> {
  const cssPath = path.join(context.extensionPath, 'resources', 'themes', themeId, 'theme.css');
  try {
    return await fs.readFile(cssPath, 'utf-8');
  } catch {
    // Fallback: minimal inline typography so the preview isn't styleless
    // if the theme is missing. Shouldn't happen in a properly packaged
    // .vsix, but a writer with a stale resources/ dir shouldn't get a
    // blank panel.
    return `
      body { font-family: Georgia, serif; line-height: 1.6; }
      p { text-indent: 1.5em; margin: 0; }
    `;
  }
}

// Reads writing.manuscriptPath from state.json so the preview follows
// the project's actual manuscript dir (e.g. 'output/manuscript/',
// 'chapters/', 'prose/'). Hardcoding 'manuscript/' broke preview for
// projects with non-default layouts. Cached per-session so we don't
// re-read the state file on every keystroke.
let cachedManuscriptPath: string | null = null;
async function getManuscriptPath(workspaceRoot: vscode.Uri): Promise<string> {
  if (cachedManuscriptPath !== null) return cachedManuscriptPath;
  try {
    const statePath = path.join(workspaceRoot.fsPath, '.storyline', 'state.json');
    const raw = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(raw);
    const p = state?.writing?.manuscriptPath;
    if (typeof p === 'string' && p.trim()) {
      cachedManuscriptPath = p.trim();
      return cachedManuscriptPath;
    }
  } catch { /* fall through */ }
  cachedManuscriptPath = 'manuscript';
  return cachedManuscriptPath;
}

async function isManuscriptMarkdown(uri: vscode.Uri, workspaceRoot: vscode.Uri): Promise<boolean> {
  const rel = path.relative(workspaceRoot.fsPath, uri.fsPath);
  if (!/\.(md|markdown)$/i.test(rel)) return false;
  const msPath = await getManuscriptPath(workspaceRoot);
  return rel.startsWith(msPath + path.sep) || rel === msPath;
}

function emptyStateHtml(): string {
  return `
    <div class="empty-state">
      <p><em>Open a chapter file in <code>manuscript/</code> to preview it here.</em></p>
    </div>
  `;
}

function buildWebviewHtml(
  themeCss: string,
  initialConfig: LivePreviewConfig,
  availableThemes: ThemeDescriptor[],
): string {
  const initialParagraphStyle = initialConfig.paragraphStyle;
  const initialTheme = initialConfig.theme || 'classic-serif';
  // Emit theme rows server-side so the popover is populated before
  // the inline script runs — no flash-of-single-option.
  const themeRows = availableThemes
    .map(t => `<button class="popover-row" data-theme="${escapeAttr(t.id)}"><span class="check">✓</span> ${escapeHtml(t.name)}</button>`)
    .join('\n            ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Chapter Preview</title>
  <style id="overrides">
    /* Override layer — Font + Scene Break pickers write :root custom
     * properties into this tag's textContent. Its rules cascade into
     * every var() reference in both the theme CSS and panel CSS
     * below. JS rewrites this tag wholesale on each override change;
     * critical that nothing else lives here. Starts empty. */
  </style>
  <style id="theme-css">
    /* Theme CSS (swapped wholesale when Theme dropdown changes — must
     * therefore contain ONLY theme CSS, nothing shared with the panel
     * chrome). */
    ${themeCss}
  </style>
  <style>
    /* ─── Panel shell (chrome around the reading surface) ──────────
     * This block is static — never touched by JS. Contains device
     * frames, header styling, and the device-surface structural rules
     * that must survive both theme swaps and override updates. */
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
    /* ─── Vellum-minimal toolbar ──────────────────────────────────
     * Two icon buttons (device picker, typography picker) on the left,
     * a compact status line in the centre (current device label +
     * filename), nothing on the right. Click an icon → a small popover
     * drops down with the relevant options as clickable rows. Each
     * popover closes when the user picks a row or clicks outside.
     *
     * The goal: hide complexity until the writer asks for it. At rest
     * the toolbar shows two icons and a filename — nothing else. */
    .preview-header {
      position: sticky;
      top: 0;
      background: var(--vscode-editor-background);
      padding: 8px 14px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.15));
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 20;
    }
    .preview-header .toolbar-left { display: flex; gap: 4px; }
    .preview-header .toolbar-center {
      flex: 1;
      text-align: center;
      font-family: var(--vscode-editor-font-family), monospace;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .preview-header .toolbar-center .device-label {
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .preview-header .toolbar-center .sep { margin: 0 6px; opacity: 0.5; }

    /* Icon buttons — flat, transparent at rest, subtle hover. */
    .icon-btn {
      background: transparent;
      color: var(--vscode-foreground);
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      line-height: 1;
      min-width: 30px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 120ms ease;
    }
    .icon-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15)); }
    .icon-btn.open { background: var(--vscode-toolbar-activeBackground, rgba(128,128,128,0.25)); }

    /* Each icon button + its popover share a .popover-anchor wrapper
     * so the popover positions itself relative to its button. */
    .popover-anchor { position: relative; display: inline-block; }

    /* Popovers — anchored below their button, drop in via display.
     * Only one popover open at a time; toggling one closes the others. */
    .popover {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 6px;
      min-width: 220px;
      max-height: calc(100vh - 80px);
      overflow-y: auto;
      background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));
      border-radius: 6px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      padding: 6px;
      display: none;
      z-index: 30;
    }
    .popover.open { display: block; }
    .popover-section + .popover-section { margin-top: 6px; border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15)); padding-top: 6px; }
    .popover-section-title {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      padding: 4px 8px 2px;
    }
    .popover-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      background: transparent;
      color: var(--vscode-foreground);
      border: none;
      border-radius: 3px;
      padding: 5px 8px;
      font-family: inherit;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
    }
    .popover-row:hover { background: var(--vscode-list-hoverBackground, rgba(128,128,128,0.12)); }
    .popover-row.selected { background: var(--vscode-list-activeSelectionBackground, rgba(0,120,212,0.2)); color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground)); }
    .popover-row .check {
      width: 12px;
      opacity: 0;
    }
    .popover-row.selected .check { opacity: 1; }
    .popover-footer {
      margin-top: 6px;
      padding: 6px 4px 2px;
      border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
    }
    .popover-footer button {
      width: 100%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      padding: 5px;
      font-family: inherit;
      font-size: 11px;
      cursor: pointer;
    }
    .popover-footer button:hover { background: var(--vscode-button-hoverBackground); }
    .popover-footer button:disabled { opacity: 0.5; cursor: default; }

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
      /* Falls through to the theme default ("* * *" / "· · ·" / "❦")
       * when no override is set; the Scene Break dropdown below writes
       * --nw-scene-break-ornament to flip live. */
      content: var(--nw-scene-break-ornament, "* * *");
      display: block;
      letter-spacing: 0.5em;
      color: #666;
      opacity: 0.7;
    }
    /* Soft section break — blank paragraph in the editor. No glyph,
     * just vertical space; the existing "hr.scene-break + p" rule
     * drops the first-line indent on the following paragraph. */
    .device-surface hr.scene-break--soft { margin: 1.6em 0; }
    .device-surface hr.scene-break--soft::before { content: none; }
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

    /* Print 6×9 surface — dimensions must match theme-print-pdf.css:
     *   6in × 9in trim at 96 DPI → 576px × 864px total page
     *   0.75in margins all sides → 72px padding
     *   Text block: 432px wide (4.5in) × 720px tall (7.5in)
     *   Body: 11pt / 1.45 line-height / serif stack (overridable via
     *         --nw-body-font, which the bodyFont override writes)
     *
     * Asymmetric verso/recto margins in the real PDF (0.875in inside,
     * 0.625in outside for binding) average to the symmetric 0.75in used
     * here — the text block width is identical, which is what drives
     * line length and character counts per line. */
    /* .device-pages stacks discrete page-shaped surfaces vertically
     * with a small gap between them. Each .device-surface is now ONE
     * page (fixed height, overflow hidden) — the JS at the bottom of
     * this file walks the rendered chapter HTML and distributes its
     * nodes across as many pages as needed, cloning paragraphs that
     * won't fit onto the next page. This gives the writer a Vellum-
     * style "book laid out on a desk" preview instead of one infinite
     * column. */
    .device-pages {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }

    /* Each page is a fixed-size clipping container. Dimensions +
     * typography come from the body.device-* rules below; the common
     * page-shadow/overflow live here so all three devices share them. */
    .device-surface {
      box-sizing: border-box;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 6px 18px rgba(0,0,0,0.10);
    }

    body.device-print-6x9 .device-stage { background: #eceae4; padding: 24px 0 40px; }
    body.device-print-6x9 .device-surface {
      width: 576px;
      height: 864px;
      padding: 72px;
      background: #ffffff;
      font-family: var(--nw-body-font, Georgia, "Times New Roman", Times, serif);
      font-size: 11pt;
      line-height: 1.45;
    }

    /* iPad (Apple Books) — 3:4 aspect (768pt × 1024pt device).
     * We drop the device bezel that used to sit around a single page:
     * it doesn't translate to a stacked-pages view (a real iPad shows
     * one page at a time, not a vertical stack). The dark stage
     * background + pure-white page + Palatino 17/1.55 still signals
     * "iPad reading" typographically. */
    body.device-ipad .device-stage { background: #1c1c1e; padding: 32px 0 80px; }
    body.device-ipad .device-surface {
      width: 720px;
      height: 960px;
      padding: 80px 96px;
      background: #ffffff;
      color: #141414;
      border-radius: 4px;
      font-family: var(--nw-body-font, "Palatino", "Iowan Old Style", Georgia, serif);
      font-size: 17px;
      line-height: 1.55;
    }
    body.device-ipad .device-surface p.first::first-letter { color: #141414; }

    /* Kindle Paperwhite — 6" e-ink. Same logic as iPad: bezel dropped,
     * dark stage + neutral pale-grey page + Bookerly 16/1.55 carries
     * the e-ink feel without the physical device frame. */
    body.device-kindle .device-stage { background: #2e2d2a; padding: 32px 0 80px; }
    body.device-kindle .device-surface {
      width: 560px;
      height: 760px;
      padding: 60px 72px;
      background: #ececeb;
      color: #1c1c1c;
      font-family: var(--nw-body-font, "Bookerly", Georgia, serif);
      font-size: 16px;
      line-height: 1.55;
    }
    body.device-kindle .device-surface p.first::first-letter { color: #1c1c1c; }
    body.device-kindle .device-surface hr.scene-break::before { color: #5c5c5c; }

    /* ─── Paragraph style override (mirror compile/theme.js) ─────
     * The preview's default is indented (first-line indent, no gap).
     * When body.paragraphs-block is active, flip to the block style:
     * no indent, vertical gap between paragraphs. This exactly
     * mirrors what the compile pipeline does when paragraphStyle
     * === "block" is set in compile.config.json. */

    body.paragraphs-block .device-surface p {
      text-indent: 0;
      margin: 0 0 1em 0;
    }
    body.paragraphs-block .device-surface p.first {
      text-indent: 0;
      margin-top: 0;
    }
    body.paragraphs-block .device-surface hr.scene-break + p {
      text-indent: 0;
    }
  </style>
</head>
<body class="device-print-6x9 paragraphs-${initialParagraphStyle}">
  <div class="preview-header">
    <div class="toolbar-left">

      <!-- Device — Print / iPad / Kindle -->
      <div class="popover-anchor">
        <button class="icon-btn" data-popover="pop-device" title="Device" aria-expanded="false">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="8" height="12" rx="1.5"/><line x1="7" y1="12.2" x2="9" y2="12.2"/></svg>
        </button>
        <div class="popover" id="pop-device">
          <div class="popover-section">
            <div class="popover-section-title">Device</div>
            <button class="popover-row" data-device="device-print-6x9"><span class="check">✓</span> Print 6×9</button>
            <button class="popover-row" data-device="device-ipad"><span class="check">✓</span> iPad — Apple Books</button>
            <button class="popover-row" data-device="device-kindle"><span class="check">✓</span> Kindle Paperwhite</button>
          </div>
          <div class="popover-footer"><button class="save-defaults-btn">Save as default</button></div>
        </div>
      </div>

      <!-- Typography — theme + font -->
      <div class="popover-anchor">
        <button class="icon-btn" data-popover="pop-type" title="Typography" aria-expanded="false" style="font-family:Georgia,serif;font-style:italic;">Aa</button>
        <div class="popover" id="pop-type">
          <div class="popover-section">
            <div class="popover-section-title">Theme</div>
            ${themeRows}
          </div>
          <div class="popover-section">
            <div class="popover-section-title">Font</div>
            <button class="popover-row" data-font=""><span class="check">✓</span> Theme default</button>
            <button class="popover-row" data-font='Georgia, "Times New Roman", Times, serif'><span class="check">✓</span> Georgia</button>
            <button class="popover-row" data-font='"Iowan Old Style", Palatino, Garamond, serif'><span class="check">✓</span> Iowan Old Style</button>
            <button class="popover-row" data-font='"Palatino Linotype", Palatino, Georgia, serif'><span class="check">✓</span> Palatino</button>
            <button class="popover-row" data-font='Garamond, "Times New Roman", serif'><span class="check">✓</span> Garamond</button>
            <button class="popover-row" data-font='"Book Antiqua", Palatino, serif'><span class="check">✓</span> Book Antiqua</button>
            <button class="popover-row" data-font='Baskerville, "Baskerville Old Face", serif'><span class="check">✓</span> Baskerville</button>
            <button class="popover-row" data-font='"Inter", "Helvetica Neue", Arial, sans-serif'><span class="check">✓</span> Inter</button>
            <button class="popover-row" data-font='"Helvetica Neue", Helvetica, Arial, sans-serif'><span class="check">✓</span> Helvetica</button>
          </div>
          <div class="popover-footer"><button class="save-defaults-btn">Save as default</button></div>
        </div>
      </div>

      <!-- Paragraphing — indented vs block -->
      <div class="popover-anchor">
        <button class="icon-btn" data-popover="pop-para" title="Paragraphing" aria-expanded="false" style="font-family:Georgia,serif;">¶</button>
        <div class="popover" id="pop-para">
          <div class="popover-section">
            <div class="popover-section-title">Paragraphs</div>
            <button class="popover-row" data-paragraphs="indented"><span class="check">✓</span> Indented (first-line indent)</button>
            <button class="popover-row" data-paragraphs="block"><span class="check">✓</span> Block (spaced)</button>
          </div>
          <div class="popover-footer"><button class="save-defaults-btn">Save as default</button></div>
        </div>
      </div>

      <!-- Ornamentation — scene break character -->
      <div class="popover-anchor">
        <button class="icon-btn" data-popover="pop-orn" title="Ornamentation" aria-expanded="false" style="font-family:Georgia,serif;">❦</button>
        <div class="popover" id="pop-orn">
          <div class="popover-section">
            <div class="popover-section-title">Scene break</div>
            <button class="popover-row" data-ornament=""><span class="check">✓</span> Theme default</button>
            <button class="popover-row" data-ornament="* * *"><span class="check">✓</span> * * *</button>
            <button class="popover-row" data-ornament="· · ·"><span class="check">✓</span> · · ·</button>
            <button class="popover-row" data-ornament="❦"><span class="check">✓</span> ❦ (fleuron)</button>
            <button class="popover-row" data-ornament="§"><span class="check">✓</span> §</button>
            <button class="popover-row" data-ornament="✦ ✦ ✦"><span class="check">✓</span> ✦ ✦ ✦</button>
            <button class="popover-row" data-ornament="— — —"><span class="check">✓</span> — — —</button>
          </div>
          <div class="popover-footer"><button class="save-defaults-btn">Save as default</button></div>
        </div>
      </div>

    </div>
    <div class="toolbar-center">
      <span class="filename" id="filename">—</span>
      <span class="sep">·</span>
      <span class="device-label" id="device-label">Print 6×9</span>
    </div>
  </div>
  <div class="device-stage">
    <div class="device-pages" id="pages">
      <div class="device-surface">
        <div class="empty-state"><p><em>Loading…</em></p></div>
      </div>
    </div>
  </div>
  <!-- Hidden buffer holding the freshly rendered HTML; pagination JS
       pulls children out of here and distributes them into #pages. -->
  <div id="source-buffer" style="display:none"></div>
  <script>
    const vscode = acquireVsCodeApi();
    const pagesEl = document.getElementById('pages');
    const sourceBuffer = document.getElementById('source-buffer');
    const filename = document.getElementById('filename');
    const deviceLabel = document.getElementById('device-label');
    const overridesStyle = document.getElementById('overrides');

    const initialConfig = {
      paragraphStyle: ${JSON.stringify(initialParagraphStyle)},
      theme: ${JSON.stringify(initialTheme)},
    };

    // ─── State (single source of truth for all four popovers) ────
    const state = vscode.getState() || {};
    let currentDevice = state.device || 'device-print-6x9';
    let currentParagraphStyle = state.paragraphStyle || initialConfig.paragraphStyle;
    let currentTheme = state.theme || initialConfig.theme;
    let currentFont = state.bodyFont ?? (initialConfig.bodyFont || '');
    let currentOrnament = state.sceneBreakOrnament ?? (initialConfig.sceneBreakOrnament || '');

    // If the restored theme isn't one of the themes we know about
    // (e.g. a bundled theme was renamed between releases), fall back.
    const knownThemes = Array.from(document.querySelectorAll('[data-theme]')).map(el => el.dataset.theme);
    if (!knownThemes.includes(currentTheme)) currentTheme = initialConfig.theme;

    const DEVICE_NAMES = {
      'device-print-6x9': 'Print 6×9',
      'device-ipad': 'iPad — Apple Books',
      'device-kindle': 'Kindle Paperwhite',
    };

    function applyDevice(device) {
      currentDevice = device;
      document.body.classList.remove('device-print-6x9', 'device-ipad', 'device-kindle');
      document.body.classList.add(device);
      deviceLabel.textContent = DEVICE_NAMES[device] || device;
      updateSelectedRows();
      repaginate();
    }
    function applyParagraphs(style) {
      currentParagraphStyle = style;
      document.body.classList.remove('paragraphs-indented', 'paragraphs-block');
      document.body.classList.add('paragraphs-' + style);
      updateSelectedRows();
      repaginate();
    }
    function applyTheme(themeId) {
      currentTheme = themeId;
      updateSelectedRows();
      vscode.postMessage({ type: 'load-theme', theme: themeId });
    }
    function applyFont(fontValue) {
      currentFont = fontValue;
      applyOverrides();
      updateSelectedRows();
      repaginate();
    }
    function applyOrnament(ornamentValue) {
      currentOrnament = ornamentValue;
      applyOverrides();
      updateSelectedRows();
    }

    // Mark the selected row in each popover with .selected so the ✓
    // shows against whichever option is currently active.
    function updateSelectedRows() {
      const pairs = [
        ['data-device', currentDevice],
        ['data-theme', currentTheme],
        ['data-font', currentFont],
        ['data-ornament', currentOrnament],
        ['data-paragraphs', currentParagraphStyle],
      ];
      for (const [attr, val] of pairs) {
        document.querySelectorAll('[' + attr + ']').forEach(el => {
          el.classList.toggle('selected', el.getAttribute(attr) === val);
        });
      }
    }

    applyDevice(currentDevice);
    applyParagraphs(currentParagraphStyle);
    applyOverrides();
    updateSelectedRows();

    if (currentTheme !== initialConfig.theme) {
      vscode.postMessage({ type: 'load-theme', theme: currentTheme });
    }

    // ─── Pagination ──────────────────────────────────────────────
    // Distributes the children of #source-buffer across discrete
    // .device-surface page elements. Each page is fixed-size; when
    // appending the next child would overflow, we close the current
    // page and start a new one. Splits only at block boundaries
    // (paragraphs, scene breaks, tables) — no mid-paragraph breaks.
    // That's visually less perfect than Paged.js but fast enough to
    // run on every keystroke-debounced update.
    function newPage() {
      const p = document.createElement('div');
      p.className = 'device-surface';
      return p;
    }

    function paginate(sourceEl) {
      // Collect fresh child nodes from the buffer. We clone so the
      // buffer stays populated (for repagination on device change).
      const children = Array.from(sourceEl.children).map(n => n.cloneNode(true));
      pagesEl.innerHTML = '';

      if (!children.length) {
        const empty = newPage();
        empty.innerHTML = '<div class="empty-state"><p><em>No content yet.</em></p></div>';
        pagesEl.appendChild(empty);
        return;
      }

      let page = newPage();
      pagesEl.appendChild(page);

      for (const child of children) {
        page.appendChild(child);
        if (page.scrollHeight > page.clientHeight) {
          // Overflow — pop the child, open a new page, put it there.
          page.removeChild(child);
          if (!page.children.length) {
            // Child alone is bigger than a page (unusual: giant table,
            // embedded image). Keep it on its own page to avoid an
            // infinite loop; it'll be clipped by overflow:hidden.
            page.appendChild(child);
            continue;
          }
          page = newPage();
          pagesEl.appendChild(page);
          page.appendChild(child);
        }
      }
    }

    // Called by device/paragraph change — re-run pagination against
    // the current buffer contents without a round-trip to the extension.
    function repaginate() {
      // Measurement depends on CSS-applied dimensions — defer a frame
      // so the browser has the new body classes applied.
      requestAnimationFrame(() => paginate(sourceBuffer));
    }
    function applyOverrides() {
      // Emit a :root stylesheet setting --nw-body-font and
      // --nw-scene-break-ornament from the current state. Empty string
      // = "Theme default", skip the variable so the theme's fallback
      // kicks in.
      const rules = [];
      if (currentFont) rules.push('--nw-body-font: ' + currentFont + ';');
      if (currentOrnament) {
        const bs = String.fromCharCode(92);
        const q  = String.fromCharCode(34);
        const safe = currentOrnament.split(bs).join(bs + bs).split(q).join(bs + q);
        rules.push('--nw-scene-break-ornament: "' + safe + '";');
      }
      overridesStyle.textContent = rules.length ? ':root { ' + rules.join(' ') + ' }' : '';
    }
    function persist() {
      vscode.setState({
        device: currentDevice,
        paragraphStyle: currentParagraphStyle,
        theme: currentTheme,
        bodyFont: currentFont,
        sceneBreakOrnament: currentOrnament,
      });
    }

    // ─── Popover open/close ──────────────────────────────────────
    function closeAllPopovers() {
      document.querySelectorAll('.popover.open').forEach(p => p.classList.remove('open'));
      document.querySelectorAll('.icon-btn.open').forEach(b => {
        b.classList.remove('open');
        b.setAttribute('aria-expanded', 'false');
      });
    }
    function openPopover(btn) {
      const id = btn.dataset.popover;
      if (!id) return;
      const wasOpen = btn.classList.contains('open');
      closeAllPopovers();
      if (!wasOpen) {
        const pop = document.getElementById(id);
        if (pop) pop.classList.add('open');
        btn.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    }

    document.querySelectorAll('.icon-btn[data-popover]').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        openPopover(btn);
      });
    });

    // Clicking a row applies the selection, persists, and closes the
    // popover. We delegate from the popover itself so every row picks
    // up the same handler without per-element binding.
    document.querySelectorAll('.popover').forEach(pop => {
      pop.addEventListener('click', ev => {
        const row = ev.target.closest('.popover-row');
        if (!row) return;
        if (row.hasAttribute('data-device'))     applyDevice(row.dataset.device);
        else if (row.hasAttribute('data-theme')) applyTheme(row.dataset.theme);
        else if (row.hasAttribute('data-font'))  applyFont(row.dataset.font);
        else if (row.hasAttribute('data-ornament')) applyOrnament(row.dataset.ornament);
        else if (row.hasAttribute('data-paragraphs')) applyParagraphs(row.dataset.paragraphs);
        persist();
        closeAllPopovers();
      });
    });

    // Click outside any popover/button closes them all. Escape too.
    document.addEventListener('click', ev => {
      if (!ev.target.closest('.popover-anchor')) closeAllPopovers();
    });
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') closeAllPopovers();
    });

    // "Save as default" — same action regardless of which popover
    // hosts the button. Writes the current state to compile.config.json.
    document.querySelectorAll('.save-defaults-btn').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Saving…';
        vscode.postMessage({
          type: 'save-as-default',
          paragraphStyle: currentParagraphStyle,
          theme: currentTheme,
          bodyFont: currentFont,
          sceneBreakOrnament: currentOrnament,
        });
        setTimeout(() => {
          btn.textContent = 'Saved ✓';
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = original;
            closeAllPopovers();
          }, 900);
        }, 400);
      });
    });

    const themeStyleEl = document.getElementById('theme-css');

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg && msg.type === 'update') {
        // Fresh chapter render. Stash in the hidden buffer so we can
        // re-paginate later (device change, theme change, paragraph
        // style toggle) without a round-trip to the extension host.
        sourceBuffer.innerHTML = msg.html || '';
        filename.textContent = msg.fileName || '—';
        repaginate();
      }
      if (msg && msg.type === 'theme-css' && typeof msg.css === 'string') {
        // Replace the theme stylesheet's text; the browser re-applies
        // styles in-place without a repaint flash. Then re-paginate —
        // a different theme may change font metrics / line heights.
        themeStyleEl.textContent = msg.css;
        repaginate();
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
