// Heritage theme — structural + regression tests.
//
// Same shape as modern-sans-theme.test.js — lock the design invariants
// that make Heritage *Heritage*, not Classic Serif with looser leading.

import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { applyTheme } from '../../lib/compile/theme.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME_DIR = resolve(HERE, '..', '..', 'lib', 'compile', 'themes', 'heritage');

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
  const tmp = mkdtempSync(join(tmpdir(), 'nw-heritage-'));
  writeFileSync(resolve(tmp, 'compile.config.json'), JSON.stringify(config));
  try {
    return await applyTheme(htmlContext({ projectPath: tmp, ...config._ctx }));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

describe('heritage theme — asset integrity', () => {
  it('ships theme.json with required metadata', async () => {
    const raw = await readFile(resolve(THEME_DIR, 'theme.json'), 'utf-8');
    const meta = JSON.parse(raw);
    expect(meta.id).toBe('heritage');
    expect(meta.name).toBe('Heritage');
    expect(meta.sceneBreakOrnament).toBe('\u2766');  // ❦
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('ships theme.css and theme-print-pdf.css', async () => {
    const epubCss = await readFile(resolve(THEME_DIR, 'theme.css'), 'utf-8');
    const printCss = await readFile(resolve(THEME_DIR, 'theme-print-pdf.css'), 'utf-8');
    expect(epubCss.length).toBeGreaterThan(500);
    expect(printCss.length).toBeGreaterThan(500);
  });
});

describe('heritage theme — distinctive design invariants', () => {
  it('loads via applyTheme without error', async () => {
    const ctx = await loadWith({ theme: 'heritage' });
    expect(ctx.theme.id).toBe('heritage');
  });

  it('uses an old-style serif body font (Iowan / Palatino / Garamond)', async () => {
    const ctx = await loadWith({ theme: 'heritage' });
    // Must use the old-style serif stack — not Georgia (Classic Serif) or
    // Inter (Modern Sans).
    expect(ctx.theme.css).toMatch(/Iowan Old Style|Palatino|Garamond/);
    const bodyRules = [...ctx.theme.css.matchAll(/body\s*\{[^}]*\}/g)].map(m => m[0]);
    const bodyWithFont = bodyRules.find(r => /font-family/.test(r));
    expect(bodyWithFont).toBeTruthy();
    expect(bodyWithFont).not.toMatch(/Georgia/);
    expect(bodyWithFont).not.toMatch(/\bInter\b/);
  });

  it('uses small-caps centred chapter headings', async () => {
    const ctx = await loadWith({ theme: 'heritage' });
    expect(ctx.theme.css).toMatch(/h1\s*\{[^}]*font-variant:\s*small-caps/);
    expect(ctx.theme.css).toMatch(/h1\s*\{[^}]*text-align:\s*center/);
    expect(ctx.theme.css).toMatch(/h1\s*\{[^}]*letter-spacing:\s*0\.1[0-9]*em/);
  });

  it('uses a fleuron (❦) scene break, not asterisks or middle dots', async () => {
    const ctx = await loadWith({ theme: 'heritage' });
    // CSS escape for ❦ (U+2766) is \2766
    expect(ctx.theme.css).toMatch(/hr\.scene-break::before[\s\S]*?\\2766/);
    const sceneBlock = ctx.theme.css.match(/hr\.scene-break::before\s*\{[^}]*\}/);
    expect(sceneBlock).toBeTruthy();
    expect(sceneBlock[0]).not.toContain('* * *');
    expect(sceneBlock[0]).not.toMatch(/\\00B7/);   // not Modern Sans's dots
  });

  it('uses a drop cap AND small-caps first line (combo treatment)', async () => {
    const ctx = await loadWith({ theme: 'heritage' });
    // Both must be present — this is Heritage's signature opening.
    expect(ctx.theme.css).toMatch(/p\.first::first-letter\s*\{[^}]*float:\s*left/);
    expect(ctx.theme.css).toMatch(/p\.first::first-line\s*\{[^}]*font-variant:\s*small-caps/);
  });

  it('applies small-caps first line to post-scene-break paragraphs too', async () => {
    const ctx = await loadWith({ theme: 'heritage' });
    // Heritage extends the small-caps opening treatment to every scene,
    // not just chapter starts. This is a distinctive trade-edition touch.
    expect(ctx.theme.css).toMatch(/hr\.scene-break \+ p::first-line\s*\{[^}]*font-variant:\s*small-caps/);
  });

  it('uses deeper first-line indent than Classic Serif', async () => {
    const ctx = await loadWith({ theme: 'heritage' });
    // Heritage indents 1.75em — literary trade convention.
    expect(ctx.theme.css).toMatch(/p\s*\{[^}]*text-indent:\s*1\.75em/);
  });

  it('uses justified body text (traditional, not ragged)', async () => {
    const ctx = await loadWith({ theme: 'heritage' });
    const bodyRules = [...ctx.theme.css.matchAll(/body\s*\{[^}]*\}/g)].map(m => m[0]);
    const bodyWithAlign = bodyRules.find(r => /text-align:/.test(r));
    expect(bodyWithAlign).toBeTruthy();
    expect(bodyWithAlign).toMatch(/text-align:\s*justify/);
  });
});

describe('heritage theme — print-pdf variant', () => {
  it('appends print-pdf CSS when format=print-pdf', async () => {
    const epub = await loadWith({ theme: 'heritage', _ctx: { format: 'epub' } });
    const print = await loadWith({ theme: 'heritage', _ctx: { format: 'print-pdf' } });
    expect(print.theme.css.length).toBeGreaterThan(epub.theme.css.length);
    expect(print.theme.css).toContain('print-pdf layer');
  });

  it('defines 6x9 @page sizing and running headers', async () => {
    const print = await loadWith({ theme: 'heritage', _ctx: { format: 'print-pdf' } });
    expect(print.theme.css).toMatch(/@page\s*\{[^}]*size:\s*6in\s+9in/);
    expect(print.theme.css).toMatch(/string\(book-title\)/);
    expect(print.theme.css).toMatch(/string\(chapter-title\)/);
  });

  it('uses more generous margins than Classic Serif / Modern Sans', async () => {
    const print = await loadWith({ theme: 'heritage', _ctx: { format: 'print-pdf' } });
    // Heritage's inside margin is 1in (vs 0.875in for the other themes).
    expect(print.theme.css).toMatch(/@page\s*\{[^}]*margin-inside:\s*1in/);
    expect(print.theme.css).toMatch(/@page\s*\{[^}]*margin-outside:\s*0\.75in/);
  });

  it('running headers use small-caps treatment', async () => {
    const print = await loadWith({ theme: 'heritage', _ctx: { format: 'print-pdf' } });
    const topLeft = print.theme.css.match(/@top-left\s*\{[^}]*\}/);
    expect(topLeft).toBeTruthy();
    expect(topLeft[0]).toMatch(/font-variant:\s*small-caps/);
    // Not uppercase (that's Modern Sans's treatment) — Heritage is always
    // small-caps with letter-spacing.
    expect(topLeft[0]).not.toMatch(/text-transform:\s*uppercase/);
  });

  it('scales up the drop cap for print (4.8em at 11pt body)', async () => {
    const print = await loadWith({ theme: 'heritage', _ctx: { format: 'print-pdf' } });
    // There are two ::first-letter rules (EPUB + print override).
    // Find the one that sets a larger font-size.
    const matches = [...print.theme.css.matchAll(/p\.first::first-letter\s*\{[^}]*\}/g)].map(m => m[0]);
    const printOverride = matches.find(r => /4\.[5-9]em/.test(r));
    expect(printOverride, 'print drop cap rule missing').toBeTruthy();
  });
});

describe('heritage theme — shared compile-pipeline integration', () => {
  it('still marks first <p> of each chapter with class="first"', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'nw-heritage-'));
    writeFileSync(resolve(tmp, 'compile.config.json'), JSON.stringify({ theme: 'heritage' }));
    try {
      const ctx = await applyTheme(htmlContext({
        projectPath: tmp,
        chapters: ['<h1>Ch</h1>\n<p>First para.</p>\n<p>Second.</p>\n'],
      }));
      // Story 6.5: class is now "first first-paragraph" (first kept for drop-cap compat)
      expect(ctx.theme.chapters[0].html).toContain('<p class="first first-paragraph">First para.</p>');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('honours paragraphStyle=block override just like the other themes', async () => {
    const ctx = await loadWith({ theme: 'heritage', paragraphStyle: 'block' });
    expect(ctx.theme.paragraphStyle).toBe('block');
    expect(ctx.theme.css).toContain('text-indent: 0');
  });
});
