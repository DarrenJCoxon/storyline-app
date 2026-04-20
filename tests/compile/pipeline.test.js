// End-to-end compile pipeline test on the tiny-book fixture.
//
// This stops at the theme phase — we don't run the EPUB packager or
// Puppeteer PDF rendering in tests (slow, flaky on CI, and covered
// well by the unit tests for the individual phases). What we're
// proving here is that the glue works: raw markdown files on disk
// flow through assembly → preflight → markdown-to-html → theme and
// produce a coherent result with no surprises.

import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { assemble } from '../../lib/compile/assembler.js';
import { runPreflight } from '../../lib/compile/preflight.js';
import { markdownToHtml } from '../../lib/compile/markdown-to-html.js';
import { applyTheme } from '../../lib/compile/theme.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '..', 'fixtures', 'tiny-book');

async function runAllPhases(format = 'epub') {
  let ctx = { format, projectPath: FIXTURE };
  ctx = await assemble(ctx);
  ctx = await runPreflight(ctx);
  ctx = await markdownToHtml(ctx);
  ctx = await applyTheme(ctx);
  return ctx;
}

describe('compile pipeline — tiny-book fixture', () => {
  it('assembles two chapters + one front-matter item from disk', async () => {
    let ctx = { format: 'epub', projectPath: FIXTURE };
    ctx = await assemble(ctx);
    expect(ctx.assembly.chapters).toHaveLength(2);
    expect(ctx.assembly.frontMatter).toHaveLength(1);
    expect(ctx.assembly.backMatter).toHaveLength(0);
  });

  it('resolves chapter titles from the first # heading', async () => {
    let ctx = { format: 'epub', projectPath: FIXTURE };
    ctx = await assemble(ctx);
    expect(ctx.assembly.chapters[0].title).toBe('Chapter One');
    expect(ctx.assembly.chapters[1].title).toBe('Chapter Two');
  });

  it('sorts chapters alphabetically (ch01 before ch02)', async () => {
    let ctx = { format: 'epub', projectPath: FIXTURE };
    ctx = await assemble(ctx);
    expect(ctx.assembly.chapters[0].filename).toBe('ch01-opening.md');
    expect(ctx.assembly.chapters[1].filename).toBe('ch02-arrival.md');
  });

  it('resolves metadata via compile.config.json precedence over state.json', async () => {
    let ctx = { format: 'epub', projectPath: FIXTURE };
    ctx = await assemble(ctx);
    expect(ctx.assembly.metadata.title).toBe('The Tiny Book');
    expect(ctx.assembly.metadata.author).toBe('Jane Fixture');
    expect(ctx.assembly.metadata.genre).toBe('thriller');
    expect(ctx.assembly.metadata.identifier).toBe('urn:uuid:00000000-0000-0000-0000-000000000001');
  });

  it('passes preflight without blocking errors (warnings OK)', async () => {
    const ctx = await runAllPhases();
    expect(ctx.preflight.errors).toHaveLength(0);
    // Short manuscript, so LOW_WORD_COUNT warning is expected.
    expect(ctx.preflight.chapterCount).toBe(2);
    expect(ctx.preflight.wordCount).toBeGreaterThan(50);
  });

  it('renders chapter HTML with curly quotes, em-dashes, and scene break', async () => {
    const ctx = await runAllPhases();
    const ch1 = ctx.html.chapters[0].html;
    // fixture uses "I never told you the truth" — smart quotes required
    expect(ch1).toContain('\u201cI never told you');
    // --- must render as em-dash
    expect(ch1).toContain('\u2014');
    // scene break via ---
    expect(ch1).toContain('<hr class="scene-break" />');
  });

  it('marks the first paragraph of each chapter for drop caps', async () => {
    const ctx = await runAllPhases();
    for (const chapter of ctx.theme.chapters) {
      expect(chapter.html).toMatch(/<p class="first">/);
      const firstCount = (chapter.html.match(/<p class="first">/g) || []).length;
      expect(firstCount).toBe(1);
    }
  });

  it('tags theme output with section classes (front-matter, chapter)', async () => {
    const ctx = await runAllPhases();
    expect(ctx.theme.frontMatter[0].sectionClass).toBe('front-matter');
    expect(ctx.theme.chapters[0].sectionClass).toBe('chapter');
  });

  it('loads classic-serif theme with indented paragraphs by default', async () => {
    const ctx = await runAllPhases();
    expect(ctx.theme.id).toBe('classic-serif');
    expect(ctx.theme.paragraphStyle).toBe('indented');
  });

  it('produces a larger CSS bundle for print-pdf than epub', async () => {
    const epubCtx = await runAllPhases('epub');
    const printCtx = await runAllPhases('print-pdf');
    expect(printCtx.theme.css.length).toBeGreaterThan(epubCtx.theme.css.length);
  });

  it('renders the fixture table as HTML (Chapter Two uses a markdown table)', async () => {
    const ctx = await runAllPhases();
    const ch2 = ctx.html.chapters[1].html;
    expect(ch2).toContain('<table>');
    expect(ch2).toContain('<th>Clue</th>');
    expect(ch2).toContain('<td>Postmark</td>');
  });

  it('renders the fixture blockquote', async () => {
    const ctx = await runAllPhases();
    const ch2 = ctx.html.chapters[1].html;
    expect(ch2).toContain('<blockquote>');
  });
});
