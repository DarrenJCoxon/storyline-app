// Theme phase tests.
//
// Three things matter here:
//   1. First-paragraph marking (drop-cap CSS hook) — the exact single-
//      replace used by markFirstParagraph could silently fail if markdown-it
//      ever changed to emit attributes on <p>.
//   2. Paragraph-style override — "block" must inject the override CSS,
//      "indented" must NOT (that's the theme's default; injecting would
//      duplicate rules).
//   3. Config resolution — missing config, corrupt config, and unknown
//      paragraph style all fall back cleanly.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { applyTheme } from '../../lib/compile/theme.js';

function htmlContext({ projectPath, chapters = [], format = 'epub' }) {
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

describe('applyTheme — first-paragraph marking', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-theme-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('marks the first <p> of each chapter with class="first first-paragraph"', async () => {
    const ctx = htmlContext({
      projectPath: tmp,
      chapters: [
        '<h1>Chapter One</h1>\n<p>First para.</p>\n<p>Second para.</p>\n',
        '<h1>Chapter Two</h1>\n<p>Only para.</p>\n',
      ],
    });
    const out = await applyTheme(ctx);
    // Story 6.5: first paragraph now gets both "first" and "first-paragraph" classes
    expect(out.theme.chapters[0].html).toContain('<p class="first first-paragraph">First para.</p>');
    expect(out.theme.chapters[0].html).toContain('<p>Second para.</p>');
    expect(out.theme.chapters[1].html).toContain('<p class="first first-paragraph">Only para.</p>');
  });

  it('only marks the first <p>, not every <p>', async () => {
    const ctx = htmlContext({
      projectPath: tmp,
      chapters: ['<p>A</p><p>B</p><p>C</p>'],
    });
    const out = await applyTheme(ctx);
    const html = out.theme.chapters[0].html;
    // Story 6.5: class is now "first first-paragraph"
    const matches = html.match(/<p class="first first-paragraph">/g) || [];
    expect(matches).toHaveLength(1);
  });
});

describe('applyTheme — paragraph style override', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-theme-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('injects block override CSS when paragraphStyle is "block"', async () => {
    writeFileSync(resolve(tmp, 'compile.config.json'), JSON.stringify({
      theme: 'classic-serif',
      paragraphStyle: 'block',
    }));
    const out = await applyTheme(htmlContext({ projectPath: tmp, chapters: ['<p>x</p>'] }));
    expect(out.theme.paragraphStyle).toBe('block');
    expect(out.theme.css).toContain('text-indent: 0');
    expect(out.theme.css).toContain('margin: 0 0 1em 0');
  });

  it('does NOT inject override CSS when paragraphStyle is "indented"', async () => {
    writeFileSync(resolve(tmp, 'compile.config.json'), JSON.stringify({
      theme: 'classic-serif',
      paragraphStyle: 'indented',
    }));
    const out = await applyTheme(htmlContext({ projectPath: tmp, chapters: ['<p>x</p>'] }));
    expect(out.theme.paragraphStyle).toBe('indented');
    expect(out.theme.css).not.toContain('paragraphStyle = "block"');
  });

  it('falls back to indented when config is absent', async () => {
    const out = await applyTheme(htmlContext({ projectPath: tmp, chapters: ['<p>x</p>'] }));
    expect(out.theme.paragraphStyle).toBe('indented');
  });

  it('falls back to indented when config is corrupt', async () => {
    writeFileSync(resolve(tmp, 'compile.config.json'), '{ not valid json');
    const out = await applyTheme(htmlContext({ projectPath: tmp, chapters: ['<p>x</p>'] }));
    expect(out.theme.paragraphStyle).toBe('indented');
  });

  it('falls back to indented when paragraphStyle is unknown', async () => {
    writeFileSync(resolve(tmp, 'compile.config.json'), JSON.stringify({
      paragraphStyle: 'double-spaced-rainbow',
    }));
    const out = await applyTheme(htmlContext({ projectPath: tmp, chapters: ['<p>x</p>'] }));
    expect(out.theme.paragraphStyle).toBe('indented');
  });
});

describe('applyTheme — theme loading', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-theme-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('loads classic-serif by default and exposes metadata', async () => {
    const out = await applyTheme(htmlContext({ projectPath: tmp, chapters: ['<p>x</p>'] }));
    expect(out.theme.id).toBe('classic-serif');
    expect(out.theme.css.length).toBeGreaterThan(100);
    expect(out.theme.meta).toBeTypeOf('object');
  });

  it('merges format-specific CSS when format=print-pdf', async () => {
    const epubOut = await applyTheme(htmlContext({ projectPath: tmp, format: 'epub', chapters: ['<p>x</p>'] }));
    const printOut = await applyTheme(htmlContext({ projectPath: tmp, format: 'print-pdf', chapters: ['<p>x</p>'] }));
    // theme-print-pdf.css is additive — print CSS must be longer than epub.
    expect(printOut.theme.css.length).toBeGreaterThan(epubOut.theme.css.length);
    expect(printOut.theme.css).toContain('print-pdf layer');
  });

  it('throws a helpful error when theme id does not exist', async () => {
    writeFileSync(resolve(tmp, 'compile.config.json'), JSON.stringify({ theme: 'no-such-theme' }));
    await expect(
      applyTheme(htmlContext({ projectPath: tmp, chapters: ['<p>x</p>'] })),
    ).rejects.toThrow(/no-such-theme/);
  });

  it('throws if HTML phase has not run', async () => {
    await expect(applyTheme({ projectPath: tmp })).rejects.toThrow(/HTML phase/);
  });
});

describe('applyTheme — section classes', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-theme-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('tags front-matter, chapter, and back-matter with section class', async () => {
    const ctx = {
      projectPath: tmp,
      format: 'epub',
      html: {
        frontMatter: [{ slug: 'title', html: '<h1>Title</h1>' }],
        chapters: [{ slug: 'ch1', html: '<p>hi</p>' }],
        backMatter: [{ slug: 'ack', html: '<p>thanks</p>' }],
      },
    };
    const out = await applyTheme(ctx);
    expect(out.theme.frontMatter[0].sectionClass).toBe('front-matter');
    expect(out.theme.chapters[0].sectionClass).toBe('chapter');
    expect(out.theme.backMatter[0].sectionClass).toBe('back-matter');
  });
});
