// FIC-A.4 — Regression nets for the verified drift fixes.
//
// Drift D1: BEAT_NAMES tables in chapter-card renderers must use canonical
// schema beat IDs (beat11BlackMoment, beat12Beat13) — not the legacy
// aliases that displayed raw IDs in chapter cards.
//
// Drift D2: master-doc renderers must read plot-thread type via
// `t.threadType` (canonical) with `t.type` as a defensive fallback —
// reading only `t.type` produced "undefined" in the rendered table.
//
// Anchored to docs/roadmap/fiction-book-brain/00-fiction-audit-2026-04-28.md.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { DEFAULT_STATE as ROOT_DEFAULT_STATE } from '../lib/state/project-state.js';
// Use the core TS version (compiled to dist) — it takes projectPath explicitly
// rather than relying on process.cwd(), which vitest workers don't support.
import { generateMasterDocument } from '../packages/core/dist/output/master-doc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CANONICAL_BEAT_IDS = [
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
  'beat11BlackMoment',
  'beat12Beat13',
  'beat13Finale',
  'beat14FinalImage',
  'beat15EndCredits',
];

const DRIFTED_BEAT_IDS = ['beat11DarkNightOfTheSoul', 'beat12BreakIntoThree'];

// ── D1: BEAT_NAMES tables in three rendering files ───────────────────────────

describe('Drift D1 — BEAT_NAMES tables use canonical schema IDs', () => {
  const tablesToCheck = [
    'lib/output/chapter-doc.js',
    'extension/lib/output/chapter-doc.js',
    'extension/src/editor/chapter-cards.ts',
  ];

  for (const rel of tablesToCheck) {
    it(`${rel} contains every canonical beat ID and none of the drifted IDs`, () => {
      const src = readFileSync(resolve(__dirname, '..', rel), 'utf-8');
      for (const id of CANONICAL_BEAT_IDS) {
        expect(src, `${rel} must contain canonical beat ID "${id}"`).toContain(id);
      }
      for (const id of DRIFTED_BEAT_IDS) {
        expect(src, `${rel} must NOT contain drifted beat ID "${id}"`).not.toContain(id);
      }
    });
  }

  it('canonical schema in lib/state/project-state.js declares the same 15 beat IDs', () => {
    const beatIds = Object.keys(ROOT_DEFAULT_STATE.beatSheet.beats);
    expect(beatIds.sort()).toEqual([...CANONICAL_BEAT_IDS].sort());
  });
});

// ── D2: master-doc renders plot-thread type, not "undefined" ─────────────────

describe('Drift D2 — plot-thread Type column reads canonical threadType', () => {
  let tmp;

  beforeEach(() => {
    tmp = mkdtempSync(resolve(tmpdir(), 'storyline-d2-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function fictionStateWithThreads(threads) {
    return {
      ...ROOT_DEFAULT_STATE,
      _meta: { ...ROOT_DEFAULT_STATE._meta, projectTitle: 'D2 Test', projectPath: tmp },
      mode: 'fiction',
      genre: { ...ROOT_DEFAULT_STATE.genre, primaryGenre: 'Mystery', tone: 'Tense', audience: 'Adult' },
      plotThreads: threads,
    };
  }

  it('renders threadType correctly when state captures under canonical "threadType"', async () => {
    const state = fictionStateWithThreads([
      { id: 't1', name: 'The mystery', threadType: 'mystery', status: 'open', resolutionPlan: 'Reveal' },
      { id: 't2', name: 'A relationship', threadType: 'relationship', status: 'open', resolutionPlan: 'Reconcile' },
    ]);
    await generateMasterDocument(state, tmp);
    const md = readFileSync(resolve(tmp, 'planning/master-document.md'), 'utf-8');
    expect(md).toContain('| mystery |');
    expect(md).toContain('| relationship |');
    expect(md, 'D2 regression: column must never show literal "undefined"').not.toContain('| undefined |');
  });

  it('falls back to legacy "type" field for backward compatibility', async () => {
    const state = fictionStateWithThreads([
      { id: 't1', name: 'Legacy thread', type: 'mystery', status: 'open', resolutionPlan: 'Reveal' },
    ]);
    await generateMasterDocument(state, tmp);
    const md = readFileSync(resolve(tmp, 'planning/master-document.md'), 'utf-8');
    expect(md).toContain('| mystery |');
    expect(md).not.toContain('| undefined |');
  });

  it('renders "-" placeholder when neither field is set', async () => {
    const state = fictionStateWithThreads([
      { id: 't1', name: 'Bare thread', status: 'open' },
    ]);
    await generateMasterDocument(state, tmp);
    const md = readFileSync(resolve(tmp, 'planning/master-document.md'), 'utf-8');
    expect(md).not.toContain('| undefined |');
    expect(md).toContain('| - |');
  });

  it('handles mixed canonical and legacy threads in the same project', async () => {
    const state = fictionStateWithThreads([
      { id: 't1', name: 'Canonical', threadType: 'mystery', status: 'open' },
      { id: 't2', name: 'Legacy', type: 'character-arc', status: 'open' },
      { id: 't3', name: 'Both — canonical wins', threadType: 'relationship', type: 'should-be-ignored', status: 'open' },
    ]);
    await generateMasterDocument(state, tmp);
    const md = readFileSync(resolve(tmp, 'planning/master-document.md'), 'utf-8');
    expect(md).toContain('| mystery |');
    expect(md).toContain('| character-arc |');
    expect(md).toContain('| relationship |');
    expect(md).not.toContain('| should-be-ignored |');
    expect(md).not.toContain('| undefined |');
  });
});
