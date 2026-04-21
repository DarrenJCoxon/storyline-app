// Manuscript snapshot + plan-vs-draft comparison.
//
// Two coupled concerns:
//   - snapshotManuscript reads manuscript/ prose from disk and reduces
//     it to structured chapter/scene/word-count data
//   - buildManuscriptMemoryEntries translates that into odd-flow
//     memory entries under the `draft:` key prefix (so plan memory
//     and draft memory coexist in the same namespace without collision)
//   - compareManuscriptToPlan diffs the two, surfacing drift points
//     the writer should review (scene count mismatch, POV drift,
//     unplanned chapters, word-count blow-out).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { DEFAULT_STATE } from '../lib/state/project-state.js';
import {
  snapshotManuscript,
  buildManuscriptMemoryEntries,
  countWords,
  countScenes,
  detectPov,
} from '../lib/manuscript/snapshot.js';
import { compareManuscriptToPlan, formatCompareReport } from '../lib/manuscript/compare.js';

function writeChapter(projectPath, filename, body) {
  const msDir = resolve(projectPath, 'manuscript');
  mkdirSync(msDir, { recursive: true });
  writeFileSync(resolve(msDir, filename), body);
}

function baseState(overrides = {}) {
  return {
    ...DEFAULT_STATE,
    _meta: { ...DEFAULT_STATE._meta, projectTitle: 'The Voynich Curse' },
    genre: { ...DEFAULT_STATE.genre, primaryGenre: 'thriller', targetWordCount: 85000 },
    writing: { manuscriptPath: 'manuscript' },
    ...overrides,
  };
}

describe('countWords', () => {
  it('counts real words, ignoring markdown punctuation (heading "Chapter" is content)', () => {
    // "Chapter" from the H1 IS counted (markdown-punctuation strip leaves
    // the word). The 7 prose words plus that = 8. Matches the editor's
    // word-count status bar behaviour.
    expect(countWords('# Chapter\n\nShe ran **hard** through the _dark_ night.')).toBe(8);
  });
  it('strips YAML frontmatter', () => {
    expect(countWords('---\ntitle: x\n---\nHello world.')).toBe(2);
  });
  it('strips fenced code blocks', () => {
    expect(countWords('```\nignored\n```\nOne two three.')).toBe(3);
  });
  it('returns 0 on empty / whitespace', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n   ')).toBe(0);
  });
});

describe('countScenes', () => {
  it('single-scene chapter counts as 1', () => {
    expect(countScenes('# Chapter\n\nOne paragraph.\n\nAnother paragraph.')).toBe(1);
  });
  it('explicit --- scene breaks are counted', () => {
    expect(countScenes('# Ch\n\nScene one.\n\n---\n\nScene two.\n\n---\n\nScene three.')).toBe(3);
  });
  it('* * * breaks are counted', () => {
    expect(countScenes('Scene one.\n\n* * *\n\nScene two.')).toBe(2);
  });
  it('blank-paragraph soft breaks (3+ newlines) count', () => {
    expect(countScenes('Scene one.\n\n\n\nScene two.')).toBe(2);
  });
  it('empty chapter counts as 0', () => {
    expect(countScenes('')).toBe(0);
    expect(countScenes('# just a heading\n')).toBe(0);
  });
});

describe('detectPov', () => {
  it('returns first-person when first-person markers are dense', () => {
    const body = '# Ch\n\nI walked to the door. I could hear my mother breathing in the next room. My hands shook. I knew what I had to do.';
    expect(detectPov(body)).toBe('first-person');
  });
  it('returns third-person for prose without first-person density', () => {
    const body = '# Ch\n\nShe walked to the door. She could hear her mother breathing. Her hands shook. She knew what she had to do.';
    expect(detectPov(body)).toBe('third-person');
  });
  it('returns null for very short content', () => {
    expect(detectPov('I')).toBeNull();
  });
});

describe('snapshotManuscript', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-ms-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('lists chapters in numeric filename order', async () => {
    writeChapter(tmp, 'ch10-later.md', '# Ten\n\nLater content.');
    writeChapter(tmp, 'ch02-arrival.md', '# Two\n\nShe arrived.');
    writeChapter(tmp, 'ch01-opening.md', '# One\n\nShe opened the door.');
    const snap = await snapshotManuscript(tmp);
    expect(snap.chapters.map(c => c.filename)).toEqual([
      'ch01-opening.md', 'ch02-arrival.md', 'ch10-later.md',
    ]);
    expect(snap.chapters[0].number).toBe(1);
    expect(snap.chapters[2].number).toBe(3);
  });

  it('ignores underscore-prefixed dirs via filename filter', async () => {
    // _front-matter isn't a file here, it's a dir, but the filter also
    // drops filenames starting with `_`
    writeChapter(tmp, '_draft-notes.md', 'Private notes.');
    writeChapter(tmp, 'ch01.md', '# Ch 1\n\nContent.');
    const snap = await snapshotManuscript(tmp);
    expect(snap.chapters).toHaveLength(1);
    expect(snap.chapters[0].filename).toBe('ch01.md');
  });

  it('extracts title from H1, falls back to filename', async () => {
    writeChapter(tmp, 'ch01-opening.md', '# The Beginning\n\nContent.');
    writeChapter(tmp, 'ch02-no-heading.md', 'Content without an H1.');
    const snap = await snapshotManuscript(tmp);
    expect(snap.chapters[0].title).toBe('The Beginning');
    expect(snap.chapters[1].title).toMatch(/No Heading/i);
  });

  it('computes totals correctly', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\n' + 'word '.repeat(300));
    writeChapter(tmp, 'ch02.md', '# Ch\n\n' + 'word '.repeat(250));
    const snap = await snapshotManuscript(tmp);
    expect(snap.chapterCount).toBe(2);
    // 300 + 250 prose words + 2 "Ch" headings = 552
    expect(snap.totalWords).toBe(552);
  });

  it('captures opening and closing sentences', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\nThe letter arrived at dawn. More middle content here.\n\nAnd then she vanished.');
    const snap = await snapshotManuscript(tmp);
    expect(snap.chapters[0].opening).toMatch(/letter arrived at dawn/);
    expect(snap.chapters[0].closing).toMatch(/she vanished/);
  });

  it('counts scenes via --- breaks', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\nScene one.\n\n---\n\nScene two.');
    const snap = await snapshotManuscript(tmp);
    expect(snap.chapters[0].sceneCount).toBe(2);
  });
});

describe('buildManuscriptMemoryEntries', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-ms-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('emits draft:* keys disambiguated from plan memory', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\n' + 'word '.repeat(500));
    const snap = await snapshotManuscript(tmp);
    const entries = buildManuscriptMemoryEntries(snap, baseState());
    const keys = entries.map(e => e.key);
    // Draft-side uses `draft:` prefix to avoid colliding with plan
    // entries emitted by buildMemoryEntries (which use `chapter:N:*`).
    expect(keys.some(k => k.startsWith('draft:chapter:1:'))).toBe(true);
    expect(keys).toContain('draft:total-word-count');
    expect(keys).toContain('draft:chapter-count');
  });

  it('includes progress-pct against target when genre.targetWordCount is set', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\n' + 'word '.repeat(17000));
    const snap = await snapshotManuscript(tmp);
    const entries = buildManuscriptMemoryEntries(snap, baseState());
    const progress = entries.find(e => e.key === 'draft:progress-pct');
    expect(progress).toBeTruthy();
    expect(Number(progress.value)).toBe(20);  // 17000/85000 = 20%
  });

  it('uses the same namespace as plan memory (novel:<slug>)', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\n' + 'word '.repeat(100));
    const snap = await snapshotManuscript(tmp);
    const entries = buildManuscriptMemoryEntries(snap, baseState());
    for (const e of entries) {
      expect(e.namespace).toBe('novel:the-voynich-curse');
    }
  });

  it('every entry tags itself as "manuscript" + "draft" for filtering', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\n' + 'word '.repeat(100));
    const snap = await snapshotManuscript(tmp);
    const entries = buildManuscriptMemoryEntries(snap, baseState());
    for (const e of entries) {
      expect(e.tags).toContain('manuscript');
      expect(e.tags).toContain('draft');
    }
  });
});

describe('compareManuscriptToPlan — drift detection', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-ms-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('reports no drift when draft matches plan', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch 1\n\n' + 'word '.repeat(2400));
    const state = baseState({
      chapterOutline: [
        { chapterNumber: 1, chapterTitle: 'Ch 1', estimatedWords: 2500, scenes: [{ sceneNumber: 1, pov: 'Jane', summary: 's', conflict: 'c', whatChanges: 'w' }] },
      ],
    });
    const report = await compareManuscriptToPlan(state, tmp);
    const warnings = report.findings.filter(f => f.severity === 'warning');
    expect(warnings).toHaveLength(0);
  });

  it('flags unplanned-chapter when a draft chapter has no plan counterpart', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch 1\n\n' + 'word '.repeat(500));
    writeChapter(tmp, 'ch02.md', '# Ch 2\n\n' + 'word '.repeat(500));
    writeChapter(tmp, 'ch03.md', '# Ch 3 surprise\n\n' + 'word '.repeat(500));  // unplanned
    const state = baseState({
      chapterOutline: [
        { chapterNumber: 1, chapterTitle: 'Ch 1', scenes: [] },
        { chapterNumber: 2, chapterTitle: 'Ch 2', scenes: [] },
      ],
    });
    const report = await compareManuscriptToPlan(state, tmp);
    const unplanned = report.findings.find(f => f.type === 'unplanned-chapter');
    expect(unplanned).toBeTruthy();
    expect(unplanned.chapterNumber).toBe(3);
  });

  it('flags chapter-count-mismatch when counts differ', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\n' + 'word '.repeat(500));
    const state = baseState({
      chapterOutline: [
        { chapterNumber: 1, chapterTitle: 'Ch', scenes: [] },
        { chapterNumber: 2, chapterTitle: 'Ch 2', scenes: [] },
        { chapterNumber: 3, chapterTitle: 'Ch 3', scenes: [] },
      ],
    });
    const report = await compareManuscriptToPlan(state, tmp);
    const mismatch = report.findings.find(f => f.type === 'chapter-count-mismatch');
    expect(mismatch).toBeTruthy();
    expect(mismatch.plannedCount).toBe(3);
    expect(mismatch.draftedCount).toBe(1);
  });

  it('flags chapter-scene-drift when scene counts differ', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\nScene one only.');  // 1 scene
    const state = baseState({
      chapterOutline: [
        { chapterNumber: 1, chapterTitle: 'Ch', scenes: [
          { sceneNumber: 1, pov: 'Jane', summary: 's', conflict: 'c', whatChanges: 'w' },
          { sceneNumber: 2, pov: 'Jane', summary: 's', conflict: 'c', whatChanges: 'w' },
          { sceneNumber: 3, pov: 'Jane', summary: 's', conflict: 'c', whatChanges: 'w' },
        ] },  // 3 scenes planned
      ],
    });
    const report = await compareManuscriptToPlan(state, tmp);
    const drift = report.findings.find(f => f.type === 'chapter-scene-drift');
    expect(drift).toBeTruthy();
    expect(drift.plannedScenes).toBe(3);
    expect(drift.draftedScenes).toBe(1);
  });

  it('flags chapter-word-drift when word count deviates more than 35% from plan', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\n' + 'word '.repeat(5000));  // drafted 5k
    const state = baseState({
      chapterOutline: [
        { chapterNumber: 1, chapterTitle: 'Ch', estimatedWords: 2000, scenes: [] },  // planned 2k
      ],
    });
    const report = await compareManuscriptToPlan(state, tmp);
    const drift = report.findings.find(f => f.type === 'chapter-word-drift');
    expect(drift).toBeTruthy();
    expect(drift.deltaPercent).toBeGreaterThan(100);  // 5000/2000 = +150%
  });

  it('does NOT flag chapter-word-drift within 35% tolerance', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\n' + 'word '.repeat(2200));  // drafted 2.2k
    const state = baseState({
      chapterOutline: [
        { chapterNumber: 1, chapterTitle: 'Ch', estimatedWords: 2000, scenes: [] },  // planned 2k
      ],
    });
    const report = await compareManuscriptToPlan(state, tmp);
    const drift = report.findings.filter(f => f.type === 'chapter-word-drift');
    expect(drift).toHaveLength(0);
  });

  it('flags target-exceeded when total words exceed 120% of genre target', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\n' + 'word '.repeat(110000));
    const state = baseState({
      chapterOutline: [{ chapterNumber: 1, chapterTitle: 'Ch', scenes: [] }],
    });
    const report = await compareManuscriptToPlan(state, tmp);
    const exceeded = report.findings.find(f => f.type === 'target-exceeded');
    expect(exceeded).toBeTruthy();
  });

  it('includes a progress info entry showing words vs target', async () => {
    writeChapter(tmp, 'ch01.md', '# Ch\n\n' + 'word '.repeat(17000));
    const state = baseState({ chapterOutline: [{ chapterNumber: 1, chapterTitle: 'Ch', scenes: [] }] });
    const report = await compareManuscriptToPlan(state, tmp);
    const progress = report.findings.find(f => f.type === 'progress');
    expect(progress).toBeTruthy();
    expect(progress.percent).toBe(20);
  });
});

describe('formatCompareReport', () => {
  it('human output contains counts + drift details', () => {
    const report = {
      drift: true,
      summary: { plannedChapters: 3, draftedChapters: 2, totalWords: 4500, targetWords: 85000 },
      findings: [
        { type: 'chapter-scene-drift', severity: 'warning', message: 'Ch 1: drafted 1 scene vs planned 3.', fix: 'adjust plan' },
        { type: 'progress', severity: 'info', message: '4,500 / 85,000 words (5%).' },
      ],
    };
    const text = formatCompareReport(report);
    expect(text).toContain('Plan:');
    expect(text).toContain('Draft:');
    expect(text).toContain('drafted 1 scene');
    expect(text).toContain('fix: adjust plan');
    expect(text).toContain('4,500');
  });

  it('reports "no drift" when findings are empty', () => {
    const text = formatCompareReport({
      drift: false,
      summary: { plannedChapters: 1, draftedChapters: 1, totalWords: 100, targetWords: null },
      findings: [],
    });
    expect(text).toContain('No plan-vs-draft drift');
  });
});
