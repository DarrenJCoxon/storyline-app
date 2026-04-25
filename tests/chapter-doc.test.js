import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { renderChapterCard, chapterFileName, writeAllChapterCards } from '../lib/output/chapter-doc.js';

describe('renderChapterCard', () => {
  it('renders chapter heading with number and title', () => {
    const out = renderChapterCard({ chapterNumber: 2, chapterTitle: 'Morning Prayers', scenes: [] });
    expect(out).toMatch(/^# Chapter 2 — Morning Prayers/);
  });

  it('falls back to "Chapter N" when no title is set', () => {
    const out = renderChapterCard({ chapterNumber: 3, scenes: [] });
    expect(out).toMatch(/^# Chapter 3 — Chapter 3/);
  });

  it('expands known beat IDs to human names', () => {
    const out = renderChapterCard({ chapterNumber: 1, chapterTitle: 'Open', beat: 'beat08Midpoint', scenes: [] });
    expect(out).toContain('**Beat:** Midpoint');
  });

  it('passes through unknown beat identifiers verbatim', () => {
    const out = renderChapterCard({ chapterNumber: 1, chapterTitle: 'Open', beat: 'custom-beat', scenes: [] });
    expect(out).toContain('**Beat:** custom-beat');
  });

  it('renders location chain from unique scene locations in order', () => {
    const chapter = {
      chapterNumber: 2, chapterTitle: 'Chase',
      scenes: [
        { sceneNumber: 1, location: 'Rooftop', pov: 'Jane', conflict: 'x', whatChanges: 'y' },
        { sceneNumber: 2, location: 'Alley', pov: 'Jane', conflict: 'x', whatChanges: 'y' },
      ],
    };
    expect(renderChapterCard(chapter)).toContain('**Location:** Rooftop → Alley');
  });

  it('deduplicates POV list when multiple scenes share a POV', () => {
    const chapter = {
      chapterNumber: 2, chapterTitle: 'Dual',
      scenes: [
        { sceneNumber: 1, pov: 'Jane', conflict: 'x', whatChanges: 'y' },
        { sceneNumber: 2, pov: 'Alex', conflict: 'x', whatChanges: 'y' },
        { sceneNumber: 3, pov: 'Jane', conflict: 'x', whatChanges: 'y' },
      ],
    };
    const out = renderChapterCard(chapter);
    expect(out).toContain('**POV:** Jane, Alex');
  });

  it('formats target word count with thousands separator', () => {
    const out = renderChapterCard({ chapterNumber: 1, chapterTitle: 'Open', estimatedWords: 2500, scenes: [] });
    expect(out).toContain('~2,500 words');
  });

  it('includes protagonist want/need/flaw as a context quote when state supplies protagonist', () => {
    const chapter = { chapterNumber: 1, chapterTitle: 'Open', scenes: [] };
    const state = { protagonist: { name: 'Jane', want: 'Justice', need: 'Self-forgiveness', flaw: 'Control' } };
    const out = renderChapterCard(chapter, state);
    expect(out).toContain('*Jane · wants **Justice** · needs **Self-forgiveness** · flaw: Control*');
  });

  it('omits the protagonist line entirely when state has no protagonist', () => {
    const out = renderChapterCard({ chapterNumber: 1, chapterTitle: 'Open', scenes: [] });
    expect(out).not.toContain('>');
  });

  it('renders each scene as a ## heading with summary', () => {
    const out = renderChapterCard({
      chapterNumber: 1, chapterTitle: 'Open',
      scenes: [{ sceneNumber: 1, pov: 'Jane', summary: 'Jane wakes', conflict: 'x', whatChanges: 'y' }],
    });
    expect(out).toContain('## Scene 1 — Jane wakes');
  });

  it('renders scene metadata strip with POV, location, time', () => {
    const out = renderChapterCard({
      chapterNumber: 1, chapterTitle: 'Open',
      scenes: [{ sceneNumber: 1, pov: 'Jane', location: 'Kitchen', timeOfDay: 'Dawn', conflict: 'x', whatChanges: 'y' }],
    });
    expect(out).toContain('**POV:** Jane');
    expect(out).toContain('**Location:** Kitchen');
    expect(out).toContain('**Time:** Dawn');
  });

  it('renders purpose / conflict / what-changes / beats / notes as bolded fields', () => {
    const out = renderChapterCard({
      chapterNumber: 1, chapterTitle: 'Open',
      scenes: [{
        sceneNumber: 1, pov: 'Jane', summary: 's',
        purpose: 'advance plot', conflict: 'v internal', whatChanges: 'bond broken',
        beats: 'Catalyst', notes: 'echoes opening image',
      }],
    });
    expect(out).toContain('**Purpose:** advance plot');
    expect(out).toContain('**Conflict:** v internal');
    expect(out).toContain('**What changes:** bond broken');
    expect(out).toContain('**Serves beats:** Catalyst');
    expect(out).toContain('**Notes:** echoes opening image');
  });

  it('handles a chapter with zero scenes by rendering a placeholder line', () => {
    const out = renderChapterCard({ chapterNumber: 1, chapterTitle: 'Stub', scenes: [] });
    expect(out).toContain('_No scenes fleshed out for this chapter yet._');
  });
});

describe('chapterFileName', () => {
  it('pads chapter number to 2 digits', () => {
    expect(chapterFileName({ chapterNumber: 3, chapterTitle: 'Open' })).toBe('03-open.md');
  });

  it('slugifies the title', () => {
    expect(chapterFileName({ chapterNumber: 1, chapterTitle: 'Morning Prayers' })).toBe('01-morning-prayers.md');
  });

  it('strips non-alphanumerics and collapses whitespace', () => {
    expect(chapterFileName({ chapterNumber: 1, chapterTitle: 'The Museum!!! (at night)' }))
      .toBe('01-the-museum-at-night.md');
  });

  it('falls back to NN.md when there is no title', () => {
    expect(chapterFileName({ chapterNumber: 5 })).toBe('05.md');
  });

  it('truncates overly long slugs to 40 chars', () => {
    const title = 'A very long chapter title that goes on and on forever';
    const name = chapterFileName({ chapterNumber: 1, chapterTitle: title });
    const slug = name.replace(/^01-/, '').replace(/\.md$/, '');
    expect(slug.length).toBeLessThanOrEqual(40);
  });
});

describe('writeAllChapterCards', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await import('fs').then(fs => fs.mkdtempSync(path.join(os.tmpdir(), 'storyline-chapter-test-')));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('writes one file per chapter under docs/chapters/', async () => {
    const state = {
      chapterOutline: [
        { chapterNumber: 1, chapterTitle: 'Open', scenes: [{ sceneNumber: 1, pov: 'J', conflict: 'c', whatChanges: 'w' }] },
        { chapterNumber: 2, chapterTitle: 'Setup', scenes: [{ sceneNumber: 1, pov: 'J', conflict: 'c', whatChanges: 'w' }] },
      ],
    };
    const result = await writeAllChapterCards(state, tmp);
    expect(result.written).toHaveLength(2);
    expect(existsSync(path.join(tmp, 'docs', 'chapters', '01-open.md'))).toBe(true);
    expect(existsSync(path.join(tmp, 'docs', 'chapters', '02-setup.md'))).toBe(true);
  });

  it('removes stale chapter files that no longer match any chapter in state', async () => {
    const chaptersDir = path.join(tmp, 'docs', 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    // Pre-seed stale card from a renamed chapter
    await writeFile(path.join(chaptersDir, '03-old-name.md'), '# old', 'utf-8');

    const state = {
      chapterOutline: [
        { chapterNumber: 3, chapterTitle: 'New Name', scenes: [{ sceneNumber: 1, pov: 'J', conflict: 'c', whatChanges: 'w' }] },
      ],
    };
    const result = await writeAllChapterCards(state, tmp);
    expect(existsSync(path.join(chaptersDir, '03-new-name.md'))).toBe(true);
    expect(existsSync(path.join(chaptersDir, '03-old-name.md'))).toBe(false);
    expect(result.removed).toContain(path.join('docs', 'chapters', '03-old-name.md'));
  });

  it('does not delete non-card files the writer put in docs/chapters/', async () => {
    const chaptersDir = path.join(tmp, 'docs', 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(path.join(chaptersDir, 'notes.md'), 'writer notes', 'utf-8');
    await writeFile(path.join(chaptersDir, 'README.md'), '# readme', 'utf-8');

    await writeAllChapterCards({ chapterOutline: [] }, tmp);
    expect(existsSync(path.join(chaptersDir, 'notes.md'))).toBe(true);
    expect(existsSync(path.join(chaptersDir, 'README.md'))).toBe(true);
  });

  it('overwrites existing cards when content changes', async () => {
    const state1 = {
      chapterOutline: [
        { chapterNumber: 1, chapterTitle: 'Open', scenes: [{ sceneNumber: 1, pov: 'Jane', summary: 'v1', conflict: 'c', whatChanges: 'w' }] },
      ],
    };
    await writeAllChapterCards(state1, tmp);
    const v1 = await readFile(path.join(tmp, 'docs', 'chapters', '01-open.md'), 'utf-8');
    expect(v1).toContain('v1');

    const state2 = {
      chapterOutline: [
        { chapterNumber: 1, chapterTitle: 'Open', scenes: [{ sceneNumber: 1, pov: 'Jane', summary: 'v2', conflict: 'c', whatChanges: 'w' }] },
      ],
    };
    await writeAllChapterCards(state2, tmp);
    const v2 = await readFile(path.join(tmp, 'docs', 'chapters', '01-open.md'), 'utf-8');
    expect(v2).toContain('v2');
    expect(v2).not.toContain('v1');
  });

  it('handles empty chapterOutline by creating the dir but writing nothing', async () => {
    const result = await writeAllChapterCards({ chapterOutline: [] }, tmp);
    expect(result.written).toHaveLength(0);
    expect(existsSync(path.join(tmp, 'docs', 'chapters'))).toBe(true);
  });
});
