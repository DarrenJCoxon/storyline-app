// Framework Card renderer — Puppeteer → PDF + PNG
// Mirrors the print-pdf.js pattern: HTML on disk → browser → export.

import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { mkdir, writeFile, stat } from 'fs/promises';
import { buildFrameworkCardHtml } from './template.js';
import { validateFramework, hasFramework, extractFramework, PLACEHOLDER_FRAMEWORK } from './schema.js';

const RENDER_TIMEOUT_MS = 30_000;

export { hasFramework, extractFramework, validateFramework };

// Main entry point
// opts.framework — framework block (if omitted, extracted from state)
// opts.state     — project state (used for extraction + output slug)
// opts.projectDir — defaults to process.cwd()
// opts.demo      — use PLACEHOLDER_FRAMEWORK regardless of state
export async function renderFrameworkCard(opts = {}) {
  const { projectDir = process.cwd(), demo = false } = opts;

  let framework;

  if (demo) {
    framework = PLACEHOLDER_FRAMEWORK;
  } else if (opts.framework) {
    framework = opts.framework;
  } else if (opts.state) {
    framework = extractFramework(opts.state);
  }

  if (!framework) {
    return { skipped: true, reason: 'no-framework', message: 'No framework block found. Framework card skipped.' };
  }

  const errors = validateFramework(framework);
  if (errors.length > 0) {
    return { skipped: true, reason: 'invalid-framework', errors, message: `Framework invalid: ${errors.join('; ')}` };
  }

  const outputDir = resolve(projectDir, 'output', 'framework-card');
  await mkdir(outputDir, { recursive: true });

  const slug = sanitiseSlug(framework.title || 'framework');
  const htmlPath = resolve(outputDir, `${slug}-framework-card.html`);
  const pdfPath  = resolve(outputDir, `${slug}-framework-card.pdf`);
  const pngPath  = resolve(outputDir, `${slug}-framework-card.png`);

  const html = buildFrameworkCardHtml(framework);
  await writeFile(htmlPath, html, 'utf-8');

  await renderViaChrome({ htmlPath, pdfPath, pngPath });

  const [pdfStat, pngStat] = await Promise.all([stat(pdfPath), stat(pngPath)]);

  return {
    skipped: false,
    htmlPath,
    pdfPath,
    pngPath,
    pdfBytes: pdfStat.size,
    pngBytes: pngStat.size,
    framework: {
      title: framework.title,
      modelName: framework.modelName,
      principleCount: framework.principles.length,
    },
  };
}

// ── Puppeteer rendering ─────────────────────────────────────────────────────

async function renderViaChrome({ htmlPath, pdfPath, pngPath }) {
  const puppeteer = (await import('puppeteer')).default;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Letter size at 2× device pixel ratio for crisp PNG
    await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });

    await page.goto(pathToFileURL(htmlPath).href, {
      waitUntil: 'networkidle0',
      timeout: RENDER_TIMEOUT_MS,
    });

    // PDF export — match @page size (8.5in × 11in)
    await page.pdf({
      path: pdfPath,
      width: '8.5in',
      height: '11in',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    // PNG screenshot — same page dimensions
    await page.screenshot({
      path: pngPath,
      fullPage: false,
      clip: { x: 0, y: 0, width: 816, height: 1056 },
    });
  } finally {
    await browser.close();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitiseSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
