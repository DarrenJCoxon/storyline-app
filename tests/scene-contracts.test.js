// FIC-B.6 — Scene contract tests.
//
// Covers the four prove-it criteria from fic-b-scene-contracts.md:
//
//  (a) Old-shape fiction projects (7 scene fields) normalise through
//      getWritingPlan with sensible defaults — no break on existing fixtures.
//  (b) New-shape projects with full contract fields render correctly.
//  (c) Mixed-shape projects (some scenes with contract fields, some without)
//      render captured fields and stub missing ones.
//  (d) Story traps fire correctly:
//        · no-turn scene  → sceneNoTurn
//        · flat value shift → sceneValueShiftFlat
//        · goal with no arc or thread → sceneInert
//  (e) Manuscript scaffold seeded from a contract-bearing chapter contains
//      the expected H2 sections with goal/obstacle/stakes/turn guidance —
//      and is NOT regenerated when the writer has touched the file.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync as rf } from 'fs';
import { resolve, dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { getWritingPlan } from '../packages/core/dist/state/writing-plan.js';
import { runStoryTraps } from '../packages/core/dist/ai/story-traps.js';
import {
  seedManuscriptFromPlan,
  seedChapterContent,
  chapterManuscriptPath,
  MANUSCRIPT_SEED_MARKER,
} from '../packages/core/dist/scaffold/manuscript-seeder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, 'fixtures/writing-plan');

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'));
}

// ── (a) Old-shape: no contract fields ───────────────────────────────────────

describe('getWritingPlan — old-shape fiction (no contract fields)', () => {
  const state = loadFixture('fiction-real-world.json');
  const plan = getWritingPlan(state);

  it('normalises without errors', () => {
    expect(plan.mode).toBe('fiction');
    expect(plan.fictionChapters.length).toBeGreaterThan(0);
  });

  it('produces scenes with undefined contract fields (not null, not crashing)', () => {
    const scene = plan.fictionChapters[0].scenes[0];
    expect(scene.goal).toBeUndefined();
    expect(scene.obstacle).toBeUndefined();
    expect(scene.stakes).toBeUndefined();
    expect(scene.storyTurn).toBeUndefined();
    expect(scene.valueShiftStart).toBeUndefined();
    expect(scene.valueShiftEnd).toBeUndefined();
    expect(scene.draftStatus).toBeUndefined();
  });

  it('preserves the existing core fields on old-shape scenes', () => {
    const scene = plan.fictionChapters[0].scenes[0];
    expect(scene.sceneNumber).toBe(1);
    expect(scene.pov).toBe('Mira');
    expect(scene.summary).toContain('Mira');
    expect(scene.conflict).toBeTruthy();
    expect(scene.whatChanges).toBeTruthy();
  });
});

// ── (b) New-shape: full contract fields ──────────────────────────────────────

describe('getWritingPlan — new-shape fiction (full contract fields)', () => {
  const state = loadFixture('fiction-new-shape.json');
  const plan = getWritingPlan(state);

  it('normalises without errors', () => {
    expect(plan.mode).toBe('fiction');
    expect(plan.fictionChapters.length).toBeGreaterThan(0);
  });

  it('exposes contract fields on scene 1 of chapter 1', () => {
    const scene = plan.fictionChapters[0].scenes[0];
    expect(scene.goal).toContain('commission');
    expect(scene.obstacle).toContain('flaw');
    expect(scene.stakes).toContain('apprenticeship');
    expect(scene.storyTurn).toContain('commission');
    expect(scene.valueShiftStart).toBe('fearful');
    expect(scene.valueShiftEnd).toBe('hopeful');
    expect(scene.draftStatus).toBe('not-started');
  });

  it('exposes arcFunction and threadMovement when set', () => {
    const scene = plan.fictionChapters[0].scenes[0];
    expect(scene.arcFunction).toContain('hiding');
    expect(scene.threadMovement).toBeTruthy();
  });

  it('scene without optional contract fields still normalises cleanly', () => {
    // Scene 2 of chapter 1 has no arcFunction or threadMovement
    const scene = plan.fictionChapters[0].scenes[1];
    expect(scene.goal).toContain('call');
    expect(scene.arcFunction).toBeUndefined();
    expect(scene.threadMovement).toBeUndefined();
  });
});

// ── (c) Mixed-shape: some scenes with contracts, some without ───────────────

describe('getWritingPlan — mixed-shape fiction', () => {
  it('handles a project where some scenes have contract fields and some do not', () => {
    // Build a mixed state: chapter 1 scene 1 has contracts, scene 2 does not
    const state = loadFixture('fiction-real-world.json');
    state.chapterOutline[0].scenes[0].goal = 'A goal';
    state.chapterOutline[0].scenes[0].obstacle = 'An obstacle';
    state.chapterOutline[0].scenes[0].stakes = 'The stakes';
    state.chapterOutline[0].scenes[0].storyTurn = 'A turn';
    // scene 2 retains old shape (no contract fields)

    const plan = getWritingPlan(state);
    const scene1 = plan.fictionChapters[0].scenes[0];
    const scene2 = plan.fictionChapters[0].scenes[1];

    expect(scene1.goal).toBe('A goal');
    expect(scene1.storyTurn).toBe('A turn');
    expect(scene2.goal).toBeUndefined();
    expect(scene2.storyTurn).toBeUndefined();
  });
});

// ── (d) Story traps ──────────────────────────────────────────────────────────

describe('runStoryTraps — scene contract traps', () => {
  function baseState() {
    return {
      mode: 'fiction',
      protagonist: { name: 'Alice', want: 'a new life', need: 'forgiveness', flaw: 'pride' },
      bStory: { character: 'Bob', premise: 'redemption', themeConnection: 'forgiveness' },
      beatSheet: {
        beats: {
          beat01OpeningImage: { image: 'lonely' },
          beat14FinalImage: { scene: 'connected', contrastToOpening: 'yes' },
        },
      },
      chapterOutline: [],
    };
  }

  it('sceneNoTurn: fires when a contract scene has no storyTurn', () => {
    const state = baseState();
    state.chapterOutline = [{
      chapterNumber: 1,
      scenes: [{
        sceneNumber: 1,
        goal: 'Get the job',
        obstacle: 'No qualifications',
        stakes: 'Loses the apartment',
        // storyTurn intentionally absent
      }],
    }];
    const traps = runStoryTraps(state);
    const trap = traps.find(t => t.id === 'sceneNoTurn');
    expect(trap).toBeDefined();
    expect(trap.severity).toBe('warning');
    expect(trap.details[0]).toContain('Chapter 1, Scene 1');
  });

  it('sceneNoTurn: does NOT fire for old-shape scenes (no contract fields)', () => {
    const state = baseState();
    state.chapterOutline = [{
      chapterNumber: 1,
      scenes: [{ sceneNumber: 1, summary: 'Old scene', conflict: 'Some conflict', whatChanges: 'Something' }],
    }];
    const traps = runStoryTraps(state);
    expect(traps.find(t => t.id === 'sceneNoTurn')).toBeUndefined();
  });

  it('sceneNoTurn: does NOT fire when storyTurn is present', () => {
    const state = baseState();
    state.chapterOutline = [{
      chapterNumber: 1,
      scenes: [{ sceneNumber: 1, goal: 'Get the job', obstacle: 'No quals', stakes: 'Apartment', storyTurn: 'Gets rejected but meets a mentor' }],
    }];
    const traps = runStoryTraps(state);
    expect(traps.find(t => t.id === 'sceneNoTurn')).toBeUndefined();
  });

  it('sceneValueShiftFlat: fires when start and end value are identical', () => {
    const state = baseState();
    state.chapterOutline = [{
      chapterNumber: 2,
      scenes: [{
        sceneNumber: 1,
        goal: 'Survive',
        obstacle: 'The storm',
        stakes: 'Life',
        storyTurn: 'The storm passes',
        valueShiftStart: 'fearful',
        valueShiftEnd: 'fearful',
      }],
    }];
    const traps = runStoryTraps(state);
    const trap = traps.find(t => t.id === 'sceneValueShiftFlat');
    expect(trap).toBeDefined();
    expect(trap.details[0]).toContain('Chapter 2, Scene 1');
    expect(trap.details[0]).toContain('"fearful"');
  });

  it('sceneValueShiftFlat: does NOT fire when values differ', () => {
    const state = baseState();
    state.chapterOutline = [{
      chapterNumber: 1,
      scenes: [{ sceneNumber: 1, goal: 'Survive', obstacle: 'Storm', stakes: 'Life', storyTurn: 'Passes', valueShiftStart: 'fearful', valueShiftEnd: 'relieved' }],
    }];
    const traps = runStoryTraps(state);
    expect(traps.find(t => t.id === 'sceneValueShiftFlat')).toBeUndefined();
  });

  it('sceneValueShiftFlat: case-insensitive comparison', () => {
    const state = baseState();
    state.chapterOutline = [{
      chapterNumber: 1,
      scenes: [{ sceneNumber: 1, goal: 'Go', obstacle: 'Block', stakes: 'All', storyTurn: 'Turn', valueShiftStart: 'Hopeful', valueShiftEnd: 'hopeful' }],
    }];
    const traps = runStoryTraps(state);
    expect(traps.find(t => t.id === 'sceneValueShiftFlat')).toBeDefined();
  });

  it('sceneInert: fires when scene has goal but no arc or thread movement', () => {
    const state = baseState();
    state.chapterOutline = [{
      chapterNumber: 1,
      scenes: [{
        sceneNumber: 2,
        goal: 'Find the document',
        obstacle: 'Locked cabinet',
        stakes: 'The case',
        storyTurn: 'Finds a clue instead',
        // arcFunction and threadMovement both absent
      }],
    }];
    const traps = runStoryTraps(state);
    const trap = traps.find(t => t.id === 'sceneInert');
    expect(trap).toBeDefined();
    expect(trap.details[0]).toContain('Chapter 1, Scene 2');
  });

  it('sceneInert: does NOT fire when arcFunction is present', () => {
    const state = baseState();
    state.chapterOutline = [{
      chapterNumber: 1,
      scenes: [{ sceneNumber: 1, goal: 'Find doc', obstacle: 'Locked', stakes: 'Case', storyTurn: 'Clue', arcFunction: 'Learns to ask for help' }],
    }];
    const traps = runStoryTraps(state);
    expect(traps.find(t => t.id === 'sceneInert')).toBeUndefined();
  });

  it('sceneInert: does NOT fire when threadMovement is present', () => {
    const state = baseState();
    state.chapterOutline = [{
      chapterNumber: 1,
      scenes: [{ sceneNumber: 1, goal: 'Find doc', obstacle: 'Locked', stakes: 'Case', storyTurn: 'Clue', threadMovement: 'Mystery thread advances' }],
    }];
    const traps = runStoryTraps(state);
    expect(traps.find(t => t.id === 'sceneInert')).toBeUndefined();
  });

  it('sceneInert: does NOT fire for old-shape scenes (no goal)', () => {
    const state = baseState();
    state.chapterOutline = [{
      chapterNumber: 1,
      scenes: [{ sceneNumber: 1, summary: 'Old scene', conflict: 'Some', whatChanges: 'Change' }],
    }];
    const traps = runStoryTraps(state);
    expect(traps.find(t => t.id === 'sceneInert')).toBeUndefined();
  });
});

// ── (e) Manuscript seeder ────────────────────────────────────────────────────

describe('seedChapterContent', () => {
  it('includes the seed marker at the top', () => {
    const ch = {
      chapterNumber: 1,
      chapterTitle: 'First Light',
      beat: 'beat01OpeningImage',
      estimatedWords: 3500,
      scenes: [],
    };
    const content = seedChapterContent(ch);
    expect(content.startsWith(MANUSCRIPT_SEED_MARKER)).toBe(true);
  });

  it('includes H1 chapter title', () => {
    const ch = { chapterNumber: 3, chapterTitle: 'The Turn', beat: null, estimatedWords: null, scenes: [] };
    const content = seedChapterContent(ch);
    expect(content).toContain('# Chapter 3 — The Turn');
  });

  it('includes beat name when set', () => {
    const ch = { chapterNumber: 1, chapterTitle: 'Open', beat: 'beat08Midpoint', estimatedWords: null, scenes: [] };
    const content = seedChapterContent(ch);
    expect(content).toContain('Midpoint');
  });

  it('renders H2 scene sections', () => {
    const ch = {
      chapterNumber: 1, chapterTitle: 'First', beat: null, estimatedWords: null,
      scenes: [
        { sceneNumber: 1, pov: 'Alice', location: 'Park', summary: 'She walks away', timeOfDay: null,
          conflict: null, whatChanges: null, notes: null, estimatedWords: null, beats: null, purpose: null,
          goal: 'Leave without being seen', obstacle: 'Her name is called', stakes: 'Her cover',
          storyTurn: 'She turns around', valueShiftStart: 'calm', valueShiftEnd: 'exposed',
          draftStatus: 'not-started',
        },
      ],
    };
    const content = seedChapterContent(ch);
    expect(content).toContain('## Scene 1');
    expect(content).toContain('*Goal: Leave without being seen*');
    expect(content).toContain('*Obstacle: Her name is called*');
    expect(content).toContain('*Stakes: Her cover*');
    expect(content).toContain('*Turn: She turns around*');
    expect(content).toContain('calm → exposed');
  });

  it('stubs "(not yet planned)" when contract fields are absent', () => {
    const ch = {
      chapterNumber: 2, chapterTitle: 'Old', beat: null, estimatedWords: null,
      scenes: [{ sceneNumber: 1, pov: 'Bob', location: null, summary: 'He waits', timeOfDay: null,
        conflict: null, whatChanges: null, notes: null, estimatedWords: null, beats: null, purpose: null }],
    };
    const content = seedChapterContent(ch);
    expect(content).toContain('*Goal: (not yet planned)*');
    expect(content).toContain('*Obstacle: (not yet planned)*');
    expect(content).toContain('*Stakes: (not yet planned)*');
    expect(content).toContain('*Turn: (not yet planned)*');
  });
});

describe('seedManuscriptFromPlan', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'storyline-seed-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates per-chapter manuscript files for fiction plans', () => {
    const state = loadFixture('fiction-new-shape.json');
    const plan = getWritingPlan(state);
    seedManuscriptFromPlan(plan, tmpDir);

    const ch1Path = join(tmpDir, chapterManuscriptPath(plan.fictionChapters[0]));
    expect(existsSync(ch1Path)).toBe(true);
    const content = rf(ch1Path, 'utf-8');
    expect(content.startsWith(MANUSCRIPT_SEED_MARKER)).toBe(true);
    expect(content).toContain('## Scene 1');
  });

  it('does NOT overwrite a file the writer has modified', () => {
    const state = loadFixture('fiction-new-shape.json');
    const plan = getWritingPlan(state);
    const ch = plan.fictionChapters[0];
    const filePath = join(tmpDir, chapterManuscriptPath(ch));

    // Simulate writer content (no seed marker)
    const manuscriptDir = join(tmpDir, 'manuscript');
    require('fs').mkdirSync(manuscriptDir, { recursive: true });
    writeFileSync(filePath, 'My actual prose. No seed marker here.\n', 'utf-8');

    seedManuscriptFromPlan(plan, tmpDir);

    const content = rf(filePath, 'utf-8');
    expect(content).toBe('My actual prose. No seed marker here.\n');
  });

  it('DOES overwrite a file that still has the seed marker', () => {
    const state = loadFixture('fiction-new-shape.json');
    const plan = getWritingPlan(state);
    const ch = plan.fictionChapters[0];
    const filePath = join(tmpDir, chapterManuscriptPath(ch));

    // Pre-create with seed marker (simulates initial seed that writer has not touched)
    const manuscriptDir = join(tmpDir, 'manuscript');
    require('fs').mkdirSync(manuscriptDir, { recursive: true });
    writeFileSync(filePath, MANUSCRIPT_SEED_MARKER + '\n# Old seed content\n', 'utf-8');

    seedManuscriptFromPlan(plan, tmpDir);

    const content = rf(filePath, 'utf-8');
    expect(content).toContain('## Scene 1');
  });

  it('is a no-op for non-fiction plans', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json');
    const plan = getWritingPlan(state);
    seedManuscriptFromPlan(plan, tmpDir);

    // No manuscript files should have been created
    const manuscriptDir = join(tmpDir, 'manuscript');
    const created = existsSync(manuscriptDir)
      ? require('fs').readdirSync(manuscriptDir)
      : [];
    expect(created.length).toBe(0);
  });
});
