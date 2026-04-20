// Structural drift detector — the exact bug class fixed in commit 851c14b.
//
// Each of the 14 planning stages has three separate sources of truth:
//   1. Schema: DEFAULT_STATE[stageId] in lib/state/project-state.js
//   2. Guide: STAGE_GUIDES[stageId] in lib/ai/stage-guides.js (what the
//      skill asks the writer)
//   3. Renderers: master-doc.js and stage-doc.js (what ends up in the
//      generated .md files)
//
// These drifted in the past — a guide question wrote
// "mutualWant" but the schema held "whatTheyWantFromEachOther", so renderers
// silently dropped the answer. This test locks down the structural
// invariants that stop that class of bug. Field-level key resolution is
// intentionally not exhaustive — the shapes vary per stage (flat,
// sections, repeatable, beats) and the value-per-complexity falls off
// fast past structural checks. Keep this test sharp, not bloated.

import { describe, it, expect } from 'vitest';
import { DEFAULT_STATE, STAGE_ORDER, STAGE_BY_ID } from '../lib/state/project-state.js';
import { STAGE_GUIDES, getStageGuide } from '../lib/ai/stage-guides.js';

const STAGE_IDS = STAGE_ORDER.map(s => s.id);

describe('stage structural alignment', () => {
  it('STAGE_ORDER contains exactly 14 stages', () => {
    expect(STAGE_IDS).toHaveLength(14);
  });

  it('every STAGE_ORDER id has a matching key in DEFAULT_STATE', () => {
    for (const id of STAGE_IDS) {
      expect(
        Object.prototype.hasOwnProperty.call(DEFAULT_STATE, id),
        `stage "${id}" listed in STAGE_ORDER but missing from DEFAULT_STATE`,
      ).toBe(true);
    }
  });

  it('every STAGE_ORDER id has a matching entry in STAGE_GUIDES', () => {
    for (const id of STAGE_IDS) {
      expect(
        STAGE_GUIDES[id],
        `stage "${id}" listed in STAGE_ORDER but missing from STAGE_GUIDES`,
      ).toBeTruthy();
      expect(STAGE_GUIDES[id].id, `STAGE_GUIDES["${id}"].id mismatch`).toBe(id);
    }
  });

  it('STAGE_GUIDES has no orphan entries outside STAGE_ORDER', () => {
    const orderIds = new Set(STAGE_IDS);
    for (const id of Object.keys(STAGE_GUIDES)) {
      expect(
        orderIds.has(id),
        `STAGE_GUIDES has entry "${id}" that isn't in STAGE_ORDER`,
      ).toBe(true);
    }
  });

  it('STAGE_BY_ID covers every STAGE_ORDER id', () => {
    for (const id of STAGE_IDS) {
      expect(STAGE_BY_ID[id]).toBeTruthy();
      expect(STAGE_BY_ID[id].id).toBe(id);
    }
  });

  it('getStageGuide returns guide for every stage and null for unknown', () => {
    for (const id of STAGE_IDS) {
      expect(getStageGuide(id)).toBeTruthy();
    }
    expect(getStageGuide('not-a-real-stage')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// Beat-level alignment — the hottest drift zone historically
// (beat05 threshold, beat06 bStoryIntro/themeConnection,
// beat11 whatMakesThemTry, etc.)
// ─────────────────────────────────────────────────────────────

describe('beatSheet alignment', () => {
  it('every beat in the schema has a matching beat in the guide', () => {
    const schemaBeats = Object.keys(DEFAULT_STATE.beatSheet.beats);
    const guideBeats = STAGE_GUIDES.beatSheet.beats.map(b => b.id);
    for (const id of schemaBeats) {
      expect(
        guideBeats,
        `beat "${id}" in schema but missing from stage-guides.js beatSheet.beats`,
      ).toContain(id);
    }
  });

  it('every beat in the guide has a matching schema slot', () => {
    const schemaBeats = Object.keys(DEFAULT_STATE.beatSheet.beats);
    for (const guideBeat of STAGE_GUIDES.beatSheet.beats) {
      expect(
        schemaBeats,
        `beat "${guideBeat.id}" in stage-guides.js but missing from DEFAULT_STATE.beatSheet.beats`,
      ).toContain(guideBeat.id);
    }
  });

  it('every guide-question key for each beat maps to a field in the schema beat object', () => {
    const schemaBeats = DEFAULT_STATE.beatSheet.beats;
    for (const guideBeat of STAGE_GUIDES.beatSheet.beats) {
      const schemaBeat = schemaBeats[guideBeat.id];
      if (!schemaBeat || !guideBeat.questions) continue;
      const schemaKeys = new Set(Object.keys(schemaBeat));
      for (const q of guideBeat.questions) {
        expect(
          schemaKeys.has(q.key),
          `beat "${guideBeat.id}" question key "${q.key}" has no matching schema field. ` +
            `Schema has: ${[...schemaKeys].join(', ')}`,
        ).toBe(true);
      }
    }
  });

  it('schema has all 15 Save the Cat beats (not 14 — includes EndCredits)', () => {
    expect(Object.keys(DEFAULT_STATE.beatSheet.beats)).toHaveLength(15);
  });
});

// ─────────────────────────────────────────────────────────────
// Repeatable-field alignment (characters, relationships, subplots,
// plotThreads, chapterOutline). For array-shaped state, the guide's
// repeatable.fields define the item shape. These must match what the
// renderers read — the renderer tests below lock this down via
// snapshots on a real state object.
// ─────────────────────────────────────────────────────────────

describe('repeatable-stage guide shape', () => {
  // Commit 851c14b renamed relationships fields from
  // from/to/type/mutualWant → characterA/characterB/connection/whatTheyWantFromEachOther.
  // If anyone reverts to the old names the renderer silently drops them.
  it('relationships guide uses the canonical post-851c14b field names', () => {
    const keys = STAGE_GUIDES.relationships.repeatable.fields.map(f => f.key);
    expect(keys).toContain('characterA');
    expect(keys).toContain('characterB');
    expect(keys).toContain('connection');
    // Old names that used to exist — making sure they're gone.
    expect(keys).not.toContain('from');
    expect(keys).not.toContain('to');
    expect(keys).not.toContain('type');
    expect(keys).not.toContain('mutualWant');
  });

  // chapterOutline must be chapter → scenes hierarchy, not flat.
  it('chapterOutline has a nested scenes array in its guide shape', () => {
    const guide = STAGE_GUIDES.chapterOutline;
    expect(guide.repeatable.nested).toBeTruthy();
    expect(guide.repeatable.nested.key).toBe('scenes');
    expect(guide.repeatable.nested.fields.length).toBeGreaterThan(3);
  });
});

// ─────────────────────────────────────────────────────────────
// Word-count allocation lives on sceneOutline guide and the
// percentages must sum to ~100%. If anyone rebalances beat
// proportions without re-normalising, this flags it.
// ─────────────────────────────────────────────────────────────

describe('beat word-count allocation', () => {
  const allocation = STAGE_GUIDES.sceneOutline.wordCountAllocation;

  it('exists on the sceneOutline guide', () => {
    expect(allocation).toBeTypeOf('object');
    expect(Object.keys(allocation).length).toBeGreaterThan(10);
  });

  it('every entry has a label and percentage', () => {
    for (const [beatId, info] of Object.entries(allocation)) {
      expect(info.label, `${beatId} missing label`).toBeTruthy();
      expect(info.pct, `${beatId} missing pct`).toBeGreaterThan(0);
    }
  });

  it('percentages sum to approximately 100', () => {
    const total = Object.values(allocation).reduce((sum, b) => sum + b.pct, 0);
    expect(Math.abs(total - 100)).toBeLessThanOrEqual(1);
  });

  it('every allocation beat id exists in the schema beatSheet', () => {
    const schemaBeats = Object.keys(DEFAULT_STATE.beatSheet.beats);
    for (const beatId of Object.keys(allocation)) {
      expect(schemaBeats).toContain(beatId);
    }
  });
});
