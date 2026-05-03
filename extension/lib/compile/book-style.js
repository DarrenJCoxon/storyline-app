// Book Style loader — supersedes theme.js for the compile pipeline.
//
// Book Styles are opinionated typographic identities: each style bakes
// in the chapter-opener treatment, scene-break ornament, drop-cap
// configuration, and running-header approach as a single coherent unit.
//
// Directory layout:
//   lib/compile/book-styles/<id>/
//   ├── style.json       metadata (id, name, genre, fonts, ornaments, overridable[])
//   ├── style.css        base stylesheet for EPUB and HTML preview
//   └── style-print-pdf.css  (optional) print-specific layer
//
// Backward compatibility:
//   compile.config.json supports both the new `bookStyle` field and the
//   legacy `theme` field. If `bookStyle` is absent, `theme` is used as
//   an alias. If the named style isn't found in book-styles/, the loader
//   falls back to lib/compile/themes/ so existing projects keep working.
//
// Output:
//   Populates context.theme with the same shape as theme.js so the rest
//   of the pipeline (epub.js, print-pdf.js, preflight.js) needs no changes.

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'fs-extra';
const { readFile, pathExists } = pkg;

const __dir = dirname(fileURLToPath(import.meta.url));
const STYLES_DIR   = resolve(__dir, 'book-styles');
const THEMES_DIR   = resolve(__dir, 'themes');       // fallback for legacy projects
const OPENERS_DIR  = resolve(__dir, 'chapter-openers');
const PRINT_RESET_PATH = resolve(__dir, 'print-reset.css');
const PRIMITIVES_CSS_PATH = resolve(__dir, 'primitives', '_base.css');
const FRONT_MATTER_CSS_PATH = resolve(__dir, 'front-matter', 'base.css');
const ELEMENT_OVERRIDES_CSS_PATH = resolve(__dir, 'element-overrides.css');
const PICTURE_BOOK_CSS_PATH = resolve(__dir, 'picture-book.css');
const PAGE_NUMBERS_CSS_PATH = resolve(__dir, 'page-numbers.css');
const DEFAULT_STYLE_ID = 'classic-serif';
const DEFAULT_PARAGRAPH_STYLE = 'indented';
const VALID_PARAGRAPH_STYLES = new Set(['indented', 'block']);
const VALID_BOOK_TYPES = new Set(['novel', 'picture-book']);

const SUPPORTED_OVERRIDE_KEYS = new Set([
  'bodyFont',
  'sceneBreakOrnament',
  'chapterHeadingStyle',
]);

const CHAPTER_HEADING_PRESETS = {
  'italic-centred': {
    '--nw-chapter-font-weight': 'normal',
    '--nw-chapter-font-style': 'italic',
    '--nw-chapter-font-variant': 'normal',
    '--nw-chapter-letter-spacing': 'normal',
    '--nw-chapter-text-align': 'center',
    '--nw-chapter-text-transform': 'none',
  },
  'bold-left': {
    '--nw-chapter-font-weight': '700',
    '--nw-chapter-font-style': 'normal',
    '--nw-chapter-font-variant': 'normal',
    '--nw-chapter-letter-spacing': '-0.01em',
    '--nw-chapter-text-align': 'left',
    '--nw-chapter-text-transform': 'none',
  },
  'small-caps': {
    '--nw-chapter-font-weight': 'normal',
    '--nw-chapter-font-style': 'normal',
    '--nw-chapter-font-variant': 'small-caps',
    '--nw-chapter-letter-spacing': '0.15em',
    '--nw-chapter-text-align': 'center',
    '--nw-chapter-text-transform': 'none',
  },
  'uppercase': {
    '--nw-chapter-font-weight': '600',
    '--nw-chapter-font-style': 'normal',
    '--nw-chapter-font-variant': 'normal',
    '--nw-chapter-letter-spacing': '0.12em',
    '--nw-chapter-text-align': 'center',
    '--nw-chapter-text-transform': 'uppercase',
  },
};

let cachedPrintResetCss = null;
export async function loadPrintResetCss() {
  if (cachedPrintResetCss !== null) return cachedPrintResetCss;
  cachedPrintResetCss = (await pathExists(PRINT_RESET_PATH))
    ? await readFile(PRINT_RESET_PATH, 'utf-8')
    : '';
  return cachedPrintResetCss;
}

let cachedPrimitivesCss = null;
export async function loadPrimitivesCss() {
  if (cachedPrimitivesCss !== null) return cachedPrimitivesCss;
  cachedPrimitivesCss = (await pathExists(PRIMITIVES_CSS_PATH))
    ? await readFile(PRIMITIVES_CSS_PATH, 'utf-8') + '\n\n'
    : '';
  return cachedPrimitivesCss;
}

let cachedFrontMatterCss = null;
export async function loadFrontMatterCss() {
  if (cachedFrontMatterCss !== null) return cachedFrontMatterCss;
  cachedFrontMatterCss = (await pathExists(FRONT_MATTER_CSS_PATH))
    ? await readFile(FRONT_MATTER_CSS_PATH, 'utf-8') + '\n\n'
    : '';
  return cachedFrontMatterCss;
}

let cachedElementOverridesCss = null;
export async function loadElementOverridesCss() {
  if (cachedElementOverridesCss !== null) return cachedElementOverridesCss;
  cachedElementOverridesCss = (await pathExists(ELEMENT_OVERRIDES_CSS_PATH))
    ? await readFile(ELEMENT_OVERRIDES_CSS_PATH, 'utf-8') + '\n\n'
    : '';
  return cachedElementOverridesCss;
}

let cachedPictureBookCss = null;
export async function loadPictureBookCss() {
  if (cachedPictureBookCss !== null) return cachedPictureBookCss;
  cachedPictureBookCss = (await pathExists(PICTURE_BOOK_CSS_PATH))
    ? await readFile(PICTURE_BOOK_CSS_PATH, 'utf-8') + '\n\n'
    : '';
  return cachedPictureBookCss;
}

let cachedPageNumbersCss = null;
export async function loadPageNumbersCss() {
  if (cachedPageNumbersCss !== null) return cachedPageNumbersCss;
  cachedPageNumbersCss = (await pathExists(PAGE_NUMBERS_CSS_PATH))
    ? await readFile(PAGE_NUMBERS_CSS_PATH, 'utf-8') + '\n\n'
    : '';
  return cachedPageNumbersCss;
}

export async function loadOpenerCss(openerId, format) {
  if (!openerId) return '';
  const base = resolve(OPENERS_DIR, openerId, 'opener.css');
  if (!(await pathExists(base))) return '';
  let css = await readFile(base, 'utf-8');
  // Optional format-specific layer (e.g. opener-print-pdf.css)
  const formatLayer = resolve(OPENERS_DIR, openerId, `opener-${format}.css`);
  if (await pathExists(formatLayer)) css += '\n\n' + await readFile(formatLayer, 'utf-8');
  return css + '\n\n';
}

export async function applyBookStyle(context) {
  if (!context.html) {
    throw new Error('Book Style phase requires the HTML phase to run first');
  }

  const { styleId, paragraphStyle, themeOverrides, openerId, previewClasses, bookType } = await resolveBookStyleConfig(context);
  const style = await loadBookStyle(styleId, context.format);

  const { css: overrideCss, warnings: overrideWarnings } = buildOverrideCss(
    themeOverrides,
    style.meta,
    styleId,
  );

  const printResetCss      = context.format === 'print-pdf' ? await loadPrintResetCss() : '';
  const primitivesCss      = await loadPrimitivesCss();
  const frontMatterCss     = await loadFrontMatterCss();
  const openerCss          = await loadOpenerCss(openerId, context.format);
  const elementOverridesCss = await loadElementOverridesCss();
  // Page numbers + running headers — shared across all book styles for
  // print-pdf only. EPUB readers ignore @page rules, so loading this
  // for EPUB would just bloat the OPF without effect.
  const pageNumbersCss     = context.format === 'print-pdf' ? await loadPageNumbersCss() : '';
  // Picture-book layer goes LAST so its scene-break-as-page-break and
  // centred paragraph rules win over the standard book-style. Only
  // emitted when the project opted in.
  const pictureBookCss     = bookType === 'picture-book' ? await loadPictureBookCss() : '';

  // opener CSS sits after book-style so it can layer decorative treatment on
  // top, but before overrides so config variables can still win the cascade.
  // element-overrides.css sits LAST so its body-class !important rules win
  // over book-style and opener defaults — that's how preview body classes
  // (ch-*, sh-*, bq-*, callout-*) take effect in compile output too.
  const effectiveCss = frontMatterCss + primitivesCss + style.css + openerCss + printResetCss + pageNumbersCss + overrideCss + paragraphStyleOverride(paragraphStyle) + elementOverridesCss + pictureBookCss;

  context.theme = {
    id: style.id,
    meta: style.meta,
    css: effectiveCss,
    paragraphStyle,
    overrideWarnings,
    openerId: openerId || null,
    openerMeta: null,
    bodyClasses: buildBodyClasses(previewClasses, bookType),
    frontMatter: context.html.frontMatter.map(item => ({
      ...item,
      html: item.html,
      sectionClass: item.sectionClass || 'front-matter',
    })),
    chapters: context.html.chapters.map((chapter, i) => {
      const fm = chapter.frontmatter || {};
      // Picture books don't have "Chapter 1" headings — they read as one
      // continuous narrative across pages. If the writer hasn't typed an
      // H1 themselves, leave the chapter heading-less. (Novels keep the
      // existing auto-injection so blank chapter files still get a
      // visible title page.)
      const needsHeading = !chapter.html.trimStart().startsWith('<h1') && bookType !== 'picture-book';
      let headingBlock = '';
      if (needsHeading) {
        const subtitleHtml = fm.subtitle
          ? `<p class="chapter-subtitle">${escapeHtmlText(fm.subtitle)}</p>\n`
          : '';
        const epigraphHtml = fm.epigraph
          ? `<p class="chapter-epigraph">${escapeHtmlText(fm.epigraph)}</p>\n`
          : '';
        // Only surface the ordinal number when the title is custom — if the
        // title is just "Chapter N" the number is already implicit and showing
        // it separately would duplicate it (mirrors preview host logic).
        const isGenericTitle = /^chapter\s+\d+$/i.test(String(chapter.title).trim());
        const chNumHtml = isGenericTitle ? '' : `<div class="chapter-number">${chapter.number}</div>\n`;
        headingBlock = `<div class="chapter-open-drop"></div>\n${chNumHtml}<h1>${escapeHtmlText(chapter.title)}</h1>\n${subtitleHtml}${epigraphHtml}`;
      }
      return {
        ...chapter,
        html: markChapterOpenerMarkup(headingBlock + chapter.html, fm.dropCap === false),
        sectionClass: i === 0 ? 'chapter first-chapter' : 'chapter',
      };
    }),
    backMatter: context.html.backMatter.map(item => ({
      ...item,
      html: item.html,
      sectionClass: item.sectionClass || 'back-matter',
    })),
  };

  return context;
}

// ── private helpers ─────────────────────────────────────────────────

async function resolveBookStyleConfig(context) {
  const defaults = {
    styleId: DEFAULT_STYLE_ID,
    paragraphStyle: DEFAULT_PARAGRAPH_STYLE,
    themeOverrides: {},
    openerId: '',
    previewClasses: {},
    bookType: 'novel',
  };
  const configPath = resolve(context.projectPath, 'compile.config.json');
  if (!(await pathExists(configPath))) return defaults;
  try {
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    // bookStyle field is preferred; theme is the legacy alias
    const rawId = (typeof config?.bookStyle === 'string' && config.bookStyle.trim())
      || (typeof config?.theme === 'string' && config.theme.trim())
      || DEFAULT_STYLE_ID;
    const styleId = rawId;
    const rawStyle = typeof config?.paragraphStyle === 'string' ? config.paragraphStyle.trim() : '';
    const paragraphStyle = VALID_PARAGRAPH_STYLES.has(rawStyle) ? rawStyle : DEFAULT_PARAGRAPH_STYLE;
    const themeOverrides = (config?.themeOverrides && typeof config.themeOverrides === 'object')
      ? config.themeOverrides : {};
    const openerId = typeof config?.chapterOpener === 'string' ? config.chapterOpener.trim() : '';
    const previewClasses = (config?.previewClasses && typeof config.previewClasses === 'object')
      ? config.previewClasses : {};
    const rawBookType = typeof config?.bookType === 'string' ? config.bookType.trim() : '';
    const bookType = VALID_BOOK_TYPES.has(rawBookType) ? rawBookType : 'novel';
    return { styleId, paragraphStyle, themeOverrides, openerId, previewClasses, bookType };
  } catch {
    return defaults;
  }
}

// Load CSS + meta for a Book Style.
// Looks in book-styles/<id>/ first; falls back to themes/<id>/ for
// projects that still use the legacy theme ids.
export async function loadBookStyle(styleId, format) {
  const styleDir  = resolve(STYLES_DIR, styleId);
  const themeDir  = resolve(THEMES_DIR, styleId);  // legacy fallback

  // Prefer book-styles/ directory
  if (await pathExists(styleDir)) {
    return loadFromDir(styleDir, styleId, format, 'style');
  }

  // Fall back to themes/ for legacy theme ids
  if (await pathExists(themeDir)) {
    return loadFromDir(themeDir, styleId, format, 'theme');
  }

  throw new Error(
    `Book Style "${styleId}" not found in lib/compile/book-styles/ or lib/compile/themes/. ` +
    `Default is "${DEFAULT_STYLE_ID}".`,
  );
}

async function loadFromDir(dir, styleId, format, prefix) {
  const basePath   = resolve(dir, `${prefix}.css`);
  const metaPath   = resolve(dir, `${prefix}.json`);
  const formatPath = format ? resolve(dir, `${prefix}-${format}.css`) : null;

  if (!(await pathExists(basePath))) {
    throw new Error(`Book Style "${styleId}" is missing ${prefix}.css`);
  }

  const [baseCss, formatCss, metaRaw] = await Promise.all([
    readFile(basePath, 'utf-8'),
    formatPath && (await pathExists(formatPath))
      ? readFile(formatPath, 'utf-8')
      : Promise.resolve(''),
    pathExists(metaPath).then(exists => (exists ? readFile(metaPath, 'utf-8') : '{}')),
  ]);

  let meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch (err) {
    throw new Error(`Book Style "${styleId}" has invalid ${prefix}.json: ${err.message}`);
  }

  const css = formatCss
    ? baseCss + `\n\n/* ─── ${format} layer ─── */\n\n` + formatCss
    : baseCss;

  return { id: styleId, meta, css };
}

function buildOverrideCss(overrides, meta, styleId) {
  const warnings = [];
  if (!overrides || Object.keys(overrides).length === 0) {
    return { css: '', warnings };
  }

  const honoured = new Set(Array.isArray(meta?.overridable) ? meta.overridable : []);
  const rules = [];

  for (const [rawKey, rawValue] of Object.entries(overrides)) {
    const key = rawKey.trim();

    if (!SUPPORTED_OVERRIDE_KEYS.has(key)) {
      warnings.push({
        type: 'unknown',
        key: rawKey,
        message: `"${rawKey}" is not a recognised override key. Supported: ${[...SUPPORTED_OVERRIDE_KEYS].join(', ')}.`,
      });
      continue;
    }

    if (key !== 'chapterHeadingStyle' && !honoured.has(key)) {
      warnings.push({
        type: 'unsupported',
        key,
        message: `Book Style "${styleId}" does not honour the "${key}" override.`,
      });
      continue;
    }

    if (typeof rawValue !== 'string' || !rawValue.trim()) {
      warnings.push({
        type: 'invalid',
        key,
        message: `"${key}" must be a non-empty string.`,
      });
      continue;
    }
    const value = rawValue.trim();

    switch (key) {
      case 'bodyFont':
        rules.push(`  --nw-body-font: ${value};`);
        break;
      case 'sceneBreakOrnament': {
        const safe = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        rules.push(`  --nw-scene-break-ornament: "${safe}";`);
        break;
      }
      case 'chapterHeadingStyle': {
        warnings.push({
          type: 'deprecation',
          key,
          message: 'chapterHeadingStyle is deprecated — use bookStyle to pick a different style instead.',
        });
        const preset = CHAPTER_HEADING_PRESETS[value];
        if (!preset) {
          warnings.push({
            type: 'invalid',
            key,
            message: `"chapterHeadingStyle" must be one of: ${Object.keys(CHAPTER_HEADING_PRESETS).join(', ')}.`,
          });
          break;
        }
        for (const [prop, val] of Object.entries(preset)) {
          rules.push(`  ${prop}: ${val};`);
        }
        break;
      }
    }
  }

  if (rules.length === 0) return { css: '', warnings };

  const css = `\n\n/* ─── compile.config.json: themeOverrides ─── */\n\n:root {\n${rules.join('\n')}\n}\n`;
  return { css, warnings };
}

function paragraphStyleOverride(paragraphStyle) {
  if (paragraphStyle !== 'block') return '';
  return `\n\n/* ─── compile.config.json: paragraphStyle = "block" override ─── */\n\np {\n  text-indent: 0;\n  margin: 0 0 1em 0;\n}\n\np.first {\n  text-indent: 0;\n  margin-top: 0;\n}\n\nhr.scene-break + p {\n  text-indent: 0;\n}\n`;
}

function escapeHtmlText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function markChapterOpenerMarkup(html, noDropCap = false) {
  let result = html.replace('<h2>', '<h2 class="first-section">');
  const firstClass = noDropCap ? 'first first-paragraph no-drop-cap' : 'first first-paragraph';
  result = result.replace('<p>', `<p class="${firstClass}">`);
  return result;
}

/** Convert preview-class config tokens (e.g. chapterHeading: "display-heavy")
 *  into the body-class strings element-overrides.css expects (e.g.
 *  "ch-display-heavy"). */
function buildBodyClasses(previewClasses, bookType) {
  const classes = [];
  const map = {
    chapterHeading: 'ch-',
    subheading:     'sh-',
    blockquote:     'bq-',
    callout:        'callout-',
  };
  for (const [key, prefix] of Object.entries(map)) {
    const v = previewClasses?.[key];
    if (typeof v === 'string' && v && v !== 'default') classes.push(prefix + v);
  }
  if (bookType === 'picture-book') classes.push('book-picture');
  return classes.join(' ');
}
