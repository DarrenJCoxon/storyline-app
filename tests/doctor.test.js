// storyline doctor — cross-surface drift detection.
//
// Verifies the exact bug class that triggered this feature: stages 12/13/14
// generating prose artefacts on disk while state.json stayed stuck at
// stage 11. The doctor must catch that as an 'orphan-artefact' error so
// the /storyline skill's stage-closure protocol halts on it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { DEFAULT_STATE } from '../lib/state/project-state.js';
import { runDoctor, formatDoctorReport } from '../lib/doctor.js';

// Build a plausibly-complete state up to a given stage. Each entry
// populates the minimum structured data needed for that stage's
// requirements to pass.
function stateCompleteThrough(stageId) {
  const order = [
    'genre', 'premise', 'protagonist', 'characters', 'relationships',
    'logline', 'beatSheet', 'bStory', 'subplots', 'sceneOutline',
    'plotThreads', 'chapterOutline', 'critique', 'masterDoc',
  ];
  const s = JSON.parse(JSON.stringify(DEFAULT_STATE));

  const fillers = {
    genre: () => { s.genre = { primaryGenre: 'thriller', tone: 'dark', audience: 'adult' }; },
    premise: () => { s.premise = { ...s.premise, rawLogline: 'A hacker...', conceptHook: 'what if' }; },
    protagonist: () => { s.protagonist = { name: 'Jane', want: 'win', need: 'heal', flaw: 'trust', coreLie: 'alone' }; },
    characters: () => { s.characters = [{ name: 'Bob' }]; },
    relationships: () => { s.relationships = [{ characterA: 'Jane', characterB: 'Bob', connection: 'ally' }]; },
    logline: () => { s.logline = { sentence: 'when...', incitingIncident: 'x', stakes: 'y' }; },
    beatSheet: () => { s.beatSheet = { ...s.beatSheet, beats: { ...s.beatSheet.beats, beat08Midpoint: { midpointType: 'False Victory' } } }; },
    bStory: () => { s.bStory = { character: 'M', premise: 'theme' }; },
    subplots: () => {},  // skippable, no fields
    sceneOutline: () => { s.sceneOutline = { highLevel: [{ beat: '1' }], approved: true, fleshedChapters: [] }; },
    plotThreads: () => {},  // skippable
    chapterOutline: () => { s.chapterOutline = [{ chapterNumber: 1, chapterTitle: 'One', scenes: [] }]; },
    critique: () => {},  // skippable, no fields
    masterDoc: () => {},  // skippable, no fields
  };

  const idx = order.indexOf(stageId);
  for (let i = 0; i <= idx; i++) fillers[order[i]]();
  return s;
}

describe('storyline doctor — orphan artefact detection', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-doctor-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('reports no drift when state is aligned with no orphan artefacts', async () => {
    const state = stateCompleteThrough('plotThreads');
    const report = await runDoctor(state, tmp);
    expect(report.drift).toBe(false);
    expect(report.ok).toBe(true);
    expect(report.findings).toHaveLength(0);
  });

  it('flags the exact bug class: docs/13-chapter-flesh-out.md exists but chapterOutline is empty', async () => {
    const state = stateCompleteThrough('plotThreads');  // stuck at stage 11
    mkdirSync(resolve(tmp, 'docs'), { recursive: true });
    writeFileSync(resolve(tmp, 'docs', '13-chapter-flesh-out.md'), '# fake chapters\n');

    const report = await runDoctor(state, tmp);
    expect(report.ok).toBe(false);
    expect(report.drift).toBe(true);
    const orphans = report.findings.filter(f => f.type === 'orphan-artefact');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].stageId).toBe('chapterOutline');
    expect(orphans[0].artefacts).toContain('docs/13-chapter-flesh-out.md');
    expect(orphans[0].fix).toContain('storyline save chapterOutline');
  });

  it('flags docs/14-consistency-critique.md as orphan when critique is empty on a chapterless project', async () => {
    const state = stateCompleteThrough('plotThreads');
    mkdirSync(resolve(tmp, 'docs'), { recursive: true });
    writeFileSync(resolve(tmp, 'docs', '14-consistency-critique.md'), '# critique\n');
    const report = await runDoctor(state, tmp);
    // critique is skippable with fields: [] — but only "complete" once
    // chapterOutline is populated (the deriver walks in order). With
    // chapterOutline empty, critique IS incomplete and the orphan doc flags.
    const critiqueOrphan = report.findings.find(
      f => f.type === 'orphan-artefact' && f.stageId === 'critique',
    );
    expect(critiqueOrphan).toBeTruthy();
  });

  it('flags docs/master-document.md as orphan when masterDoc is incomplete', async () => {
    const state = stateCompleteThrough('plotThreads');
    mkdirSync(resolve(tmp, 'docs'), { recursive: true });
    writeFileSync(resolve(tmp, 'docs', 'master-document.md'), '# master\n');
    const report = await runDoctor(state, tmp);
    const masterOrphan = report.findings.find(
      f => f.type === 'orphan-artefact' && f.stageId === 'masterDoc',
    );
    expect(masterOrphan).toBeTruthy();
    expect(masterOrphan.artefacts).toContain('docs/master-document.md');
  });

  it('reports all three orphans together (the Voynich project case)', async () => {
    const state = stateCompleteThrough('plotThreads');
    mkdirSync(resolve(tmp, 'docs'), { recursive: true });
    writeFileSync(resolve(tmp, 'docs', '13-chapter-flesh-out.md'), '# chapters\n');
    writeFileSync(resolve(tmp, 'docs', '14-consistency-critique.md'), '# critique\n');
    writeFileSync(resolve(tmp, 'docs', 'master-document.md'), '# master\n');
    const report = await runDoctor(state, tmp);
    const stageIds = report.findings
      .filter(f => f.type === 'orphan-artefact')
      .map(f => f.stageId)
      .sort();
    expect(stageIds).toEqual(['chapterOutline', 'critique', 'masterDoc']);
  });

  it('clears the flag once the missing stage is saved (chapterOutline populated)', async () => {
    const state = stateCompleteThrough('chapterOutline');
    mkdirSync(resolve(tmp, 'docs'), { recursive: true });
    writeFileSync(resolve(tmp, 'docs', '13-chapter-flesh-out.md'), '# chapters\n');
    const report = await runDoctor(state, tmp);
    const chOrphan = report.findings.find(
      f => f.type === 'orphan-artefact' && f.stageId === 'chapterOutline',
    );
    expect(chOrphan).toBeUndefined();
  });

  it('finds output/stages/<id>.md that exists despite stage being incomplete', async () => {
    const state = stateCompleteThrough('bStory');
    mkdirSync(resolve(tmp, 'output', 'stages'), { recursive: true });
    writeFileSync(resolve(tmp, 'output', 'stages', 'sceneOutline.md'), '# outline\n');
    const report = await runDoctor(state, tmp);
    const orphan = report.findings.find(f => f.stageId === 'sceneOutline');
    expect(orphan).toBeTruthy();
    expect(orphan.artefacts).toContain('output/stages/sceneOutline.md');
  });
});

describe('storyline doctor — stale completion marker', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-doctor-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('warns when state.stages[id].completed=true but requirements fail', async () => {
    const state = stateCompleteThrough('genre');
    state.stages = { protagonist: { completed: true, completedAt: '2026-01-01' } };
    // protagonist requirements are NOT met (empty protagonist object)
    const report = await runDoctor(state, tmp);
    const stale = report.findings.find(f => f.type === 'stale-completion-marker');
    expect(stale).toBeTruthy();
    expect(stale.stageId).toBe('protagonist');
    expect(stale.severity).toBe('warning');
  });

  it('does not warn when completion marker is consistent with requirements', async () => {
    const state = stateCompleteThrough('protagonist');
    state.stages = { protagonist: { completed: true, completedAt: '2026-01-01' } };
    const report = await runDoctor(state, tmp);
    const stale = report.findings.filter(f => f.type === 'stale-completion-marker');
    expect(stale).toHaveLength(0);
  });
});

describe('formatDoctorReport', () => {
  it('reports "no drift" when clean', () => {
    const text = formatDoctorReport({ ok: true, drift: false, findings: [] });
    expect(text).toContain('no drift');
  });

  it('lists errors with fix hints', () => {
    const text = formatDoctorReport({
      ok: false,
      drift: true,
      findings: [{
        type: 'orphan-artefact',
        severity: 'error',
        stageId: 'chapterOutline',
        stageName: 'Chapter Flesh-Out',
        message: 'Artefact on disk but not in state.',
        artefacts: ['docs/13-chapter-flesh-out.md'],
        fix: 'storyline save chapterOutline ...',
      }],
    });
    expect(text).toContain('DRIFT');
    expect(text).toContain('orphan-artefact:chapterOutline');
    expect(text).toContain('docs/13-chapter-flesh-out.md');
    expect(text).toContain('fix: storyline save chapterOutline');
  });
});
