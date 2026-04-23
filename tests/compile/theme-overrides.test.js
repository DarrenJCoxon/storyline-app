// Theme override system — Story 6.3.
//
// compile.config.json → themeOverrides lets writers customise body font,
// scene break ornament, chapter heading style without editing theme CSS.
// Each theme declares which overrides it honours via theme.json's
// `overridable[]` array. Unknown keys and unsupported keys surface as
// warnings on context.theme.overrideWarnings for preflight to display.
//
// Invariants locked here:
//   - Honoured overrides emit :root { --nw-* } variables the themes read
//   - Unknown keys warn (typos, old docs)
//   - Keys not in theme.overridable warn (theme declined this touchpoint)
//   - Invalid values (wrong type, unknown preset name) warn
//   - Overrides coexist with paragraphStyle=block

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { applyTheme } from '../../lib/compile/theme.js';

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

describe('themeOverrides — bodyFont', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-ov-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('emits --nw-body-font custom property when set', async () => {
    writeConfig(tmp, { theme: 'classic-serif', themeOverrides: { bodyFont: 'Palatino, Georgia, serif' } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.css).toMatch(/--nw-body-font:\s*Palatino, Georgia, serif/);
    expect(ctx.theme.overrideWarnings).toHaveLength(0);
  });

  it('no :root override block emitted when themeOverrides is empty', async () => {
    writeConfig(tmp, { theme: 'classic-serif' });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    // The theme CSS itself uses `var(--nw-body-font, fallback)` — that's
    // always present. What we want to assert is the :root override block
    // (where variables are SET, not just referenced) is absent.
    expect(ctx.theme.css).not.toContain('themeOverrides');
    expect(ctx.theme.css).not.toMatch(/:root\s*\{[^}]*--nw-body-font:/);
    expect(ctx.theme.overrideWarnings).toHaveLength(0);
  });

  it('theme fallback still works when override is absent (Classic Serif uses Georgia)', async () => {
    writeConfig(tmp, { theme: 'classic-serif' });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    // The theme CSS itself references var(--nw-body-font, Georgia, ...).
    expect(ctx.theme.css).toMatch(/var\(--nw-body-font,\s*Georgia/);
  });
});

describe('themeOverrides — sceneBreakOrnament', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-ov-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('emits --nw-scene-break-ornament with the literal string', async () => {
    writeConfig(tmp, { theme: 'classic-serif', themeOverrides: { sceneBreakOrnament: '§' } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.css).toMatch(/--nw-scene-break-ornament:\s*"§"/);
    expect(ctx.theme.overrideWarnings).toHaveLength(0);
  });

  it('escapes quotes in the ornament value', async () => {
    writeConfig(tmp, { theme: 'classic-serif', themeOverrides: { sceneBreakOrnament: 'a"b' } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.css).toMatch(/--nw-scene-break-ornament:\s*"a\\"b"/);
  });

  it('falls back to theme default ornament when override is absent', async () => {
    writeConfig(tmp, { theme: 'classic-serif' });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    // Classic Serif's CSS: var(--nw-scene-break-ornament, "* * *")
    expect(ctx.theme.css).toMatch(/var\(--nw-scene-break-ornament,\s*"\* \* \*"\)/);
  });
});

describe('themeOverrides — chapterHeadingStyle presets', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-ov-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('applies the "small-caps" preset (flips font-variant + letter-spacing)', async () => {
    writeConfig(tmp, { theme: 'classic-serif', themeOverrides: { chapterHeadingStyle: 'small-caps' } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.css).toMatch(/--nw-chapter-font-variant:\s*small-caps/);
    expect(ctx.theme.css).toMatch(/--nw-chapter-letter-spacing:\s*0\.15em/);
    expect(ctx.theme.css).toMatch(/--nw-chapter-text-align:\s*center/);
  });

  it('applies the "bold-left" preset', async () => {
    writeConfig(tmp, { theme: 'classic-serif', themeOverrides: { chapterHeadingStyle: 'bold-left' } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.css).toMatch(/--nw-chapter-font-weight:\s*700/);
    expect(ctx.theme.css).toMatch(/--nw-chapter-text-align:\s*left/);
  });

  it('applies the "italic-centred" preset (back to Classic Serif default)', async () => {
    writeConfig(tmp, { theme: 'classic-serif', themeOverrides: { chapterHeadingStyle: 'italic-centred' } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.css).toMatch(/--nw-chapter-font-style:\s*italic/);
    expect(ctx.theme.css).toMatch(/--nw-chapter-text-align:\s*center/);
  });

  it('applies the "uppercase" preset', async () => {
    writeConfig(tmp, { theme: 'classic-serif', themeOverrides: { chapterHeadingStyle: 'uppercase' } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.css).toMatch(/--nw-chapter-text-transform:\s*uppercase/);
  });

  it('warns on unknown preset name', async () => {
    writeConfig(tmp, { theme: 'classic-serif', themeOverrides: { chapterHeadingStyle: 'swirly' } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    // Story 6.5: chapterHeadingStyle is deprecated, so we get a deprecation
    // warning AND an invalid-preset warning (2 total).
    const invalidWarn = ctx.theme.overrideWarnings.find(w => w.type === 'invalid');
    expect(invalidWarn).toBeTruthy();
    expect(invalidWarn.key).toBe('chapterHeadingStyle');
    expect(invalidWarn.message).toContain('swirly');
    const deprecationWarn = ctx.theme.overrideWarnings.find(w => w.type === 'deprecation');
    expect(deprecationWarn).toBeTruthy();
  });
});

describe('themeOverrides — warnings', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-ov-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('warns "unknown" for a key not in the supported set', async () => {
    writeConfig(tmp, { theme: 'classic-serif', themeOverrides: { emojiAbundance: 'high' } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.overrideWarnings).toHaveLength(1);
    expect(ctx.theme.overrideWarnings[0].type).toBe('unknown');
    expect(ctx.theme.overrideWarnings[0].key).toBe('emojiAbundance');
  });

  it('warns "deprecation" when chapterHeadingStyle is used (Story 6.5)', async () => {
    // chapterHeadingStyle is deprecated as of Story 6.5 — the opener system
    // owns heading style now. It still applies for backwards compat but always
    // emits a deprecation warning regardless of theme.
    writeConfig(tmp, { theme: 'heritage', themeOverrides: { chapterHeadingStyle: 'bold-left' } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    const deprecationWarn = ctx.theme.overrideWarnings.find(w => w.type === 'deprecation');
    expect(deprecationWarn).toBeTruthy();
    expect(deprecationWarn.key).toBe('chapterHeadingStyle');
    expect(deprecationWarn.message).toContain('deprecated');
  });

  it('warns "invalid" when bodyFont is not a string', async () => {
    writeConfig(tmp, { theme: 'classic-serif', themeOverrides: { bodyFont: ['Palatino', 'Georgia'] } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.overrideWarnings).toHaveLength(1);
    expect(ctx.theme.overrideWarnings[0].type).toBe('invalid');
    expect(ctx.theme.overrideWarnings[0].key).toBe('bodyFont');
  });

  it('warns "invalid" when value is an empty string', async () => {
    writeConfig(tmp, { theme: 'classic-serif', themeOverrides: { sceneBreakOrnament: '   ' } });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.overrideWarnings[0].type).toBe('invalid');
  });

  it('collects multiple warnings from a mixed themeOverrides block', async () => {
    writeConfig(tmp, {
      theme: 'classic-serif',
      themeOverrides: {
        bodyFont: 'Palatino, serif',     // valid → applied
        chapterHeadingStyle: 'funky',    // invalid preset + deprecation → 2 warnings
        mystery: 'thing',                // unknown → warning
      },
    });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.css).toMatch(/--nw-body-font:\s*Palatino/);  // valid applied
    // Story 6.5: chapterHeadingStyle emits deprecation + invalid; mystery emits unknown
    const types = ctx.theme.overrideWarnings.map(w => w.type).sort();
    expect(types).toContain('invalid');
    expect(types).toContain('unknown');
    expect(types).toContain('deprecation');
  });
});

describe('themeOverrides — coexistence with paragraphStyle', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-ov-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('block paragraphStyle AND overrides both apply', async () => {
    writeConfig(tmp, {
      theme: 'classic-serif',
      paragraphStyle: 'block',
      themeOverrides: { bodyFont: 'Palatino, serif' },
    });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.paragraphStyle).toBe('block');
    expect(ctx.theme.css).toMatch(/--nw-body-font:\s*Palatino/);
    expect(ctx.theme.css).toContain('text-indent: 0');   // block override
  });
});

describe('themeOverrides — theme.json overridable declarations', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-ov-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('classic-serif honours bodyFont and sceneBreakOrnament without warnings', async () => {
    // Story 6.5: chapterHeadingStyle is deprecated; test non-deprecated keys only.
    writeConfig(tmp, {
      theme: 'classic-serif',
      themeOverrides: {
        bodyFont: 'Palatino, serif',
        sceneBreakOrnament: '§',
      },
    });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.overrideWarnings).toHaveLength(0);
  });

  it('classic-serif applies chapterHeadingStyle with a deprecation warning', async () => {
    writeConfig(tmp, {
      theme: 'classic-serif',
      themeOverrides: {
        bodyFont: 'Palatino, serif',
        sceneBreakOrnament: '§',
        chapterHeadingStyle: 'small-caps',
      },
    });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    // Only deprecation warning — preset still applied
    const types = ctx.theme.overrideWarnings.map(w => w.type);
    expect(types).toEqual(['deprecation']);
    expect(ctx.theme.css).toMatch(/--nw-chapter-font-variant:\s*small-caps/);
  });

  it('modern-sans honours bodyFont and sceneBreakOrnament without warnings', async () => {
    // Story 6.5: chapterHeadingStyle is deprecated; test non-deprecated keys only.
    writeConfig(tmp, {
      theme: 'modern-sans',
      themeOverrides: {
        bodyFont: 'Helvetica, sans-serif',
        sceneBreakOrnament: '***',
      },
    });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.overrideWarnings).toHaveLength(0);
  });

  it('modern-sans applies chapterHeadingStyle with a deprecation warning', async () => {
    writeConfig(tmp, {
      theme: 'modern-sans',
      themeOverrides: {
        bodyFont: 'Helvetica, sans-serif',
        sceneBreakOrnament: '***',
        chapterHeadingStyle: 'italic-centred',
      },
    });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    const types = ctx.theme.overrideWarnings.map(w => w.type);
    expect(types).toEqual(['deprecation']);
    expect(ctx.theme.css).toMatch(/--nw-chapter-font-style:\s*italic/);
  });

  it('heritage only honours bodyFont + sceneBreakOrnament (chapter style locked)', async () => {
    writeConfig(tmp, {
      theme: 'heritage',
      themeOverrides: {
        bodyFont: 'Garamond, serif',
        sceneBreakOrnament: '—',
      },
    });
    const ctx = await applyTheme(htmlContext({ projectPath: tmp }));
    expect(ctx.theme.overrideWarnings).toHaveLength(0);
  });
});
