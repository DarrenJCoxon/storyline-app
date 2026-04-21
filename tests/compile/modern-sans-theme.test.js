// Modern Sans theme — structural + regression tests.
//
// Purpose: lock the theme's distinctive design choices so an accidental
// CSS refactor doesn't silently regress it into "Classic Serif but with
// different fonts". The look-and-feel differences ARE the theme — they
// must not drift without intent.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'fs/promises';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { applyTheme } from '../../lib/compile/theme.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME_DIR = resolve(HERE, '..', '..', 'lib', 'compile', 'themes', 'modern-sans');

function htmlContext({ projectPath, chapters = ['<p>x</p>'], format = 'epub' }) {
  return {
    projectPath,
    format,
    html: {
      frontMatter: [],
      chapters: chapters.map((html, i) => ({ slug: `ch${i + 1}`, title: `Chapter ${i + 1}`, html })),
      backMatter: [],
    },
  };
}

async function loadWith(config) {
  const tmp = mkdtempSync(join(tmpdir(), 'nw-modern-'));
  writeFileSync(resolve(tmp, 'compile.config.json'), JSON.stringify(config));
  try {
    return await applyTheme(htmlContext({ projectPath: tmp, ...config._ctx }));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

describe('modern-sans theme — asset integrity', () => {
  it('ships theme.json with required metadata', async () => {
    const raw = await readFile(resolve(THEME_DIR, 'theme.json'), 'utf-8');
    const meta = JSON.parse(raw);
    expect(meta.id).toBe('modern-sans');
    expect(meta.name).toBe('Modern Sans');
    expect(meta.sceneBreakOrnament).toBeTruthy();
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('ships theme.css and theme-print-pdf.css', async () => {
    const epubCss = await readFile(resolve(THEME_DIR, 'theme.css'), 'utf-8');
    const printCss = await readFile(resolve(THEME_DIR, 'theme-print-pdf.css'), 'utf-8');
    expect(epubCss.length).toBeGreaterThan(500);
    expect(printCss.length).toBeGreaterThan(500);
  });
});

describe('modern-sans theme — distinctive design invariants', () => {
  it('loads via applyTheme without error', async () => {
    const ctx = await loadWith({ theme: 'modern-sans' });
    expect(ctx.theme.id).toBe('modern-sans');
  });

  it('uses a sans-serif body font stack (Inter / Helvetica / Arial)', async () => {
    const ctx = await loadWith({ theme: 'modern-sans' });
    // Must contain at least one canonical sans face; must NOT fall back
    // to Georgia / Times (those are Classic Serif's stack).
    expect(ctx.theme.css).toMatch(/Inter|Helvetica|Arial/);
    // Body rule specifically: sans-serif at some point in the stack
    expect(ctx.theme.css).toMatch(/font-family:[^;]*sans-serif/);
  });

  it('uses left-aligned bold chapter headings (not italic centred)', async () => {
    const ctx = await loadWith({ theme: 'modern-sans' });
    // A key design choice: Modern Sans chapter h1 is bold + left, not
    // italic + centred (Classic Serif's style).
    expect(ctx.theme.css).toMatch(/h1\s*\{[^}]*font-weight:\s*700/);
    expect(ctx.theme.css).toMatch(/h1\s*\{[^}]*text-align:\s*left/);
  });

  it('uses three-dot scene break ornament (not asterisks)', async () => {
    const ctx = await loadWith({ theme: 'modern-sans' });
    // The middle-dot escape \00B7 produces '·'. Must not fall back to '* * *'
    // which is Classic Serif's ornament.
    expect(ctx.theme.css).toMatch(/hr\.scene-break::before[\s\S]*?\\00B7/);
    // Negative: no asterisks in the scene-break content rule
    const sceneBlock = ctx.theme.css.match(/hr\.scene-break::before\s*\{[^}]*\}/);
    expect(sceneBlock).toBeTruthy();
    expect(sceneBlock[0]).not.toContain('* * *');
  });

  it('uses small-caps first-line instead of a drop cap', async () => {
    const ctx = await loadWith({ theme: 'modern-sans' });
    // Small-caps via ::first-line is the modern-sans idiom.
    expect(ctx.theme.css).toMatch(/p\.first::first-line\s*\{[^}]*font-variant:\s*small-caps/);
    // Negative: no ::first-letter float:left (that's a drop cap)
    const dropCap = ctx.theme.css.match(/p\.first::first-letter\s*\{[^}]*float:\s*left/);
    expect(dropCap).toBeNull();
  });

  it('omits the body-level justify (modern = ragged right)', async () => {
    const ctx = await loadWith({ theme: 'modern-sans' });
    // Find the body rule that sets text alignment (there's also a reset
    // body rule up top that only sets margin/padding — skip that).
    const bodyRules = [...ctx.theme.css.matchAll(/body\s*\{[^}]*\}/g)].map(m => m[0]);
    const bodyWithAlign = bodyRules.find(r => /text-align:/.test(r));
    expect(bodyWithAlign, 'no body rule sets text-align').toBeTruthy();
    expect(bodyWithAlign).toMatch(/text-align:\s*left/);
    expect(bodyWithAlign).not.toMatch(/text-align:\s*justify/);
  });
});

describe('modern-sans theme — print-pdf variant', () => {
  it('appends print-pdf CSS when format=print-pdf', async () => {
    const epub = await loadWith({ theme: 'modern-sans', _ctx: { format: 'epub' } });
    const print = await loadWith({ theme: 'modern-sans', _ctx: { format: 'print-pdf' } });
    expect(print.theme.css.length).toBeGreaterThan(epub.theme.css.length);
    expect(print.theme.css).toContain('print-pdf layer');
  });

  it('defines 6x9 @page sizing and running headers', async () => {
    const print = await loadWith({ theme: 'modern-sans', _ctx: { format: 'print-pdf' } });
    expect(print.theme.css).toMatch(/@page\s*\{[^}]*size:\s*6in\s+9in/);
    expect(print.theme.css).toMatch(/string\(book-title\)/);
    expect(print.theme.css).toMatch(/string\(chapter-title\)/);
  });

  it('running headers use sans-serif not serif', async () => {
    const print = await loadWith({ theme: 'modern-sans', _ctx: { format: 'print-pdf' } });
    // Inside the @top-left content rule, font-family must be Inter/Helvetica/etc.,
    // not Georgia. This tripped in an earlier theme copy-paste.
    const topLeft = print.theme.css.match(/@top-left\s*\{[^}]*\}/);
    expect(topLeft).toBeTruthy();
    expect(topLeft[0]).toMatch(/Inter|Helvetica|Arial/);
    expect(topLeft[0]).not.toMatch(/Georgia/);
  });

  it('uses uppercase running headers (distinctive modern treatment)', async () => {
    const print = await loadWith({ theme: 'modern-sans', _ctx: { format: 'print-pdf' } });
    // Modern-sans specifically uppercases + letter-spaces the verso/recto header.
    const topLeft = print.theme.css.match(/@top-left\s*\{[^}]*\}/);
    expect(topLeft[0]).toMatch(/text-transform:\s*uppercase/);
  });
});

describe('modern-sans theme — shared compile-pipeline integration', () => {
  it('still marks first <p> of each chapter with class="first"', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'nw-modern-'));
    writeFileSync(resolve(tmp, 'compile.config.json'), JSON.stringify({ theme: 'modern-sans' }));
    try {
      const ctx = await applyTheme(htmlContext({
        projectPath: tmp,
        chapters: ['<h1>Ch</h1>\n<p>First para.</p>\n<p>Second.</p>\n'],
      }));
      expect(ctx.theme.chapters[0].html).toContain('<p class="first">First para.</p>');
      expect(ctx.theme.chapters[0].html).toContain('<p>Second.</p>');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('honours paragraphStyle=block override just like classic-serif', async () => {
    const ctx = await loadWith({ theme: 'modern-sans', paragraphStyle: 'block' });
    expect(ctx.theme.paragraphStyle).toBe('block');
    expect(ctx.theme.css).toContain('text-indent: 0');
  });
});
