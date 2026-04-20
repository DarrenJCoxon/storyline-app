// Preflight tests — the last line of defence before we ship a
// broken EPUB. Errors here must block the compile; warnings must
// surface but not block. Changing these thresholds without updating
// the roadmap / docs is almost always a mistake.

import { describe, it, expect } from 'vitest';
import { runPreflight } from '../../lib/compile/preflight.js';

function makeChapter(body) {
  return { slug: 'ch', title: 'Ch', body };
}

function repeat(text, times) {
  return Array(times).fill(text).join(' ');
}

function makeContext({
  chapters = [makeChapter(repeat('word', 1000))],
  frontMatter = [{ slug: 'title', body: '# Title' }],
  backMatter = [],
  metadata = {
    title: 'The Tiny Book',
    author: 'Jane Fixture',
    identifier: 'urn:uuid:xxx',
    isbn: null,
    genre: 'thriller',
  },
  format = 'epub',
} = {}) {
  return {
    format,
    assembly: {
      manuscriptPath: 'manuscript',
      metadata,
      chapters,
      frontMatter,
      backMatter,
    },
  };
}

const codesOf = list => list.map(item => item.code);

describe('runPreflight — structural gates', () => {
  it('throws if assembly has not run', async () => {
    await expect(runPreflight({})).rejects.toThrow(/assembly phase/);
  });

  it('fails with NO_CHAPTERS error when manuscript is empty', async () => {
    const ctx = await runPreflight(makeContext({ chapters: [] }));
    expect(codesOf(ctx.preflight.errors)).toContain('NO_CHAPTERS');
  });

  it('warns on NO_FRONT_MATTER when front matter is empty', async () => {
    const ctx = await runPreflight(makeContext({ frontMatter: [] }));
    expect(codesOf(ctx.preflight.warnings)).toContain('NO_FRONT_MATTER');
  });

  it('passes cleanly with chapters + front matter + author + identifier', async () => {
    const ctx = await runPreflight(makeContext());
    expect(ctx.preflight.errors).toHaveLength(0);
    // Word count is 1000; thriller min is 70000 so LOW_WORD_COUNT IS expected.
    expect(codesOf(ctx.preflight.warnings)).toContain('LOW_WORD_COUNT');
  });
});

describe('runPreflight — metadata warnings', () => {
  it('warns NO_TITLE when title is empty or "Untitled"', async () => {
    const missingTitle = await runPreflight(makeContext({
      metadata: { title: null, author: 'A', identifier: 'id', genre: 'thriller' },
    }));
    expect(codesOf(missingTitle.preflight.warnings)).toContain('NO_TITLE');

    const literalUntitled = await runPreflight(makeContext({
      metadata: { title: 'Untitled', author: 'A', identifier: 'id', genre: 'thriller' },
    }));
    expect(codesOf(literalUntitled.preflight.warnings)).toContain('NO_TITLE');
  });

  it('warns NO_AUTHOR when author is missing', async () => {
    const ctx = await runPreflight(makeContext({
      metadata: { title: 'T', author: null, identifier: 'id', genre: 'thriller' },
    }));
    expect(codesOf(ctx.preflight.warnings)).toContain('NO_AUTHOR');
  });

  it('warns NO_IDENTIFIER for EPUB but NOT for print-pdf', async () => {
    const epub = await runPreflight(makeContext({
      format: 'epub',
      metadata: { title: 'T', author: 'A', identifier: null, genre: 'thriller' },
    }));
    expect(codesOf(epub.preflight.warnings)).toContain('NO_IDENTIFIER');

    const print = await runPreflight(makeContext({
      format: 'print-pdf',
      metadata: { title: 'T', author: 'A', identifier: null, genre: 'thriller' },
    }));
    expect(codesOf(print.preflight.warnings)).not.toContain('NO_IDENTIFIER');
  });

  it('warns NO_ISBN when isbn is missing', async () => {
    const ctx = await runPreflight(makeContext({
      metadata: { title: 'T', author: 'A', identifier: 'id', isbn: null, genre: 'thriller' },
    }));
    expect(codesOf(ctx.preflight.warnings)).toContain('NO_ISBN');
  });
});

describe('runPreflight — word count guardrails', () => {
  it('warns LOW_WORD_COUNT when below the genre minimum', async () => {
    const ctx = await runPreflight(makeContext({
      chapters: [makeChapter(repeat('word', 1000))], // 1k words, thriller min is 70k
      metadata: { title: 'T', author: 'A', identifier: 'id', genre: 'thriller' },
    }));
    expect(codesOf(ctx.preflight.warnings)).toContain('LOW_WORD_COUNT');
  });

  it('warns VERY_SHORT_MANUSCRIPT when under 500 words AND no known genre', async () => {
    const ctx = await runPreflight(makeContext({
      chapters: [makeChapter(repeat('word', 50))],
      metadata: { title: 'T', author: 'A', identifier: 'id', genre: 'not-a-real-genre' },
    }));
    expect(codesOf(ctx.preflight.warnings)).toContain('VERY_SHORT_MANUSCRIPT');
  });

  it('exposes wordCount and chapterCount on the preflight result', async () => {
    const ctx = await runPreflight(makeContext({
      chapters: [
        makeChapter(repeat('word', 100)),
        makeChapter(repeat('word', 200)),
      ],
    }));
    expect(ctx.preflight.wordCount).toBe(300);
    expect(ctx.preflight.chapterCount).toBe(2);
  });
});

describe('runPreflight — print-pdf specific checks', () => {
  it('warns PRINT_TOO_SHORT when estimated pages < 24 at 6x9', async () => {
    const ctx = await runPreflight(makeContext({
      format: 'print-pdf',
      chapters: [makeChapter(repeat('word', 1000))], // ~3 pages at 350 wpp
    }));
    expect(codesOf(ctx.preflight.warnings)).toContain('PRINT_TOO_SHORT');
    expect(ctx.preflight.estimatedPages).toBeLessThan(24);
  });

  it('does NOT run print-specific checks for EPUB format', async () => {
    const ctx = await runPreflight(makeContext({
      format: 'epub',
      chapters: [makeChapter(repeat('word', 1000))],
    }));
    expect(codesOf(ctx.preflight.warnings)).not.toContain('PRINT_TOO_SHORT');
    expect(ctx.preflight.estimatedPages).toBeNull();
  });

  it('warns UNUSUAL_CHAPTER_COUNT when chapters > 100', async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      makeChapter(repeat('word', 300)),
    );
    const ctx = await runPreflight(makeContext({
      format: 'print-pdf',
      chapters: many,
    }));
    expect(codesOf(ctx.preflight.warnings)).toContain('UNUSUAL_CHAPTER_COUNT');
  });
});
