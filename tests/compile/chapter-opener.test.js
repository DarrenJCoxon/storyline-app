// Chapter opener infrastructure tests — Story 6.5.
//
// Covers:
//   1. markChapterOpenerMarkup — HTML tagging (first <h2>, first <p>)
//   2. Opener loading — valid opener appends CSS to context.theme.css
//   3. Default opener — uses theme.json defaultOpener when config omits chapterOpener
//   4. Invalid/missing opener — warning collected, compile continues
//   5. chapterHeadingStyle deprecation — warning includes "deprecated" text

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { applyTheme } from '../../lib/compile/theme.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OPENERS_DIR = resolve(HERE, '..', '..', 'lib', 'compile', 'chapter-openers');

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

function writeConfig(dir, config) {
  writeFileSync(resolve(dir, 'compile.config.json'), JSON.stringify(config, null, 2));
}

// Create a fake opener directory with opener.css for testing.
function createFakeOpener(openerId, css, { formatCss, format } = {}) {
  const openerDir = resolve(OPENERS_DIR, openerId);
  mkdirSync(openerDir, { recursive: true });
  writeFileSync(resolve(openerDir, 'opener.css'), css);
  if (formatCss && format) {
    writeFileSync(resolve(openerDir, `opener-${format}.css`), formatCss);
  }
  return openerDir;
}

// Remove a fake opener directory after the test.
function removeFakeOpener(openerId) {
  const openerDir = resolve(OPENERS_DIR, openerId);
  try { rmSync(openerDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ── markChapterOpenerMarkup ──────────────────────────────────────────────────

describe('markChapterOpenerMarkup — HTML tagging', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-opener-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('tags the first <p> with class="first first-paragraph"', async () => {
    const ctx = htmlContext({
      projectPath: tmp,
      chapters: ['<h1>Ch</h1>\n<p>First para.</p>\n<p>Second para.</p>\n'],
    });
    const out = await applyTheme(ctx);
    expect(out.theme.chapters[0].html).toContain('<p class="first first-paragraph">First para.</p>');
    expect(out.theme.chapters[0].html).toContain('<p>Second para.</p>');
  });

  it('only marks the first <p>, not every <p>', async () => {
    const ctx = htmlContext({
      projectPath: tmp,
      chapters: ['<p>A</p><p>B</p><p>C</p>'],
    });
    const out = await applyTheme(ctx);
    const html = out.theme.chapters[0].html;
    const firstMatches = html.match(/<p class="first first-paragraph">/g) || [];
    expect(firstMatches).toHaveLength(1);
    // Two plain <p> remain
    const plainMatches = html.match(/<p>/g) || [];
    expect(plainMatches).toHaveLength(2);
  });

  it('tags the first <h2> with class="first-section"', async () => {
    const ctx = htmlContext({
      projectPath: tmp,
      chapters: ['<h1>Ch</h1>\n<h2>Section A</h2>\n<p>Para.</p>\n<h2>Section B</h2>\n'],
    });
    const out = await applyTheme(ctx);
    const html = out.theme.chapters[0].html;
    expect(html).toContain('<h2 class="first-section">Section A</h2>');
    // Second h2 must NOT get the class
    expect(html).toContain('<h2>Section B</h2>');
  });

  it('only marks the first <h2>, not subsequent ones', async () => {
    const ctx = htmlContext({
      projectPath: tmp,
      chapters: ['<h2>A</h2><h2>B</h2><h2>C</h2>'],
    });
    const out = await applyTheme(ctx);
    const html = out.theme.chapters[0].html;
    const sectionMatches = html.match(/<h2 class="first-section">/g) || [];
    expect(sectionMatches).toHaveLength(1);
    const plainH2 = html.match(/<h2>/g) || [];
    expect(plainH2).toHaveLength(2);
  });

  it('still marks first <p> even when no <h2> is present', async () => {
    const ctx = htmlContext({
      projectPath: tmp,
      chapters: ['<h1>Ch</h1>\n<p>Only para.</p>\n'],
    });
    const out = await applyTheme(ctx);
    expect(out.theme.chapters[0].html).toContain('<p class="first first-paragraph">Only para.</p>');
  });

  it('retains the "first" class for backwards compat with existing drop-cap CSS rules', async () => {
    const ctx = htmlContext({
      projectPath: tmp,
      chapters: ['<p>Para.</p>'],
    });
    const out = await applyTheme(ctx);
    expect(out.theme.chapters[0].html).toContain('class="first first-paragraph"');
  });
});

// ── Opener loading ───────────────────────────────────────────────────────────

describe('chapterOpener — valid opener loading', () => {
  let tmp;
  const TEST_OPENER_ID = '__test-opener-valid__';

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'nw-opener-'));
    createFakeOpener(TEST_OPENER_ID, '/* test opener base css */');
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    removeFakeOpener(TEST_OPENER_ID);
  });

  it('appends opener CSS to context.theme.css when chapterOpener is set', async () => {
    writeConfig(tmp, { theme: 'classic-serif', chapterOpener: TEST_OPENER_ID });
    const out = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(out.theme.css).toContain('/* test opener base css */');
    expect(out.theme.overrideWarnings).toHaveLength(0);
  });

  it('stores openerId on context.theme', async () => {
    writeConfig(tmp, { theme: 'classic-serif', chapterOpener: TEST_OPENER_ID });
    const out = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(out.theme.openerId).toBe(TEST_OPENER_ID);
  });

  it('opener CSS comes after theme CSS + override CSS in effectiveCss', async () => {
    writeConfig(tmp, { theme: 'classic-serif', chapterOpener: TEST_OPENER_ID });
    const out = await applyTheme(htmlContext({ projectPath: tmp }));
    const css = out.theme.css;
    // The theme CSS will contain something from classic-serif; opener CSS comes after
    const openerIdx = css.indexOf('/* test opener base css */');
    expect(openerIdx).toBeGreaterThan(100); // sanity: theme CSS came first
  });

  it('loads format-specific opener CSS when opener-<format>.css exists', async () => {
    removeFakeOpener(TEST_OPENER_ID);
    createFakeOpener(TEST_OPENER_ID, '/* base */', {
      formatCss: '/* print layer */',
      format: 'print-pdf',
    });
    writeConfig(tmp, { theme: 'classic-serif', chapterOpener: TEST_OPENER_ID });
    const out = await applyTheme(htmlContext({ projectPath: tmp, format: 'print-pdf' }));
    expect(out.theme.css).toContain('/* base */');
    expect(out.theme.css).toContain('/* print layer */');
  });
});

// ── Default opener from theme.json ───────────────────────────────────────────

describe('chapterOpener — default opener from theme.json', () => {
  let tmp;
  // We use 'edgewood' — the classic-serif default. It may or may not have
  // actual CSS yet (another agent populates it), so we just verify openerId
  // is set correctly. We do NOT assert CSS content since it may not exist yet.
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-opener-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('uses theme defaultOpener when chapterOpener is not in config', async () => {
    writeConfig(tmp, { theme: 'classic-serif' });
    const out = await applyTheme(htmlContext({ projectPath: tmp }));
    // classic-serif defaultOpener is "edgewood"
    expect(out.theme.openerId).toBe('edgewood');
  });

  it('modern-sans defaults to meridian opener', async () => {
    writeConfig(tmp, { theme: 'modern-sans' });
    const out = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(out.theme.openerId).toBe('meridian');
  });

  it('heritage defaults to hawthorn opener', async () => {
    writeConfig(tmp, { theme: 'heritage' });
    const out = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(out.theme.openerId).toBe('hawthorn');
  });

  it('explicit chapterOpener in config overrides theme defaultOpener', async () => {
    // Use a non-existent opener to test override without real CSS dependency
    writeConfig(tmp, { theme: 'classic-serif', chapterOpener: 'meridian' });
    const out = await applyTheme(htmlContext({ projectPath: tmp }));
    // openerId should be 'meridian' regardless of classic-serif's default
    expect(out.theme.openerId).toBe('meridian');
  });
});

// ── Invalid / missing opener ─────────────────────────────────────────────────

describe('chapterOpener — invalid or missing opener', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-opener-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('warns when opener directory does not exist and still compiles', async () => {
    writeConfig(tmp, { theme: 'classic-serif', chapterOpener: 'no-such-opener-xyz' });
    const out = await applyTheme(htmlContext({ projectPath: tmp }));
    const warnings = out.theme.overrideWarnings;
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    const openerWarn = warnings.find(w => w.type === 'opener-not-found');
    expect(openerWarn).toBeTruthy();
    expect(openerWarn.message).toContain('no-such-opener-xyz');
  });

  it('does NOT throw when opener is missing — compile continues', async () => {
    writeConfig(tmp, { theme: 'classic-serif', chapterOpener: 'no-such-opener-xyz' });
    await expect(
      applyTheme(htmlContext({ projectPath: tmp })),
    ).resolves.toBeTruthy();
  });

  it('emits no opener CSS when opener is missing', async () => {
    writeConfig(tmp, { theme: 'classic-serif', chapterOpener: 'no-such-opener-xyz' });
    const out = await applyTheme(htmlContext({ projectPath: tmp }));
    // opener CSS block marker should not be present
    expect(out.theme.css).not.toContain('chapter-opener: no-such-opener-xyz');
  });

  it('warns when opener dir exists but opener.css is absent', async () => {
    const bareId = '__test-opener-no-css__';
    const openerDir = resolve(OPENERS_DIR, bareId);
    mkdirSync(openerDir, { recursive: true });
    // Do NOT write opener.css
    try {
      writeConfig(tmp, { theme: 'classic-serif', chapterOpener: bareId });
      const out = await applyTheme(htmlContext({ projectPath: tmp }));
      const openerWarn = out.theme.overrideWarnings.find(w => w.type === 'opener-not-found');
      expect(openerWarn).toBeTruthy();
      expect(openerWarn.message).toContain('opener.css');
    } finally {
      rmSync(openerDir, { recursive: true, force: true });
    }
  });
});

// ── chapterHeadingStyle deprecation ─────────────────────────────────────────

describe('chapterHeadingStyle — deprecation warning', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-opener-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('includes "deprecated" text in the warning message when chapterHeadingStyle is used', async () => {
    writeConfig(tmp, {
      theme: 'classic-serif',
      themeOverrides: { chapterHeadingStyle: 'small-caps' },
    });
    const out = await applyTheme(htmlContext({ projectPath: tmp }));
    const deprecationWarn = out.theme.overrideWarnings.find(
      w => w.type === 'deprecation' && w.key === 'chapterHeadingStyle',
    );
    expect(deprecationWarn).toBeTruthy();
    expect(deprecationWarn.message).toContain('deprecated');
    expect(deprecationWarn.message).toContain('chapterOpener');
  });

  it('still applies chapterHeadingStyle preset despite deprecation (backwards compat)', async () => {
    writeConfig(tmp, {
      theme: 'classic-serif',
      themeOverrides: { chapterHeadingStyle: 'small-caps' },
    });
    const out = await applyTheme(htmlContext({ projectPath: tmp }));
    // The preset CSS should still be emitted
    expect(out.theme.css).toMatch(/--nw-chapter-font-variant:\s*small-caps/);
  });

  it('deprecation warning fires even for a valid preset name', async () => {
    for (const preset of ['italic-centred', 'bold-left', 'small-caps', 'uppercase']) {
      writeConfig(tmp, {
        theme: 'classic-serif',
        themeOverrides: { chapterHeadingStyle: preset },
      });
      const out = await applyTheme(htmlContext({ projectPath: tmp }));
      const hasDeprecation = out.theme.overrideWarnings.some(
        w => w.type === 'deprecation' && w.key === 'chapterHeadingStyle',
      );
      expect(hasDeprecation, `Expected deprecation for preset "${preset}"`).toBe(true);
    }
  });
});
