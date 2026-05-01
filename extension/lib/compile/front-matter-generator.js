// Front-matter generator — produces half-title, title page, copyright,
// dedication, epigraph, table of contents, about-author, and also-by
// pages from project metadata. Each generated item carries `rawHtml`
// so the markdown-to-html phase passes it through without rendering.
//
// Resolution order for each page type:
//   1. `compile.config.json` frontMatter.<type>: false  → suppressed
//   2. Manual file in _front-matter/ with matching name → suppressed
//      (manual file takes over; generator is skipped for that type)
//   3. Metadata field absent (dedication, epigraph, etc.) → conditional
//   4. Default → generated
//
// Canonical front-matter order (fixed, matches book convention):
//   half-title → title → copyright → dedication → epigraph
//   → [manual non-replacing files] → toc
//
// Generated back matter appended after manual back matter:
//   about-author → also-by

import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pkg from 'fs-extra';
const { readFile, pathExists, readdir } = pkg;

const __dir = dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = '_front-matter';
const BACK_DIR  = '_back-matter';

// Manual files that suppress a specific generated page (by type key).
const SUPPRESS_BY_FILENAME = {
  'half-title.md':   'halfTitle',
  'title.md':        'title',
  'title-page.md':   'title',
  'copyright.md':    'copyright',
  'dedication.md':   'dedication',
  'epigraph.md':     'epigraph',
  'about-author.md': 'aboutAuthor',
  'also-by.md':      'alsoBy',
};

export async function generateFrontMatter(context) {
  const { assembly, projectPath, format } = context;
  const { metadata, manuscriptPath } = assembly;

  const config = await readCompileConfig(projectPath);
  const fmCfg  = config?.frontMatter  || {};
  const metaCfg = config?.metadata    || {};

  // Collect names of manual files to detect suppression
  const frontDir = resolve(projectPath, manuscriptPath, FRONT_DIR);
  const backDir  = resolve(projectPath, manuscriptPath, BACK_DIR);
  const manualFrontFiles = await listMd(frontDir);
  const manualBackFiles  = await listMd(backDir);

  const suppressed = new Set();
  for (const f of [...manualFrontFiles, ...manualBackFiles]) {
    const key = SUPPRESS_BY_FILENAME[f.toLowerCase()];
    if (key) suppressed.add(key);
  }
  for (const [key, val] of Object.entries(fmCfg)) {
    if (val === false) suppressed.add(key);
  }

  // Determine which book style name to credit in the copyright page
  const styleId = config?.bookStyle || config?.theme || 'classic-serif';

  // ── Generated front matter (canonical order) ──────────────────

  const generatedFront = [];

  if (!suppressed.has('halfTitle')) {
    generatedFront.push(page('gen-half-title', metadata.title, 'front-matter-page half-title-page',
      buildHalfTitle(metadata)));
  }

  if (!suppressed.has('title')) {
    generatedFront.push(page('gen-title', metadata.title, 'front-matter-page title-page',
      buildTitlePage(metadata)));
  }

  if (!suppressed.has('copyright')) {
    generatedFront.push(page('gen-copyright', 'Copyright', 'front-matter-page copyright-page',
      buildCopyrightPage(metadata, styleId)));
  }

  const dedicationText = fmCfg.dedication ?? metaCfg.dedication;
  if (!suppressed.has('dedication') && dedicationText) {
    generatedFront.push(page('gen-dedication', '', 'front-matter-page dedication-page',
      buildDedicationPage(String(dedicationText))));
  }

  const epigraphText = fmCfg.epigraph ?? metaCfg.epigraph;
  const epigraphBy   = fmCfg.epigraphAttribution ?? metaCfg.epigraphAttribution ?? null;
  if (!suppressed.has('epigraph') && epigraphText) {
    generatedFront.push(page('gen-epigraph', '', 'front-matter-page epigraph-page',
      buildEpigraphPage(String(epigraphText), epigraphBy ? String(epigraphBy) : null)));
  }

  // Manual front matter files that don't suppress a generated type slot in here.
  const passThroughFront = assembly.frontMatter.filter(item => {
    const key = SUPPRESS_BY_FILENAME[(item.filename || '').toLowerCase()];
    return !key;
  });

  // ToC always generated last in front matter (required by KDP / Apple)
  if (!suppressed.has('toc')) {
    generatedFront.push(page('gen-toc', 'Contents', 'front-matter-page toc-page',
      buildToC(assembly.chapters, format)));
  }

  context.assembly.frontMatter = [...generatedFront, ...passThroughFront];

  // ── Generated back matter (appended after manual) ─────────────

  const generatedBack = [];

  const aboutAuthor = metaCfg.aboutAuthor ?? fmCfg.aboutAuthor ?? null;
  const authorPhoto  = metaCfg.authorPhoto  ?? fmCfg.authorPhoto  ?? null;
  if (!suppressed.has('aboutAuthor') && aboutAuthor) {
    generatedBack.push(page('gen-about-author', 'About the Author', 'front-matter-page about-author-page',
      buildAboutAuthor(metadata.author, String(aboutAuthor), authorPhoto ? String(authorPhoto) : null)));
  }

  const alsoBy = metaCfg.alsoBy ?? fmCfg.alsoBy ?? null;
  if (!suppressed.has('alsoBy') && Array.isArray(alsoBy) && alsoBy.length > 0) {
    generatedBack.push(page('gen-also-by', 'Also By', 'front-matter-page also-by-page',
      buildAlsoBy(metadata.author, alsoBy)));
  }

  context.assembly.backMatter = [...assembly.backMatter, ...generatedBack];

  context.frontMatterSummary = {
    generatedFront: generatedFront.map(i => i.id),
    generatedBack:  generatedBack.map(i => i.id),
  };

  return context;
}

// ── private helpers ──────────────────────────────────────────────

function page(id, title, sectionClass, rawHtml) {
  return { id, title, sectionClass, rawHtml, body: '', generated: true };
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function readCompileConfig(projectPath) {
  const p = resolve(projectPath, 'compile.config.json');
  if (!(await pathExists(p))) return null;
  try { return JSON.parse(await readFile(p, 'utf-8')); } catch { return null; }
}

async function listMd(dir) {
  if (!(await pathExists(dir))) return [];
  const entries = await readdir(dir);
  return entries.filter(f => /\.md$/i.test(f));
}

// ── Page builders ────────────────────────────────────────────────

function buildHalfTitle({ title }) {
  return `<h1 class="half-title">${esc(title)}</h1>`;
}

function buildTitlePage({ title, subtitle, author, publisher }) {
  const sub  = subtitle  ? `<p class="book-subtitle">${esc(subtitle)}</p>\n` : '';
  const auth = author    ? `<p class="book-author">${esc(author)}</p>\n`     : '';
  const rule = (author && publisher) ? `<hr class="title-rule" />\n`          : '';
  const pub  = publisher ? `<p class="book-publisher">${esc(publisher)}</p>`  : '';
  return `<h1 class="book-title">${esc(title)}</h1>\n${sub}${auth}${rule}${pub}`.trimEnd();
}

function buildCopyrightPage({ author, copyrightYear, publisher, isbn }, styleId) {
  const year = copyrightYear || new Date().getFullYear();
  const auth = esc(author || 'the author');
  const pubLine  = publisher ? `<p>${esc(publisher)}</p>\n` : '';
  const isbnLine = isbn      ? `<p>ISBN ${esc(isbn)}</p>\n` : '';
  const styleCredit = styleId
    ? `<p class="copyright-typeset">Interior typography: ${esc(styleId)}</p>\n`
    : '';
  return `<p>Copyright &copy; ${year} ${auth}</p>
<p>All rights reserved. No part of this publication may be reproduced, stored in a
retrieval system, or transmitted in any form or by any means&mdash;electronic,
mechanical, photocopy, recording, or otherwise&mdash;without prior written permission
of the publisher.</p>
<p>This is a work of fiction. Names, characters, places, and incidents are either the
products of the author&rsquo;s imagination or are used fictitiously. Any resemblance
to actual events, locales, or persons, living or dead, is purely coincidental.</p>
${pubLine}${isbnLine}${styleCredit}<p class="printing-line">10 9 8 7 6 5 4 3 2 1</p>`;
}

function buildDedicationPage(text) {
  const lines = text.split('\n').map(l => `<p class="dedication-text">${esc(l.trim())}</p>`);
  return lines.join('\n');
}

function buildEpigraphPage(quote, attribution) {
  const attr = attribution
    ? `\n<p class="epigraph-attribution">&mdash; ${esc(attribution)}</p>`
    : '';
  return `<p class="book-epigraph">${esc(quote)}</p>${attr}`;
}

function buildToC(chapters, format) {
  if (!chapters || chapters.length === 0) {
    return '<p class="toc-empty">No chapters found.</p>';
  }

  const isPrint = format === 'print-pdf';

  const items = chapters.map(ch => {
    const numLabel = `<span class="toc-chapter-number">Chapter ${ch.number}</span>`;
    const title    = `<span class="toc-chapter-title">${esc(ch.title)}</span>`;
    const leader   = `<span class="toc-leader" aria-hidden="true"></span>`;
    const pageNum  = isPrint
      ? `<span class="toc-page-number" data-href="#${esc(ch.id)}"></span>`
      : `<span class="toc-page-number"></span>`;

    const inner = `${numLabel}${title}${leader}${pageNum}`;

    return isPrint
      ? `    <li class="toc-entry"><a href="#${esc(ch.id)}">${inner}</a></li>`
      : `    <li class="toc-entry"><span class="toc-row">${inner}</span></li>`;
  });

  return `<h2 class="toc-title">Contents</h2>
<nav role="doc-toc">
  <ol class="toc-list">
${items.join('\n')}
  </ol>
</nav>`;
}

function buildAboutAuthor(authorName, bio, photoPath) {
  const photo = photoPath
    ? `<img class="author-photo" src="${esc(photoPath)}" alt="${esc(authorName)}" />\n`
    : '';
  const bioHtml = bio.includes('<p>') ? bio : bio.split(/\n\n+/).map(p =>
    `<p>${esc(p.trim())}</p>`).join('\n');
  return `<h2 class="about-author-title">About the Author</h2>\n${photo}<div class="author-bio">\n${bioHtml}\n</div>`;
}

function buildAlsoBy(authorName, books) {
  const items = books.map(b => {
    const year = b.year ? ` <span class="also-by-year">(${b.year})</span>` : '';
    return `    <li><em>${esc(b.title)}</em>${year}</li>`;
  });
  return `<h2 class="also-by-title">Also by ${esc(authorName || 'the author')}</h2>
<ul class="also-by-list">
${items.join('\n')}
</ul>`;
}
