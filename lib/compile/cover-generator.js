// Full-cover PDF generator.
//
// Produces a single-page PDF compositing back cover + spine + front cover
// at the correct physical dimensions for a given trim and bleed setting.
// Rendered by Chromium via Puppeteer (same engine as print-pdf.js).
//
// Layout (RTL reading order for print, but PDF is landscape):
//   [Back panel] [Spine] [Front panel]
//
// Inputs (from metadata + distribution config):
//   metadata.coverImage   — path to front cover image (JPEG / PNG / WebP)
//   metadata.title        — book title (spine + back)
//   metadata.author       — author name (spine + back)
//   metadata.description  — back cover blurb
//   metadata.publisher    — small print at bottom of back
//
// The spine uses the Book Style's display face via CSS custom properties
// so it inherits the same feel as the interior.

import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { stat } from 'fs/promises';
import pkg from 'fs-extra';
const { ensureDir, writeFile, pathExists } = pkg;
import { TRIMS, DEFAULT_TRIM } from './trims/index.js';
import { calculateSpineWidth, estimatePageCount, DEFAULT_PAPER_STOCK } from './spine-calculator.js';

const __dir = dirname(fileURLToPath(import.meta.url));

export async function generateCoverPdf({
  metadata,
  projectPath,
  outputDir,
  trimId = DEFAULT_TRIM,
  bleedIn = 0.125,
  paperStock = DEFAULT_PAPER_STOCK,
  estimatedPages = null,
  filenameSuffix = 'cover',
  themeCss = '',
}) {
  const trim = TRIMS[trimId] ?? TRIMS[DEFAULT_TRIM];

  // Resolve page count → spine width
  const pageCount = estimatedPages ?? estimatePageCount(10000);
  const spineWidth = calculateSpineWidth(pageCount, paperStock);

  // Physical panel dimensions (inches), before bleed
  const panelW = trim.widthIn;
  const panelH = trim.heightIn;

  // Total canvas with bleed
  const totalW = (panelW * 2 + spineWidth + bleedIn * 2);
  const totalH = panelH + bleedIn * 2;

  // Resolve cover image path
  const coverImagePath = metadata.coverImage
    ? resolve(projectPath, metadata.coverImage)
    : null;
  const hasCoverImage = coverImagePath && (await pathExists(coverImagePath));
  const coverImageUrl = hasCoverImage ? pathToFileURL(coverImagePath).href : null;

  await ensureDir(outputDir);
  const slug = sanitise(metadata.title || 'manuscript');
  const previewPath = resolve(outputDir, `${slug}-${filenameSuffix}-preview.html`);
  const pdfPath = resolve(outputDir, `${slug}-${filenameSuffix}.pdf`);

  const html = buildCoverHtml({
    metadata,
    totalW,
    totalH,
    panelW,
    panelH,
    spineWidth,
    bleedIn,
    coverImageUrl,
    themeCss,
  });

  await writeFile(previewPath, html, 'utf-8');
  await renderCoverPdf(previewPath, pdfPath, totalW, totalH);

  const { size } = await stat(pdfPath);
  return { path: pdfPath, bytes: size, spineWidth, pageCount, paperStock };
}

// ── HTML template ──────────────────────────────────────────────────

function buildCoverHtml({
  metadata,
  totalW, totalH,
  panelW, panelH,
  spineWidth,
  bleedIn,
  coverImageUrl,
  themeCss,
}) {
  const { title, author, publisher, description } = metadata;

  const frontBg = coverImageUrl
    ? `background-image: url('${coverImageUrl}'); background-size: cover; background-position: center;`
    : 'background: #1a1a2e;';

  const blurb = (description || '').slice(0, 600); // truncate for back cover
  const truncated = description && description.length > 600 ? blurb + '…' : blurb;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
/* Inherit Book Style custom properties for spine typography */
${themeCss}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page {
  size: ${px(totalW)}in ${px(totalH)}in;
  margin: 0;
}

body {
  width: ${px(totalW)}in;
  height: ${px(totalH)}in;
  display: flex;
  flex-direction: row;
  background: #fff;
  font-family: var(--nw-body-font, "Georgia", serif);
  overflow: hidden;
}

/* ── Back cover ── */
.back-panel {
  width: ${px(panelW + bleedIn)}in;
  height: ${px(totalH)}in;
  padding: ${px(bleedIn + 0.5)}in ${px(0.6)}in ${px(bleedIn + 0.5)}in ${px(bleedIn + 0.5)}in;
  background: #1a1a2e;
  color: #f0ede6;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.back-blurb {
  font-size: 0.5in;
  line-height: 1.55;
  text-indent: 0;
  margin: 0;
  flex: 1;
  overflow: hidden;
}

.back-author {
  font-size: 0.42in;
  font-style: italic;
  margin-top: 0.3in;
  text-indent: 0;
}

.back-publisher {
  font-size: 0.3in;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.6;
  margin-top: 0.2in;
  text-indent: 0;
}

/* ── Spine ── */
.spine-panel {
  width: ${px(spineWidth)}in;
  height: ${px(totalH)}in;
  background: #111827;
  color: #f0ede6;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: ${px(bleedIn + 0.25)}in ${px(Math.max(spineWidth * 0.15, 0.05))}in;
  gap: 0.1in;
}

.spine-title {
  font-size: ${px(Math.min(spineWidth * 0.35, 0.22))}in;
  font-weight: bold;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-indent: 0;
}

.spine-author {
  font-size: ${px(Math.min(spineWidth * 0.25, 0.16))}in;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-indent: 0;
  opacity: 0.8;
}

/* ── Front cover ── */
.front-panel {
  width: ${px(panelW + bleedIn)}in;
  height: ${px(totalH)}in;
  ${frontBg}
  overflow: hidden;
}

.front-panel .cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #f0ede6;
  padding: 0.5in;
  text-align: center;
}

.cover-placeholder-title {
  font-size: 0.7in;
  font-weight: bold;
  line-height: 1.15;
  margin-bottom: 0.3in;
  text-indent: 0;
}

.cover-placeholder-author {
  font-size: 0.4in;
  font-style: italic;
  text-indent: 0;
}
</style>
</head>
<body>

<div class="back-panel">
  ${truncated ? `<p class="back-blurb">${esc(truncated)}</p>` : '<p class="back-blurb"></p>'}
  ${author ? `<p class="back-author">${esc(author)}</p>` : ''}
  ${publisher ? `<p class="back-publisher">${esc(publisher)}</p>` : ''}
</div>

<div class="spine-panel">
  <span class="spine-title">${esc(title || 'Untitled')}</span>
  ${author ? `<span class="spine-author">${esc(author)}</span>` : ''}
</div>

<div class="front-panel">
  ${coverImageUrl
    ? ''
    : `<div class="cover-placeholder">
        <p class="cover-placeholder-title">${esc(title || 'Untitled')}</p>
        ${author ? `<p class="cover-placeholder-author">${esc(author)}</p>` : ''}
       </div>`}
</div>

</body>
</html>`;
}

// ── Puppeteer rendering ────────────────────────────────────────────

async function renderCoverPdf(htmlPath, pdfPath, totalWIn, totalHIn) {
  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: pdfPath,
      width: `${totalWIn}in`,
      height: `${totalHIn}in`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await browser.close();
  }
}

// ── Utilities ──────────────────────────────────────────────────────

function px(inches) {
  // Return rounded to 4 decimal places to avoid floating point noise in CSS
  return Math.round(inches * 10000) / 10000;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitise(title) {
  return title
    .normalize('NFKD')
    .replace(/[^\w\s\-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'manuscript';
}
