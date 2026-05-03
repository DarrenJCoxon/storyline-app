import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import { readFileSync } from 'fs';
import * as path from 'path';
import MarkdownIt from 'markdown-it';
// markdown-it-attrs has no @types package — declare locally so tsc is happy.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const markdownItAttrs = require('markdown-it-attrs') as (md: MarkdownIt, opts?: Record<string, unknown>) => void;
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
  // Match the compile pipeline: allow `{.bleed .recto}` etc. on
  // markdown images so picture-book authors see the same layout in
  // preview as they will in the compiled book.
  md.use(markdownItAttrs, {
    allowedAttributes: ['class'],
    leftDelimiter: '{',
    rightDelimiter: '}',
  });
  return md;
}

// Picture-book transforms — duplicated from lib/compile/markdown-to-html.js
// so the preview can show the same layout as compile without paying the
// dynamic-import cost on every render. Keep the two in sync.
function liftBleedImagesPreview(html: string): string {
  let out = html.replace(
    /<p\b[^>]*>\s*(<img\b[^>]*\bclass="[^"]*\bbleed\b[^"]*"[^>]*\/?>)\s*<\/p>/g,
    (_full, img: string) => wrapBleedPreview(img),
  );
  out = out.replace(
    /(<img\b[^>]*\bclass="[^"]*\bbleed\b[^"]*"[^>]*\/?>)/g,
    (_full, img: string, offset: number, src: string) => {
      const before = src.slice(Math.max(0, offset - 80), offset);
      if (/bleed-page[^>]*>\s*$/.test(before)) return img;
      return wrapBleedPreview(img);
    },
  );
  return out;
}
function wrapBleedPreview(imgTag: string): string {
  const cls = (imgTag.match(/\bclass="([^"]*)"/) || [, ''])[1];
  const sides: string[] = [];
  if (/\brecto\b/.test(cls)) sides.push('recto');
  if (/\bverso\b/.test(cls)) sides.push('verso');
  return `<div class="${['bleed-page', ...sides].join(' ')}">${imgTag}</div>`;
}
function splitIntoPbPagesPreview(html: string): string {
  const tokens: Array<{ kind: 'text' | 'break' | 'bleed'; html?: string }> = [];
  let cursor = 0;
  const re = /<hr\s+class="scene-break[^"]*"\s*\/>|<div\s+class="bleed-page[^"]*">[\s\S]*?<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m.index > cursor) tokens.push({ kind: 'text', html: html.slice(cursor, m.index) });
    if (m[0].startsWith('<hr')) tokens.push({ kind: 'break' });
    else tokens.push({ kind: 'bleed', html: m[0] });
    cursor = m.index + m[0].length;
  }
  if (cursor < html.length) tokens.push({ kind: 'text', html: html.slice(cursor) });
  const out: string[] = [];
  let buf = '';
  const flush = () => { if (buf.trim()) out.push(`<section class="pb-page">\n${buf.trim()}\n</section>`); buf = ''; };
  for (const t of tokens) {
    if (t.kind === 'text') buf += t.html ?? '';
    else if (t.kind === 'break') flush();
    else if (t.kind === 'bleed') { flush(); out.push(t.html ?? ''); }
  }
  flush();
  return out.join('\n');
}

let _activePreviewPanel: vscode.WebviewPanel | undefined;

export async function openLivePreview(
  context: vscode.ExtensionContext,
  editorProvider?: StorylineEditorProvider,
): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Storyline: open a novel project folder first.');
    return;
  }

  // Dispose any existing panel so the command always opens fresh HTML.
  if (_activePreviewPanel) {
    _activePreviewPanel.dispose();
    _activePreviewPanel = undefined;
  }

  // After a window reload, VS Code restores webview tabs from workspace
  // state but the in-memory _activePreviewPanel reference is gone — those
  // ghost tabs hold stale HTML. Walk every tab group and close any tab
  // titled "Live Chapter Preview" so the new createWebviewPanel below
  // always wins.
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.label === 'Live Chapter Preview') {
        try { await vscode.window.tabGroups.close(tab); } catch { /* ignore */ }
      }
    }
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

  // Pre-load ALL themes and openers CSS for hot-swap via the compile pipeline
  // (book-style.js). This ensures preview and compile use identical CSS —
  // same source files, same layering order. Shared base (primitives + front-matter)
  // is loaded once and injected as a separate <style> element so it isn't
  // duplicated across per-theme hot-swap sheets.
  const { themesCss: allThemesCss, openersCss: allOpenersCss, sharedBaseCss } =
    await loadAllStylesCss(context, availableThemes, availableOpeners);

  const panel = vscode.window.createWebviewPanel(
    'storyline.livePreview',
    'Live Chapter Preview',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      // extensionUri needed so the webview can load bundled WOFF2 fonts from
      // extension/resources/fonts/ via asWebviewUri.
      localResourceRoots: [folder.uri, context.extensionUri],
    },
  );

  _activePreviewPanel = panel;
  panel.onDidDispose(() => { _activePreviewPanel = undefined; });

  const fontFaceCss = buildPreviewFontCss(panel.webview, context.extensionUri);

  panel.webview.html = buildWebviewHtml(
    allThemesCss,
    allOpenersCss,
    { ...initialConfig, theme: initialThemeId, chapterOpener: initialOpenerId },
    availableThemes,
    availableOpeners,
    fontFaceCss,
    sharedBaseCss,
  );

  let sourceUri: vscode.Uri | undefined;

  const resolveActiveDoc = (): vscode.TextDocument | undefined => {
    if (!sourceUri) return undefined;
    return vscode.workspace.textDocuments.find(
      d => d.uri.toString() === sourceUri!.toString(),
    );
  };

  // bookType + trim live in compile.config.json — re-read on every
  // update so toggling them in the Compile panel takes effect without
  // restarting the preview. Cheap (single small file read, debounced).
  const readPbConfig = (): { isPictureBook: boolean; trim: string } => {
    try {
      const cfg = JSON.parse(readFileSync(path.join(folder.uri.fsPath, 'compile.config.json'), 'utf-8'));
      return {
        isPictureBook: cfg?.bookType === 'picture-book',
        trim: typeof cfg?.pdf?.trim === 'string' ? cfg.pdf.trim : '6x9',
      };
    } catch { return { isPictureBook: false, trim: '6x9' }; }
  };

  const updatePreview = () => {
    const doc = resolveActiveDoc();
    if (!doc) {
      panel.webview.postMessage({ type: 'update', html: emptyStateHtml() });
      return;
    }
    const markdown = doc.getText();
    const { isPictureBook: isPB, trim: pbTrim } = readPbConfig();
    const SOFT_BREAK = '<hr class="scene-break scene-break--soft" />\n';
    let chunkHtml: string;
    if (isPB) {
      // Picture-book mode: render the whole markdown in one pass so
      // markdown-it-attrs sees `{.bleed .recto}` markers, then run the
      // same lift-and-segment transforms the compile pipeline uses.
      // Skip the chunk-by-chunk pre-split: scene breaks ARE the page
      // breaks and we want them treated as such, not as soft-break
      // ornaments.
      chunkHtml = splitIntoPbPagesPreview(liftBleedImagesPreview(md.render(markdown)));
    } else {
      const chunks = markdown.split(/\n[\s\n]*\n[\s\n]*\n/).filter(c => c.trim().length > 0);
      chunkHtml = chunks.length > 1
        ? chunks.map(c => md.render(c)).join(SOFT_BREAK)
        : md.render(markdown);
      chunkHtml = chunkHtml.replace(/<p>\s*<\/p>\s*/g, SOFT_BREAK);
    }
    // Auto-inject chapter heading only for novels — picture books read
    // as one continuous narrative; "Chapter 1" headings don't belong.
    if (!isPB && !chunkHtml.trimStart().startsWith('<h1') && sourceUri) {
      const heading = deriveChapterHeading(sourceUri, folder.uri.fsPath);
      if (heading) {
        const chNumHtml = heading.number ? `<div class="chapter-number">${heading.number}</div>\n` : '';
        chunkHtml = `<div class="chapter-open-drop"></div>\n${chNumHtml}<h1>${heading.title}</h1>\n` + chunkHtml;
      }
    }
    // .first applies a drop cap in some book styles — picture books
    // suppress drop caps via picture-book.css, but skip the marker
    // anyway so the cascade doesn't have to fight it.
    const withFirst = isPB ? chunkHtml : chunkHtml.replace('<p>', '<p class="first">');
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
      bookType: isPB ? 'picture-book' : 'novel',
      trim: pbTrim,
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
      let css = cached?.baseCss ?? '';
      let printCss = cached?.printCss ?? '';
      if (!cached) {
        const libBase = path.resolve(__dirname, '..', 'lib', 'compile');
        try {
          const bs = await import(path.join(libBase, 'book-style.js')) as { loadBookStyle: (id: string, fmt: string) => Promise<{ css: string }> };
          const [epub, print] = await Promise.all([bs.loadBookStyle(id, 'epub'), bs.loadBookStyle(id, 'print-pdf')]);
          css = epub.css; printCss = print.css;
        } catch { /* leave empty */ }
      }
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
      const css = cached?.baseCss ?? await loadOpenerCssFromResources(context, id);
      const printCss = cached?.printCss ?? await loadOpenerPrintCssFromResources(context, id);
      panel.webview.postMessage({ type: 'opener-css', id, css, printCss });
      return;
    }
    if (msg?.type === 'save-as-default') {
      const { paragraphStyle, theme, bodyFont, sceneBreakOrnament, chapterOpener,
              chapterHeading, subheading, blockquote, callout } = msg as {
        paragraphStyle?: string;
        theme?: string;
        bodyFont?: string;
        sceneBreakOrnament?: string;
        chapterOpener?: string;
        chapterHeading?: string;
        subheading?: string;
        blockquote?: string;
        callout?: string;
      };
      try {
        await saveDefaultsToConfig(folder.uri, {
          paragraphStyle,
          theme,
          bodyFont,
          sceneBreakOrnament,
          chapterOpener,
          chapterHeading,
          subheading,
          blockquote,
          callout,
        });
        vscode.window.setStatusBarMessage(`Storyline: preview defaults saved to compile.config.json`, 3000);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Storyline: could not save defaults — ${message}`);
      }
      return;
    }
    // Vellum-style "Generate" button — saves all preview selections to
    // compile.config.json synchronously, then runs the appropriate compile
    // command. Guarantees compile output mirrors current preview state.
    if (msg?.type === 'generate') {
      const m = msg as {
        device?: string;
        paragraphStyle?: string;
        theme?: string;
        bodyFont?: string;
        sceneBreakOrnament?: string;
        chapterOpener?: string;
        chapterHeading?: string;
        subheading?: string;
        blockquote?: string;
        callout?: string;
      };
      try {
        await saveDefaultsToConfig(folder.uri, {
          paragraphStyle: m.paragraphStyle,
          theme: m.theme,
          bodyFont: m.bodyFont,
          sceneBreakOrnament: m.sceneBreakOrnament,
          chapterOpener: m.chapterOpener,
          chapterHeading: m.chapterHeading,
          subheading: m.subheading,
          blockquote: m.blockquote,
          callout: m.callout,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Storyline: could not save preview settings — ${message}`);
        return;
      }
      // Pick the compile target from the active device pane:
      //   print  → PDF   (paginated, designed-for-paper trim)
      //   ipad/kindle → EPUB (reflowable)
      const cmd = m.device === 'print' ? 'storyline.compilePdf' : 'storyline.compileEpub';
      void vscode.commands.executeCommand(cmd);
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
    chapterHeading,
    subheading,
    blockquote,
    callout,
  }: {
    paragraphStyle?: string;
    theme?: string;
    bodyFont?: string;
    sceneBreakOrnament?: string;
    chapterOpener?: string;
    chapterHeading?: string;
    subheading?: string;
    blockquote?: string;
    callout?: string;
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

  // Body-class typography toggles (chapter heading style, subhead style,
  // blockquote treatment, callout colour). The compile pipeline reads these
  // from previewClasses and emits them as space-separated body classes on
  // the rendered HTML, so compile output mirrors what the preview shows.
  const previewClasses: Record<string, unknown> = (existing.previewClasses && typeof existing.previewClasses === 'object')
    ? { ...existing.previewClasses as Record<string, unknown> }
    : {};
  const setOrClear = (k: string, v: string | undefined): void => {
    if (v === undefined) return;
    if (!v || v === 'default') delete previewClasses[k];
    else previewClasses[k] = v;
  };
  setOrClear('chapterHeading', chapterHeading);
  setOrClear('subheading',     subheading);
  setOrClear('blockquote',     blockquote);
  setOrClear('callout',        callout);
  if (Object.keys(previewClasses).length > 0) {
    updated.previewClasses = previewClasses;
  } else {
    delete updated.previewClasses;
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

// Loads all theme and opener CSS via the compile pipeline (book-style.js).
// Single source of truth: same code generates EPUB/PDF CSS and preview CSS.
async function loadAllStylesCss(
  context: vscode.ExtensionContext,
  themes: ThemeDescriptor[],
  openers: OpenerDescriptor[],
): Promise<{
  themesCss: Map<string, { baseCss: string; printCss: string }>;
  openersCss: Map<string, { baseCss: string; printCss: string }>;
  sharedBaseCss: string;
}> {
  const libBase = path.resolve(__dirname, '..', 'lib', 'compile');
  type BookStyleModule = {
    loadBookStyle: (id: string, fmt: string) => Promise<{ css: string }>;
    loadOpenerCss: (id: string, fmt: string) => Promise<string>;
    loadPrimitivesCss: () => Promise<string>;
    loadFrontMatterCss: () => Promise<string>;
    loadElementOverridesCss?: () => Promise<string>;
  };
  type BookStyleModuleExt = BookStyleModule & {
    loadPictureBookCss?: () => Promise<string>;
  };
  const bs = await import(path.join(libBase, 'book-style.js')) as BookStyleModuleExt;

  const [primCss, fmCss, overridesCss, pbCss] = await Promise.all([
    bs.loadPrimitivesCss(),
    bs.loadFrontMatterCss(),
    bs.loadElementOverridesCss ? bs.loadElementOverridesCss() : Promise.resolve(''),
    bs.loadPictureBookCss ? bs.loadPictureBookCss() : Promise.resolve(''),
  ]);
  // element-overrides.css ships LAST so its body-class !important rules
  // win over the active book-style. picture-book.css is gated by the
  // `.book-picture` body class, so it's safe to ship to all previews —
  // novels never trigger its rules.
  const sharedBaseCss = fmCss + '\n\n' + primCss + '\n\n' + overridesCss + '\n\n' + pbCss;

  const themesCss = new Map<string, { baseCss: string; printCss: string }>();
  const openersCss = new Map<string, { baseCss: string; printCss: string }>();

  await Promise.all([
    ...themes.map(async t => {
      const [epub, print] = await Promise.all([
        bs.loadBookStyle(t.id, 'epub'),
        bs.loadBookStyle(t.id, 'print-pdf'),
      ]);
      themesCss.set(t.id, { baseCss: epub.css, printCss: print.css });
    }),
    ...openers.map(async o => {
      const [baseCss, printCss] = await Promise.all([
        bs.loadOpenerCss(o.id, 'epub'),
        bs.loadOpenerCss(o.id, 'print-pdf'),
      ]);
      openersCss.set(o.id, { baseCss, printCss });
    }),
  ]);

  return { themesCss, openersCss, sharedBaseCss };
}

// Used by the load-chapter-opener fallback handler for dynamically loaded openers.
async function loadOpenerCssFromResources(context: vscode.ExtensionContext, openerId: string): Promise<string> {
  const cssPath = path.join(context.extensionPath, 'resources', 'chapter-openers', openerId, 'opener.css');
  try { return await fs.readFile(cssPath, 'utf-8'); } catch { return ''; }
}

async function loadOpenerPrintCssFromResources(context: vscode.ExtensionContext, openerId: string): Promise<string> {
  if (!openerId) return '';
  const cssPath = path.join(context.extensionPath, 'resources', 'chapter-openers', openerId, 'opener-print-pdf.css');
  try { return await fs.readFile(cssPath, 'utf-8'); } catch { return ''; }
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
  if (sidecarTitle) {
    // Don't surface the number separately when the sidecar title is a generic
    // "Chapter N" string — the number is already implied by the title itself.
    const isGenericTitle = /^chapter\s+\d+$/i.test(sidecarTitle.trim())
    return { number: isGenericTitle ? null : number, title: sidecarTitle }
  };
  const match = basename.match(/^(?:ch(?:apter)?[-_]?)(\d+)(?:[-_]+(.+))?$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    const titlePart = match[2]
      ? match[2].replace(/[-_]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : '';
    // Only surface the number separately when there's a custom title to pair it with.
    // Without a custom title the heading IS "Chapter N" — the number would duplicate it.
    return { number: titlePart ? String(num) : null, title: titlePart || `Chapter ${num}` };
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

/** Generate @font-face rules for all bundled WOFF2 fonts using webview URIs. */
function buildPreviewFontCss(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const FONTS: { family: string; prefix: string }[] = [
    { family: 'Crimson Pro',       prefix: 'crimson-pro-latin' },
    { family: 'EB Garamond',       prefix: 'eb-garamond-latin' },
    { family: 'Source Serif 4',    prefix: 'source-serif-4-latin' },
    { family: 'Newsreader',        prefix: 'newsreader-latin' },
    { family: 'Inter',             prefix: 'inter-latin' },
    { family: 'Plus Jakarta Sans', prefix: 'plus-jakarta-sans-latin' },
  ]
  const VARIANTS: { weight: number; style: string }[] = [
    { weight: 400, style: 'normal' },
    { weight: 400, style: 'italic' },
    { weight: 700, style: 'normal' },
    { weight: 700, style: 'italic' },
  ]
  const fontsDir = vscode.Uri.joinPath(extensionUri, 'resources', 'fonts')
  return FONTS.flatMap(({ family, prefix }) =>
    VARIANTS.map(({ weight, style }) => {
      const file = `${prefix}-${weight}-${style}.woff2`
      const uri = webview.asWebviewUri(vscode.Uri.joinPath(fontsDir, file))
      return `@font-face {\n  font-family: "${family}";\n  font-weight: ${weight};\n  font-style: ${style};\n  font-display: block;\n  src: url("${uri}") format("woff2");\n}`
    }),
  ).join('\n')
}

function buildWebviewHtml(
  allThemesCss: Map<string, { baseCss: string; printCss: string }>,
  allOpenersCss: Map<string, { baseCss: string; printCss: string }>,
  initialConfig: LivePreviewConfig,
  availableThemes: ThemeDescriptor[],
  availableOpeners: OpenerDescriptor[],
  fontFaceCss: string,
  sharedBaseCss: string = '',
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

  <!-- Bundled WOFF2 fonts — identical typefaces used in EPUB/PDF compile -->
  <style id="font-faces">${fontFaceCss}</style>

  <!-- Shared base CSS: front-matter + primitives (from compile pipeline) -->
  <style id="shared-base">${sharedBaseCss}</style>

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
      /* No overflow:hidden — the device popover drops below the toolbar
       * and would be clipped. Use a wrapping span for the page indicator
       * if its label ever needs ellipsis. */
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

    /* Vellum-style Generate (Compile) button — primary CTA in the toolbar */
    .generate-btn {
      display: inline-flex; align-items: center;
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border: 1px solid transparent;
      border-radius: 4px;
      padding: 4px 12px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      height: 26px;
      transition: background 120ms ease;
    }
    .generate-btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
    .generate-btn:disabled { opacity: 0.55; cursor: progress; }

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

    /* ── Device tabs ─────────────────────────────────────────────── */
    .device-tabs {
      display: flex;
      gap: 2px;
      background: rgba(128,128,128,0.12);
      border-radius: 6px;
      padding: 2px;
    }
    .device-tab {
      background: transparent;
      border: none;
      border-radius: 4px;
      padding: 3px 11px;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      color: var(--vscode-foreground);
      opacity: 0.55;
      transition: opacity 100ms, background 100ms;
      white-space: nowrap;
    }
    .device-tab:hover { opacity: 0.85; }
    .device-tab.active {
      background: var(--vscode-editor-background);
      opacity: 1;
      box-shadow: 0 1px 3px rgba(0,0,0,0.18);
    }

    /* ── Page indicator ──────────────────────────────────────────── */
    .page-indicator {
      font-size: 11px;
      font-family: var(--vscode-editor-font-family, monospace);
      color: var(--vscode-descriptionForeground);
      user-select: none;
      min-width: 52px;
      text-align: center;
      opacity: 0.7;
    }

    /* ── Single-pane layout ──────────────────────────────────────── */
    .preview-layout {
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      padding: 0 80px;     /* symmetric reserve for page-turn arrows on both sides */
      box-sizing: border-box;
    }

    /* Inactive panes rendered off-screen so pagination still works */
    .preview-pane {
      position: absolute;
      top: 0;
      left: -9999px;
      visibility: hidden;
      pointer-events: none;
    }
    .preview-pane.active-pane {
      position: static;
      visibility: visible;
      pointer-events: auto;
      flex: 0 0 auto;
    }

    /* ── Page-turn hover arrows ──────────────────────────────────── */
    .page-turn-btn {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(0,0,0,0.45);
      color: #fff;
      border: none;
      border-radius: 50%;
      width: 48px;
      height: 48px;
      font-size: 26px;
      line-height: 1;
      cursor: pointer;
      opacity: 0;
      transition: opacity 180ms ease, background 120ms;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
    .page-turn-btn:hover { background: rgba(0,0,0,0.7); opacity: 1 !important; }
    .page-turn-btn:disabled { opacity: 0 !important; pointer-events: none; }
    #btn-prev-page { left: 16px; }
    #btn-next-page { right: 16px; }
    .preview-layout:hover .page-turn-btn:not(:disabled) { opacity: 0.8; }

    /* Wrap clips the scaled stage to its visual footprint */
    .pane-stage-wrap {
      overflow: hidden;
      flex-shrink: 0;
    }

    /* Spread-view toggle button — visible only on the print pane.
     * Sits in the top-right corner of the layout area. */
    .spread-toggle-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(0,0,0,0.55);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
      z-index: 18;
      display: none;
      gap: 6px;
      align-items: center;
    }
    .spread-toggle-btn:hover { background: rgba(0,0,0,0.75); }
    /* Toggle is print-only — show only when print pane is active. */
    body[data-active-device="print"] .spread-toggle-btn { display: inline-flex; }

    /* Spread mode: two device-surfaces side by side. The left "verso"
     * may be empty for page 1 (which sits alone on the recto).  */
    .pane-print.spread-mode .device-pages {
      display: flex;
      flex-direction: row;
      gap: 4px;
      justify-content: center;
      align-items: flex-start;
    }
    .pane-print.spread-mode .device-pages .device-surface {
      display: block;
    }
    .pane-print.spread-mode .device-pages .device-surface.spread-hidden {
      display: none;
    }
    /* Empty placeholder for the verso when page 1 sits alone on recto. */
    .pane-print.spread-mode .device-pages::before {
      content: '';
      display: none;
      width: var(--print-page-w);
      height: var(--print-page-h);
      background: rgba(255,255,255,0.04);
      border: 1px dashed rgba(255,255,255,0.12);
      flex-shrink: 0;
    }
    .pane-print.spread-mode[data-spread-lonely-recto="1"] .device-pages::before {
      display: block;
    }

    .pane-stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      transform-origin: top left;
      box-sizing: border-box;
    }

    /* ── Shared page stack ───────────────────────────────────────── */
    /* Only one page surface shown at a time */
    .device-pages {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .device-pages .device-surface { display: none; }
    .device-pages .device-surface.active-page { display: block; }

    .device-surface {
      box-sizing: border-box;
      overflow: hidden;
      position: relative;
      flex-shrink: 0;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 6px 18px rgba(0,0,0,0.12);
    }
    .device-surface ::selection { background: rgba(80,140,220,0.25); color: inherit; }
    .device-surface ::-moz-selection { background: rgba(80,140,220,0.25); color: inherit; }

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
    /* VS Code injects dark-theme defaults for blockquote/pre/kbd via
     * --vscode-textBlockQuote-* and --vscode-textPreformat-*. Strip them so
     * book-style CSS controls appearance on the white page. */
    .device-surface blockquote,
    .device-surface pre,
    .device-surface kbd {
      background: transparent !important;
      border-color: currentColor !important;
      color: inherit !important;
    }

    :where(.device-surface) img { max-width: 100%; display: block; margin: 1.2em auto; }
    :where(.device-surface) img:not([style*="height"]) { height: auto; }

    /* chapter-number is injected by the preview host, not by book-styles */
    .device-surface .chapter-number { text-align: center; margin: 4em 0 0.5em; text-indent: 0; }

    /* Chapter drop spacer — pushes the chapter heading ~35% down the page,
     * matching the conventional "chapter drop" seen in trade-press books. */
    .device-surface > .chapter-open-drop:first-child {
      height: 30%;
      margin-top: 0;
      display: block;
      flex-shrink: 0;
    }
    /* When a chapter-number div follows the drop, remove its own top margin
     * so the drop alone controls the vertical position. */
    .device-surface > .chapter-open-drop:first-child + .chapter-number {
      margin-top: 0 !important;
    }

    /* ── Print pane ──────────────────────────────────────────────── */
    /* Vellum-style: white page floating on a dark neutral surround.
     * Page dimensions are driven by --print-page-w / --print-page-h
     * CSS variables so picture-book trims (8×10 portrait, 8.5×8.5
     * square) render with the correct shape. Defaults to 6×9. */
    :root {
      --print-page-w: 576px;   /* 6in × 96dpi  */
      --print-page-h: 864px;   /* 9in × 96dpi  */
      --print-page-padding: 72px;
    }
    body.book-picture[data-trim="8x10"] {
      --print-page-w: 768px;   /* 8in  × 96dpi */
      --print-page-h: 960px;   /* 10in × 96dpi */
      --print-page-padding: 48px;
    }
    body.book-picture[data-trim="8.5x8.5"] {
      --print-page-w: 816px;   /* 8.5in × 96dpi — square */
      --print-page-h: 816px;
      --print-page-padding: 48px;
    }
    .pane-print .pane-stage { background: #1e1e1e; padding: 56px 80px; }
    .pane-print .pane-stage-wrap { border-radius: 4px; }
    .pane-print .device-surface {
      width: var(--print-page-w);
      height: var(--print-page-h);
      padding: var(--print-page-padding);
      background: #ffffff;
      color: #111;
      font-size: 11pt;
    }
    .pane-print .device-surface .page-number { bottom: 36px; font-size: 10pt; color: #555; }
    /* Picture-book: bleed pages claim the full surface, no padding. */
    body.book-picture .pane-print .device-surface.pb-bleed {
      padding: 0;
    }
    body.book-picture .pane-print .device-surface.pb-bleed img.bleed,
    body.book-picture .pane-print .device-surface.pb-bleed img.full-bleed,
    body.book-picture .pane-print .device-surface.pb-bleed .bleed-page,
    body.book-picture .pane-print .device-surface.pb-bleed .bleed-page img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    /* Picture-book text pages: vertical centre, larger type, no folio. */
    body.book-picture .pane-print .device-surface.pb-text {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      font-size: 14pt;
      line-height: 1.5;
    }
    body.book-picture .pane-print .device-surface.pb-text > p {
      max-width: 24em;
      margin: 0 0 1em 0;
      text-indent: 0;
    }
    body.book-picture .pane-print .device-surface.pb-text > p:last-child { margin: 0; }
    /* Side label for bleed pages so the writer can see at a glance
     * which side each illustration falls on. */
    body.book-picture .pane-print .device-surface.pb-bleed::before {
      content: attr(data-side);
      position: absolute;
      top: 12px;
      left: 12px;
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 3px;
      z-index: 5;
      pointer-events: none;
    }

    /* ── iPad Apple Books pane ───────────────────────────────────── */
    /* Dark iPad bezel surrounds the white page. iPad portrait is 4:3 (768×1024). */
    .pane-ipad .pane-stage {
      background: #1c1c1e;
      padding: 60px 36px 88px;
      position: relative;
    }
    .pane-ipad .pane-stage::after {
      content: '';
      position: absolute;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%);
      width: 160px;
      height: 5px;
      background: rgba(255,255,255,0.22);
      border-radius: 3px;
    }
    .pane-ipad .pane-stage-wrap {
      border-radius: 32px;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.07), 0 12px 40px rgba(0,0,0,0.55);
    }
    .pane-ipad .device-surface {
      width: 768px;        /* iPad portrait: 768×1024 (4:3) */
      height: 1024px;
      padding: 80px 96px;
      background: #ffffff;
      color: #141414;
      font-size: 17px;
      border-radius: 2px;  /* iPad screen has very subtle rounding */
    }
    .pane-ipad .device-surface .page-number { bottom: 32px; font-size: 12px; color: #6b6b6b; }

    /* ── Kindle Paperwhite pane ──────────────────────────────────── */
    /* Smaller, more compact device with markedly different proportions:
     *  - Page text area 480×640 (smaller than iPad)
     *  - Wide top bezel (Aa toolbar real estate), wider bottom chin
     *  - Thin side bezels (12px) — the real Paperwhite has minimal sides
     *  - Square-cornered cream E-ink screen (no border-radius on surface)
     * Final device aspect ≈ 1:1.4 (vs iPad 1:1.33), and the device is
     * physically smaller so it visually reads as a different class. */
    .pane-kindle .pane-stage {
      background: #2a2a2a;
      padding: 96px 14px 120px;
      position: relative;
    }
    /* Subtle Aa-style status hint at the top of the Kindle frame */
    .pane-kindle .pane-stage::before {
      content: '';
      position: absolute;
      top: 38px;
      left: 50%;
      transform: translateX(-50%);
      width: 90px;
      height: 4px;
      background: rgba(255,255,255,0.12);
      border-radius: 2px;
    }
    /* Front-light power button hint at bottom chin */
    .pane-kindle .pane-stage::after {
      content: '';
      position: absolute;
      bottom: 38px;
      left: 50%;
      transform: translateX(-50%);
      width: 36px;
      height: 36px;
      background: rgba(255,255,255,0.06);
      border-radius: 50%;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
    }
    .pane-kindle .pane-stage-wrap {
      border-radius: 6px;  /* Kindle has very slight body rounding */
      box-shadow: 0 0 0 1px rgba(255,255,255,0.04), 0 8px 28px rgba(0,0,0,0.45);
    }
    .pane-kindle .device-surface {
      width: 540px;        /* 6.8" Paperwhite text area, scaled */
      height: 720px;
      padding: 44px 36px 48px;
      background: #d8d4c9;  /* warm cream E-ink */
      color: #1c1c1c;
      filter: grayscale(20%) contrast(0.96);
      /* Bookerly is Amazon's proprietary Kindle font — substitute the closest
       * bundled alternative (Source Serif 4) so the page reads visually like
       * a real Paperwhite, not like the same serif as the print/iPad preview.
       * !important so the active book-style's body font doesn't override. */
      font-family: "Source Serif 4", "Charter", "Iowan Old Style", Georgia, serif !important;
      font-size: 15px;     /* Kindle default reading size, post-DPI normalisation */
      line-height: 1.42;   /* tighter than print/iPad — Kindle uses dense leading */
      font-weight: 400;
      border-radius: 0;     /* Kindle screen has square corners */
      /* Kindle renders less aggressive justification — soften ours to match */
      hyphens: auto;
      -webkit-hyphens: auto;
    }
    /* Override book-style typographic indent inside Kindle: Kindle's default
     * paragraph treatment is a small (1.2em) indent and slightly tighter
     * paragraph spacing than print. */
    .pane-kindle .device-surface p { text-indent: 1.2em; }
    .pane-kindle .device-surface p.first,
    .pane-kindle .device-surface hr + p,
    .pane-kindle .device-surface h1 + p,
    .pane-kindle .device-surface h2 + p,
    .pane-kindle .device-surface h3 + p { text-indent: 0; }
    /* Kindle drop cap is smaller than print; match the on-device feel */
    .pane-kindle .device-surface p.first::first-letter,
    .pane-kindle .device-surface p.first-paragraph::first-letter {
      font-size: 2.4em;
      line-height: 0.9;
    }
    .pane-kindle .device-surface .page-number { bottom: 18px; font-size: 11px; color: #5c5c5c; }

    /* ── Paragraph style overrides ───────────────────────────────── */
    body.paragraphs-block .device-surface p { text-indent: 0 !important; margin: 0 0 1em !important; }
    body.paragraphs-block .device-surface p.first { text-indent: 0 !important; margin-top: 0 !important; }

    /* ── Chapter heading overrides ───────────────────────────────── */
    body.ch-bold-left .device-surface h1 {
      font-style: normal !important; font-weight: 700 !important;
      text-align: left !important; text-align-last: left !important;
      letter-spacing: -0.01em !important;
      text-transform: none !important; font-variant: normal !important;
    }
    body.ch-small-caps .device-surface h1 {
      font-variant: small-caps !important; font-weight: normal !important;
      letter-spacing: 0.14em !important; text-align: center !important;
      text-align-last: center !important;
      font-style: normal !important; text-transform: none !important;
    }
    body.ch-uppercase .device-surface h1 {
      text-transform: uppercase !important; font-weight: 600 !important;
      letter-spacing: 0.15em !important; text-align: center !important;
      text-align-last: center !important;
      font-style: normal !important; font-variant: normal !important; font-size: 1.25em !important;
    }
    body.ch-spaced .device-surface h1 {
      text-transform: uppercase !important; font-weight: 400 !important;
      letter-spacing: 0.22em !important; text-align: center !important;
      text-align-last: center !important;
      font-style: normal !important; font-variant: normal !important; font-size: 1.15em !important;
    }
    body.ch-ruled .device-surface h1 {
      font-style: normal !important; font-weight: 700 !important;
      text-align: left !important; text-align-last: left !important;
      border-bottom: 2px solid currentColor !important;
      padding-bottom: 0.3em !important; letter-spacing: normal !important;
      text-transform: none !important;
    }
    /* Modern heavy display sans, left-aligned uppercase — Vellum "Verdict" feel */
    body.ch-display-heavy .device-surface h1 {
      font-family: "Plus Jakarta Sans", "Inter", -apple-system, system-ui, sans-serif !important;
      font-weight: 800 !important;
      text-transform: uppercase !important;
      letter-spacing: -0.01em !important;
      line-height: 1.05 !important;
      text-align: left !important; text-align-last: left !important;
      font-style: normal !important; font-variant: normal !important;
      font-size: 1.6em !important;
    }
    /* Modern heavy display sans, centred uppercase — Vellum "Metro" feel */
    body.ch-display-centred .device-surface h1 {
      font-family: "Plus Jakarta Sans", "Inter", -apple-system, system-ui, sans-serif !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.02em !important;
      line-height: 1.1 !important;
      text-align: center !important; text-align-last: center !important;
      font-style: normal !important; font-variant: normal !important;
      font-size: 1.5em !important;
    }

    /* Suppress opener ::before decorations when a ch-* override is active —
     * they were designed to sit above a chapter-number div which may be absent. */
    body.ch-bold-left .device-surface h1::before,
    body.ch-small-caps .device-surface h1::before,
    body.ch-uppercase .device-surface h1::before,
    body.ch-spaced .device-surface h1::before,
    body.ch-ruled .device-surface h1::before,
    body.ch-display-heavy .device-surface h1::before,
    body.ch-display-centred .device-surface h1::before { display: none !important; }

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
    /* Modern heavy sans subheadings — pairs with ch-display-heavy / centred */
    body.sh-display-heavy .device-surface h2,
    body.sh-display-heavy .device-surface h3 {
      font-family: "Plus Jakarta Sans", "Inter", -apple-system, system-ui, sans-serif !important;
      font-weight: 800 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.02em !important;
      font-style: normal !important; font-variant: normal !important;
      font-size: 0.95em !important;
    }
    body.sh-display-medium .device-surface h2,
    body.sh-display-medium .device-surface h3 {
      font-family: "Plus Jakarta Sans", "Inter", -apple-system, system-ui, sans-serif !important;
      font-weight: 600 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.08em !important;
      font-style: normal !important; font-variant: normal !important;
      font-size: 0.82em !important;
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
<body class="paragraphs-${initialParagraphStyle}">

  <!-- ── Toolbar ── -->
  <div class="preview-header">
    <div class="toolbar-left">

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
            <button class="popover-row" data-cheading="display-heavy"><span class="check">✓</span> Display sans, heavy left</button>
            <button class="popover-row" data-cheading="display-centred"><span class="check">✓</span> Display sans, centred</button>
          </div>
          <div class="popover-section">
            <div class="popover-section-title">Subheadings (h2 / h3)</div>
            <button class="popover-row" data-subhead="default"><span class="check">✓</span> Style default</button>
            <button class="popover-row" data-subhead="italic-centred"><span class="check">✓</span> Italic, centred</button>
            <button class="popover-row" data-subhead="small-caps"><span class="check">✓</span> Small caps</button>
            <button class="popover-row" data-subhead="uppercase"><span class="check">✓</span> Uppercase</button>
            <button class="popover-row" data-subhead="ruled"><span class="check">✓</span> Bold + underline</button>
            <button class="popover-row" data-subhead="display-heavy"><span class="check">✓</span> Display sans, heavy</button>
            <button class="popover-row" data-subhead="display-medium"><span class="check">✓</span> Display sans, medium</button>
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
    <div class="toolbar-center" style="display:flex;align-items:center;gap:12px;justify-content:center;">
      <div class="popover-anchor">
        <button class="icon-btn device-select-btn" id="device-btn" data-popover="pop-device" title="Output device" aria-expanded="false"
                style="border:1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));padding:4px 10px;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2.5" y="3" width="11" height="8" rx="1"/>
            <line x1="2.5" y1="13" x2="13.5" y2="13"/>
          </svg>
          <span id="device-label" style="font-size:12px;font-weight:500;">Print 6×9</span>
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7;">
            <polyline points="3 4.5 6 7.5 9 4.5"/>
          </svg>
        </button>
        <div class="popover" id="pop-device" role="menu">
          <div class="popover-section">
            <button class="popover-row" data-device="print"><span class="check">✓</span> Print 6×9</button>
            <button class="popover-row" data-device="ipad"><span class="check">✓</span> iPad (Apple Books)</button>
            <button class="popover-row" data-device="kindle"><span class="check">✓</span> Kindle Paperwhite</button>
          </div>
        </div>
      </div>
      <span class="page-indicator" id="page-indicator">—</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;">
      <button id="generate-btn" class="generate-btn" title="Compile EPUB + PDF using these preview settings">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;">
          <path d="M3 13V3a1 1 0 0 1 1-1h6l3 3v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>
          <polyline points="10 2 10 5 13 5"/>
        </svg>
        Generate
      </button>
      <div style="font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">
        <span id="filename">—</span>
      </div>
    </div>
  </div>

  <!-- ── Device panes — one active at a time ── -->
  <div class="preview-layout">

    <!-- Hover page-turn arrows -->
    <button class="page-turn-btn" id="btn-prev-page" disabled>&#8249;</button>
    <button class="page-turn-btn" id="btn-next-page" disabled>&#8250;</button>

    <!-- Spread-view toggle (print only) -->
    <button class="spread-toggle-btn" id="btn-spread-toggle" title="Show pages as facing-page spreads">
      <span id="spread-toggle-label">Spread</span>
    </button>

    <!-- Print 6×9 -->
    <div class="preview-pane pane-print active-pane" id="pane-print">
      <div class="pane-stage-wrap">
        <div class="pane-stage">
          <div class="device-pages" id="pages-print"></div>
        </div>
      </div>
    </div>

    <!-- iPad Apple Books -->
    <div class="preview-pane pane-ipad" id="pane-ipad">
      <div class="pane-stage-wrap">
        <div class="pane-stage">
          <div class="device-pages" id="pages-ipad"></div>
        </div>
      </div>
    </div>

    <!-- Kindle Paperwhite -->
    <div class="preview-pane pane-kindle" id="pane-kindle">
      <div class="pane-stage-wrap">
        <div class="pane-stage">
          <div class="device-pages" id="pages-kindle"></div>
        </div>
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
    let currentDevice        = stored.device         || 'print';
    const pageIndices        = { print: 0, ipad: 0, kindle: 0 };
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

    // ── Device switching + page navigation ───────────────────────
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');
    const pageIndicatorEl = document.getElementById('page-indicator');

    function updatePageNav() {
      const pagesEl = document.getElementById('pages-' + currentDevice);
      const total = pagesEl ? pagesEl.children.length : 0;
      const idx = pageIndices[currentDevice];
      if (pageIndicatorEl) pageIndicatorEl.textContent = total > 0 ? (idx + 1) + ' / ' + total : '—';
      if (btnPrev) btnPrev.disabled = idx <= 0;
      if (btnNext) btnNext.disabled = idx >= total - 1;
    }

    let spreadMode = false;

    function showCurrentPage(device) {
      const pagesEl = document.getElementById('pages-' + device);
      if (!pagesEl) return;
      const idx = pageIndices[device];
      const printPane = document.getElementById('pane-print');
      if (device === 'print' && spreadMode) {
        // Spread layout: page index 0 (book page 1) sits ALONE on the
        // recto with an empty verso to its left. Otherwise the spread
        // is [verso, recto] = [evenIdx-1, evenIdx] when idx is odd, or
        // [idx-1, idx] when idx is even (and > 0).
        let leftIdx, rightIdx;
        if (idx === 0) { leftIdx = -1; rightIdx = 0; }
        else if (idx % 2 === 1) { leftIdx = idx; rightIdx = idx + 1; }
        else { leftIdx = idx - 1; rightIdx = idx; }
        Array.from(pagesEl.children).forEach((s, i) => {
          const visible = i === leftIdx || i === rightIdx;
          s.classList.toggle('spread-hidden', !visible);
          // active-page is unused in spread mode but kept consistent.
          s.classList.toggle('active-page', i === idx);
        });
        if (printPane) printPane.dataset.spreadLonelyRecto = idx === 0 ? '1' : '0';
      } else {
        Array.from(pagesEl.children).forEach((s, i) => {
          s.classList.toggle('active-page', i === idx);
          s.classList.remove('spread-hidden');
        });
        if (printPane) printPane.dataset.spreadLonelyRecto = '0';
      }
      if (device === currentDevice) updatePageNav();
    }

    function goToPage(idx) {
      const pagesEl = document.getElementById('pages-' + currentDevice);
      const total = pagesEl ? pagesEl.children.length : 0;
      // In spread mode on the print pane, snap navigation to spread
      // boundaries so prev/next moves whole spreads, not single pages.
      if (currentDevice === 'print' && spreadMode) {
        const cur = pageIndices.print;
        if (idx > cur) {
          // forward: from page 0 → 1; from any other → next-spread-left (odd)
          idx = cur === 0 ? 1 : cur + 2;
        } else if (idx < cur) {
          // backward: into prev spread's verso (the left page)
          idx = cur <= 1 ? 0 : (cur % 2 === 0 ? cur - 3 : cur - 2);
        }
      }
      pageIndices[currentDevice] = Math.max(0, Math.min(idx, total - 1));
      showCurrentPage(currentDevice);
      scalePanes();
    }

    function setSpreadMode(on) {
      spreadMode = !!on;
      const printPane = document.getElementById('pane-print');
      if (printPane) printPane.classList.toggle('spread-mode', spreadMode);
      const lbl = document.getElementById('spread-toggle-label');
      if (lbl) lbl.textContent = spreadMode ? 'Single' : 'Spread';
      showCurrentPage(currentDevice);
      scheduleScale();
    }
    const btnSpread = document.getElementById('btn-spread-toggle');
    if (btnSpread) btnSpread.addEventListener('click', () => { setSpreadMode(!spreadMode); persist(); });

    const DEVICE_LABELS = { print: 'Print 6×9', ipad: 'iPad', kindle: 'Kindle' };
    function switchDevice(device) {
      currentDevice = device;
      document.body.dataset.activeDevice = device;
      document.querySelectorAll('.preview-pane').forEach(p => {
        p.classList.toggle('active-pane', p.id === 'pane-' + device);
      });
      // Update device-button label + popover row check marks
      const label = document.getElementById('device-label');
      if (label) label.textContent = DEVICE_LABELS[device] || device;
      document.querySelectorAll('#pop-device .popover-row').forEach(r => {
        r.classList.toggle('selected', r.dataset.device === device);
      });
      // Print-specific CSS layers only active for print device
      const isPrint = device === 'print';
      document.querySelectorAll('.bookstyle-print-sheet').forEach(el => {
        el.media = (isPrint && el.dataset.style === currentTheme) ? '' : 'not all';
      });
      document.querySelectorAll('.opener-print-sheet').forEach(el => {
        el.media = (isPrint && el.dataset.opener === currentOpener) ? '' : 'not all';
      });
      showCurrentPage(device);
      scheduleScale();
      persist();
    }

    if (btnPrev) btnPrev.addEventListener('click', () => { goToPage(pageIndices[currentDevice] - 1); persist(); });
    if (btnNext) btnNext.addEventListener('click', () => { goToPage(pageIndices[currentDevice] + 1); persist(); });

    // (device tabs removed — popover-row click handler in the global popover
    //  delegate calls switchDevice; switchDevice now persists internally.)

    // Keyboard left/right arrows for page turn
    document.addEventListener('keydown', e => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { goToPage(pageIndices[currentDevice] + 1); persist(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { goToPage(pageIndices[currentDevice] - 1); persist(); }
    });

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

      // Picture-book mode: each top-level <section class="pb-page"> or
      // <div class="bleed-page"> already maps 1:1 to a printed page in
      // the compiled book. Render them the same way in the preview —
      // one source block per device-surface — so the writer sees the
      // exact pagination they'll get on press. Skip the scroll-height
      // spill that we use for novels.
      const isPictureBook = document.body.classList.contains('book-picture');
      if (isPictureBook && pagesEl.id === 'pages-print') {
        let first = true;
        for (const child of children) {
          const isPb = child.nodeType === 1 && (
            (child.classList && (child.classList.contains('pb-page') || child.classList.contains('bleed-page')))
          );
          if (!isPb) continue;  // skip stray nodes (whitespace text, etc.)
          const page = newPage();
          if (first) { page.classList.add('active-page'); first = false; }
          if (child.classList.contains('bleed-page')) {
            page.classList.add('pb-bleed');
            // Surface the recto/verso side as a label badge.
            const side = child.classList.contains('recto')
              ? 'Recto'
              : child.classList.contains('verso')
              ? 'Verso'
              : 'Bleed';
            page.setAttribute('data-side', side);
            // The bleed-page wrapper itself becomes the surface content.
            page.appendChild(child);
          } else {
            page.classList.add('pb-text');
            // Move the inner children of pb-page into the surface so
            // the centring + max-width rules apply directly to <p>.
            while (child.firstChild) page.appendChild(child.firstChild);
          }
          pagesEl.appendChild(page);
        }
        if (!pagesEl.children.length) {
          const p = newPage();
          p.innerHTML = '<div class="empty-state"><p><em>No content yet.</em></p></div>';
          pagesEl.appendChild(p);
        }
        // Page numbers on text pages only (bleed pages stay clean).
        const pages = pagesEl.children;
        for (let i = 0; i < pages.length; i++) {
          const surface = pages[i];
          if (surface.classList.contains('pb-bleed')) continue;
          if (surface.querySelector('.empty-state')) continue;
          const num = document.createElement('div');
          num.className = 'page-number';
          num.textContent = String(i + 1);
          surface.appendChild(num);
        }
        return;
      }

      let page = newPage();
      page.classList.add('active-page');
      pagesEl.appendChild(page);

      const isHeading = el => el && /^H[1-6]$/.test(el.tagName);

      for (const child of children) {
        page.appendChild(child);
        if (page.scrollHeight > page.clientHeight) {
          page.removeChild(child);
          if (!page.children.length) {
            page.appendChild(child);
            continue;
          }
          page.classList.remove('active-page');
          page = newPage();
          page.classList.add('active-page');
          pagesEl.appendChild(page);
          page.appendChild(child);
        }
      }

      // Widow / orphan control: walk every page and, if the LAST child is
      // a heading (h1–h6), pop it off and prepend it to the next page so
      // the heading stays with its body content. Same intent as Paged.js's
      // break-after:avoid for compile — implemented in JS here because
      // our scroll-height pagination ignores CSS break properties.
      const allPages = Array.from(pagesEl.children);
      for (let i = 0; i < allPages.length - 1; i++) {
        const cur  = allPages[i];
        const next = allPages[i + 1];
        let last = cur.lastElementChild;
        // If the page ends on a heading (or stack of consecutive
        // headings), move them all to the start of the next page.
        while (isHeading(last) && cur.children.length > 1) {
          next.insertBefore(last, next.firstChild);
          last = cur.lastElementChild;
        }
      }
      page.classList.remove('active-page');

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
        // Clamp current page indices to new page counts, show active pages
        for (const dev of ['print', 'ipad', 'kindle']) {
          const pagesEl = document.getElementById('pages-' + dev);
          const total = pagesEl ? pagesEl.children.length : 0;
          pageIndices[dev] = Math.min(pageIndices[dev], Math.max(0, total - 1));
          showCurrentPage(dev);
        }
        scalePanes();
      });
    }

    // ── Pane scaling ─────────────────────────────────────────────
    // Scales the active pane's stage to fit the preview area.
    // Uses transform:scale so device-surface clientHeight/scrollHeight
    // (used by pagination) remain at their natural CSS values.
    const PANE_DIMS = {
      print:  { natW: 576 + 160, natPageH: 864,  natPadH: 112 }, // 80×2 horiz; 56+56 vert — generous dark surround
      ipad:   { natW: 768 + 72,  natPageH: 1024, natPadH: 148 }, // 36×2; 60 top + 88 bottom (iPad bezel)
      kindle: { natW: 540 + 28,  natPageH: 720,  natPadH: 216 }, // 14×2; 96 top + 120 bottom (Kindle chin)
    };

    // For picture-book mode the print pane page size is driven by CSS
    // variables (--print-page-w / --print-page-h) that change with the
    // configured trim. Recompute the print PANE_DIMS from those vars so
    // scaling fits the actual square / 8×10 page rather than 6×9.
    function refreshPrintPaneDims() {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      const w = parseFloat(cs.getPropertyValue('--print-page-w')) || 576;
      const h = parseFloat(cs.getPropertyValue('--print-page-h')) || 864;
      // Spread mode shows two pages side by side: double the natural
      // width (plus a small gap) so scaling fits both surfaces.
      const widthMul = spreadMode ? 2 : 1;
      const gap = spreadMode ? 4 : 0;
      PANE_DIMS.print.natW = Math.round(w * widthMul + gap + 160);
      PANE_DIMS.print.natPageH = Math.round(h);
    }

    function scalePanes() {
      refreshPrintPaneDims();
      const layout = document.querySelector('.preview-layout');
      if (!layout) return;
      // clientWidth INCLUDES the layout's CSS padding, so subtract it to
      // get the content area width (the space available to the active pane).
      const cs = getComputedStyle(layout);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const layoutW = layout.clientWidth - padX;
      const layoutH = layout.clientHeight;
      const HORIZ = 0;
      const VERT  = 40;

      for (const [key, cfg] of Object.entries(PANE_DIMS)) {
        const wrap  = document.querySelector('.pane-' + key + ' .pane-stage-wrap');
        const stage = document.querySelector('.pane-' + key + ' .pane-stage');
        if (!wrap || !stage) continue;

        const natH  = cfg.natPageH + cfg.natPadH;
        const availW = Math.max(200, layoutW - HORIZ);
        const availH = Math.max(200, layoutH - VERT);
        const scale  = Math.min(1, availW / cfg.natW, availH / natH);

        stage.style.width = cfg.natW + 'px';
        stage.style.transform = 'scale(' + scale.toFixed(4) + ')';
        wrap.style.width  = Math.round(cfg.natW * scale) + 'px';
        wrap.style.height = Math.round(stage.scrollHeight * scale) + 'px';
      }
    }

    let scaleRafId = 0;
    function scheduleScale() {
      cancelAnimationFrame(scaleRafId);
      scaleRafId = requestAnimationFrame(scalePanes);
    }
    window.addEventListener('resize', scheduleScale);

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

    const CH_CLASSES  = ['ch-bold-left','ch-small-caps','ch-uppercase','ch-spaced','ch-ruled','ch-display-heavy','ch-display-centred'];
    const SH_CLASSES  = ['sh-italic-centred','sh-small-caps','sh-uppercase','sh-ruled','sh-display-heavy','sh-display-medium'];
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
    switchDevice(currentDevice);
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
        else if (row.hasAttribute('data-device')) switchDevice(row.dataset.device);
        else if (row.hasAttribute('data-layout')) { /* removed */ }
        else if (row.hasAttribute('data-cheading'))   applyChapterHeading(row.dataset.cheading);
        else if (row.hasAttribute('data-subhead'))    applySubheading(row.dataset.subhead);
        else if (row.hasAttribute('data-blockquote')) applyBlockquote(row.dataset.blockquote);
        else if (row.hasAttribute('data-callout'))    applyCallout(row.dataset.callout);
        persist();
        // Live Preview is the single source of truth for compile typography:
        // every selection auto-writes to compile.config.json so the next
        // EPUB/PDF compile uses exactly what's on screen.
        vscode.postMessage({
          type: 'save-as-default',
          paragraphStyle: currentParagraphStyle,
          theme: currentTheme,
          chapterOpener: currentOpener,
          bodyFont: currentFont,
          sceneBreakOrnament: currentOrnament,
          chapterHeading: currentChapterHeading,
          subheading: currentSubheading,
          blockquote: currentBlockquote,
          callout: currentCallout,
        });
        closeAllPopovers();
      });
    });

    document.addEventListener('click', ev => {
      if (!ev.target.closest('.popover-anchor')) {
        closeAllPopovers();
      }
    });

    // ── Generate (compile) — Vellum-style ─────────────────────────
    // Click sends every current preview selection to the host, which
    // (a) writes them all to compile.config.json synchronously, then
    // (b) kicks off the appropriate compile command. The compile reads
    // the freshly-saved config so the output mirrors exactly what's on
    // screen — no possibility of preview/compile drift.
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        generateBtn.disabled = true;
        const original = generateBtn.innerHTML;
        generateBtn.textContent = 'Generating…';
        vscode.postMessage({
          type: 'generate',
          device: currentDevice,
          paragraphStyle: currentParagraphStyle,
          theme: currentTheme,
          chapterOpener: currentOpener,
          bodyFont: currentFont,
          sceneBreakOrnament: currentOrnament,
          chapterHeading: currentChapterHeading,
          subheading: currentSubheading,
          blockquote: currentBlockquote,
          callout: currentCallout,
        });
        // Re-enable after 4s in case the host doesn't reply (compile failed).
        setTimeout(() => {
          generateBtn.disabled = false;
          generateBtn.innerHTML = original;
        }, 4000);
      });
    }

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
        device: currentDevice,
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
        document.body.classList.toggle('book-picture', msg.bookType === 'picture-book');
        if (msg.trim) document.body.setAttribute('data-trim', msg.trim);
        else document.body.removeAttribute('data-trim');
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
