// FIC-A.2 — Normalizer fixtures and tests.
//
// Proves that getWritingPlan(state) produces a coherent, drift-free view
// across fiction and all three NF pipelines, and that the legacy +
// canonical NF state shapes produce byte-identical normalized output (the
// regression net for NF-11.0's compatibility adapter).
//
// Fixtures live in tests/fixtures/writing-plan/. The fiction-real-world
// fixture is the load-bearing one for FIC-A through FIC-D — every later
// renderer / detector / scaffolder is expected to handle it correctly.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getWritingPlan } from '../packages/core/dist/state/writing-plan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, 'fixtures/writing-plan');

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'));
}

// ── Fiction fixture: real-world project ──────────────────────────────────────

describe('getWritingPlan — fiction real-world fixture', () => {
  const state = loadFixture('fiction-real-world.json');
  const plan = getWritingPlan(state);

  it('reports fiction mode', () => {
    expect(plan.mode).toBe('fiction');
  });

  it('extracts project title from _meta', () => {
    expect(plan.title).toBe('The Glass Witness');
  });

  it('extracts genre and audience', () => {
    expect(plan.primaryGenre).toBe('Mystery');
    expect(plan.audience).toBe('Adult');
    expect(plan.targetWordCount).toBe(90000);
  });

  it('populates protagonist with all inner-engine fields', () => {
    expect(plan.protagonist).not.toBeNull();
    expect(plan.protagonist.name).toBe('Mira Halloran');
    expect(plan.protagonist.want).toContain('apprenticeship');
    expect(plan.protagonist.need).toContain('terrified of being seen');
    expect(plan.protagonist.flaw).toBe('Looks away from things that matter');
    expect(plan.protagonist.coreLie).toBe("If I don't see it, it isn't real");
    expect(plan.protagonist.isProtagonist).toBe(true);
  });

  it('populates supporting cast', () => {
    expect(plan.cast).toHaveLength(3);
    const vance = plan.cast.find(c => c.name === 'Det. Arthur Vance');
    expect(vance).toBeDefined();
    expect(vance.isProtagonist).toBe(false);
    expect(vance.relationshipToProtagonist).toContain('detective');
  });

  it('populates relationships', () => {
    expect(plan.relationships).toHaveLength(2);
    const r0 = plan.relationships[0];
    expect(r0.characterA).toBe('Mira Halloran');
    expect(r0.characterB).toBe('Det. Arthur Vance');
    expect(r0.connection).toContain('Witness');
  });

  it('returns all 15 canonical beats in schema order', () => {
    expect(plan.beats).toHaveLength(15);
    expect(plan.beats[0].id).toBe('beat01OpeningImage');
    expect(plan.beats[7].id).toBe('beat08Midpoint');
    expect(plan.beats[10].id).toBe('beat11BlackMoment');
    expect(plan.beats[11].id).toBe('beat12Beat13');
    expect(plan.beats[14].id).toBe('beat15EndCredits');
  });

  it('exposes beat-specific fields via the fields map', () => {
    const midpoint = plan.beats.find(b => b.id === 'beat08Midpoint');
    expect(midpoint.fields.midpointType).toBe('falseDefeat');
    expect(midpoint.fields.flipOrReveal).toContain('same man');
    const allIsLost = plan.beats.find(b => b.id === 'beat10AllIsLost');
    expect(allIsLost.fields.whiffOfDeath).toContain('near-death');
  });

  it('populates B-story when character + premise are set', () => {
    expect(plan.bStory).not.toBeNull();
    expect(plan.bStory.character).toBe('Coen Halloran');
    expect(plan.bStory.themeConnection).toContain('relationship');
  });

  it('populates plot threads with canonical threadType field', () => {
    expect(plan.plotThreads).toHaveLength(3);
    expect(plan.plotThreads[0].threadType).toBe('mystery');
    expect(plan.plotThreads[1].threadType).toBe('character-arc');
  });

  it('populates fiction chapters with scenes', () => {
    expect(plan.fictionChapters).toHaveLength(2);
    const ch1 = plan.fictionChapters[0];
    expect(ch1.chapterNumber).toBe(1);
    expect(ch1.chapterTitle).toBe('First Light');
    expect(ch1.beat).toBe('beat01OpeningImage');
    expect(ch1.scenes).toHaveLength(2);
    expect(ch1.scenes[0].pov).toBe('Mira');
    expect(ch1.scenes[0].whatChanges).toContain('private commission');
  });

  it('populates logline structure', () => {
    expect(plan.logline.sentence).toContain('glassblower');
    expect(plan.logline.incitingIncident).toContain('reflected');
    expect(plan.logline.stakes).toContain('killer');
  });

  it('leaves NF arrays empty for fiction projects', () => {
    expect(plan.nfChapters).toEqual([]);
  });

  it('leaves reserved slots (promises, claims, figures, researchItems) empty until later milestones populate them', () => {
    expect(plan.promises).toEqual([]);
    expect(plan.claims).toEqual([]);
    expect(plan.figures).toEqual([]);
    expect(plan.researchItems).toEqual([]);
  });
});

// ── Fiction: drift-tolerant plot-thread reading ──────────────────────────────

describe('getWritingPlan — fiction with mixed t.type / t.threadType drift', () => {
  const state = loadFixture('fiction-legacy-thread-shape.json');
  const plan = getWritingPlan(state);

  it('normalizes t.type into canonical threadType (Drift D2 fix)', () => {
    expect(plan.plotThreads[0].threadType).toBe('mystery');
    expect(plan.plotThreads[1].threadType).toBe('relationship');
  });

  it('downstream consumers no longer need to read t.type', () => {
    for (const t of plan.plotThreads) {
      expect(t.threadType).not.toBeNull();
      expect(t.threadType).not.toBe('');
    }
  });
});

// ── NF Pipeline A: canonical state shape ─────────────────────────────────────

describe('getWritingPlan — NF Pipeline A (canonical nfStages shape)', () => {
  const state = loadFixture('nf-pipeline-a-canonical.json');
  const plan = getWritingPlan(state);

  it('reports nonfiction mode and pipeline A', () => {
    expect(plan.mode).toBe('nonfiction');
    expect(plan.pipeline).toBe('A');
  });

  it('extracts title and audience', () => {
    expect(plan.title).toBe('Leading With Disappointment');
    expect(plan.audience).toContain('managers');
  });

  it('populates NF chapters from state.nfStages["pa-chapters"]', () => {
    expect(plan.nfChapters).toHaveLength(2);
    const ch1 = plan.nfChapters[0];
    expect(ch1.number).toBe(1);
    expect(ch1.title).toBe('The Cost of Being Liked');
    expect(ch1.linkedPrinciple).toBe('opener');
  });

  it('derives manuscript and card file paths from chapter slugs', () => {
    const ch1 = plan.nfChapters[0];
    expect(ch1.slug).toBe('the-cost-of-being-liked');
    expect(ch1.manuscriptFile).toBe('manuscript/01-the-cost-of-being-liked.md');
    expect(ch1.cardFile).toBe('docs/chapters/01-the-cost-of-being-liked.md');
  });

  it('populates NF chapter sections', () => {
    const ch2 = plan.nfChapters[1];
    expect(ch2.sections.length).toBeGreaterThan(0);
    expect(ch2.sections[0].title).toContain('Hook');
    expect(ch2.sections[0].type).toBe('hook');
  });

  it('leaves fiction arrays empty for NF projects', () => {
    expect(plan.fictionChapters).toEqual([]);
    expect(plan.beats).toEqual([]);
    expect(plan.plotThreads).toEqual([]);
    expect(plan.protagonist).toBeNull();
  });
});

// ── NF Pipeline A: legacy state shape ────────────────────────────────────────

describe('getWritingPlan — NF Pipeline A (legacy top-level shape)', () => {
  const state = loadFixture('nf-pipeline-a-legacy.json');
  const plan = getWritingPlan(state);

  it('reads NF chapters from top-level state["pa-chapters"] when nfStages is empty', () => {
    expect(plan.nfChapters).toHaveLength(2);
    expect(plan.nfChapters[0].title).toBe('The Cost of Being Liked');
  });
});

// ── NF Pipeline A: legacy and canonical produce byte-identical plans ─────────

describe('getWritingPlan — legacy/canonical NF state shape parity', () => {
  it('produces byte-identical normalized output regardless of which shape captured the data', () => {
    const canonical = getWritingPlan(loadFixture('nf-pipeline-a-canonical.json'));
    const legacy = getWritingPlan(loadFixture('nf-pipeline-a-legacy.json'));
    // The two fixtures only differ in *where* the NF stage data lives —
    // nfStages.pa-chapters (canonical) vs state.pa-chapters (legacy). The
    // normalized plan must be identical. This is the regression net for
    // NF-11.0's compatibility adapter.
    expect(JSON.stringify(legacy)).toBe(JSON.stringify(canonical));
  });
});

// ── NF Pipeline B ────────────────────────────────────────────────────────────

describe('getWritingPlan — NF Pipeline B', () => {
  const state = loadFixture('nf-pipeline-b.json');
  const plan = getWritingPlan(state);

  it('reports pipeline B and reads pb-chapters', () => {
    expect(plan.pipeline).toBe('B');
    expect(plan.nfChapters).toHaveLength(2);
  });

  it('surfaces pipeline-B-specific anchor (chapterQuestion)', () => {
    const ch1 = plan.nfChapters[0];
    expect(ch1.chapterQuestion).toContain('March 4th');
  });
});

// ── NF Pipeline C ────────────────────────────────────────────────────────────

describe('getWritingPlan — NF Pipeline C', () => {
  const state = loadFixture('nf-pipeline-c.json');
  const plan = getWritingPlan(state);

  it('reports pipeline C and reads pc-lessons', () => {
    expect(plan.pipeline).toBe('C');
    expect(plan.nfChapters).toHaveLength(2);
  });

  it('surfaces pipeline-C-specific anchor (learningObjective)', () => {
    const ch1 = plan.nfChapters[0];
    expect(ch1.learningObjective).toContain('pinch grip');
  });

  it('uses lesson titles for slugs', () => {
    expect(plan.nfChapters[0].slug).toBe('hold-the-knife-like-you-mean-it');
    expect(plan.nfChapters[0].manuscriptFile).toContain('01-hold-the-knife-like-you-mean-it.md');
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('getWritingPlan — edge cases', () => {
  it('returns the empty base plan when mode is null', () => {
    const plan = getWritingPlan({
      _meta: { projectPath: null, createdAt: null, updatedAt: null },
      mode: null,
      pipeline: 'novel',
      subMode: null,
      bookDna: {},
      nfStages: {},
      stages: {},
      genre: { primaryGenre: null, subGenre: null, targetWordCount: 80000, tone: null, audience: null, genreVariant: 'standard' },
      premise: { rawLogline: null, conceptHook: null, seriesPotential: null, seriesContext: { isSeries: false, seriesTitle: null, bookCount: null, currentBookNumber: 1, overallArc: null, firstBookFocus: null } },
      protagonist: { name: null, age: null, occupation: null, dailyLife: null, want: null, need: null, ghost: null, flaw: null, coreLie: null, arcDirection: null, voice: null },
      characters: [],
      relationships: [],
      logline: { sentence: null, setup: null, incitingIncident: null, stakes: null, resolutionHint: null, antagonistQuestion: null },
      beatSheet: { genreVariant: 'standard', beats: {}, overallNotes: null },
      bStory: { character: null, premise: null, beats: {}, resolution: null, themeConnection: null },
      subplots: [],
      sceneOutline: { highLevel: [], approved: false, fleshedChapters: [] },
      plotThreads: [],
      chapterOutline: [],
      critique: { flaggedIssues: [], resolvedIssues: [], pacingAnalysis: null, characterConsistency: null, beatSheetValidation: null },
      masterDoc: { generatedAt: null, markdown: null, wordCountEstimate: null },
      writing: { manuscriptPath: 'manuscript' },
    });
    expect(plan.mode).toBeNull();
    expect(plan.protagonist).toBeNull();
    expect(plan.fictionChapters).toEqual([]);
    expect(plan.nfChapters).toEqual([]);
    expect(plan.beats).toEqual([]);
  });

  it('returns null protagonist when name is missing', () => {
    const state = loadFixture('fiction-real-world.json');
    state.protagonist.name = null;
    expect(getWritingPlan(state).protagonist).toBeNull();
  });

  it('handles a fiction project with empty characters/relationships/threads gracefully', () => {
    const state = loadFixture('fiction-real-world.json');
    state.characters = [];
    state.relationships = [];
    state.plotThreads = [];
    const plan = getWritingPlan(state);
    expect(plan.cast).toEqual([]);
    expect(plan.relationships).toEqual([]);
    expect(plan.plotThreads).toEqual([]);
    // Beats should still populate from beatSheet.
    expect(plan.beats).toHaveLength(15);
  });

  it('returns empty NF chapters when pipeline data is missing', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json');
    state.nfStages = {};
    const plan = getWritingPlan(state);
    expect(plan.nfChapters).toEqual([]);
  });

  it('does not throw on pipeline=novel with mode=nonfiction (pre-dna-consolidate state)', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json');
    state.pipeline = 'novel';  // user hasn't picked yet
    expect(() => getWritingPlan(state)).not.toThrow();
    expect(getWritingPlan(state).nfChapters).toEqual([]);
  });
});

// ── Drift-prevention contract ────────────────────────────────────────────────

describe('getWritingPlan — drift-prevention contract', () => {
  it('beat order matches the canonical schema (FIC-A.0 audit D1 — chapter cards must use canonical IDs)', () => {
    const state = loadFixture('fiction-real-world.json');
    const plan = getWritingPlan(state);
    const ids = plan.beats.map(b => b.id);
    expect(ids).toEqual([
      'beat01OpeningImage',
      'beat02Setup',
      'beat03Catalyst',
      'beat04Debate',
      'beat05BreakIntoTwo',
      'beat06BStory',
      'beat07FunAndGames',
      'beat08Midpoint',
      'beat09BadGuysCloseIn',
      'beat10AllIsLost',
      'beat11BlackMoment',  // NOT beat11DarkNightOfTheSoul
      'beat12Beat13',       // NOT beat12BreakIntoThree
      'beat13Finale',
      'beat14FinalImage',
      'beat15EndCredits',
    ]);
  });

  it('every plot thread normalized output has threadType (never undefined or null when source has either field)', () => {
    const state = loadFixture('fiction-legacy-thread-shape.json');
    const plan = getWritingPlan(state);
    for (const t of plan.plotThreads) {
      expect(t.threadType, `thread ${t.id} should have threadType`).toBeTruthy();
    }
  });

  it('downstream code never needs to branch on pipeline — same WritingPlan shape for all four modes', () => {
    const fiction = getWritingPlan(loadFixture('fiction-real-world.json'));
    const nfA = getWritingPlan(loadFixture('nf-pipeline-a-canonical.json'));
    const nfB = getWritingPlan(loadFixture('nf-pipeline-b.json'));
    const nfC = getWritingPlan(loadFixture('nf-pipeline-c.json'));
    // Same top-level keys across all four.
    const keys = (o) => Object.keys(o).sort();
    expect(keys(fiction)).toEqual(keys(nfA));
    expect(keys(nfA)).toEqual(keys(nfB));
    expect(keys(nfB)).toEqual(keys(nfC));
  });
});

// ── FIC-A.3: scene capture/render reconciliation (Drift D3) ──────────────────
//
// Pre-FIC-A.3, the chapterOutline stage guide captured 7 scene fields but
// renderers (master-doc, stage-doc, chapter-cards) read 11. The fix was to
// expand the guide to capture the 4 missing fields. This test pins the
// expanded shape so future drift fails loudly.

describe('chapterOutline scene schema — capture matches render', () => {
  it('chapterOutline.nested.scenes captures every field the renderers display', async () => {
    const { STAGE_GUIDES } = await import('../packages/core/dist/ai/stage-guides.js');
    const sceneFields = STAGE_GUIDES.chapterOutline.repeatable.nested.fields.map(f => f.key);
    // The full set: 7 originally captured + 4 added in FIC-A.3.
    const expected = [
      'sceneNumber', 'pov', 'location', 'timeOfDay', 'summary',
      'purpose', 'conflict', 'whatChanges', 'beats', 'estimatedWords',
      'notes',
    ];
    for (const key of expected) {
      expect(sceneFields, `scene field "${key}" must be captured`).toContain(key);
    }
  });

  it('required scene fields include core fields plus FIC-B contract fields', async () => {
    const { STAGE_GUIDES } = await import('../packages/core/dist/ai/stage-guides.js');
    const fields = STAGE_GUIDES.chapterOutline.repeatable.nested.fields;
    const required = fields.filter(f => f.required).map(f => f.key);
    // FIC-A.3 added only optional fields; FIC-B.1 adds goal/obstacle/stakes/storyTurn as required.
    expect(required.sort()).toEqual([
      'conflict', 'goal', 'obstacle', 'pov', 'sceneNumber', 'stakes', 'storyTurn', 'summary', 'whatChanges',
    ]);
  });
});
