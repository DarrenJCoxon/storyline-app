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
import { isAbsolute, resolve } from 'path';
import { randomUUID } from 'crypto';
import { stat } from 'fs/promises';
import { existsSync } from 'fs';
import pkg from 'fs-extra';
const { ensureDir } = pkg;

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

  const content = buildContentList(theme);
  const epubOptions = buildEpubOptions(metadata, theme, content, context.projectPath);

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

function buildEpubOptions(metadata, theme, content, projectPath) {
  const identifier = metadata.identifier || `urn:uuid:${randomUUID()}`;

  const opts = {
    title: metadata.title,
    author: metadata.author || 'Unknown Author',
    publisher: metadata.publisher || 'Independent',
    lang: metadata.language || 'en',
    tocTitle: 'Contents',
    appendChapterTitles: false, // we control chapter titles via <h1> in body
    css: theme.css,
    content,
    version: 3,
    uuid: identifier,
    verbose: false,
  };

  if (metadata.description) opts.description = metadata.description;

  // Embed the cover image if one is configured. Resolves against the
  // project root so the EPUB ships with the cover art the writer chose
  // in the Compile panel (or via Cover Generator's "Save (ebook only)").
  if (metadata.coverImage) {
    const coverAbs = isAbsolute(metadata.coverImage)
      ? metadata.coverImage
      : resolve(projectPath, metadata.coverImage);
    if (existsSync(coverAbs)) {
      opts.cover = coverAbs;
    }
  }

  return opts;
}

function buildContentList(theme) {
  const entries = [];

  for (const item of theme.frontMatter) {
    entries.push({
      title: item.title,
      data: wrapSection(item.html, item.sectionClass),
      beforeToc: true,
    });
  }

  for (const chapter of theme.chapters) {
    entries.push({
      title: chapter.title,
      data: wrapSection(chapter.html, chapter.sectionClass),
    });
  }

  for (const item of theme.backMatter) {
    entries.push({
      title: item.title,
      data: wrapSection(item.html, item.sectionClass),
    });
  }

  return entries;
}

// Each chapter's HTML is already themable (p.first for drop caps, etc.)
// but needs a section wrapper so CSS can scope styles per section type.
function wrapSection(bodyHtml, sectionClass) {
  return `<section class="${sectionClass}">\n${bodyHtml}\n</section>`;
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
