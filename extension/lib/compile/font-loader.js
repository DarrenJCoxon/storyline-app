// Font loader — provides @font-face CSS and file-path manifests for the
// six bundled OFL typefaces used by Book Styles and themes.
//
// Bundled fonts (WOFF2, subset to Latin Extended):
//   Crimson Pro      — refined book serif (Classic Serif, Atticus)
//   EB Garamond      — classical heritage serif (Heritage, Gallant)
//   Source Serif 4   — modern text serif (Riverside, Strand body)
//   Newsreader       — narrative non-fiction serif (Ledger, Periodical)
//   Inter            — neutral sans-serif (Modern Sans display)
//   Plus Jakarta Sans — humanist sans (Modern Sans body, Quarto, Strand display)
//
// All fonts are SIL OFL 1.1 licensed — free to embed in commercial EPUBs
// and PDFs. Licence files ship alongside the WOFF2s in lib/compile/fonts/.
//
// Usage:
//   import { fontFaceCss, epubFontEntries, printFontFaceBlock } from './font-loader.js'
//
//   fontFaceCss(['crimson-pro', 'eb-garamond'])
//     → CSS @font-face block referencing fonts/ relative URLs (for EPUB)
//
//   epubFontEntries(['crimson-pro'])
//     → [{ id, href, mediaType, filePath }] for the EPUB packager
//
//   printFontFaceBlock(['crimson-pro', 'eb-garamond'])
//     → CSS @font-face block with absolute file:// URLs (for Paged.js / Chromium)

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const FONTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fonts');

// ─── Font registry ──────────────────────────────────────────────────────────
//
// Each entry declares the CSS font-family name, the file prefix, and which
// weights/styles are available. EPUB @font-face paths use `fonts/<file>` so
// they resolve relative to the CSS inside the EPUB zip. Print @font-face paths
// use absolute file:// URIs so Chromium can load them off disk.

const FONT_REGISTRY = {
  'crimson-pro': {
    family: 'Crimson Pro',
    prefix: 'crimson-pro-latin',
    variants: [
      { weight: 400, style: 'normal' },
      { weight: 400, style: 'italic' },
      { weight: 700, style: 'normal' },
      { weight: 700, style: 'italic' },
    ],
  },
  'eb-garamond': {
    family: 'EB Garamond',
    prefix: 'eb-garamond-latin',
    variants: [
      { weight: 400, style: 'normal' },
      { weight: 400, style: 'italic' },
      { weight: 700, style: 'normal' },
      { weight: 700, style: 'italic' },
    ],
  },
  'source-serif-4': {
    family: 'Source Serif 4',
    prefix: 'source-serif-4-latin',
    variants: [
      { weight: 400, style: 'normal' },
      { weight: 400, style: 'italic' },
      { weight: 700, style: 'normal' },
      { weight: 700, style: 'italic' },
    ],
  },
  'newsreader': {
    family: 'Newsreader',
    prefix: 'newsreader-latin',
    variants: [
      { weight: 400, style: 'normal' },
      { weight: 400, style: 'italic' },
      { weight: 700, style: 'normal' },
      { weight: 700, style: 'italic' },
    ],
  },
  'inter': {
    family: 'Inter',
    prefix: 'inter-latin',
    variants: [
      { weight: 400, style: 'normal' },
      { weight: 400, style: 'italic' },
      { weight: 700, style: 'normal' },
      { weight: 700, style: 'italic' },
    ],
  },
  'plus-jakarta-sans': {
    family: 'Plus Jakarta Sans',
    prefix: 'plus-jakarta-sans-latin',
    variants: [
      { weight: 400, style: 'normal' },
      { weight: 400, style: 'italic' },
      { weight: 700, style: 'normal' },
      { weight: 700, style: 'italic' },
    ],
  },
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns @font-face CSS for the given font IDs using relative `fonts/<file>`
 * URLs. Used inside EPUB CSS where the font files are alongside the stylesheet.
 *
 * @param {string[]} fontIds — keys from FONT_REGISTRY
 * @returns {string} CSS text
 */
export function fontFaceCss(fontIds) {
  return fontIds
    .flatMap(id => buildFontFaceRules(id, file => `fonts/${file}`))
    .join('\n');
}

/**
 * Returns @font-face CSS for the given font IDs using absolute file:// URIs.
 * Used in the Paged.js print-preview HTML so Chromium can load bundled fonts.
 *
 * @param {string[]} fontIds — keys from FONT_REGISTRY
 * @returns {string} CSS text
 */
export function printFontFaceBlock(fontIds) {
  return fontIds
    .flatMap(id => buildFontFaceRules(id, file => `file://${FONTS_DIR}/${file}`))
    .join('\n');
}

/**
 * Returns an array of font-entry objects for the EPUB packager. Each entry
 * describes one WOFF2 file to embed in the EPUB zip.
 *
 * @param {string[]} fontIds — keys from FONT_REGISTRY
 * @returns {{ id: string, href: string, mediaType: string, filePath: string }[]}
 */
export function epubFontEntries(fontIds) {
  return fontIds.flatMap(id => {
    const reg = FONT_REGISTRY[id];
    if (!reg) return [];
    return reg.variants.map(({ weight, style }) => {
      const file = `${reg.prefix}-${weight}-${style}.woff2`;
      return {
        id: `font-${id}-${weight}-${style}`,
        href: `fonts/${file}`,
        mediaType: 'application/font-woff2',
        filePath: resolve(FONTS_DIR, file),
      };
    });
  });
}

/**
 * Returns the canonical CSS font-family name for the given font ID.
 *
 * @param {string} fontId
 * @returns {string}
 */
export function fontFamily(fontId) {
  return FONT_REGISTRY[fontId]?.family ?? fontId;
}

/**
 * Returns all registered font IDs.
 *
 * @returns {string[]}
 */
export function allFontIds() {
  return Object.keys(FONT_REGISTRY);
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildFontFaceRules(id, urlBuilder) {
  const reg = FONT_REGISTRY[id];
  if (!reg) {
    console.warn(`[font-loader] Unknown font id: ${id}`);
    return [];
  }
  return reg.variants.map(({ weight, style }) => {
    const file = `${reg.prefix}-${weight}-${style}.woff2`;
    return [
      `@font-face {`,
      `  font-family: "${reg.family}";`,
      `  font-weight: ${weight};`,
      `  font-style: ${style};`,
      `  font-display: block;`,
      `  src: url("${urlBuilder(file)}") format("woff2");`,
      `}`,
    ].join('\n');
  });
}
