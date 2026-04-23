// Theme phase — loads the chosen theme's CSS and post-processes chapter HTML
// so theme styles can target structural affordances (drop caps, first
// paragraphs, front/back matter).
//
// Theme directory layout:
//   lib/compile/themes/<theme-id>/
//   ├── theme.css      — stylesheet applied to every compiled HTML file
//   ├── theme.json     — metadata (id, name, fonts, sceneBreakOrnament,
//   │                    overridable[], defaultOpener)
//   └── theme-<format>.css (optional) — format-specific layer
//
// Chapter opener directory layout (Story 6.5):
//   lib/compile/chapter-openers/<opener-id>/
//   ├── opener.css           — always loaded when opener is active
//   └── opener-<format>.css  — format-specific layer (optional)
//
// Which theme is used:
//   1. compile.config.json → `theme` (string, theme id)
//   2. Falls back to 'classic-serif' (the default)
//
// Which opener is used (Story 6.5):
//   1. compile.config.json → `chapterOpener` (top-level field, string)
//   2. Falls back to theme.json → `defaultOpener`
//   3. If opener directory/CSS not found, warns and continues without it
//
// Overrides (Story 6.3):
//   compile.config.json → `themeOverrides` lets writers customise a
//   curated set of touch-points (body font, scene break ornament,
//   chapter heading style) without editing theme CSS. Each theme
//   declares which overrides it honours via `overridable[]` in its
//   theme.json. Overrides are applied as CSS custom properties on
//   :root so themes that reference them (via var(--nw-*)) pick up
//   the new values. Unknown keys and keys the theme doesn't honour
//   are reported back via context.theme.overrideWarnings for the
//   preflight phase to surface.
//
// Note: `chapterHeadingStyle` in themeOverrides is deprecated as of
//   Story 6.5. Use the top-level `chapterOpener` field instead. It
//   still works for backwards compatibility but emits a deprecation
//   warning.

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'fs-extra';
const { readFile, pathExists } = pkg;

const THEMES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'themes');
const OPENERS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'chapter-openers');
const DEFAULT_THEME_ID = 'classic-serif';
const DEFAULT_PARAGRAPH_STYLE = 'indented';
const VALID_PARAGRAPH_STYLES = new Set(['indented', 'block']);

// The complete set of supported override keys across all themes. An
// override key not in this set is flagged as "unknown" by preflight
// regardless of which theme is active. A key that IS in this set but
// not in the active theme's overridable[] is flagged as "not honoured
// by current theme" — a softer warning.
const SUPPORTED_OVERRIDE_KEYS = new Set([
  'bodyFont',
  'sceneBreakOrnament',
  'chapterHeadingStyle',
]);

// Chapter-heading style presets map to a set of CSS custom property
// values the themes consume. A writer says "small-caps" and the theme
// flips font-variant, letter-spacing, and text-transform accordingly.
const CHAPTER_HEADING_PRESETS = {
  // Each preset sets a complete group of --nw-chapter-* properties so
  // that switching presets doesn't inherit stale values from the theme's
  // defaults. Themes read these via var(--nw-chapter-*, fallback).
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

export async function applyTheme(context) {
  if (!context.html) {
    throw new Error('Theme phase requires the HTML phase to run first');
  }

  const { themeId, paragraphStyle, themeOverrides, chapterOpener: configOpener } = await resolveThemeConfig(context);
  const theme = await loadTheme(themeId, context.format);

  const { css: overrideCss, warnings: overrideWarnings } = buildOverrideCss(
    themeOverrides,
    theme.meta,
    themeId,
  );

  // Resolve opener: explicit config > theme default > none
  const openerId = configOpener || theme.meta.defaultOpener || null;
  const { css: openerCss, meta: openerMeta, warnings: openerWarnings } = openerId
    ? await loadOpener(openerId, context.format)
    : { css: '', meta: null, warnings: [] };

  const effectiveCss = theme.css + overrideCss + paragraphStyleOverride(paragraphStyle) + openerCss;

  // Merge all warnings: override warnings + opener warnings
  const allOverrideWarnings = [...overrideWarnings, ...openerWarnings];

  context.theme = {
    id: theme.id,
    meta: theme.meta,
    css: effectiveCss,
    paragraphStyle,
    overrideWarnings: allOverrideWarnings,
    openerId,
    openerMeta,
    frontMatter: context.html.frontMatter.map(item => ({
      ...item,
      html: item.html,
      sectionClass: 'front-matter',
    })),
    chapters: context.html.chapters.map(chapter => {
      // If the chapter body doesn't start with an H1, inject a chapter number
      // and title block so opener CSS has the elements it needs to style.
      const needsHeading = !chapter.html.trimStart().startsWith('<h1');
      const headingBlock = needsHeading
        ? `<div class="chapter-number">${chapter.number}</div>\n<h1>${escapeHtmlText(chapter.title)}</h1>\n`
        : '';
      return {
        ...chapter,
        html: markChapterOpenerMarkup(headingBlock + chapter.html),
        sectionClass: 'chapter',
      };
    }),
    backMatter: context.html.backMatter.map(item => ({
      ...item,
      html: item.html,
      sectionClass: 'back-matter',
    })),
  };

  return context;
}

// ── private helpers ─────────────────────────────────────────────

// Reads compile.config.json (if present) for theme id, paragraph style,
// the themeOverrides block, and the chapterOpener field (Story 6.5).
async function resolveThemeConfig(context) {
  const defaults = {
    themeId: DEFAULT_THEME_ID,
    paragraphStyle: DEFAULT_PARAGRAPH_STYLE,
    themeOverrides: {},
    chapterOpener: null,
  };
  const configPath = resolve(context.projectPath, 'compile.config.json');
  if (!(await pathExists(configPath))) return defaults;
  try {
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    const themeId = (typeof config?.theme === 'string' && config.theme.trim()) || DEFAULT_THEME_ID;
    const rawStyle = typeof config?.paragraphStyle === 'string' ? config.paragraphStyle.trim() : '';
    const paragraphStyle = VALID_PARAGRAPH_STYLES.has(rawStyle) ? rawStyle : DEFAULT_PARAGRAPH_STYLE;
    const themeOverrides = (config?.themeOverrides && typeof config.themeOverrides === 'object')
      ? config.themeOverrides : {};
    const chapterOpener = (typeof config?.chapterOpener === 'string' && config.chapterOpener.trim())
      ? config.chapterOpener.trim()
      : null;
    return { themeId, paragraphStyle, themeOverrides, chapterOpener };
  } catch {
    return defaults;
  }
}

// Translates the `themeOverrides` config block into a :root { ... }
// stylesheet of CSS custom properties, and collects warnings about
// unknown or unsupported keys so preflight can surface them.
//
// Warning types:
//   - 'unknown'     — key isn't in SUPPORTED_OVERRIDE_KEYS (typo, old
//                     docs, or writer invented their own)
//   - 'unsupported' — key is valid globally but the active theme's
//                     theme.json didn't list it in overridable[]
//                     (theme has declined to honour this touchpoint)
//   - 'invalid'     — value type was wrong (e.g. array for bodyFont)
//                     or the chapter-heading preset name is unknown
function buildOverrideCss(overrides, themeMeta, themeId) {
  const warnings = [];
  if (!overrides || Object.keys(overrides).length === 0) {
    return { css: '', warnings };
  }

  const honoured = new Set(Array.isArray(themeMeta?.overridable) ? themeMeta.overridable : []);
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

    // chapterHeadingStyle is deprecated (Story 6.5) but still processed for
    // backwards compat regardless of theme.json overridable[]. The deprecation
    // warning is emitted inside the switch case below.
    if (key !== 'chapterHeadingStyle' && !honoured.has(key)) {
      warnings.push({
        type: 'unsupported',
        key,
        message: `Theme "${themeId}" does not honour the "${key}" override. Check the theme's theme.json (overridable[]) or fork the theme directory for deeper customisation.`,
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
        // Pass-through. Writers supply a CSS font-family stack
        // (e.g. `"Palatino, Georgia, serif"`). We don't validate the
        // families — the fallback chain in the theme handles missing
        // fonts on a given reader.
        rules.push(`  --nw-body-font: ${value};`);
        break;

      case 'sceneBreakOrnament': {
        // Whatever the writer types becomes the content value for the
        // hr.scene-break::before. Wrap as a quoted CSS string, escaping
        // any quotes inside. Common values: "* * *", "· · ·", "❦", "§".
        const safe = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        rules.push(`  --nw-scene-break-ornament: "${safe}";`);
        break;
      }

      case 'chapterHeadingStyle': {
        // Deprecation notice — chapterHeadingStyle is superseded by the
        // top-level `chapterOpener` field (Story 6.5). Still processed for
        // backwards compatibility but writers should migrate.
        warnings.push({
          type: 'deprecation',
          key,
          message: 'chapterHeadingStyle is deprecated — use the top-level chapterOpener field instead. See compile.config.json documentation.',
        });
        const preset = CHAPTER_HEADING_PRESETS[value];
        if (!preset) {
          warnings.push({
            type: 'invalid',
            key,
            message: `"chapterHeadingStyle" must be one of: ${Object.keys(CHAPTER_HEADING_PRESETS).join(', ')}. Got "${value}".`,
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

  if (rules.length === 0) {
    return { css: '', warnings };
  }

  const css = `

/* ─── compile.config.json: themeOverrides ───────────────────────────── */

:root {
${rules.join('\n')}
}
`;
  return { css, warnings };
}

// When paragraphStyle is "block", append an override stylesheet that
// flips paragraphs from first-line-indent to vertical-margin style.
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

// Mark the first <h2> and first <p> of a chapter so opener CSS can target
// structural affordances (chapter heading treatment, drop cap, no indent).
// Uses simple string replace (not regex) so only the first occurrence
// of each tag is affected.
//
// `first` class is kept alongside `first-paragraph` for backwards
// compatibility with existing theme CSS drop-cap rules.
function escapeHtmlText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function markChapterOpenerMarkup(html) {
  let result = html.replace('<h2>', '<h2 class="first-section">');
  result = result.replace('<p>', '<p class="first first-paragraph">');
  return result;
}

// Load a chapter opener's CSS from lib/compile/chapter-openers/<id>/.
// Returns { css, meta, warnings }. If the opener dir or opener.css doesn't
// exist, warns and returns empty CSS so compile can continue gracefully
// even when another agent hasn't yet populated the CSS files.
async function loadOpener(openerId, format) {
  const openerDir = resolve(OPENERS_DIR, openerId);
  const warnings = [];

  if (!(await pathExists(openerDir))) {
    warnings.push({
      type: 'opener-not-found',
      key: 'chapterOpener',
      message: `Chapter opener "${openerId}" not found at lib/compile/chapter-openers/${openerId}/. Skipping opener CSS.`,
    });
    return { css: '', meta: null, warnings };
  }

  const basePath = resolve(openerDir, 'opener.css');
  if (!(await pathExists(basePath))) {
    warnings.push({
      type: 'opener-not-found',
      key: 'chapterOpener',
      message: `Chapter opener "${openerId}" is missing opener.css. Skipping opener CSS.`,
    });
    return { css: '', meta: null, warnings };
  }

  const formatCssPath = format ? resolve(openerDir, `opener-${format}.css`) : null;
  const metaPath = resolve(openerDir, 'opener.json');

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
  } catch {
    meta = {};
  }

  const css = formatCss
    ? `\n\n/* ─── chapter-opener: ${openerId} ─── */\n\n` + baseCss +
      `\n\n/* ─── chapter-opener: ${openerId} ${format} layer ─── */\n\n` + formatCss
    : `\n\n/* ─── chapter-opener: ${openerId} ─── */\n\n` + baseCss;

  return { css, meta, warnings };
}
