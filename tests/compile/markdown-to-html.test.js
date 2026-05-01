// Markdown → HTML typography snapshot.
//
// markdown-it's typographer transforms are configuration-sensitive: one
// wrong flag and smart quotes stop curling, em-dashes become hyphens, or
// scene breaks lose their class. Because these rendering differences are
// invisible until you open the EPUB in Kindle and see straight quotes
// everywhere, a snapshot test is the right shape here — we lock the
// current output exactly and break loudly if it changes without intent.

import { describe, it, expect } from 'vitest';
import { markdownToHtml } from '../../lib/compile/markdown-to-html.js';

function minimalContext(bodies) {
  return {
    // markdownToHtml resolves relative <img> paths against
    // projectPath + assembly.manuscriptPath. Tests don't include images,
    // so any string is fine — '/tmp' is a valid absolute path on every
    // platform vitest runs on.
    projectPath: '/tmp',
    assembly: {
      manuscriptPath: 'manuscript',
      frontMatter: [],
      chapters: bodies.map((body, i) => ({ slug: `ch${i + 1}`, title: `Chapter ${i + 1}`, body })),
      backMatter: [],
    },
  };
}

async function renderOne(markdown) {
  const ctx = await markdownToHtml(minimalContext([markdown]));
  return ctx.html.chapters[0].html;
}

describe('markdown-to-html typography', () => {
  it('converts straight double quotes to curly', async () => {
    const html = await renderOne(`"Hello," she said.`);
    expect(html).toContain('\u201cHello,\u201d');
    expect(html).not.toContain('"Hello,"');
  });

  it('converts straight single quotes to curly', async () => {
    const html = await renderOne(`She didn't know.`);
    expect(html).toContain('didn\u2019t');
  });

  it('converts --- to em-dash', async () => {
    const html = await renderOne(`She paused --- and then spoke.`);
    expect(html).toContain('\u2014');
  });

  it('converts -- to en-dash', async () => {
    const html = await renderOne(`pages 10 -- 20`);
    expect(html).toContain('\u2013');
  });

  it('converts ... to ellipsis', async () => {
    const html = await renderOne(`She hesitated...`);
    expect(html).toContain('\u2026');
  });

  it('renders horizontal rule as scene-break class', async () => {
    const html = await renderOne(`First paragraph.\n\n---\n\nSecond paragraph.`);
    expect(html).toContain('<hr class="scene-break" />');
  });

  it('strips raw HTML (no <script> passthrough)', async () => {
    const html = await renderOne(`Text <script>alert(1)</script> more text.`);
    expect(html).not.toContain('<script>');
  });

  it('produces XHTML-safe self-closed void elements', async () => {
    // Without xhtmlOut, <hr> and <br /> render as <hr> — which is invalid
    // XHTML and breaks EPUB validation.
    const html = await renderOne(`Line 1\n\n---\n\nLine 2`);
    expect(html).toMatch(/<hr[^>]*\/>/);
  });

  it('renders GFM-style tables (used by TipTap tables)', async () => {
    const md = [
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n');
    const html = await renderOne(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders blockquotes', async () => {
    const html = await renderOne(`> A quoted line.`);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('</blockquote>');
  });

  it('throws if assembly phase has not run', async () => {
    await expect(markdownToHtml({})).rejects.toThrow(/assembly phase/);
  });

  it('preserves chapter metadata from assembly', async () => {
    const ctx = await markdownToHtml(minimalContext(['body one', 'body two']));
    expect(ctx.html.chapters).toHaveLength(2);
    expect(ctx.html.chapters[0].slug).toBe('ch1');
    expect(ctx.html.chapters[1].slug).toBe('ch2');
  });
});

// ─────────────────────────────────────────────────────────────
// Full snapshot of the rendered fixture chapter. If any typographer
// flag drifts, this snapshot mismatches loudly — review the diff
// and update with `vitest -u` only if the change is intended.
// ─────────────────────────────────────────────────────────────

describe('markdown-to-html snapshot', () => {
  it('renders a realistic chapter with quotes, dashes, scene break, curlies', async () => {
    const markdown = [
      '# Chapter One',
      '',
      'She opened the letter with shaking hands. The paper was thin and the handwriting unmistakable --- her mother\'s, written weeks before she died.',
      '',
      '"I never told you the truth about your father," the letter began.',
      '',
      '---',
      '',
      'Later, she sat by the window...',
    ].join('\n');
    const html = await renderOne(markdown);
    expect(html).toMatchInlineSnapshot(`
      "<h1>Chapter One</h1>
      <p>She opened the letter with shaking hands. The paper was thin and the handwriting unmistakable — her mother’s, written weeks before she died.</p>
      <p>“I never told you the truth about your father,” the letter began.</p>
      <hr class="scene-break" />
      <p>Later, she sat by the window…</p>
      "
    `);
  });
});
