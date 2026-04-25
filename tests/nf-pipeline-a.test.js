// NF-05 — Pipeline A (Prescriptive) tests
// Covers: stage guides, sub-mode fork, critique, framework extraction, master doc

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';

import {
  PIPELINE_A_GUIDES,
  PIPELINE_A_GUIDE_ORDER,
  getPipelineAGuide,
} from '../lib/ai/stage-guides-nf-pipeline-a.js';

import {
  PIPELINE_A_STAGES,
  PIPELINE_A_BY_ID,
  getActiveStages,
  runStage,
  extractFrameworkFromStage,
} from '../lib/stages-nf/pipeline-a/index.js';

import {
  critiquePipelineAStage,
  buildPipelineACritiqueSummary,
} from '../lib/ai/narrative-voice-nf.js';

import { generatePipelineAMaster } from '../lib/output/pipeline-a-master.js';

// ── Stage Guides ─────────────────────────────────────────────────────────────

describe('Pipeline A stage guides', () => {
  it('defines all 11 stages', () => {
    expect(Object.keys(PIPELINE_A_GUIDES)).toHaveLength(11);
  });

  it('guide order is 1–11 with no gaps', () => {
    const indexes = PIPELINE_A_GUIDE_ORDER.map(g => g.index);
    expect(indexes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('getPipelineAGuide returns guide by id', () => {
    const g = getPipelineAGuide('pa-thesis');
    expect(g).toBeDefined();
    expect(g.id).toBe('pa-thesis');
    expect(g.questions.length).toBeGreaterThan(0);
  });

  it('getPipelineAGuide returns null for unknown id', () => {
    expect(getPipelineAGuide('nonexistent')).toBeNull();
  });

  it('pa-framework has subModeDecision flag', () => {
    const g = getPipelineAGuide('pa-framework');
    expect(g.subModeDecision).toBe(true);
  });

  it('pa-braid has subModes restriction', () => {
    const g = getPipelineAGuide('pa-braid');
    expect(g.subModes).toContain('braid');
  });

  it('pa-evidence has researchIntegration field', () => {
    const g = getPipelineAGuide('pa-evidence');
    expect(g.researchIntegration).toBeDefined();
    expect(g.researchIntegration.command).toContain('research add');
  });

  it('every guide has required fields', () => {
    for (const [id, guide] of Object.entries(PIPELINE_A_GUIDES)) {
      expect(guide.id, `${id} missing id`).toBe(id);
      expect(guide.name, `${id} missing name`).toBeTruthy();
      expect(guide.index, `${id} missing index`).toBeGreaterThan(0);
    }
  });
});

// ── Sub-mode Fork ─────────────────────────────────────────────────────────────

describe('Pipeline A sub-mode fork', () => {
  it('getActiveStages("argument") excludes pa-braid', () => {
    const stages = getActiveStages('argument');
    expect(stages.some(s => s.id === 'pa-braid')).toBe(false);
    expect(stages).toHaveLength(10);
  });

  it('getActiveStages("braid") includes pa-braid', () => {
    const stages = getActiveStages('braid');
    expect(stages.some(s => s.id === 'pa-braid')).toBe(true);
    expect(stages).toHaveLength(11);
  });

  it('getActiveStages(null) excludes pa-braid (default to argument)', () => {
    const stages = getActiveStages(null);
    expect(stages.some(s => s.id === 'pa-braid')).toBe(false);
  });

  it('runStage returns skipped for pa-braid in argument mode', async () => {
    const state = { mode: 'nonfiction', pipeline: 'A', subMode: 'argument', nfStages: {} };
    const result = await runStage('pa-braid', state);
    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('braid mode');
  });

  it('runStage returns ok for pa-braid in braid mode', async () => {
    const state = { mode: 'nonfiction', pipeline: 'A', subMode: 'braid', nfStages: {} };
    const result = await runStage('pa-braid', state);
    expect(result.status).toBe('ok');
    expect(result.guide).toBeDefined();
  });
});

// ── Stage Index ───────────────────────────────────────────────────────────────

describe('PIPELINE_A_STAGES index', () => {
  it('has 11 stages total', () => {
    expect(PIPELINE_A_STAGES).toHaveLength(11);
  });

  it('PIPELINE_A_BY_ID maps all stage ids', () => {
    PIPELINE_A_STAGES.forEach(s => {
      expect(PIPELINE_A_BY_ID[s.id]).toBeDefined();
    });
  });

  it('runStage returns error for unknown stageId', async () => {
    const result = await runStage('nonexistent', {});
    expect(result.error).toBeTruthy();
  });

  it('runStage returns guide and critique for known stage', async () => {
    const state = { nfStages: {}, subMode: 'argument' };
    const result = await runStage('pa-thesis', state);
    expect(result.status).toBe('ok');
    expect(result.guide).toBeDefined();
    expect(result.critique).toBeDefined();
  });
});

// ── Framework Extraction ─────────────────────────────────────────────────────

describe('extractFrameworkFromStage', () => {
  it('returns null when no pa-framework', () => {
    expect(extractFrameworkFromStage({})).toBeNull();
    expect(extractFrameworkFromStage(null)).toBeNull();
  });

  it('returns null when modelName missing', () => {
    expect(extractFrameworkFromStage({ 'pa-framework': { title: 'X' } })).toBeNull();
  });

  it('maps framework data to Framework Card schema', () => {
    const nfStages = {
      'pa-framework': {
        modelName: '4 Laws of Clear Leadership',
        author: 'Jane Smith',
        coverAccent: '#ff0000',
        principles: [
          { number: 1, name: 'Law One', definition: 'First law of leadership' },
          { number: 2, name: 'Law Two', definition: 'Second law' },
        ],
      },
      'dna-title': { workingTitle: 'The Clarity Method' },
    };
    const fw = extractFrameworkFromStage(nfStages);
    expect(fw.modelName).toBe('4 Laws of Clear Leadership');
    expect(fw.title).toBe('The Clarity Method');
    expect(fw.coverAccent).toBe('#ff0000');
    expect(fw.principles).toHaveLength(2);
    expect(fw.principles[0].description).toBe('First law of leadership');
  });

  it('defaults coverAccent to #1e3a5f', () => {
    const nfStages = {
      'pa-framework': {
        modelName: 'The Method',
        author: 'Author',
        principles: [{ number: 1, name: 'P1' }],
      },
    };
    expect(extractFrameworkFromStage(nfStages).coverAccent).toBe('#1e3a5f');
  });
});

// ── Critique ─────────────────────────────────────────────────────────────────

describe('Pipeline A critique', () => {
  it('flags missing thesis as error', () => {
    const issues = critiquePipelineAStage('pa-thesis', {});
    expect(issues.some(i => i.type === 'error' && /thesis/i.test(i.message))).toBe(true);
  });

  it('passes clean thesis', () => {
    const issues = critiquePipelineAStage('pa-thesis', {
      thesis: 'Leaders who optimise for clarity outperform those who optimise for authority within 6 months',
      thesisBefore: 'Leaders need to assert authority to be respected',
      thesisAfter: 'Leaders need to create clarity to earn authority organically',
      thesisSentence: 'Clarity is the new authority — and you can build it in 90 days.',
    });
    expect(issues.filter(i => i.type === 'error')).toHaveLength(0);
  });

  it('flags no objections as error', () => {
    const issues = critiquePipelineAStage('pa-objections', {});
    expect(issues.some(i => i.type === 'error')).toBe(true);
  });

  it('flags fewer than 3 objections as warning', () => {
    const issues = critiquePipelineAStage('pa-objections', {
      objections: [{ objection: 'It won\'t work for me', source: 'Prior failure', response: 'Here\'s why' }],
    });
    expect(issues.some(i => /only 1 objection/i.test(i.message))).toBe(true);
  });

  it('flags missing modelName as error', () => {
    const issues = critiquePipelineAStage('pa-framework', {});
    expect(issues.some(i => /modelName|model name/i.test(i.message) && i.type === 'error')).toBe(true);
  });

  it('flags missing subMode as error', () => {
    const issues = critiquePipelineAStage('pa-framework', {
      modelName: 'The Method',
      principles: [{ name: 'P1' }, { name: 'P2' }, { name: 'P3' }],
    });
    expect(issues.some(i => /sub.?mode/i.test(i.message) && i.type === 'error')).toBe(true);
  });

  it('flags >9 principles as warning', () => {
    const manyPrinciples = Array.from({ length: 10 }, (_, i) => ({ number: i + 1, name: `Law ${i + 1}` }));
    const issues = critiquePipelineAStage('pa-framework', {
      modelName: 'The 10 Laws',
      principles: manyPrinciples,
      subMode: 'argument',
    });
    expect(issues.some(i => /10 principles/i.test(i.message))).toBe(true);
  });

  it('flags no application actions as error', () => {
    const issues = critiquePipelineAStage('pa-application', {});
    expect(issues.some(i => i.type === 'error')).toBe(true);
  });

  it('flags no braidStory in braid mode as error', () => {
    const issues = critiquePipelineAStage('pa-braid', {});
    expect(issues.some(i => i.type === 'error' && /story/i.test(i.message))).toBe(true);
  });

  it('unknown stage returns empty issues', () => {
    expect(critiquePipelineAStage('nonexistent', {})).toEqual([]);
  });

  it('buildPipelineACritiqueSummary returns structured summary', () => {
    const summary = buildPipelineACritiqueSummary('pa-thesis', {});
    expect(summary.stageId).toBe('pa-thesis');
    expect(summary.blocking).toBe(true);
    expect(Array.isArray(summary.issues)).toBe(true);
    expect(typeof summary.formatted).toBe('string');
  });
});

// ── Master Document ───────────────────────────────────────────────────────────

describe('generatePipelineAMaster', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'storyline-pa-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const minimalState = {
    mode: 'nonfiction',
    pipeline: 'A',
    subMode: 'argument',
    nfStages: {
      'dna-title': { workingTitle: 'The Clarity Method' },
      'dna-promise': { subtitleDraft: 'Lead without losing people' },
      'pa-thesis': {
        thesis: 'Leaders who optimise for clarity outperform authority-first leaders',
        thesisSentence: 'Clarity is the new authority.',
        completed: true,
      },
      'pa-framework': {
        modelName: '4 Laws of Clear Leadership',
        principles: [
          { number: 1, name: 'Make It Visible', definition: 'Name what others avoid' },
          { number: 2, name: 'Make It Honest', definition: 'Signal over polish' },
        ],
        subMode: 'argument',
        completed: true,
      },
    },
  };

  it('generates a master markdown file', async () => {
    const result = await generatePipelineAMaster(minimalState, tmpDir);
    expect(result.mdPath).toContain('pipeline-a-master.md');
    expect(result.pipeline).toBe('A');
    expect(result.bookTitle).toBe('The Clarity Method');

    const { existsSync, readFileSync } = await import('fs');
    expect(existsSync(result.mdPath)).toBe(true);

    const md = readFileSync(result.mdPath, 'utf-8');
    expect(md).toContain('The Clarity Method');
    expect(md).toContain('4 Laws of Clear Leadership');
    expect(md).toContain('Clarity is the new authority');
    expect(md).toContain('Argument-Led');
  });

  it('includes "Narrative Braid" label for braid subMode', async () => {
    const braidState = {
      ...minimalState,
      subMode: 'braid',
      nfStages: {
        ...minimalState.nfStages,
        'pa-braid': {
          braidStory: 'My journey from burnout to clarity',
          braidBeats: [{ beat: 'The breaking point', storyContent: 'Collapse at 3am', placement: 'Beginning' }],
          braidResolution: 'Found the method, rebuilt the team',
        },
      },
    };
    const result = await generatePipelineAMaster(braidState, tmpDir);
    const { readFileSync } = await import('fs');
    const md = readFileSync(result.mdPath, 'utf-8');
    expect(md).toContain('Narrative Braid');
    expect(md).toContain('Part 4');
    expect(md).toContain('My journey from burnout');
  });

  it('handles empty state without throwing', async () => {
    const empty = { mode: 'nonfiction', pipeline: 'A', subMode: 'argument', nfStages: {} };
    await expect(generatePipelineAMaster(empty, tmpDir)).resolves.toBeDefined();
  });
});
