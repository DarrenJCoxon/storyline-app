// Tests for core modules: transitions, gates, story traps, quality checklist, persona routing
import { describe, it, expect } from 'vitest';
import { deriveCurrentStage, calculateProgress, getMissingRequirements, checkGate, getDownstreamImpacts } from '../lib/state/transitions.js';
import { runStoryTraps, formatTrapResults } from '../lib/ai/story-traps.js';
import { getPersonaForStage, formatPersonaIntro, runQualityChecklist, getProbingQuestions } from '../lib/ai/coaching-personas.js';

// ─────────────────────────────────────────────────────────────
// Stage Derivation
// ─────────────────────────────────────────────────────────────

describe('deriveCurrentStage', () => {
  it('returns genre when state is empty', () => {
    const state = { genre: {}, premise: {}, protagonist: {}, characters: [], relationships: [], logline: {}, beatSheet: { beats: {} }, bStory: {}, subplots: [], sceneOutline: { highLevel: [], approved: false }, plotThreads: [], chapterOutline: [], critique: { flaggedIssues: [] }, masterDoc: {} };
    const result = deriveCurrentStage(state);
    expect(result).toBeTruthy();
    expect(result.id).toBe('genre');
  });

  it('returns premise when genre is complete', () => {
    const state = {
      genre: { primaryGenre: 'thriller', tone: 'dark', audience: 'adult' },
      premise: {},
      protagonist: {},
      characters: [],
      relationships: [],
      logline: {},
      beatSheet: { beats: {} },
      bStory: {},
      subplots: [],
      sceneOutline: { highLevel: [], approved: false },
      plotThreads: [],
      chapterOutline: [],
      critique: { flaggedIssues: [] },
      masterDoc: {},
    };
    const result = deriveCurrentStage(state);
    expect(result.id).toBe('premise');
  });

  it('returns beatSheet when earlier stages are complete', () => {
    const state = {
      genre: { primaryGenre: 'thriller', tone: 'dark', audience: 'adult' },
      premise: { rawLogline: 'A hacker...', conceptHook: 'What if...' },
      protagonist: { name: 'Jane', want: 'find the truth', need: 'accept loss', flaw: 'trusts no one' },
      characters: [{ name: 'Bob' }],
      relationships: [{ from: 'Jane', to: 'Bob' }],
      logline: { sentence: 'When...', incitingIncident: 'hack', stakes: 'life' },
      beatSheet: { beats: {} },
      bStory: {},
      subplots: [],
      sceneOutline: { highLevel: [], approved: false },
      plotThreads: [],
      chapterOutline: [],
      critique: { flaggedIssues: [] },
      masterDoc: {},
    };
    const result = deriveCurrentStage(state);
    expect(result.id).toBe('beatSheet');
  });

  it('returns null when all stages complete', () => {
    const state = {
      genre: { primaryGenre: 'thriller', tone: 'dark', audience: 'adult' },
      premise: { rawLogline: 'x', conceptHook: 'y' },
      protagonist: { name: 'J', want: 'w', need: 'n', flaw: 'f' },
      characters: [{ name: 'B' }],
      relationships: [{ from: 'J', to: 'B' }],
      logline: { sentence: 's', incitingIncident: 'i', stakes: 'h' },
      beatSheet: { beats: { beat08Midpoint: { midpointType: 'False Victory' } } },
      bStory: { character: 'Mentor', premise: 'Trust' },
      subplots: [],
      sceneOutline: { highLevel: [{ beat: 'Beat 1' }], approved: true },
      plotThreads: [{ id: 't1' }],
      chapterOutline: [{ chapterNumber: 1 }],
      critique: { flaggedIssues: [] },
      masterDoc: {},
    };
    const result = deriveCurrentStage(state);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// Progress Calculation
// ─────────────────────────────────────────────────────────────

describe('calculateProgress', () => {
  it('counts skippable stages with no requirements as complete', () => {
    const state = { genre: {}, premise: {}, protagonist: {}, characters: [], relationships: [], logline: {}, beatSheet: { beats: {} }, bStory: {}, subplots: [], sceneOutline: { highLevel: [], approved: false }, plotThreads: [], chapterOutline: [], critique: { flaggedIssues: [] }, masterDoc: {} };
    const progress = calculateProgress(state);
    // Skippable stages with no requirements (subplots, critique, masterDoc) count as complete
    expect(progress).toBeGreaterThan(0);
  });

  it('increases when genre is complete', () => {
    const state = { genre: { primaryGenre: 'thriller', tone: 'dark', audience: 'adult' }, premise: {}, protagonist: {}, characters: [], relationships: [], logline: {}, beatSheet: { beats: {} }, bStory: {}, subplots: [], sceneOutline: { highLevel: [], approved: false }, plotThreads: [], chapterOutline: [], critique: { flaggedIssues: [] }, masterDoc: {} };
    const progress = calculateProgress(state);
    expect(progress).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Missing Requirements
// ─────────────────────────────────────────────────────────────

describe('getMissingRequirements', () => {
  it('returns all missing genre fields for empty state', () => {
    const state = { genre: {} };
    const missing = getMissingRequirements('genre', state);
    expect(missing).toContain('primary genre');
    expect(missing).toContain('tone');
    expect(missing).toContain('audience');
  });

  it('returns empty array when all genre fields are set', () => {
    const state = { genre: { primaryGenre: 'thriller', tone: 'dark', audience: 'adult' } };
    const missing = getMissingRequirements('genre', state);
    expect(missing).toHaveLength(0);
  });

  it('returns missing protagonist fields', () => {
    const state = { protagonist: { name: 'Jane' } };
    const missing = getMissingRequirements('protagonist', state);
    expect(missing.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Gate Enforcement
// ─────────────────────────────────────────────────────────────

describe('checkGate', () => {
  it('blocks beatSheetEntry when protagonist is missing core elements', () => {
    const state = { protagonist: { name: 'Jane' } };
    const result = checkGate('beatSheetEntry', state);
    expect(result.passed).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('passes beatSheetEntry when protagonist has want, need, flaw, core lie', () => {
    const state = { protagonist: { name: 'Jane', want: 'find truth', need: 'accept loss', flaw: 'trusts no one', coreLie: 'I am alone' } };
    const result = checkGate('beatSheetEntry', state);
    expect(result.passed).toBe(true);
  });

  it('passes masterDocEntry when no unresolved errors', () => {
    const state = { critique: { flaggedIssues: [] } };
    const result = checkGate('masterDocEntry', state);
    expect(result.passed).toBe(true);
  });

  it('blocks masterDocEntry when unresolved errors exist', () => {
    const state = { critique: { flaggedIssues: [{ severity: 'error', resolution: 'unresolved' }] } };
    const result = checkGate('masterDocEntry', state);
    expect(result.passed).toBe(false);
  });

  it('passes unknown gates', () => {
    const result = checkGate('unknownGate', {});
    expect(result.passed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Downstream Impacts
// ─────────────────────────────────────────────────────────────

describe('getDownstreamImpacts', () => {
  it('returns downstream stages for genre', () => {
    const impacts = getDownstreamImpacts('genre');
    expect(impacts).toContain('beatSheet');
    expect(impacts).toContain('sceneOutline');
  });

  it('returns empty array for unknown stage', () => {
    const impacts = getDownstreamImpacts('unknownStage');
    expect(impacts).toHaveLength(0);
  });

  it('returns downstream for protagonist (most connected)', () => {
    const impacts = getDownstreamImpacts('protagonist');
    expect(impacts.length).toBeGreaterThan(3);
  });
});

// ─────────────────────────────────────────────────────────────
// Story Traps
// ─────────────────────────────────────────────────────────────

describe('runStoryTraps', () => {
  it('detects flat protagonist when want and need are identical', () => {
    const state = { protagonist: { want: 'Find the truth about the conspiracy', need: 'Find the truth about the conspiracy' } };
    const results = runStoryTraps(state);
    const flat = results.find(r => r.id === 'flatProtagonist');
    expect(flat).toBeTruthy();
  });

  it('does not flag flat protagonist when want and need differ', () => {
    const state = { protagonist: { want: 'Make partner at the law firm', need: 'Accept I am enough without external validation' } };
    const results = runStoryTraps(state);
    const flat = results.find(r => r.id === 'flatProtagonist');
    expect(flat).toBeFalsy();
  });

  it('detects structural gap when debate has no question', () => {
    const state = {
      beatSheet: {
        beats: {
          beat03Catalyst: { scene: 'A letter arrives' },
          beat04Debate: { scene: 'She hesitates' },
        },
      },
    };
    const results = runStoryTraps(state);
    const gap = results.find(r => r.id === 'structuralGap');
    expect(gap).toBeTruthy();
  });

  it('detects theme-free plot when B story has no theme connection', () => {
    const state = { bStory: { character: 'Mentor', premise: 'A wise figure' } };
    const results = runStoryTraps(state);
    const theme = results.find(r => r.id === 'themeFreePlot');
    expect(theme).toBeTruthy();
  });

  it('detects static world when opening and final images are the same', () => {
    const state = {
      beatSheet: {
        beats: {
          beat01OpeningImage: { image: 'A lonely apartment at night overlooking the city' },
          beat14FinalImage: { scene: 'A lonely apartment at night overlooking the city' },
        },
      },
    };
    const results = runStoryTraps(state);
    const staticWorld = results.find(r => r.id === 'staticWorld');
    expect(staticWorld).toBeTruthy();
  });

  it('returns empty results when state is clean', () => {
    const state = {
      protagonist: { want: 'Win the case', need: 'Learn to let go of control' },
      beatSheet: {
        beats: {
          beat03Catalyst: { scene: 'Assigned the case' },
          beat04Debate: { scene: 'Should she take it?', debateQuestion: 'Can she win without losing herself?' },
          beat05BreakIntoTwo: { scene: 'She takes the case', choice: 'Yes' },
          beat07FunAndGames: { scene: 'Building the case' },
          beat08Midpoint: { scene: 'Discovery', midpointType: 'False Victory' },
          beat09BadGuysCloseIn: { scene: 'Opposition grows' },
          beat10AllIsLost: { scene: 'Key evidence destroyed', whiffOfDeath: 'Her mentor leaves' },
          beat11BlackMoment: { scene: 'Darkest hour' },
          beat12Beat13: { scene: 'New path', secondDoorway: 'Revelation' },
          beat01OpeningImage: { image: 'A controlled office' },
          beat14FinalImage: { scene: 'An open field', contrastToOpening: 'yes' },
        },
      },
      bStory: { character: 'Mentor', premise: 'Guidance', themeConnection: 'Control vs surrender' },
    };
    const results = runStoryTraps(state);
    expect(results).toHaveLength(0);
  });
});

describe('formatTrapResults', () => {
  it('formats detected traps with names and fix protocols', () => {
    const results = [{
      id: 'flatProtagonist',
      name: 'Flat Protagonist',
      severity: 'error',
      description: 'test',
      stcReasoning: 'test reason',
      fixProtocol: ['step 1', 'step 2'],
    }];
    const output = formatTrapResults(results);
    expect(output).toContain('Flat Protagonist');
    expect(output).toContain('step 1');
  });

  it('returns clean message when no traps', () => {
    const output = formatTrapResults([]);
    expect(output).toContain('No story traps');
  });
});

// ─────────────────────────────────────────────────────────────
// Coaching Personas
// ─────────────────────────────────────────────────────────────

describe('getPersonaForStage', () => {
  it('returns The Strategist for genre', () => {
    const persona = getPersonaForStage('genre');
    expect(persona.name).toBe('The Strategist');
  });

  it('returns The Architect for protagonist', () => {
    const persona = getPersonaForStage('protagonist');
    expect(persona.name).toBe('The Architect');
  });

  it('returns The Structuralist for beatSheet', () => {
    const persona = getPersonaForStage('beatSheet');
    expect(persona.name).toBe('The Structuralist');
  });

  it('returns The Weaver for bStory', () => {
    const persona = getPersonaForStage('bStory');
    expect(persona.name).toBe('The Weaver');
  });

  it('returns The Director for sceneOutline', () => {
    const persona = getPersonaForStage('sceneOutline');
    expect(persona.name).toBe('The Director');
  });

  it('returns null for unknown stage', () => {
    const persona = getPersonaForStage('nonexistent');
    expect(persona).toBeNull();
  });
});

describe('formatPersonaIntro', () => {
  it('returns formatted intro for genre stage', () => {
    const intro = formatPersonaIntro('genre');
    expect(intro).toContain('The Strategist');
    expect(intro.length).toBeGreaterThan(50);
  });

  it('returns empty string for unknown stage', () => {
    const intro = formatPersonaIntro('nonexistent');
    expect(intro).toBe('');
  });
});

describe('getProbingQuestions', () => {
  it('returns questions for genre/tone', () => {
    const questions = getProbingQuestions('genre', 'tone');
    expect(questions.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown field', () => {
    const questions = getProbingQuestions('genre', 'nonexistent');
    expect(questions).toHaveLength(0);
  });
});

describe('runQualityChecklist', () => {
  it('returns failed checks for empty genre state', () => {
    const state = { genre: {} };
    const results = runQualityChecklist('genre', state);
    const failed = results.filter(r => !r.passed);
    expect(failed.length).toBeGreaterThan(0);
  });

  it('returns all passed for complete genre state', () => {
    const state = { genre: { primaryGenre: 'thriller', tone: 'dark', audience: 'adult', genreVariant: 'standard', targetWordCount: 80000 } };
    const results = runQualityChecklist('genre', state);
    const failed = results.filter(r => !r.passed);
    expect(failed).toHaveLength(0);
  });

  it('flags missing midpoint type in beat sheet', () => {
    const state = { beatSheet: { beats: {} } };
    const results = runQualityChecklist('beatSheet', state);
    const midpoint = results.find(r => r.check.includes('reversal'));
    expect(midpoint).toBeTruthy();
    expect(midpoint.passed).toBe(false);
  });
});

// Word-count allocation moved to tests/stage-drift.test.js — the
// allocation data now lives as STAGE_GUIDES.sceneOutline.wordCountAllocation
// rather than a function, and is naturally a structural-integrity check.