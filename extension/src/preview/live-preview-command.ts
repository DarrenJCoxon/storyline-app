import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import { readFileSync } from 'fs';
import * as path from 'path';
import MarkdownIt from 'markdown-it';
import type { EditorPanel } from '../panels/EditorPanel.js';
type StorylineEditorProvider = EditorPanel;

// "Storyline: Open Live Chapter Preview" — Phase 6 overhaul.
//
// Three simultaneous device panes (Print 6×9 spread, iPad Apple Books,
// Kindle Paperwhite) with:
//  - Book Style hot-swap via CSS media="" toggle (<300ms, no round-trip)
//  - Typography inspector on Shift+hover (getComputedStyle overlay)
//  - Layout modes: side (all three) / single-device focus
//  - Chapter opener hot-swap, same approach
//
// Print pane shows pages in flex-wrap pairs (verso/recto spread view).
// All Book Style and opener CSS is pre-loaded at preview open.

const CURLY_QUOTES = '“”‘’';
const DEBOUNCE_MS = 150;

function createRenderer(): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    breaks: false,
    linkify: false,
    typographer: true,
    quotes: CURLY_QUOTES,
    xhtmlOut: true,
  });
  md.renderer.rules.hr = () => '<hr class="scene-break" />\n';
  return md;
}

export async function openLivePreview(
  context: vscode.ExtensionContext,
  editorProvider?: StorylineEditorProvider,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Storyline: open a novel project folder first.');
    return;
  }

  const availableThemes = await discoverThemes(context);
  const availableOpeners = await discoverOpeners(context);
  const initialConfig = await readCompileConfig(folder.uri);
  const initialThemeId = availableThemes.some(t => t.id === initialConfig.theme)
    ? initialConfig.theme
    : 'classic-serif';
  const initialOpenerId = (() => {
    if (initialConfig.chapterOpener && availableOpeners.some(o => o.id === initialConfig.chapterOpener)) {
      return initialConfig.chapterOpener;
    }
    const compatible = availableOpeners.filter(
      o => o.compatibleThemes.length === 0 || o.compatibleThemes.includes(initialThemeId),
    );
    return compatible.length > 0 ? compatible[0].id : (availableOpeners.length > 0 ? availableOpeners[0].id : '');
  })();
  const md = createRenderer();

  // Pre-load ALL themes and openers CSS for hot-swap. This eliminates
  // the host round-trip on theme change: webview toggles media="" on the
  // pre-injected <style> tags directly.
  const [allThemesCss, allOpenersCss] = await Promise.all([
    loadAllThemesCss(context, availableThemes),
    loadAllOpenersCss(context, availableOpeners),
  ]);

  const panel = vscode.window.createWebviewPanel(
    'storyline.livePreview',
    'Live Chapter Preview',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [folder.uri],
    },
  );

  panel.webview.html = buildWebviewHtml(
    allThemesCss,
    allOpenersCss,
    { ...initialConfig, theme: initialThemeId, chapterOpener: initialOpenerId },
    availableThemes,
    availableOpeners,
  );

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
    const SOFT_BREAK = '<hr class="scene-break scene-break--soft" />\n';
    const chunks = markdown.split(/\n[\s\n]*\n[\s\n]*\n/).filter(c => c.trim().length > 0);
    let chunkHtml = chunks.length > 1
      ? chunks.map(c => md.render(c)).join(SOFT_BREAK)
      : md.render(markdown);
    chunkHtml = chunkHtml.replace(/<p>\s*<\/p>\s*/g, SOFT_BREAK);
    if (!chunkHtml.trimStart().startsWith('<h1') && sourceUri) {
      const heading = deriveChapterHeading(sourceUri, folder.uri.fsPath);
      if (heading) {
        const chNumHtml = heading.number ? `<div class="chapter-number">${heading.number}</div>\n` : '';
        chunkHtml = `${chNumHtml}<h1>${heading.title}</h1>\n` + chunkHtml;
      }
    }
    const withFirst = chunkHtml.replace('<p>', '<p class="first">');
    const chapterDir = path.dirname(doc.uri.fsPath);
    const withImages = withFirst.replace(/<img\s+([^>]*?)src="([^"]+)"([^>]*?)>/g, (full, pre, src, post) => {
      if (/^(https?:|data:|vscode-webview:)/.test(src)) return full;
      const absPath = path.isAbsolute(src) ? src : path.resolve(chapterDir, src);
      const webviewSrc = panel.webview.asWebviewUri(vscode.Uri.file(absPath)).toString();
      return `<img ${pre}src="${webviewSrc}"${post}>`;
    });
    panel.webview.postMessage({
      type: 'update',
      html: withImages,
      fileName: vscode.workspace.asRelativePath(doc.uri),
    });
  };

  let debounceTimer: NodeJS.Timeout | undefined;
  const scheduleUpdate = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updatePreview, DEBOUNCE_MS);
  };

  const getActiveTabUri = (): vscode.Uri | undefined => {
    const tab = vscode.window.tabGroups.activeTabGroup?.activeTab;
    if (!tab) return undefined;
    const input = tab.input;
    if (input instanceof vscode.TabInputText) return input.uri;
    if (input instanceof vscode.TabInputCustom) return input.uri;
    if (input instanceof vscode.TabInputWebview) {
      return editorProvider?.getActiveRichEditorUri();
    }
    return undefined;
  };

  const refreshSource = async () => {
    const uri = getActiveTabUri();
    if (uri && (await isManuscriptMarkdown(uri, folder.uri))) {
      const changed = !sourceUri || sourceUri.toString() !== uri.toString();
      sourceUri = uri;
      if (changed) updatePreview();
    }
  };

  refreshSource();

  const tabSubscription = vscode.window.tabGroups.onDidChangeTabs(refreshSource);
  const tabGroupSubscription = vscode.window.tabGroups.onDidChangeTabGroups(refreshSource);
  const richEditorSubscription =
    editorProvider?.onDidChangeActiveRichEditor(() => refreshSource()) ?? { dispose: () => {} };

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
      updatePreview();
      return;
    }
    // load-theme: fallback for themes not in the pre-loaded set
    if (msg?.type === 'load-theme') {
      const { theme } = msg as { theme?: string };
      if (typeof theme !== 'string' || !theme.trim()) return;
      const id = theme.trim();
      if (!availableThemes.some(t => t.id === id)) return;
      const cached = allThemesCss.get(id);
      const css = cached?.baseCss ?? await loadThemeCss(context, id);
      const printCss = cached?.printCss ?? await loadThemePrintCss(context, id);
      panel.webview.postMessage({ type: 'theme-css', id, css, printCss });
      return;
    }
    // load-chapter-opener: fallback for openers not in the pre-loaded set
    if (msg?.type === 'load-chapter-opener') {
      const { opener } = msg as { opener?: string };
      if (typeof opener !== 'string') return;
      const id = opener.trim();
      if (!id) {
        panel.webview.postMessage({ type: 'opener-css', id: '', css: '', printCss: '' });
        return;
      }
      if (!availableOpeners.some(o => o.id === id)) return;
      const cached = allOpenersCss.get(id);
      const css = cached?.baseCss ?? await loadOpenerCss(context, id);
      const printCss = cached?.printCss ?? await loadOpenerPrintCss(context, id);
      panel.webview.postMessage({ type: 'opener-css', id, css, printCss });
      return;
    }
    if (msg?.type === 'save-as-default') {
      const { paragraphStyle, theme, bodyFont, sceneBreakOrnament, chapterOpener } = msg as {
        paragraphStyle?: string;
        theme?: string;
        bodyFont?: string;
        sceneBreakOrnament?: string;
        chapterOpener?: string;
      };
      try {
        await saveDefaultsToConfig(folder.uri, {
          paragraphStyle,
          theme,
          bodyFont,
          sceneBreakOrnament,
          chapterOpener,
        });
        vscode.window.setStatusBarMessage(`Storyline: preview defaults saved to compile.config.json`, 3000);
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
    richEditorSubscription.dispose();
    if (debounceTimer) clearTimeout(debounceTimer);
  });
}

// ── private helpers ────────────────────────────────────────────

interface LivePreviewConfig {
  paragraphStyle: 'indented' | 'block';
  theme: string;
  bodyFont: string;
  sceneBreakOrnament: string;
  chapterOpener: string;
}

async function readCompileConfig(workspaceRoot: vscode.Uri): Promise<LivePreviewConfig> {
  const configPath = path.join(workspaceRoot.fsPath, 'compile.config.json');
  const defaults: LivePreviewConfig = {
    paragraphStyle: 'indented',
    theme: 'classic-serif',
    bodyFont: '',
    sceneBreakOrnament: '',
    chapterOpener: '',
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
    const chapterOpener = typeof parsed.chapterOpener === 'string' ? parsed.chapterOpener : '';
    return {
      paragraphStyle: style === 'block' ? 'block' : 'indented',
      theme,
      bodyFont,
      sceneBreakOrnament,
      chapterOpener,
    };
  } catch {
    return defaults;
  }
}

async function saveDefaultsToConfig(
  workspaceRoot: vscode.Uri,
  {
    paragraphStyle,
    theme,
    bodyFont,
    sceneBreakOrnament,
    chapterOpener,
  }: {
    paragraphStyle?: string;
    theme?: string;
    bodyFont?: string;
    sceneBreakOrnament?: string;
    chapterOpener?: string;
  },
): Promise<void> {
  const configPath = path.join(workspaceRoot.fsPath, 'compile.config.json');
  let existing: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    existing = JSON.parse(raw);
  } catch { /* write minimal config */ }
  const updated: Record<string, unknown> = { ...existing };
  if (paragraphStyle === 'indented' || paragraphStyle === 'block') {
    updated.paragraphStyle = paragraphStyle;
  }
  if (typeof theme === 'string' && theme.trim()) {
    updated.theme = theme.trim();
  }
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
  if (typeof chapterOpener === 'string') {
    if (chapterOpener === '') delete updated.chapterOpener;
    else updated.chapterOpener = chapterOpener;
  }
  await fs.writeFile(configPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
}

interface ThemeDescriptor { id: string; name: string; }
interface OpenerDescriptor { id: string; name: string; compatibleThemes: string[]; }

async function discoverThemes(context: vscode.ExtensionContext): Promise<ThemeDescriptor[]> {
  // Primary: book-styles/ (style.json) — synced from lib/compile/book-styles/
  // Fallback: themes/ (theme.json) — legacy three-theme structure
  const bookStylesRoot = path.join(context.extensionPath, 'resources', 'book-styles');
  const themesRoot = path.join(context.extensionPath, 'resources', 'themes');

  async function readDir(root: string, metaFile: string): Promise<ThemeDescriptor[]> {
    let entries: string[];
    try { entries = await fs.readdir(root); } catch { return []; }
    const results: ThemeDescriptor[] = [];
    for (const name of entries) {
      const dir = path.join(root, name);
      try {
        const stat = await fs.stat(dir);
        if (!stat.isDirectory()) continue;
        const raw = await fs.readFile(path.join(dir, metaFile), 'utf-8');
        const meta = JSON.parse(raw) as { id?: string; name?: string };
        results.push({
          id: typeof meta.id === 'string' && meta.id.trim() ? meta.id.trim() : name,
          name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : name,
        });
      } catch {
        console.warn(`[Storyline] theme discovery: skipping "${name}" in ${root}`);
      }
    }
    return results;
  }

  let themes = await readDir(bookStylesRoot, 'style.json');
  if (themes.length === 0) themes = await readDir(themesRoot, 'theme.json');

  themes.sort((a, b) => {
    if (a.id === 'classic-serif') return -1;
    if (b.id === 'classic-serif') return 1;
    return a.name.localeCompare(b.name);
  });
  return themes.length > 0 ? themes : [{ id: 'classic-serif', name: 'Classic Serif' }];
}

async function discoverOpeners(context: vscode.ExtensionContext): Promise<OpenerDescriptor[]> {
  const openersRoot = path.join(context.extensionPath, 'resources', 'chapter-openers');
  let entries: string[];
  try {
    entries = await fs.readdir(openersRoot);
  } catch {
    return [];
  }
  const openers: OpenerDescriptor[] = [];
  for (const name of entries) {
    const openerDir = path.join(openersRoot, name);
    try {
      const statResult = await fs.stat(openerDir);
      if (!statResult.isDirectory()) continue;
      const metaPath = path.join(openerDir, 'opener.json');
      const raw = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(raw) as { id?: string; name?: string; compatibleThemes?: string[] };
      openers.push({
        id: typeof meta.id === 'string' && meta.id.trim() ? meta.id.trim() : name,
        name: typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : name,
        compatibleThemes: Array.isArray(meta.compatibleThemes)
          ? meta.compatibleThemes.filter((t): t is string => typeof t === 'string')
          : [],
      });
    } catch (err) {
      console.warn(`[Storyline] opener discovery: skipping "${name}"`, err);
    }
  }
  openers.sort((a, b) => a.name.localeCompare(b.name));
  return openers;
}

async function loadOpenerCss(context: vscode.ExtensionContext, openerId: string): Promise<string> {
  const cssPath = path.join(context.extensionPath, 'resources', 'chapter-openers', openerId, 'opener.css');
  try { return await fs.readFile(cssPath, 'utf-8'); } catch { return ''; }
}

async function loadThemeCss(context: vscode.ExtensionContext, themeId: string): Promise<string> {
  // Prefer book-styles/style.css, fall back to legacy themes/theme.css
  for (const [dir, file] of [
    ['book-styles', 'style.css'],
    ['themes', 'theme.css'],
  ] as const) {
    try {
      return await fs.readFile(path.join(context.extensionPath, 'resources', dir, themeId, file), 'utf-8');
    } catch { /* try next */ }
  }
  return `body { font-family: Georgia, serif; line-height: 1.6; }
      p { text-indent: 1.5em; margin: 0; }`;
}

async function loadThemePrintCss(context: vscode.ExtensionContext, themeId: string): Promise<string> {
  // Prefer book-styles/style-print-pdf.css, fall back to legacy themes/theme-print-pdf.css
  for (const [dir, file] of [
    ['book-styles', 'style-print-pdf.css'],
    ['themes', 'theme-print-pdf.css'],
  ] as const) {
    try {
      return await fs.readFile(path.join(context.extensionPath, 'resources', dir, themeId, file), 'utf-8');
    } catch { /* try next */ }
  }
  return '';
}

async function loadOpenerPrintCss(context: vscode.ExtensionContext, openerId: string): Promise<string> {
  if (!openerId) return '';
  const cssPath = path.join(context.extensionPath, 'resources', 'chapter-openers', openerId, 'opener-print-pdf.css');
  try { return await fs.readFile(cssPath, 'utf-8'); } catch { return ''; }
}

// Pre-loads CSS for every discovered theme. Called once at preview open.
async function loadAllThemesCss(
  context: vscode.ExtensionContext,
  themes: ThemeDescriptor[],
): Promise<Map<string, { baseCss: string; printCss: string }>> {
  const map = new Map<string, { baseCss: string; printCss: string }>();
  await Promise.all(themes.map(async t => {
    const [baseCss, printCss] = await Promise.all([
      loadThemeCss(context, t.id),
      loadThemePrintCss(context, t.id),
    ]);
    map.set(t.id, { baseCss, printCss });
  }));
  return map;
}

async function loadAllOpenersCss(
  context: vscode.ExtensionContext,
  openers: OpenerDescriptor[],
): Promise<Map<string, { baseCss: string; printCss: string }>> {
  const map = new Map<string, { baseCss: string; printCss: string }>();
  await Promise.all(openers.map(async o => {
    const [baseCss, printCss] = await Promise.all([
      loadOpenerCss(context, o.id),
      loadOpenerPrintCss(context, o.id),
    ]);
    map.set(o.id, { baseCss, printCss });
  }));
  return map;
}

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
  return `<div class="empty-state"><p><em>Open a chapter file in <code>manuscript/</code> to preview it here.</em></p></div>`;
}

function deriveChapterHeading(uri: vscode.Uri, workspaceRoot: string): { number: string | null; title: string } | null {
  const basename = path.basename(uri.fsPath, path.extname(uri.fsPath));
  let sidecarTitle: string | null = null;
  try {
    const titlesPath = path.join(workspaceRoot, '.storyline', 'chapter-titles.json');
    const titles = JSON.parse(readFileSync(titlesPath, 'utf-8')) as Record<string, string>;
    const relPath = path.relative(workspaceRoot, uri.fsPath);
    sidecarTitle = titles[relPath] ?? null;
  } catch { /* sidecar absent */ }
  const numMatch = basename.match(/^(?:ch(?:apter)?[-_]?)(\d+)/i);
  const number = numMatch ? String(parseInt(numMatch[1], 10)) : null;
  if (sidecarTitle) return { number, title: sidecarTitle };
  const match = basename.match(/^(?:ch(?:apter)?[-_]?)(\d+)(?:[-_]+(.+))?$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const titlePart = match[2]
      ? match[2].replace(/[-_]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : '';
    return { number: String(num), title: titlePart || `Chapter ${num}` };
  }
  const humanTitle = basename
    .replace(/^[\d_]+[\s\-_]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
  return humanTitle ? { number: null, title: humanTitle } : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ── HTML builder ───────────────────────────────────────────────

function buildWebviewHtml(
  allThemesCss: Map<string, { baseCss: string; printCss: string }>,
  allOpenersCss: Map<string, { baseCss: string; printCss: string }>,
  initialConfig: LivePreviewConfig,
  availableThemes: ThemeDescriptor[],
  availableOpeners: OpenerDescriptor[],
): string {
  const initialParagraphStyle = initialConfig.paragraphStyle;
  const initialTheme = initialConfig.theme || 'classic-serif';
  const initialOpener = initialConfig.chapterOpener || '';

  // Pre-inject all Book Style CSS sheets. Active one has media="", inactive have media="not all".
  // The webview toggles these directly — no host round-trip needed for hot-swap.
  const themeStylesheets = availableThemes.map(t => {
    const css = allThemesCss.get(t.id)?.baseCss ?? '';
    const active = t.id === initialTheme;
    return `<style class="bookstyle-sheet" data-style="${escapeAttr(t.id)}" id="bs-${escapeAttr(t.id)}"${active ? '' : ' media="not all"'}>${css}</style>`;
  }).join('\n  ');

  const themePrintStylesheets = availableThemes.map(t => {
    const css = allThemesCss.get(t.id)?.printCss ?? '';
    const active = t.id === initialTheme;
    return `<style class="bookstyle-print-sheet" data-style="${escapeAttr(t.id)}"${active ? '' : ' media="not all"'}>${css}</style>`;
  }).join('\n  ');

  // Opener sheets — include a no-op sheet for id="" (theme default)
  const openerStylesheets = [
    `<style class="opener-sheet" data-opener="" id="opener-none"${initialOpener === '' ? '' : ' media="not all"'}></style>`,
    ...availableOpeners.map(o => {
      const css = allOpenersCss.get(o.id)?.baseCss ?? '';
      const active = o.id === initialOpener;
      return `<style class="opener-sheet" data-opener="${escapeAttr(o.id)}" id="opener-${escapeAttr(o.id)}"${active ? '' : ' media="not all"'}>${css}</style>`;
    }),
  ].join('\n  ');

  const openerPrintStylesheets = availableOpeners.map(o => {
    const css = allOpenersCss.get(o.id)?.printCss ?? '';
    const active = o.id === initialOpener;
    return `<style class="opener-print-sheet" data-opener="${escapeAttr(o.id)}"${active ? '' : ' media="not all"'}>${css}</style>`;
  }).join('\n  ');

  const themeRows = availableThemes
    .map(t => `<button class="popover-row" data-theme="${escapeAttr(t.id)}"><span class="check">✓</span> ${escapeHtml(t.name)}</button>`)
    .join('\n            ');

  const openerRows = availableOpeners.length > 0
    ? availableOpeners
        .map(o => {
          const compat = escapeAttr(JSON.stringify(o.compatibleThemes));
          return `<button class="popover-row" data-opener="${escapeAttr(o.id)}" data-opener-themes="${compat}"><span class="check">✓</span> ${escapeHtml(o.name)}</button>`;
        })
        .join('\n            ')
    : `<div style="padding:6px 8px;font-size:12px;color:var(--vscode-descriptionForeground);">No openers available</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Chapter Preview</title>

  <!-- Override layer (body-font + ornament custom props) -->
  <style id="overrides"></style>

  <!-- All Book Style CSS pre-loaded for hot-swap (<300ms via media="" toggle) -->
  ${themeStylesheets}

  <!-- Book Style print-PDF layers — only active for Print 6×9 pane -->
  ${themePrintStylesheets}

  <!-- Chapter opener CSS -->
  ${openerStylesheets}

  <!-- Chapter opener print-PDF layers -->
  ${openerPrintStylesheets}

  <style>
    /* ── Panel shell ─────────────────────────────────────────────── */
    /* font-family intentionally omitted — active book-style sets it on body */
    html, body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100%;
      margin: 0; padding: 0;
      display: flex;
      flex-direction: column;
    }

    /* ── Toolbar ─────────────────────────────────────────────────── */
    .preview-header {
      flex-shrink: 0;
      background: var(--vscode-editor-background);
      padding: 8px 14px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
      font-size: 11px;
      font-family: var(--vscode-font-family);
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
      font-family: var(--vscode-editor-font-family, monospace);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Icon buttons */
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
    .icon-btn.open,
    .icon-btn.active { background: var(--vscode-toolbar-activeBackground, rgba(128,128,128,0.25)); }

    /* Popovers */
    .popover-anchor { position: relative; display: inline-block; }
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
    .popover-row.selected { background: var(--vscode-list-activeSelectionBackground, rgba(0,120,212,0.2)); }
    .popover-row .check { width: 12px; opacity: 0; }
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

    /* ── Three-pane layout ───────────────────────────────────────── */
    .preview-layout {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: row;
      gap: 24px;
      padding: 20px 20px 60px;
      overflow-x: auto;
      overflow-y: auto;
      align-items: flex-start;
    }

    .preview-pane {
      display: flex;
      flex-direction: column;
      flex: 0 0 auto;
    }

    .pane-label {
      text-align: center;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      padding: 0 0 8px;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .pane-focus-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
      opacity: 0.4;
      padding: 2px 4px;
      border-radius: 2px;
      font-size: 11px;
      line-height: 1;
      transition: opacity 120ms;
    }
    .pane-focus-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15)); }
    .pane-focus-btn.active { opacity: 1; color: var(--vscode-foreground); }

    .pane-stage {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    /* ── Shared page stack ───────────────────────────────────────── */
    .device-pages {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }

    .device-surface {
      box-sizing: border-box;
      overflow: hidden;
      position: relative;
      flex-shrink: 0;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 6px 18px rgba(0,0,0,0.12);
    }

    .empty-state {
      padding: 60px 20px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
    }

    /* Page numbers — positioned in bottom margin of each surface */
    .device-surface .page-number {
      position: absolute;
      left: 0; right: 0;
      text-align: center;
      font-variant-numeric: oldstyle-nums;
      user-select: none;
      pointer-events: none;
    }

    /* ── Shared content safety resets ───────────────────────────── */
    /* Typography (p, h1, hr, blockquote, etc.) comes from book-style CSS.
     * Only reset things that would look wrong regardless of style. */
    .device-surface code,
    .device-surface pre { background: transparent !important; color: inherit !important; }

    :where(.device-surface) img { max-width: 100%; display: block; margin: 1.2em auto; }
    :where(.device-surface) img:not([style*="height"]) { height: auto; }

    /* chapter-number is injected by the preview host, not by book-styles */
    .device-surface .chapter-number { text-align: center; margin: 4em 0 0.5em; text-indent: 0; }

    /* ── Print 6×9 pane ──────────────────────────────────────────── */
    .pane-print .pane-stage {
      background: #eceae4;
      padding: 20px 24px 24px;
    }

    /* Pages in print pane wrap into spread pairs — pages 1+2, 3+4, etc.
     * The 6px horizontal gap between pages represents the book spine gutter.
     * flex-direction:row + flex-wrap:wrap + max-width centres each pair. */
    .pane-print .device-pages {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 20px 6px;
      justify-content: center;
      max-width: 1200px;
    }

    .pane-print .device-surface {
      width: 576px;
      height: 864px;
      padding: 72px;
      background: #ffffff;
      color: #111;
      font-size: 11pt;
    }
    .pane-print .device-surface .page-number { bottom: 36px; font-size: 10pt; color: #555; }

    /* ── iPad Apple Books pane ───────────────────────────────────── */
    .pane-ipad .pane-stage {
      background: #1c1c1e;
      padding: 20px 24px 24px;
    }

    .pane-ipad .device-surface {
      width: 768px;
      height: 1024px;
      padding: 80px 96px;
      background: #ffffff;
      color: #141414;
      border-radius: 4px;
      font-size: 17px;
    }
    .pane-ipad .device-surface .page-number { bottom: 32px; font-size: 12px; color: #6b6b6b; }

    /* ── Kindle Paperwhite pane ──────────────────────────────────── */
    .pane-kindle .pane-stage {
      background: #2e2d2a;
      padding: 20px 24px 24px;
    }

    .pane-kindle .device-surface {
      width: 600px;
      height: 800px;
      padding: 60px 72px;
      background: #ececeb;
      color: #1c1c1c;
      filter: grayscale(15%) contrast(0.92);
      font-size: 16px;
    }
    .pane-kindle .device-surface .page-number { bottom: 24px; font-size: 11px; color: #5c5c5c; }

    /* ── Layout modes ────────────────────────────────────────────── */
    /* layout-side is default — all three visible */
    body.layout-single-print .pane-ipad,
    body.layout-single-print .pane-kindle { display: none; }
    body.layout-single-ipad .pane-print,
    body.layout-single-ipad .pane-kindle { display: none; }
    body.layout-single-kindle .pane-print,
    body.layout-single-kindle .pane-ipad { display: none; }

    /* ── Paragraph style overrides ───────────────────────────────── */
    body.paragraphs-block .device-surface p { text-indent: 0 !important; margin: 0 0 1em !important; }
    body.paragraphs-block .device-surface p.first { text-indent: 0 !important; margin-top: 0 !important; }

    /* ── Chapter heading overrides ───────────────────────────────── */
    body.ch-bold-left .device-surface h1 {
      font-style: normal !important; font-weight: 700 !important;
      text-align: left !important; letter-spacing: -0.01em !important;
      text-transform: none !important; font-variant: normal !important;
    }
    body.ch-small-caps .device-surface h1 {
      font-variant: small-caps !important; font-weight: normal !important;
      letter-spacing: 0.14em !important; text-align: center !important;
      font-style: normal !important; text-transform: none !important;
    }
    body.ch-uppercase .device-surface h1 {
      text-transform: uppercase !important; font-weight: 600 !important;
      letter-spacing: 0.15em !important; text-align: center !important;
      font-style: normal !important; font-variant: normal !important; font-size: 1.25em !important;
    }
    body.ch-spaced .device-surface h1 {
      text-transform: uppercase !important; font-weight: 400 !important;
      letter-spacing: 0.22em !important; text-align: center !important;
      font-style: normal !important; font-variant: normal !important; font-size: 1.15em !important;
    }
    body.ch-ruled .device-surface h1 {
      font-style: normal !important; font-weight: 700 !important;
      text-align: left !important; border-bottom: 2px solid currentColor !important;
      padding-bottom: 0.3em !important; letter-spacing: normal !important;
      text-transform: none !important;
    }

    /* ── Subheading overrides ─────────────────────────────────────── */
    body.sh-italic-centred .device-surface h2,
    body.sh-italic-centred .device-surface h3 {
      font-style: italic !important; text-align: center !important;
      font-weight: normal !important;
    }
    body.sh-small-caps .device-surface h2,
    body.sh-small-caps .device-surface h3 {
      font-variant: small-caps !important; font-weight: normal !important;
      letter-spacing: 0.1em !important; font-style: normal !important;
    }
    body.sh-uppercase .device-surface h2,
    body.sh-uppercase .device-surface h3 {
      text-transform: uppercase !important; letter-spacing: 0.14em !important;
      font-weight: 600 !important; font-style: normal !important; font-size: 0.85em !important;
    }
    body.sh-ruled .device-surface h2,
    body.sh-ruled .device-surface h3 {
      border-bottom: 1px solid currentColor !important; padding-bottom: 0.35em !important;
      font-style: normal !important; font-weight: 700 !important;
    }

    /* ── Block quote overrides ────────────────────────────────────── */
    body.bq-left-border .device-surface blockquote {
      border-left: 3px solid rgba(0,0,0,0.35) !important;
      padding-left: 1.2em !important; margin: 1em 0.5em !important;
      font-style: normal !important; background: transparent !important;
    }
    body.bq-box .device-surface blockquote {
      border: 1px solid rgba(0,0,0,0.18) !important;
      border-left: 1px solid rgba(0,0,0,0.18) !important;
      padding: 0.8em 1.2em !important; border-radius: 4px !important;
      margin: 1em 0 !important; font-style: normal !important; background: transparent !important;
    }
    body.bq-tinted .device-surface blockquote {
      background: rgba(0,0,0,0.045) !important;
      border: none !important; padding: 0.8em 1.4em !important;
      border-radius: 4px !important; margin: 1em 0 !important; font-style: italic !important;
    }
    body.bq-poetry .device-surface blockquote {
      text-align: center !important; margin: 2em auto !important;
      max-width: 80% !important; font-style: italic !important;
      padding: 0 !important; border: none !important; background: transparent !important;
    }

    /* ── Callout overrides ────────────────────────────────────────── */
    body.callout-note .device-surface aside.callout {
      background: rgba(0,100,220,0.07) !important; border-left: 3px solid #0064dc !important;
    }
    body.callout-tip .device-surface aside.callout {
      background: rgba(0,140,60,0.07) !important; border-left: 3px solid #008c3c !important;
    }
    body.callout-alert .device-surface aside.callout {
      background: rgba(200,130,0,0.07) !important; border-left: 3px solid #c88200 !important;
    }
    body.callout-boxed .device-surface aside.callout {
      border: 1px solid rgba(0,0,0,0.2) !important; border-left: 1px solid rgba(0,0,0,0.2) !important;
      background: transparent !important; border-radius: 4px !important;
    }

    /* ── Typography inspector ────────────────────────────────────── */
    .typo-inspector {
      display: none;
      position: fixed;
      z-index: 100;
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));
      border-radius: 6px;
      padding: 10px 12px;
      min-width: 230px;
      pointer-events: none;
      box-shadow: 0 4px 16px rgba(0,0,0,0.35);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      line-height: 1.5;
    }
    .typo-inspector.locked {
      pointer-events: auto;
      border-color: var(--vscode-focusBorder, #007acc);
    }
    .typo-row { display: flex; gap: 8px; margin: 2px 0; }
    .typo-key { color: var(--vscode-descriptionForeground); width: 90px; flex-shrink: 0; font-size: 10px; }
    .typo-val { color: var(--vscode-foreground); font-weight: 500; word-break: break-all; }
    .typo-hint {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 7px;
      padding-top: 6px;
      border-top: 1px solid rgba(128,128,128,0.2);
      opacity: 0.7;
    }
  </style>
</head>
<body class="layout-side paragraphs-${initialParagraphStyle}">

  <!-- ── Toolbar ── -->
  <div class="preview-header">
    <div class="toolbar-left">

      <!-- Layout mode (side = all three / focus one) -->
      <div class="popover-anchor">
        <button class="icon-btn" data-popover="pop-layout" title="Layout" aria-expanded="false">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="1" y="2" width="4" height="12" rx="1"/><rect x="6" y="2" width="4" height="12" rx="1"/><rect x="11" y="2" width="4" height="12" rx="1"/></svg>
        </button>
        <div class="popover" id="pop-layout">
          <div class="popover-section">
            <div class="popover-section-title">Layout</div>
            <button class="popover-row" data-layout="side"><span class="check">✓</span> All three devices</button>
            <button class="popover-row" data-layout="single-print"><span class="check">✓</span> Focus: Print 6×9</button>
            <button class="popover-row" data-layout="single-ipad"><span class="check">✓</span> Focus: iPad — Apple Books</button>
            <button class="popover-row" data-layout="single-kindle"><span class="check">✓</span> Focus: Kindle Paperwhite</button>
          </div>
        </div>
      </div>

      <!-- Style picker: Book Style + Font override + Chapter Opening -->
      <div class="popover-anchor">
        <button class="icon-btn" data-popover="pop-style" title="Style" aria-expanded="false" style="font-family:Georgia,serif;font-style:italic;">Aa</button>
        <div class="popover" id="pop-style">
          <div class="popover-section">
            <div class="popover-section-title">Book Style</div>
            ${themeRows}
          </div>
          <div class="popover-section">
            <div class="popover-section-title">Font override</div>
            <button class="popover-row" data-font=""><span class="check">✓</span> Style default</button>
            <button class="popover-row" data-font='Georgia, "Times New Roman", Times, serif'><span class="check">✓</span> Georgia</button>
            <button class="popover-row" data-font='"Iowan Old Style", Palatino, Garamond, serif'><span class="check">✓</span> Iowan Old Style</button>
            <button class="popover-row" data-font='"Palatino Linotype", Palatino, Georgia, serif'><span class="check">✓</span> Palatino</button>
            <button class="popover-row" data-font='Garamond, "Times New Roman", serif'><span class="check">✓</span> Garamond</button>
            <button class="popover-row" data-font='Baskerville, "Baskerville Old Face", serif'><span class="check">✓</span> Baskerville</button>
            <button class="popover-row" data-font='"Inter", "Helvetica Neue", Arial, sans-serif'><span class="check">✓</span> Inter</button>
          </div>
          <div class="popover-section">
            <div class="popover-section-title">Chapter opening</div>
            <button class="popover-row" data-opener=""><span class="check">✓</span> Style default</button>
            ${openerRows}
          </div>
          <div class="popover-footer"><button class="save-defaults-btn">Save as default</button></div>
        </div>
      </div>

      <!-- Paragraphing -->
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

      <!-- Element styles -->
      <div class="popover-anchor">
        <button class="icon-btn" data-popover="pop-elements" title="Element styles" aria-expanded="false">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="4" x2="9" y2="4" stroke-width="2.2"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="11.5" x2="12" y2="11.5"/><line x1="2" y1="14.5" x2="10" y2="14.5"/></svg>
        </button>
        <div class="popover" id="pop-elements">
          <div class="popover-section">
            <div class="popover-section-title">Chapter heading</div>
            <button class="popover-row" data-cheading="default"><span class="check">✓</span> Style default</button>
            <button class="popover-row" data-cheading="bold-left"><span class="check">✓</span> Bold, left-aligned</button>
            <button class="popover-row" data-cheading="small-caps"><span class="check">✓</span> Small caps, centred</button>
            <button class="popover-row" data-cheading="uppercase"><span class="check">✓</span> Uppercase, centred</button>
            <button class="popover-row" data-cheading="spaced"><span class="check">✓</span> Spaced caps</button>
            <button class="popover-row" data-cheading="ruled"><span class="check">✓</span> Bold + rule below</button>
          </div>
          <div class="popover-section">
            <div class="popover-section-title">Subheadings (h2 / h3)</div>
            <button class="popover-row" data-subhead="default"><span class="check">✓</span> Style default</button>
            <button class="popover-row" data-subhead="italic-centred"><span class="check">✓</span> Italic, centred</button>
            <button class="popover-row" data-subhead="small-caps"><span class="check">✓</span> Small caps</button>
            <button class="popover-row" data-subhead="uppercase"><span class="check">✓</span> Uppercase</button>
            <button class="popover-row" data-subhead="ruled"><span class="check">✓</span> Bold + underline</button>
          </div>
          <div class="popover-section">
            <div class="popover-section-title">Block quote</div>
            <button class="popover-row" data-blockquote="default"><span class="check">✓</span> Style default</button>
            <button class="popover-row" data-blockquote="left-border"><span class="check">✓</span> Left border</button>
            <button class="popover-row" data-blockquote="box"><span class="check">✓</span> Outlined box</button>
            <button class="popover-row" data-blockquote="tinted"><span class="check">✓</span> Tinted background</button>
            <button class="popover-row" data-blockquote="poetry"><span class="check">✓</span> Poetry (centred)</button>
          </div>
          <div class="popover-section">
            <div class="popover-section-title">Callout</div>
            <button class="popover-row" data-callout="default"><span class="check">✓</span> Style default</button>
            <button class="popover-row" data-callout="note"><span class="check">✓</span> Note (blue)</button>
            <button class="popover-row" data-callout="tip"><span class="check">✓</span> Tip (green)</button>
            <button class="popover-row" data-callout="alert"><span class="check">✓</span> Alert (amber)</button>
            <button class="popover-row" data-callout="boxed"><span class="check">✓</span> Outlined box</button>
          </div>
          <div class="popover-footer"><button class="save-defaults-btn">Save as default</button></div>
        </div>
      </div>

      <!-- Scene break ornament -->
      <div class="popover-anchor">
        <button class="icon-btn" data-popover="pop-orn" title="Scene break ornament" aria-expanded="false" style="font-family:Georgia,serif;">❦</button>
        <div class="popover" id="pop-orn">
          <div class="popover-section">
            <div class="popover-section-title">Scene break</div>
            <button class="popover-row" data-ornament=""><span class="check">✓</span> Style default</button>
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

      <!-- Typography inspector toggle -->
      <button class="icon-btn" id="inspector-btn" title="Typography inspector (Shift+hover a word)" aria-pressed="false">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="6" cy="6" r="4"/><line x1="9.5" y1="9.5" x2="14" y2="14"/><line x1="4" y1="6" x2="8" y2="6"/><line x1="6" y1="4" x2="6" y2="8"/></svg>
      </button>

    </div>
    <div class="toolbar-center">
      <span id="filename">—</span>
    </div>
  </div>

  <!-- ── Three device panes ── -->
  <div class="preview-layout">

    <!-- Print 6×9 — spread view (pages wrap into pairs) -->
    <div class="preview-pane pane-print" id="pane-print">
      <div class="pane-label">
        Print 6×9
        <button class="pane-focus-btn" data-pane="print" title="Focus this pane">⤢</button>
      </div>
      <div class="pane-stage">
        <div class="device-pages" id="pages-print"></div>
      </div>
    </div>

    <!-- iPad Apple Books -->
    <div class="preview-pane pane-ipad" id="pane-ipad">
      <div class="pane-label">
        iPad — Apple Books
        <button class="pane-focus-btn" data-pane="ipad" title="Focus this pane">⤢</button>
      </div>
      <div class="pane-stage">
        <div class="device-pages" id="pages-ipad"></div>
      </div>
    </div>

    <!-- Kindle Paperwhite -->
    <div class="preview-pane pane-kindle" id="pane-kindle">
      <div class="pane-label">
        Kindle Paperwhite
        <button class="pane-focus-btn" data-pane="kindle" title="Focus this pane">⤢</button>
      </div>
      <div class="pane-stage">
        <div class="device-pages" id="pages-kindle"></div>
      </div>
    </div>

  </div>

  <!-- Source buffer — chapter HTML lives here; pagination JS distributes its
       children into the three pane containers on every update. -->
  <div id="source-buffer" style="display:none"></div>

  <!-- Typography inspector overlay -->
  <div id="typo-inspector" class="typo-inspector">
    <div id="typo-content"></div>
    <div class="typo-hint">Shift+hover · Click to lock · Esc to dismiss</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const sourceBuffer = document.getElementById('source-buffer');
    const filenameEl   = document.getElementById('filename');
    const overridesStyle = document.getElementById('overrides');
    const typoInspector  = document.getElementById('typo-inspector');
    const typoContent    = document.getElementById('typo-content');
    const inspectorBtn   = document.getElementById('inspector-btn');

    const initialConfig = {
      paragraphStyle: ${JSON.stringify(initialParagraphStyle)},
      theme:          ${JSON.stringify(initialTheme)},
      chapterOpener:  ${JSON.stringify(initialOpener)},
    };

    // ── State ────────────────────────────────────────────────────
    const stored = vscode.getState() || {};
    let currentLayout        = stored.layout         || 'side';
    let currentParagraphStyle = stored.paragraphStyle || initialConfig.paragraphStyle;
    let currentTheme         = stored.theme          || initialConfig.theme;
    let currentFont          = stored.bodyFont       ?? '';
    let currentOrnament      = stored.sceneBreakOrnament ?? '';
    let currentOpener        = stored.chapterOpener  ?? initialConfig.chapterOpener;
    let inspectorEnabled     = stored.inspectorEnabled ?? false;
    let inspectorLocked      = false;
    let currentChapterHeading = stored.chapterHeading  ?? 'default';
    let currentSubheading     = stored.subheading      ?? 'default';
    let currentBlockquote     = stored.blockquote      ?? 'default';
    let currentCallout        = stored.callout         ?? 'default';

    const knownStyles = Array.from(document.querySelectorAll('.bookstyle-sheet')).map(el => el.dataset.style).filter(Boolean);
    if (!knownStyles.includes(currentTheme)) currentTheme = initialConfig.theme;

    // ── Book Style hot-swap ──────────────────────────────────────
    // Toggle CSS media="" on pre-injected <style> tags — no host round-trip.
    function applyTheme(styleId) {
      currentTheme = styleId;
      document.querySelectorAll('.bookstyle-sheet').forEach(el => {
        el.media = el.dataset.style === styleId ? '' : 'not all';
      });
      document.querySelectorAll('.bookstyle-print-sheet').forEach(el => {
        el.media = el.dataset.style === styleId ? '' : 'not all';
      });
      filterOpenerRows(styleId);
      updateSelectedRows();
      repaginateAll();
    }

    // ── Opener hot-swap ──────────────────────────────────────────
    function applyOpener(openerId) {
      currentOpener = openerId;
      document.querySelectorAll('.opener-sheet').forEach(el => {
        el.media = el.dataset.opener === openerId ? '' : 'not all';
      });
      document.querySelectorAll('.opener-print-sheet').forEach(el => {
        el.media = el.dataset.opener === openerId ? '' : 'not all';
      });
      updateSelectedRows();
      repaginateAll();
    }

    // ── Layout modes ─────────────────────────────────────────────
    function applyLayout(layout) {
      currentLayout = layout;
      document.body.classList.remove(
        'layout-side',
        'layout-single-print',
        'layout-single-ipad',
        'layout-single-kindle',
      );
      document.body.classList.add('layout-' + layout);
      // Update focus button states
      document.querySelectorAll('.pane-focus-btn').forEach(btn => {
        btn.classList.toggle('active', 'single-' + btn.dataset.pane === layout);
      });
      updateSelectedRows();
      requestAnimationFrame(() => repaginateAll());
    }

    // ── Pagination ───────────────────────────────────────────────
    // Runs against all three panes simultaneously. Each pane's
    // .device-surface has its own CSS-applied dimensions (576×864,
    // 768×1024, 600×800) so overflow detection is pane-accurate.
    function newPage() {
      const p = document.createElement('div');
      p.className = 'device-surface';
      return p;
    }

    function paginateInto(sourceEl, pagesEl) {
      if (!pagesEl) return;
      const children = Array.from(sourceEl.children).map(n => n.cloneNode(true));
      pagesEl.innerHTML = '';

      if (!children.length) {
        const p = newPage();
        p.innerHTML = '<div class="empty-state"><p><em>No content yet.</em></p></div>';
        pagesEl.appendChild(p);
        return;
      }

      let page = newPage();
      pagesEl.appendChild(page);

      for (const child of children) {
        page.appendChild(child);
        if (page.scrollHeight > page.clientHeight) {
          page.removeChild(child);
          if (!page.children.length) {
            // Single child larger than a page — keep it, it clips
            page.appendChild(child);
            continue;
          }
          page = newPage();
          pagesEl.appendChild(page);
          page.appendChild(child);
        }
      }

      // Number pages after distribution
      const pages = pagesEl.children;
      for (let i = 0; i < pages.length; i++) {
        const surface = pages[i];
        if (surface.querySelector('.empty-state')) continue;
        const num = document.createElement('div');
        num.className = 'page-number';
        num.textContent = String(i + 1);
        surface.appendChild(num);
      }
    }

    function repaginateAll() {
      requestAnimationFrame(() => {
        paginateInto(sourceBuffer, document.getElementById('pages-print'));
        paginateInto(sourceBuffer, document.getElementById('pages-ipad'));
        paginateInto(sourceBuffer, document.getElementById('pages-kindle'));
      });
    }

    // ── Overrides (font + ornament custom props) ─────────────────
    function applyOverrides() {
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

    function applyParagraphs(style) {
      currentParagraphStyle = style;
      document.body.classList.remove('paragraphs-indented', 'paragraphs-block');
      document.body.classList.add('paragraphs-' + style);
      updateSelectedRows();
      repaginateAll();
    }

    function applyFont(fontValue) {
      currentFont = fontValue;
      applyOverrides();
      updateSelectedRows();
      repaginateAll();
    }

    function applyOrnament(ornamentValue) {
      currentOrnament = ornamentValue;
      applyOverrides();
      updateSelectedRows();
    }

    const CH_CLASSES  = ['ch-bold-left','ch-small-caps','ch-uppercase','ch-spaced','ch-ruled'];
    const SH_CLASSES  = ['sh-italic-centred','sh-small-caps','sh-uppercase','sh-ruled'];
    const BQ_CLASSES  = ['bq-left-border','bq-box','bq-tinted','bq-poetry'];
    const CAL_CLASSES = ['callout-note','callout-tip','callout-alert','callout-boxed'];

    function applyChapterHeading(val) {
      currentChapterHeading = val;
      CH_CLASSES.forEach(c => document.body.classList.remove(c));
      if (val && val !== 'default') document.body.classList.add('ch-' + val);
      updateSelectedRows();
    }
    function applySubheading(val) {
      currentSubheading = val;
      SH_CLASSES.forEach(c => document.body.classList.remove(c));
      if (val && val !== 'default') document.body.classList.add('sh-' + val);
      updateSelectedRows();
    }
    function applyBlockquote(val) {
      currentBlockquote = val;
      BQ_CLASSES.forEach(c => document.body.classList.remove(c));
      if (val && val !== 'default') document.body.classList.add('bq-' + val);
      updateSelectedRows();
    }
    function applyCallout(val) {
      currentCallout = val;
      CAL_CLASSES.forEach(c => document.body.classList.remove(c));
      if (val && val !== 'default') document.body.classList.add('callout-' + val);
      updateSelectedRows();
    }

    // ── Typography inspector ─────────────────────────────────────
    function buildInspectorRows(el) {
      const cs = getComputedStyle(el);
      const fontFamily = (cs.fontFamily || '').split(',')[0].replace(/['"]/g, '').trim();
      const fontSize   = cs.fontSize;
      const lineHeight = cs.lineHeight;
      const weight     = cs.fontWeight;
      const style      = cs.fontStyle;
      const ls         = cs.letterSpacing;
      const tag        = el.tagName.toLowerCase();

      let html = '<div class="typo-row"><span class="typo-key">Font</span><span class="typo-val">' + fontFamily + '</span></div>' +
        '<div class="typo-row"><span class="typo-key">Size</span><span class="typo-val">' + fontSize + '</span></div>' +
        '<div class="typo-row"><span class="typo-key">Leading</span><span class="typo-val">' + lineHeight + '</span></div>' +
        '<div class="typo-row"><span class="typo-key">Weight</span><span class="typo-val">' + weight + '</span></div>';
      if (style && style !== 'normal') {
        html += '<div class="typo-row"><span class="typo-key">Style</span><span class="typo-val">' + style + '</span></div>';
      }
      if (ls && ls !== 'normal' && ls !== '0px') {
        html += '<div class="typo-row"><span class="typo-key">Letter-sp.</span><span class="typo-val">' + ls + '</span></div>';
      }
      html += '<div class="typo-row"><span class="typo-key">Element</span><span class="typo-val">&lt;' + tag + '&gt;</span></div>';
      return html;
    }

    function positionInspector(x, y) {
      const margin = 14;
      const iw = typoInspector.offsetWidth  || 240;
      const ih = typoInspector.offsetHeight || 140;
      typoInspector.style.left = Math.min(x + 14, window.innerWidth  - iw - margin) + 'px';
      typoInspector.style.top  = Math.min(y + 14, window.innerHeight - ih - margin) + 'px';
    }

    function setInspectorEnabled(on) {
      inspectorEnabled = on;
      inspectorBtn.classList.toggle('active', on);
      inspectorBtn.setAttribute('aria-pressed', String(on));
      if (!on) {
        inspectorLocked = false;
        typoInspector.style.display = 'none';
        typoInspector.classList.remove('locked');
      }
    }

    inspectorBtn.addEventListener('click', () => {
      setInspectorEnabled(!inspectorEnabled);
      persist();
    });

    document.addEventListener('mousemove', e => {
      if (!inspectorEnabled || inspectorLocked) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (!target || !target.closest('.device-surface')) {
        typoInspector.style.display = 'none';
        return;
      }
      typoContent.innerHTML = buildInspectorRows(target);
      typoInspector.style.display = 'block';
      positionInspector(e.clientX, e.clientY);
    });

    document.addEventListener('click', e => {
      if (!inspectorEnabled) return;
      const onSurface = e.target && e.target.closest('.device-surface');
      if (onSurface && typoInspector.style.display !== 'none') {
        inspectorLocked = !inspectorLocked;
        typoInspector.classList.toggle('locked', inspectorLocked);
      } else if (!onSurface && !e.target.closest('#typo-inspector')) {
        inspectorLocked = false;
        typoInspector.style.display = 'none';
        typoInspector.classList.remove('locked');
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        inspectorLocked = false;
        typoInspector.style.display = 'none';
        typoInspector.classList.remove('locked');
        closeAllPopovers();
      }
    });

    // ── Opener row filtering (by active theme) ───────────────────
    function filterOpenerRows(themeId) {
      document.querySelectorAll('[data-opener]').forEach(el => {
        const raw = el.getAttribute('data-opener-themes');
        if (raw === null) return; // no-filter option
        try {
          const compat = JSON.parse(raw);
          el.style.display = (compat.length === 0 || compat.includes(themeId)) ? '' : 'none';
        } catch { /* leave visible */ }
      });
    }

    // ── Selected row markers ─────────────────────────────────────
    function updateSelectedRows() {
      const pairs = [
        ['data-theme',      currentTheme],
        ['data-opener',     currentOpener],
        ['data-font',       currentFont],
        ['data-ornament',   currentOrnament],
        ['data-paragraphs', currentParagraphStyle],
        ['data-layout',     currentLayout],
        ['data-cheading',   currentChapterHeading  || 'default'],
        ['data-subhead',    currentSubheading      || 'default'],
        ['data-blockquote', currentBlockquote      || 'default'],
        ['data-callout',    currentCallout         || 'default'],
      ];
      for (const [attr, val] of pairs) {
        document.querySelectorAll('[' + attr + ']').forEach(el => {
          el.classList.toggle('selected', el.getAttribute(attr) === val);
        });
      }
    }

    // ── Initialise ───────────────────────────────────────────────
    applyLayout(currentLayout);
    applyParagraphs(currentParagraphStyle);
    applyOverrides();
    filterOpenerRows(currentTheme);
    updateSelectedRows();
    setInspectorEnabled(inspectorEnabled);
    applyChapterHeading(currentChapterHeading);
    applySubheading(currentSubheading);
    applyBlockquote(currentBlockquote);
    applyCallout(currentCallout);

    // Trigger load-theme/opener messages as fallback if CSS wasn't pre-loaded
    // (shouldn't happen when loadAllThemesCss succeeded, but defensive)
    if (!document.getElementById('bs-' + currentTheme)) {
      vscode.postMessage({ type: 'load-theme', theme: currentTheme });
    }

    // ── Popovers ─────────────────────────────────────────────────
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
      btn.addEventListener('click', ev => { ev.stopPropagation(); openPopover(btn); });
    });

    document.querySelectorAll('.popover').forEach(pop => {
      pop.addEventListener('click', ev => {
        const row = ev.target.closest('.popover-row');
        if (!row) return;
        if (row.hasAttribute('data-theme'))      applyTheme(row.dataset.theme);
        else if (row.hasAttribute('data-opener')) applyOpener(row.dataset.opener);
        else if (row.hasAttribute('data-font'))  applyFont(row.dataset.font);
        else if (row.hasAttribute('data-ornament')) applyOrnament(row.dataset.ornament);
        else if (row.hasAttribute('data-paragraphs')) applyParagraphs(row.dataset.paragraphs);
        else if (row.hasAttribute('data-layout')) applyLayout(row.dataset.layout);
        else if (row.hasAttribute('data-cheading'))   applyChapterHeading(row.dataset.cheading);
        else if (row.hasAttribute('data-subhead'))    applySubheading(row.dataset.subhead);
        else if (row.hasAttribute('data-blockquote')) applyBlockquote(row.dataset.blockquote);
        else if (row.hasAttribute('data-callout'))    applyCallout(row.dataset.callout);
        persist();
        closeAllPopovers();
      });
    });

    document.querySelectorAll('.pane-focus-btn').forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        const pane = btn.dataset.pane;
        const single = 'single-' + pane;
        applyLayout(currentLayout === single ? 'side' : single);
        persist();
      });
    });

    document.addEventListener('click', ev => {
      if (!ev.target.closest('.popover-anchor') && !ev.target.closest('.pane-focus-btn')) {
        closeAllPopovers();
      }
    });

    // ── Save as default ──────────────────────────────────────────
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
          chapterOpener: currentOpener,
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

    // ── Persist state ─────────────────────────────────────────────
    function persist() {
      vscode.setState({
        layout: currentLayout,
        paragraphStyle: currentParagraphStyle,
        theme: currentTheme,
        chapterOpener: currentOpener,
        bodyFont: currentFont,
        sceneBreakOrnament: currentOrnament,
        inspectorEnabled,
        chapterHeading: currentChapterHeading,
        subheading:     currentSubheading,
        blockquote:     currentBlockquote,
        callout:        currentCallout,
      });
    }

    // ── Message handling ─────────────────────────────────────────
    window.addEventListener('message', event => {
      const msg = event.data;

      if (msg && msg.type === 'update') {
        sourceBuffer.innerHTML = msg.html || '';
        filenameEl.textContent = msg.fileName || '—';
        repaginateAll();
        return;
      }

      // Fallback: theme-css arrives if a theme wasn't pre-loaded
      if (msg && msg.type === 'theme-css' && typeof msg.css === 'string') {
        let el = document.getElementById('bs-' + msg.id);
        if (!el) {
          el = document.createElement('style');
          el.id = 'bs-' + msg.id;
          el.className = 'bookstyle-sheet';
          el.dataset.style = msg.id;
          document.head.appendChild(el);
        }
        el.textContent = msg.css;
        el.removeAttribute('media');
        document.querySelectorAll('.bookstyle-sheet').forEach(s => {
          if (s !== el) s.media = 'not all';
        });
        repaginateAll();
        return;
      }

      // Fallback: opener-css
      if (msg && msg.type === 'opener-css' && typeof msg.css === 'string') {
        const targetId = 'opener-' + (msg.id || 'none');
        let el = document.getElementById(targetId);
        if (!el) {
          el = document.createElement('style');
          el.id = targetId;
          el.className = 'opener-sheet';
          el.dataset.opener = msg.id || '';
          document.head.appendChild(el);
        }
        el.textContent = msg.css;
        el.removeAttribute('media');
        document.querySelectorAll('.opener-sheet').forEach(s => {
          if (s !== el) s.media = 'not all';
        });
        repaginateAll();
        return;
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
