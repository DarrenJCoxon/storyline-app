// EPUB packaging — takes the themed context and writes a valid EPUB 3
// zip to output/compiled/manuscript.epub.
//
// Uses @lesjoursfr/html-to-epub (actively maintained fork of epub-gen)
// to build the zip, OPF, NCX, nav.xhtml and per-chapter XHTML files.
// Our job is to hand it:
//   - metadata (title, author, language, identifier, publisher, ...)
//   - an ordered content list (front matter → chapters → back matter)
//   - the theme CSS
//
// The library wraps each content entry in a complete XHTML document
// automatically; we only supply the body HTML (which already has scene
// breaks, drop-cap first-paragraph classes, etc. from Story 3.4).

import { EPub } from '@lesjoursfr/html-to-epub';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { stat } from 'fs/promises';
import pkg from 'fs-extra';
const { ensureDir } = pkg;
import { fontFaceCss, epubFontEntries } from './font-loader.js';

export async function packageEpub(context) {
  if (!context.theme) {
    throw new Error('EPUB packaging requires the theme phase to run first');
  }

  const { metadata } = context.assembly;
  const { theme } = context;

  if (!metadata?.title) {
    throw new Error('Cannot package EPUB: missing metadata.title');
  }

  const outputDir = resolve(context.projectPath, 'output', 'compiled');
  await ensureDir(outputDir);
  const outputPath = resolve(outputDir, sanitiseFilename(metadata.title) + '.epub');

  // Font IDs declared in theme.json (e.g. ["crimson-pro"]).
  const fontIds = Array.isArray(theme.meta?.fonts) ? theme.meta.fonts : [];
  const fontEntries = epubFontEntries(fontIds);
  const fontCss = fontIds.length ? fontFaceCss(fontIds) : '';

  const content = buildContentList(theme);
  const epubOptions = buildEpubOptions(metadata, theme, content, fontCss, fontEntries, context.projectPath);

  const epub = new EPub(epubOptions, outputPath);
  await epub.render();

  const { size } = await stat(outputPath);

  context.output = {
    path: outputPath,
    bytes: size,
    format: 'epub',
  };

  return context;
}

// ── private helpers ─────────────────────────────────────────────

function buildEpubOptions(metadata, theme, content, fontCss = '', fontEntries = [], projectPath = '') {
  const identifier = metadata.identifier || `urn:uuid:${randomUUID()}`;

  // @font-face rules go first so the font-family declarations in theme.css
  // resolve correctly. fontCss uses relative `fonts/<file>` URLs that the
  // epub library resolves against the EPUB's internal CSS path.
  const css = fontCss ? fontCss + '\n\n' + theme.css : theme.css;

  const opts = {
    title: metadata.title,
    author: metadata.author || 'Unknown Author',
    publisher: metadata.publisher || 'Independent',
    lang: metadata.language || 'en',
    tocTitle: 'Contents',
    appendChapterTitles: false, // we control chapter titles via <h1> in body
    css,
    content,
    version: 3,
    uuid: identifier,
    verbose: false,
  };

  // Embed font files in the EPUB zip. The library copies each filePath into
  // OEBPS/fonts/ and adds an OPF manifest entry. fontEntries is empty when
  // the theme declares no bundled fonts (graceful no-op).
  if (fontEntries.length > 0) {
    opts.fonts = fontEntries.map(e => e.filePath);
  }

  if (metadata.description) opts.description = metadata.description;

  if (metadata.coverImage && projectPath) {
    const coverPath = resolve(projectPath, metadata.coverImage);
    opts.cover = coverPath;
  }

  return opts;
}

function buildContentList(theme) {
  const entries = [];
  const bodyClasses = theme.bodyClasses || '';

  for (const item of theme.frontMatter) {
    entries.push({
      title: item.title,
      data: wrapSection(item.html, item.sectionClass, item.id, bodyClasses),
      // Generated ToC page should appear in spine but not in epub nav (the
      // epub library's auto nav handles reader navigation).
      beforeToc: item.id !== 'gen-toc',
    });
  }

  for (const chapter of theme.chapters) {
    entries.push({
      title: chapter.title,
      data: wrapSection(chapter.html, chapter.sectionClass, chapter.id, bodyClasses),
    });
  }

  for (const item of theme.backMatter) {
    entries.push({
      title: item.title,
      data: wrapSection(item.html, item.sectionClass, item.id, bodyClasses),
    });
  }

  return entries;
}

function wrapSection(bodyHtml, sectionClass, id, extraClasses = '') {
  const idAttr = id ? ` id="${id}"` : '';
  // EPUB wraps each section in its own xhtml file; the html-to-epub lib
  // gives us no <body> hook, so the preview body classes are emitted on
  // the <section> instead. element-overrides.css uses bare class selectors
  // (.ch-x, .sh-x ...) so the same rules match in either context.
  const cls = [sectionClass || 'section', extraClasses].filter(Boolean).join(' ');
  return `<section class="${cls}"${idAttr}>\n${bodyHtml}\n</section>`;
}

// Drop characters that would fail on Windows/macOS file systems. Keep
// letters, digits, spaces (converted to hyphens), and a few punctuation
// marks. Replace everything else with nothing.
function sanitiseFilename(title) {
  return title
    .normalize('NFKD')
    .replace(/[^\w\s\-\u00C0-\u024F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'manuscript';
}
