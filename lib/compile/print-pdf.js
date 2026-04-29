// Print PDF packager — produces a press-ready PDF at the requested trim.
//
// Pipeline:
//   1. Assemble a self-contained HTML document (trim CSS + theme CSS +
//      paged.js polyfill + all book sections). Trim CSS owns @page size
//      and margins; theme CSS layers running-header typography on top.
//      Written to disk as <slug>-print-preview.html so writers can
//      inspect pagination.
//   2. Launch Puppeteer (headless Chrome from ~/.cache/puppeteer).
//   3. Navigate to the HTML via file:// URL. Paged.js auto-runs on
//      load and rewrites the body into paginated .pagedjs_page elements.
//   4. Wait for pagination to complete (window.PagedPolyfill.ready
//      promise, with a polling fallback + 60s hard timeout).
//   5. Call page.pdf({ preferCSSPageSize: true }) so Chromium uses the
//      @page size from the trim CSS.
//   6. Save to <slug>-print-<trim>.pdf.

import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { stat } from 'fs/promises';
import pkg from 'fs-extra';
const { ensureDir, writeFile, readFile } = pkg;
import { TRIMS, DEFAULT_TRIM, resolveTrimCssPath, isValidTrim } from './trims/index.js';

const PAGED_POLYFILL_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'node_modules',
  'pagedjs',
  'dist',
  'paged.polyfill.min.js',
);

// Max time we'll wait for Paged.js to finish pagination. A 300-page book
// takes 10-20 seconds on modern hardware; 60s gives headroom.
const PAGED_RENDER_TIMEOUT_MS = 60_000;

export async function packagePrintPdf(context) {
  if (!context.theme) {
    throw new Error('Print PDF packaging requires the theme phase to run first');
  }

  const { metadata } = context.assembly;
  const { theme } = context;

  if (!metadata?.title) {
    throw new Error('Cannot package print PDF: missing metadata.title');
  }

  // Resolve trim. Fall back to the default trade trim if the writer's
  // compile.config.json predates this feature.
  const trimId = context.trim && isValidTrim(context.trim) ? context.trim : DEFAULT_TRIM;
  const trim = TRIMS[trimId];
  const trimCss = await readFile(resolveTrimCssPath(trimId), 'utf-8');

  const outputDir = resolve(context.projectPath, 'output', 'compiled');
  await ensureDir(outputDir);
  const slug = sanitiseFilename(metadata.title);
  const previewHtmlPath = resolve(outputDir, `${slug}-print-preview.html`);
  const pdfPath = resolve(outputDir, `${slug}-print-${trim.fileSlug}.pdf`);

  // 1. Build and write the preview HTML (kept on disk for inspection).
  const html = await buildPagedHtml({ metadata, theme, trimCss });
  await writeFile(previewHtmlPath, html, 'utf-8');

  // 2-6. Render to PDF via Puppeteer + Paged.js.
  await renderPdf({ previewHtmlPath, pdfPath });

  const { size } = await stat(pdfPath);
  context.output = {
    path: pdfPath,
    previewPath: previewHtmlPath,
    bytes: size,
    format: 'print-pdf',
    trim: trimId,
  };
  return context;
}

// ── Puppeteer rendering ─────────────────────────────────────────

async function renderPdf({ previewHtmlPath, pdfPath }) {
  // Dynamic import so users who only compile to EPUB don't pay the
  // puppeteer startup cost or error out if Chromium isn't installed.
  const puppeteer = (await import('puppeteer')).default;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Silence console noise from paged.js unless we hit an error.
    page.on('pageerror', err => {
      // Re-throw by rejecting below via an error capture
      lastPageError = err;
    });
    let lastPageError = null;

    await page.goto(pathToFileURL(previewHtmlPath).href, {
      waitUntil: 'load',
      timeout: PAGED_RENDER_TIMEOUT_MS,
    });

    // Wait for Paged.js to finish pagination. Primary signal: the
    // PagedPolyfill instance's `ready` promise (resolves when all pages
    // have been laid out). Fallback: poll for .pagedjs_pages element.
    await page.evaluate((timeout) => {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Paged.js render timed out')), timeout);

        const done = () => { clearTimeout(t); resolve(); };

        if (window.PagedPolyfill && window.PagedPolyfill.ready && typeof window.PagedPolyfill.ready.then === 'function') {
          window.PagedPolyfill.ready.then(done).catch(err => { clearTimeout(t); reject(err); });
          return;
        }

        // Fallback: poll for the paginated output element.
        const poll = setInterval(() => {
          const pages = document.querySelector('.pagedjs_pages');
          if (pages && pages.children.length > 0) {
            clearInterval(poll);
            // Small settle delay so last-page layout completes.
            setTimeout(done, 500);
          }
        }, 150);
      });
    }, PAGED_RENDER_TIMEOUT_MS);

    if (lastPageError) {
      throw new Error(`Paged.js error: ${lastPageError.message}`);
    }

    await page.pdf({
      path: pdfPath,
      preferCSSPageSize: true,   // use @page size from the trim CSS layer
      printBackground: true,     // retain background colours / borders
      displayHeaderFooter: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },  // margins are in @page rules
    });
  } finally {
    await browser.close();
  }
}

// ── HTML assembly (unchanged from Story 4.3) ────────────────────

async function buildPagedHtml({ metadata, theme, trimCss }) {
  const pagedPolyfill = await readFile(PAGED_POLYFILL_PATH, 'utf-8');

  const sectionsHtml = [
    ...theme.frontMatter.map(item => renderSection(item, 'front-matter')),
    ...theme.chapters.map(item => renderSection(item, 'chapter')),
    ...theme.backMatter.map(item => renderSection(item, 'back-matter')),
  ].join('\n');

  // The first chapter gets an extra `first-chapter` class so the theme's
  // counter-reset rule can target it. `:first-of-type` would pick the first
  // <section> regardless of class, which is wrong when front matter comes
  // first — `.first-chapter` is unambiguous.
  const chaptersHtml = theme.chapters
    .map((item, i) => renderSection(item, i === 0 ? 'chapter first-chapter' : 'chapter'))
    .join('\n');
  const frontHtml = theme.frontMatter.map(item => renderSection(item, 'front-matter')).join('\n');
  const backHtml = theme.backMatter.map(item => renderSection(item, 'back-matter')).join('\n');

  // Hidden marker element for the verso running header. Paged.js reads
  // book-title via `string-set: book-title content()` on this element —
  // more reliable than setting a static string via `string-set:
  // book-title "literal"` on body, which doesn't fire consistently.
  // Styled invisible in theme-print-pdf.css (height: 0, visibility: hidden).
  const bookTitleMarker = `  <div class="book-title-marker" aria-hidden="true">${escHtml(metadata.title)}</div>`;

  return `<!DOCTYPE html>
<html lang="${escAttr(metadata.language || 'en')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(metadata.title)}${metadata.author ? ' — ' + escHtml(metadata.author) : ''}</title>
  <style>
/* ── Trim layer (page size + margins) ───────────────────────────── */
${trimCss}
/* ── Theme layer (typography + running headers) ─────────────────── */
${theme.css}
  </style>
</head>
<body>
${bookTitleMarker}
${frontHtml}
${chaptersHtml}
${backHtml}

  <script>
${pagedPolyfill}
  </script>
</body>
</html>
`;
}

function renderSection(item, kind) {
  const cls = kind;
  return `  <section class="${cls}" id="${escAttr(item.id)}">
${indentHtml(item.html, 4)}
  </section>`;
}

function indentHtml(html, spaces) {
  const indent = ' '.repeat(spaces);
  return html
    .split('\n')
    .map(line => (line.trim() ? indent + line : line))
    .join('\n');
}

function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escAttr(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitiseFilename(title) {
  return title
    .normalize('NFKD')
    .replace(/[^\w\s\-\u00C0-\u024F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'manuscript';
}
