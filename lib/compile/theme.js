// Theme phase — loads the chosen theme's CSS and post-processes chapter HTML
// so theme styles can target structural affordances (drop caps, first
// paragraphs, front/back matter).
//
// Theme directory layout:
//   lib/compile/themes/<theme-id>/
//   ├── theme.css      — the stylesheet applied to every compiled HTML file
//   └── theme.json     — metadata (id, name, fonts, sceneBreakOrnament, etc.)
//
// Which theme is used:
//   1. compile.config.json → `theme` (string, theme id)
//   2. Falls back to 'classic-serif' (the only theme as of Story 3.4)

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'fs-extra';
const { readFile, pathExists } = pkg;

const THEMES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'themes');
const DEFAULT_THEME_ID = 'classic-serif';
const DEFAULT_PARAGRAPH_STYLE = 'indented';
const VALID_PARAGRAPH_STYLES = new Set(['indented', 'block']);

export async function applyTheme(context) {
  if (!context.html) {
    throw new Error('Theme phase requires the HTML phase to run first');
  }

  const { themeId, paragraphStyle } = await resolveThemeConfig(context);
  const theme = await loadTheme(themeId, context.format);
  const effectiveCss = theme.css + paragraphStyleOverride(paragraphStyle);

  context.theme = {
    id: theme.id,
    meta: theme.meta,
    css: effectiveCss,
    paragraphStyle,
    frontMatter: context.html.frontMatter.map(item => ({
      ...item,
      html: item.html,
      sectionClass: 'front-matter',
    })),
    chapters: context.html.chapters.map(chapter => ({
      ...chapter,
      html: markFirstParagraph(chapter.html),
      sectionClass: 'chapter',
    })),
    backMatter: context.html.backMatter.map(item => ({
      ...item,
      html: item.html,
      sectionClass: 'back-matter',
    })),
  };

  return context;
}

// ── private helpers ─────────────────────────────────────────────

// Reads compile.config.json (if present) for theme id + paragraph style.
// Defaults:  theme = "classic-serif",  paragraphStyle = "indented".
async function resolveThemeConfig(context) {
  const defaults = { themeId: DEFAULT_THEME_ID, paragraphStyle: DEFAULT_PARAGRAPH_STYLE };
  const configPath = resolve(context.projectPath, 'compile.config.json');
  if (!(await pathExists(configPath))) return defaults;
  try {
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    const themeId = (typeof config?.theme === 'string' && config.theme.trim()) || DEFAULT_THEME_ID;
    const rawStyle = typeof config?.paragraphStyle === 'string' ? config.paragraphStyle.trim() : '';
    const paragraphStyle = VALID_PARAGRAPH_STYLES.has(rawStyle) ? rawStyle : DEFAULT_PARAGRAPH_STYLE;
    return { themeId, paragraphStyle };
  } catch {
    return defaults;
  }
}

// When paragraphStyle is "block", append an override stylesheet that
// flips paragraphs from first-line-indent to vertical-margin style.
// "indented" is the theme's built-in default, so no override needed.
function paragraphStyleOverride(paragraphStyle) {
  if (paragraphStyle !== 'block') return '';
  return `

/* ─── compile.config.json: paragraphStyle = "block" override ───────── */

p {
  text-indent: 0;
  margin: 0 0 1em 0;
}

p.first {
  text-indent: 0;
  margin-top: 0;
}

hr.scene-break + p {
  text-indent: 0;
}
`;
}

async function loadTheme(themeId, format) {
  const themeDir = resolve(THEMES_DIR, themeId);
  if (!(await pathExists(themeDir))) {
    throw new Error(
      `Theme "${themeId}" not found. Available themes live in ` +
      `lib/compile/themes/. Default is "${DEFAULT_THEME_ID}".`,
    );
  }

  const basePath = resolve(themeDir, 'theme.css');
  const metaPath = resolve(themeDir, 'theme.json');

  if (!(await pathExists(basePath))) {
    throw new Error(`Theme "${themeId}" is missing theme.css`);
  }

  // Additively load theme-<format>.css if it exists. This lets themes
  // ship format-specific layers (e.g. theme-print.css with @page rules
  // for print-pdf) on top of a shared base.
  const formatCssPath = format ? resolve(themeDir, `theme-${format}.css`) : null;

  const [baseCss, formatCss, metaRaw] = await Promise.all([
    readFile(basePath, 'utf-8'),
    formatCssPath && (await pathExists(formatCssPath))
      ? readFile(formatCssPath, 'utf-8')
      : Promise.resolve(''),
    pathExists(metaPath).then(exists => (exists ? readFile(metaPath, 'utf-8') : '{}')),
  ]);

  let meta;
  try {
    meta = JSON.parse(metaRaw);
  } catch (err) {
    throw new Error(`Theme "${themeId}" has invalid theme.json: ${err.message}`);
  }

  const css = formatCss
    ? baseCss + `\n\n/* ─── ${format} layer ─── */\n\n` + formatCss
    : baseCss;

  return { id: themeId, meta, css };
}

// Mark the first <p> so theme CSS can target it (drop cap, no indent).
// markdown-it produces vanilla <p> tags with no attributes, so this
// simple substitution is safe and predictable.
function markFirstParagraph(html) {
  return html.replace(/<p>/, '<p class="first">');
}
