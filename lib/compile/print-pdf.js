// Print PDF packager — produces a single HTML document that Paged.js
// paginates into print-ready pages, then (Story 4.4) Puppeteer renders
// to PDF via Chromium's print engine.
//
// Story 4.3 writes the HTML to output/compiled/<slug>-print-preview.html.
// Writers can open it in any browser to inspect pagination before the
// PDF step lands in Story 4.4. Paged.js auto-runs on page load and
// rewrites the body into paginated .pagedjs_page elements.
//
// The HTML is self-contained: theme CSS inlined in <style>, paged.js
// polyfill inlined in <script>. No external dependencies at render time.

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { stat } from 'fs/promises';
import pkg from 'fs-extra';
const { ensureDir, writeFile, readFile } = pkg;

const PAGED_POLYFILL_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'node_modules',
  'pagedjs',
  'dist',
  'paged.polyfill.min.js',
);

export async function packagePrintPdf(context) {
  if (!context.theme) {
    throw new Error('Print PDF packaging requires the theme phase to run first');
  }

  const { metadata } = context.assembly;
  const { theme } = context;

  if (!metadata?.title) {
    throw new Error('Cannot package print PDF: missing metadata.title');
  }

  // Assemble the full book HTML with paged.js scaffolding.
  const html = await buildPagedHtml({ metadata, theme });

  // Write to output/compiled/<slug>-print-preview.html.
  // Story 4.4 will add a <slug>-print-6x9.pdf file alongside this.
  const outputDir = resolve(context.projectPath, 'output', 'compiled');
  await ensureDir(outputDir);
  const outputPath = resolve(outputDir, sanitiseFilename(metadata.title) + '-print-preview.html');
  await writeFile(outputPath, html, 'utf-8');

  const { size } = await stat(outputPath);
  context.output = {
    path: outputPath,
    bytes: size,
    format: 'print-pdf-preview',
    // Still a stub from the POV of "produces a PDF" — Story 4.4 removes this.
    stub: true,
  };
  return context;
}

// ── private helpers ─────────────────────────────────────────────

async function buildPagedHtml({ metadata, theme }) {
  const pagedPolyfill = await readFile(PAGED_POLYFILL_PATH, 'utf-8');

  const sectionsHtml = [
    ...theme.frontMatter.map(item => renderSection(item, 'front-matter')),
    ...theme.chapters.map(item => renderSection(item, 'chapter')),
    ...theme.backMatter.map(item => renderSection(item, 'back-matter')),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="${escAttr(metadata.language || 'en')}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(metadata.title)}${metadata.author ? ' — ' + escHtml(metadata.author) : ''}</title>
  <style>
${theme.css}
  </style>
</head>
<body>
  <!-- Hidden marker element that string-set captures for the verso running header -->
  <span class="book-title-marker" aria-hidden="true">${escHtml(metadata.title)}</span>

${sectionsHtml}

  <script>
${pagedPolyfill}
  </script>
</body>
</html>
`;
}

function renderSection(item, kind) {
  const cls = kind; // 'front-matter' | 'chapter' | 'back-matter'
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

// Escape for use inside HTML text content
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Escape for use inside HTML attribute values
function escAttr(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Same filename logic as the EPUB packager — keeps outputs consistent
// when both EPUB and print-PDF exist side by side.
function sanitiseFilename(title) {
  return title
    .normalize('NFKD')
    .replace(/[^\w\s\-\u00C0-\u024F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'manuscript';
}
