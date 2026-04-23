// Brief-builder — assembles the JSON bundle the draft critic reads when
// the writer invokes /critique on a chapter.
//
// Tests cover:
//   - chapter-ref parsing (numeric and ch-prefix forms)
//   - happy-path assembly: prose + plan slice + beat slice + drift +
//     protagonist
//   - drift filtering by chapterNumber
//   - structured errors on missing state, missing chapter file, and
//     missing plan slice (the documented "don't fail silently" path)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { DEFAULT_STATE } from '../../lib/state/project-state.js';
import { buildCritiqueBrief, parseChapterRef } from '../../lib/critique/brief-builder.js';

function writeChapter(projectPath, filename, body) {
  const msDir = resolve(projectPath, 'manuscript');
  mkdirSync(msDir, { recursive: true });
  writeFileSync(resolve(msDir, filename), body);
}

function planChapter(number, overrides = {}) {
  return {
    chapterNumber: number,
    chapterTitle: `Chapter ${number}`,
    estimatedWords: 3000,
    beat: 'beat08Midpoint',
    scenes: [
      {
        sceneNumber: 1,
        location: 'Warehouse',
        timeOfDay: 'Night',
        pov: 'first-person',
        purpose: 'Deliver the false victory',
        conflict: 'Protagonist must choose between truth and the bag of money',
        whatChanges: 'Protagonist takes the bag, then realises it is counterfeit',
        beats: 'beat08Midpoint',
        notes: null,
      },
    ],
    ...overrides,
  };
}

function baseState(overrides = {}) {
  return {
    ...DEFAULT_STATE,
    _meta: { ...DEFAULT_STATE._meta, projectTitle: 'The Voynich Curse' },
    genre: { ...DEFAULT_STATE.genre, targetWordCount: 85000 },
    writing: { manuscriptPath: 'manuscript' },
    protagonist: {
      name: 'Mara',
      want: 'To clear her father\'s name',
      need: 'To stop confusing loyalty with love',
      ghost: 'Her mother\'s death she could not prevent',
      flaw: 'She trusts only people she can fix',
      coreLie: 'If I am useful enough I will be loved',
      arcDirection: 'self-reliant → vulnerable',
      voice: 'wry, observant',
    },
    beatSheet: {
      ...DEFAULT_STATE.beatSheet,
      beats: {
        ...DEFAULT_STATE.beatSheet.beats,
        beat08Midpoint: {
          scene: 'The bag in the warehouse',
          midpointType: 'false-victory',
          flipOrReveal: 'The cash is counterfeit; she has been the mark all along',
          stakesRaise: 'Now she owes the people she was betraying',
          notes: null,
        },
      },
    },
    chapterOutline: [
      planChapter(1, { beat: 'beat03Catalyst' }),
      planChapter(2),
    ],
    ...overrides,
  };
}

describe('parseChapterRef', () => {
  it('accepts a positive integer', () => {
    expect(parseChapterRef(3)).toBe(3);
    expect(parseChapterRef('3')).toBe(3);
  });
  it('accepts ch-prefix forms', () => {
    expect(parseChapterRef('ch03')).toBe(3);
    expect(parseChapterRef('ch3')).toBe(3);
    expect(parseChapterRef('CH-03')).toBe(3);
  });
  it('accepts chapter-prefix forms', () => {
    expect(parseChapterRef('chapter-3')).toBe(3);
    expect(parseChapterRef('chapter 03')).toBe(3);
  });
  it('rejects garbage', () => {
    expect(parseChapterRef('')).toBe(null);
    expect(parseChapterRef('abc')).toBe(null);
    expect(parseChapterRef(0)).toBe(null);
    expect(parseChapterRef(-1)).toBe(null);
    expect(parseChapterRef(null)).toBe(null);
    expect(parseChapterRef(undefined)).toBe(null);
  });
});

describe('buildCritiqueBrief — happy path', () => {
  let projectPath;

  beforeEach(() => {
    projectPath = mkdtempSync(resolve(tmpdir(), 'storyline-critique-'));
    writeChapter(projectPath, 'ch01-opening.md', '# Opening\n\nMara found the letter.\n');
    writeChapter(
      projectPath,
      'ch02-warehouse.md',
      '# The Warehouse\n\nThe bag was heavier than she expected. She slung it over her shoulder and walked out.\n',
    );
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('returns the full bundle for a valid chapter', async () => {
    const brief = await buildCritiqueBrief(2, baseState(), projectPath);
    expect(brief.error).toBeUndefined();
    expect(brief.chapter).toMatchObject({
      number: 2,
      filename: 'ch02-warehouse.md',
      title: 'The Warehouse',
      sceneCount: 1,
    });
    expect(brief.chapter.wordCount).toBeGreaterThan(0);
    expect(brief.prose).toContain('The bag was heavier');
    expect(brief.chapterPlan).toMatchObject({
      chapterNumber: 2,
      beat: 'beat08Midpoint',
    });
    expect(brief.beatPlan).toMatchObject({
      midpointType: 'false-victory',
      flipOrReveal: expect.stringContaining('counterfeit'),
    });
    expect(brief.protagonist).toMatchObject({
      name: 'Mara',
      flaw: expect.stringContaining('trusts'),
    });
    // Protagonist projection drops voice/age/occupation noise.
    expect(brief.protagonist.voice).toBeUndefined();
  });

  it('accepts ch-prefix invocation forms', async () => {
    const brief = await buildCritiqueBrief('ch02', baseState(), projectPath);
    expect(brief.error).toBeUndefined();
    expect(brief.chapter.number).toBe(2);
  });

  it('beatPlan is null when chapterPlan.beat is null', async () => {
    const state = baseState();
    state.chapterOutline[1].beat = null;
    const brief = await buildCritiqueBrief(2, state, projectPath);
    expect(brief.error).toBeUndefined();
    expect(brief.beatPlan).toBeNull();
  });

  it('protagonist is null when state.protagonist is empty', async () => {
    const state = baseState({ protagonist: { ...DEFAULT_STATE.protagonist } });
    const brief = await buildCritiqueBrief(2, state, projectPath);
    expect(brief.error).toBeUndefined();
    expect(brief.protagonist).toBeNull();
  });
});

describe('buildCritiqueBrief — drift filtering', () => {
  let projectPath;

  beforeEach(() => {
    projectPath = mkdtempSync(resolve(tmpdir(), 'storyline-critique-drift-'));
    // Ch 1 will be plan-conformant. Ch 2 will be deliberately under-words
    // and have a scene-count mismatch, so the per-chapter drift filter
    // gets something to pick up.
    writeChapter(projectPath, 'ch01-opening.md', '# Opening\n\n' + 'word '.repeat(2950));
    writeChapter(projectPath, 'ch02-warehouse.md', '# The Warehouse\n\nVery short. Two sentences.\n');
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('only includes drift findings for the requested chapter', async () => {
    const brief = await buildCritiqueBrief(2, baseState(), projectPath);
    expect(brief.error).toBeUndefined();
    expect(Array.isArray(brief.driftFindings)).toBe(true);
    // Every finding included must reference chapter 2.
    for (const f of brief.driftFindings) {
      expect(f.chapterNumber).toBe(2);
    }
    // And we should have at least one — chapter 2 is heavily under-words.
    const wordDrift = brief.driftFindings.find(f => f.type === 'chapter-word-drift');
    expect(wordDrift).toBeDefined();
    expect(wordDrift.draftedWords).toBeLessThan(50);
  });
});

describe('buildCritiqueBrief — structured errors', () => {
  let projectPath;

  beforeEach(() => {
    projectPath = mkdtempSync(resolve(tmpdir(), 'storyline-critique-err-'));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('rejects an unparseable chapter ref', async () => {
    const brief = await buildCritiqueBrief('not-a-chapter', baseState(), projectPath);
    expect(brief.error?.code).toBe('INVALID_CHAPTER_REF');
  });

  it('returns NO_STATE when state is null', async () => {
    const brief = await buildCritiqueBrief(1, null, projectPath);
    expect(brief.error?.code).toBe('NO_STATE');
    expect(brief.error.chapterNumber).toBe(1);
  });

  it('returns CHAPTER_NOT_FOUND when no manuscript file exists for the number', async () => {
    // Empty manuscript directory.
    mkdirSync(resolve(projectPath, 'manuscript'), { recursive: true });
    const brief = await buildCritiqueBrief(2, baseState(), projectPath);
    expect(brief.error?.code).toBe('CHAPTER_NOT_FOUND');
    expect(brief.error.chapterNumber).toBe(2);
    expect(brief.error.message).toContain('manuscript');
  });

  it('returns NO_CHAPTER_PLAN when state.chapterOutline lacks the chapter', async () => {
    // Three chapters drafted, but baseState's chapterOutline only goes
    // up to chapter 2 — so ch03 exists on disk but has no plan slice.
    writeChapter(projectPath, 'ch01-opening.md', '# Opening\n\nMara found the letter.\n');
    writeChapter(projectPath, 'ch02-warehouse.md', '# Warehouse\n\nThe bag was heavier than she expected.\n');
    writeChapter(projectPath, 'ch03-orphan.md', '# Orphan\n\nDrafted but unplanned.\n');
    const state = baseState();   // chapterOutline only goes up to chapter 2
    const brief = await buildCritiqueBrief(3, state, projectPath);
    expect(brief.error?.code).toBe('NO_CHAPTER_PLAN');
    expect(brief.error.chapterNumber).toBe(3);
    expect(brief.error.message).toContain('Stage 12');
  });

  it('returns STATE_DOC_DRIFT when chapterOutline is empty but a chapter-flesh-out doc exists', async () => {
    // The recurring drift class: writer ran /storyline Stage 12, the skill
    // generated the long-form doc, but the parent harness skipped the
    // `storyline-vsc save chapterOutline` call. State stays empty.
    // The brief-builder must detect this and tell the writer specifically
    // — not pretend they haven't planned the stage.
    writeChapter(projectPath, 'ch01-orphan.md', '# Orphan\n\nDrafted prose.\n');
    mkdirSync(resolve(projectPath, 'docs'), { recursive: true });
    writeFileSync(
      resolve(projectPath, 'docs', '13-chapter-flesh-out.md'),
      '# Chapter Flesh-Out\n\nLong-form planning content here, never reached state.\n'.repeat(20),
    );

    // Explicitly empty chapterOutline.
    const state = baseState({ chapterOutline: [] });
    const brief = await buildCritiqueBrief(1, state, projectPath);
    expect(brief.error?.code).toBe('STATE_DOC_DRIFT');
    expect(brief.error.chapterNumber).toBe(1);
    expect(brief.error.orphanDocs).toContain('docs/13-chapter-flesh-out.md');
    expect(brief.error.message).toContain('storyline-vsc save chapterOutline');
    expect(brief.error.message).toContain('storyline-vsc doctor');
  });
});
