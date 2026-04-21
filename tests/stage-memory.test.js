// Comprehensive memory coverage lockdown.
//
// Every material field in DEFAULT_STATE should have a corresponding memory
// entry key. These tests assert the per-stage builder captures what matters;
// if someone adds a field to the state schema without updating the builder,
// the relevant test fails loudly.
//
// The historical bug this prevents: stage builders only emitted 10% of the
// beat sheet / scene outline / chapter outline state, so long-term agent
// memory had the structure but not the content. A future /novel session
// could say "all 15 beats are there" but not answer "what happens at the
// midpoint reversal?"

import { describe, it, expect } from 'vitest';
import { buildMemoryEntries } from '../lib/memory/stage-memory.js';

function ns(entries) { return new Map(entries.map(e => [e.key, e.value])); }

describe('buildMemoryEntries — genre', () => {
  it('captures all 6 genre fields', () => {
    const state = { genre: { primaryGenre: 'thriller', subGenre: 'psych', tone: 'dark', audience: 'adult', genreVariant: 'standard', targetWordCount: 85000 } };
    const keys = buildMemoryEntries('genre', state).map(e => e.key);
    expect(keys).toEqual(expect.arrayContaining([
      'genre:primary', 'genre:sub', 'genre:tone', 'genre:audience', 'genre:variant', 'genre:target-word-count',
    ]));
  });
});

describe('buildMemoryEntries — premise', () => {
  it('captures logline + hook', () => {
    const state = { premise: { rawLogline: 'A hacker...', conceptHook: 'what if' } };
    const keys = buildMemoryEntries('premise', state).map(e => e.key);
    expect(keys).toContain('premise:logline');
    expect(keys).toContain('premise:hook');
  });

  it('expands series context into separate entries (title, book count, current, arc, focus)', () => {
    const state = {
      premise: {
        rawLogline: 'x',
        conceptHook: 'y',
        seriesContext: { isSeries: true, seriesTitle: 'Voynich', bookCount: 3, currentBookNumber: 1, overallArc: 'uncover', firstBookFocus: 'first clue' },
      },
    };
    const keys = buildMemoryEntries('premise', state).map(e => e.key);
    expect(keys).toContain('premise:series-title');
    expect(keys).toContain('premise:series-book-count');
    expect(keys).toContain('premise:series-current-book');
    expect(keys).toContain('premise:series-arc');
    expect(keys).toContain('premise:series-book-focus');
  });
});

describe('buildMemoryEntries — protagonist', () => {
  it('captures all ten protagonist fields as separate entries', () => {
    const state = {
      protagonist: {
        name: 'Jane', age: 33, occupation: 'lawyer',
        ghost: 'father left', coreLie: 'alone', flaw: 'controls',
        want: 'partner', need: 'accept', arcDirection: 'controlled→surrender',
        voice: 'clipped', dailyLife: 'early starts',
      },
    };
    const keys = buildMemoryEntries('protagonist', state).map(e => e.key);
    for (const k of [
      'protagonist:name', 'protagonist:age', 'protagonist:occupation',
      'protagonist:wound', 'protagonist:lie', 'protagonist:flaw',
      'protagonist:want', 'protagonist:need', 'protagonist:arc',
      'protagonist:voice', 'protagonist:ordinary-world',
    ]) {
      expect(keys).toContain(k);
    }
  });
});

describe('buildMemoryEntries — characters', () => {
  it('emits one entry per field per character (not a single summary line)', () => {
    const state = {
      characters: [
        { name: 'Bob', role: 'mentor', want: 'redeem', need: 'forgive', flaw: 'stubborn', ghost: 'failed', relationshipToProtagonist: 'guides', arcSummary: 'learns', meetsProtagonistAt: 'Beat 3' },
      ],
    };
    const keys = buildMemoryEntries('characters', state).map(e => e.key);
    expect(keys).toContain('character:bob:role');
    expect(keys).toContain('character:bob:want');
    expect(keys).toContain('character:bob:flaw');
    expect(keys).toContain('character:bob:ghost');
    expect(keys).toContain('character:bob:arc');
    expect(keys).toContain('character:bob:enters-at');
  });
});

describe('buildMemoryEntries — relationships', () => {
  it('emits pair + connection + conflict + mutual-want for each relationship', () => {
    const state = {
      relationships: [
        { characterA: 'Jane', characterB: 'Bob', connection: 'ally', conflict: 'trust', whatTheyWantFromEachOther: 'loyalty' },
      ],
    };
    const keys = buildMemoryEntries('relationships', state).map(e => e.key);
    expect(keys.some(k => k.endsWith(':pair'))).toBe(true);
    expect(keys.some(k => k.endsWith(':connection'))).toBe(true);
    expect(keys.some(k => k.endsWith(':conflict'))).toBe(true);
    expect(keys.some(k => k.endsWith(':mutual-want'))).toBe(true);
  });
});

describe('buildMemoryEntries — logline', () => {
  it('captures all six logline fields', () => {
    const state = {
      logline: {
        sentence: 'when x...', setup: 'who', incitingIncident: 'event',
        stakes: 'death', resolutionHint: 'maybe', antagonistQuestion: 'who opposes',
      },
    };
    const keys = buildMemoryEntries('logline', state).map(e => e.key);
    expect(keys).toEqual(expect.arrayContaining([
      'logline:sentence', 'logline:setup', 'logline:inciting',
      'logline:stakes', 'logline:resolution-hint', 'logline:antagonist',
    ]));
  });
});

describe('buildMemoryEntries — beatSheet (the critical one)', () => {
  it('captures all 15 beats, not just 7', () => {
    const beats = {};
    const ids = [
      'beat01OpeningImage','beat02Setup','beat03Catalyst','beat04Debate',
      'beat05BreakIntoTwo','beat06BStory','beat07FunAndGames','beat08Midpoint',
      'beat09BadGuysCloseIn','beat10AllIsLost','beat11BlackMoment','beat12Beat13',
      'beat13Finale','beat14FinalImage','beat15EndCredits',
    ];
    for (const id of ids) beats[id] = { scene: `scene for ${id}` };
    const entries = buildMemoryEntries('beatSheet', { beatSheet: { beats } });
    for (const id of ids) {
      expect(entries.some(e => e.key === `beats:${id}:scene`), `beat ${id} missing`).toBe(true);
    }
  });

  it('captures every non-scene field on a beat that has them (midpoint)', () => {
    const state = { beatSheet: { beats: { beat08Midpoint: {
      scene: 'reversal', midpointType: 'False Victory', flipOrReveal: 'flip',
      stakesRaise: 'doubled', notes: 'pivot',
    } } } };
    const keys = buildMemoryEntries('beatSheet', state).map(e => e.key);
    expect(keys).toEqual(expect.arrayContaining([
      'beats:beat08Midpoint:scene',
      'beats:beat08Midpoint:midpointType',
      'beats:beat08Midpoint:flipOrReveal',
      'beats:beat08Midpoint:stakesRaise',
      'beats:beat08Midpoint:notes',
    ]));
  });

  it('flattens array-shaped beat fields (beat09 pressures[]) into a joined string', () => {
    const state = { beatSheet: { beats: { beat09BadGuysCloseIn: {
      scene: 'closing in', pressures: ['time', 'money', 'ally betrays'],
    } } } };
    const m = ns(buildMemoryEntries('beatSheet', state));
    expect(m.get('beats:beat09BadGuysCloseIn:pressures')).toMatch(/time.*money.*ally/);
  });

  it('skips empty beat fields — no blank entries pollute memory', () => {
    const state = { beatSheet: { beats: { beat03Catalyst: { scene: 'real', incitingIncident: '' } } } };
    const entries = buildMemoryEntries('beatSheet', state);
    expect(entries.some(e => e.key === 'beats:beat03Catalyst:scene')).toBe(true);
    expect(entries.some(e => e.key === 'beats:beat03Catalyst:incitingIncident')).toBe(false);
  });
});

describe('buildMemoryEntries — bStory + subplots', () => {
  it('bStory captures character, premise, theme, resolution', () => {
    const state = { bStory: { character: 'M', premise: 'p', themeConnection: 't', resolution: 'r' } };
    const keys = buildMemoryEntries('bStory', state).map(e => e.key);
    expect(keys).toEqual(expect.arrayContaining(['bstory:character', 'bstory:premise', 'bstory:theme-connection', 'bstory:resolution']));
  });

  it('subplots captures driver/premise/purpose/resolution per subplot', () => {
    const state = { subplots: [{ name: 'A', character: 'X', premise: 'p', purpose: 'u', resolution: 'r' }] };
    const keys = buildMemoryEntries('subplots', state).map(e => e.key);
    expect(keys).toContain('subplot:a:driver');
    expect(keys).toContain('subplot:a:premise');
    expect(keys).toContain('subplot:a:purpose');
    expect(keys).toContain('subplot:a:resolution');
  });
});

describe('buildMemoryEntries — sceneOutline', () => {
  it('emits one entry per high-level sequence (not just the count)', () => {
    const state = { sceneOutline: {
      approved: true,
      highLevel: [
        { act: '1', sequence: 1, highLevelSummary: 'Opening setup', servesBeats: 'Opening Image' },
        { act: '1', sequence: 2, highLevelSummary: 'Catalyst hits' },
        { act: '2A', sequence: 3, highLevelSummary: 'New world' },
      ],
    } };
    const entries = buildMemoryEntries('sceneOutline', state);
    const keys = entries.map(e => e.key);
    expect(keys).toContain('scene-outline:approved');
    expect(keys).toContain('scene-outline:sequence-count');
    // One entry per sequence with the summary text
    const seqKeys = keys.filter(k => k.startsWith('scene-outline:act'));
    expect(seqKeys).toHaveLength(3);
    const opening = entries.find(e => e.key === 'scene-outline:act1-seq1');
    expect(opening.value).toContain('Opening setup');
    expect(opening.value).toContain('Opening Image');
  });
});

describe('buildMemoryEntries — plotThreads', () => {
  it('captures every thread field (name, type, introduced-at, status, resolution)', () => {
    const state = { plotThreads: [
      { id: 't1', name: 'The Key', threadType: 'mystery', introducedAt: 'Ch 3', status: 'open', resolutionPlan: 'Ch 12 reveal' },
    ] };
    const keys = buildMemoryEntries('plotThreads', state).map(e => e.key);
    expect(keys).toEqual(expect.arrayContaining([
      'thread:t1:name', 'thread:t1:type', 'thread:t1:introduced-at',
      'thread:t1:status', 'thread:t1:resolution',
    ]));
  });
});

describe('buildMemoryEntries — chapterOutline (the heavyweight)', () => {
  it('emits per-chapter meta AND per-scene entries with every scene field', () => {
    const state = { chapterOutline: [
      {
        chapterNumber: 1,
        chapterTitle: 'Opening',
        beat: 'Opening Image',
        estimatedWords: 2500,
        scenes: [
          {
            sceneNumber: 1, pov: 'Jane', location: 'office', timeOfDay: 'night',
            summary: 'Jane catches a clue', purpose: 'establish flaw',
            conflict: 'time pressure', whatChanges: 'she decides to investigate',
            beats: 'Opening Image', notes: 'show control',
          },
        ],
      },
    ] };
    const m = ns(buildMemoryEntries('chapterOutline', state));
    // Chapter-level
    expect(m.get('chapter:1:chapter-title')).toBe('Opening');
    expect(m.get('chapter:1:beat')).toBe('Opening Image');
    expect(m.get('chapter:1:estimated-words')).toBe('2500');
    expect(m.get('chapter:1:scene-count')).toBe('1');
    // Scene-level (all 9 fields)
    expect(m.get('chapter:1:scene:1:pov')).toBe('Jane');
    expect(m.get('chapter:1:scene:1:location')).toBe('office');
    expect(m.get('chapter:1:scene:1:time-of-day')).toBe('night');
    expect(m.get('chapter:1:scene:1:summary')).toContain('Jane catches');
    expect(m.get('chapter:1:scene:1:purpose')).toContain('establish');
    expect(m.get('chapter:1:scene:1:conflict')).toContain('time');
    expect(m.get('chapter:1:scene:1:what-changes')).toContain('decides');
    expect(m.get('chapter:1:scene:1:beats')).toBe('Opening Image');
    expect(m.get('chapter:1:scene:1:notes')).toBe('show control');
  });

  it('scales linearly: 33 chapters × 3 scenes → ~100+ memory entries', () => {
    const chapters = Array.from({ length: 33 }, (_, i) => ({
      chapterNumber: i + 1,
      chapterTitle: `Ch ${i + 1}`,
      beat: 'some beat',
      scenes: Array.from({ length: 3 }, (_, j) => ({
        sceneNumber: j + 1, pov: 'Jane', summary: `scene ${i}.${j}`,
        conflict: 'c', whatChanges: 'w',
      })),
    }));
    const entries = buildMemoryEntries('chapterOutline', { chapterOutline: chapters });
    // 1 count entry + per chapter: 2 meta (title, beat) + 1 scene-count + per scene: 4 populated
    // = 1 + 33 × (3 + 3 × 4) = 1 + 33 × 15 = 496 ... verify at least ~400
    expect(entries.length).toBeGreaterThan(400);
  });
});

describe('buildMemoryEntries — critique', () => {
  it('captures analysis fields AND each flagged issue separately', () => {
    const state = { critique: {
      flaggedIssues: [
        { check: 'pacing', message: 'Act 2B drags', severity: 'warning', resolution: 'accepted' },
        { check: 'midpoint', message: 'too subtle', severity: 'note' },
      ],
      resolvedIssues: [
        { check: 'ghost', message: 'was vague', resolution: 'added specificity' },
      ],
      pacingAnalysis: 'Acts 1 and 3 tight; Act 2B runs long.',
      characterConsistency: 'Want/need threaded cleanly.',
      beatSheetValidation: 'All beats doing their job.',
    } };
    const m = ns(buildMemoryEntries('critique', state));
    expect(m.get('critique:pacing-analysis')).toContain('Act 2B');
    expect(m.get('critique:character-consistency')).toContain('threaded');
    expect(m.get('critique:beat-validation')).toContain('doing their job');
    expect(m.get('critique:flagged-count')).toBe('2');
    expect(m.get('critique:resolved-count')).toBe('1');
    // Each flagged issue has its own entry
    const flaggedKeys = [...m.keys()].filter(k => k.startsWith('critique:flagged:'));
    expect(flaggedKeys.length).toBe(2);
    const resolvedKeys = [...m.keys()].filter(k => k.startsWith('critique:resolved:'));
    expect(resolvedKeys.length).toBe(1);
  });
});

describe('buildMemoryEntries — masterDoc', () => {
  it('captures generatedAt + word count', () => {
    const state = { masterDoc: { generatedAt: '2026-04-20T12:00:00Z', wordCountEstimate: 82450 } };
    const keys = buildMemoryEntries('masterDoc', state).map(e => e.key);
    expect(keys).toEqual(expect.arrayContaining(['masterdoc:generated-at', 'masterdoc:word-count']));
  });
});

describe('buildMemoryEntries — contract invariants', () => {
  it('every entry has namespace, key, value (string), tags (array)', () => {
    const state = {
      genre: { primaryGenre: 'thriller', tone: 'dark', audience: 'adult' },
      protagonist: { name: 'Jane', want: 'x', need: 'y', flaw: 'z' },
    };
    for (const stageId of ['genre', 'protagonist']) {
      const entries = buildMemoryEntries(stageId, state);
      for (const e of entries) {
        expect(typeof e.namespace).toBe('string');
        expect(e.namespace).toMatch(/^novel:/);
        expect(typeof e.key).toBe('string');
        expect(typeof e.value).toBe('string');
        expect(Array.isArray(e.tags)).toBe(true);
        expect(e.tags).toContain(stageId);
      }
    }
  });

  it('namespace stays consistent across stages within a project', () => {
    const state = {
      _meta: { projectTitle: 'The Voynich Curse' },
      genre: { primaryGenre: 'thriller', tone: 'dark', audience: 'adult' },
      protagonist: { name: 'Jane', want: 'x', need: 'y', flaw: 'z' },
    };
    const nsGenre = buildMemoryEntries('genre', state)[0].namespace;
    const nsProtag = buildMemoryEntries('protagonist', state)[0].namespace;
    expect(nsGenre).toBe(nsProtag);
    expect(nsGenre).toBe('novel:the-voynich-curse');
  });
});
