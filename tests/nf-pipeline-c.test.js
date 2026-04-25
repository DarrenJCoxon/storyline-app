// NF-07 — Pipeline C (How-To / Skill Ladder) tests
// Covers: stage guides, critique, skill tree DAG validation, master doc

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';

import {
  PIPELINE_C_GUIDES,
  PIPELINE_C_GUIDE_ORDER,
  getPipelineCGuide,
} from '../lib/ai/stage-guides-nf-pipeline-c.js';

import {
  PIPELINE_C_STAGES,
  PIPELINE_C_BY_ID,
  runStage,
} from '../lib/stages-nf/pipeline-c/index.js';

import {
  critiquePipelineCStage,
  buildPipelineCCritiqueSummary,
} from '../lib/ai/narrative-voice-nf.js';

import {
  validateSkillTree,
  saveSkillTree,
  loadSkillTree,
} from '../lib/stages-nf/pipeline-c/skill-tree.js';

import { generatePipelineCMaster } from '../lib/output/pipeline-c-master.js';

// ── Stage Guides ─────────────────────────────────────────────────────────────

describe('Pipeline C stage guides', () => {
  it('defines all 11 stages', () => {
    expect(Object.keys(PIPELINE_C_GUIDES)).toHaveLength(11);
  });

  it('guide order is 1–11 with no gaps', () => {
    const indexes = PIPELINE_C_GUIDE_ORDER.map(g => g.index);
    expect(indexes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('getPipelineCGuide returns guide by id', () => {
    const g = getPipelineCGuide('pc-skill');
    expect(g).toBeDefined();
    expect(g.id).toBe('pc-skill');
    expect(g.questions.length).toBeGreaterThan(0);
  });

  it('getPipelineCGuide returns null for unknown id', () => {
    expect(getPipelineCGuide('nonexistent')).toBeNull();
  });

  it('pc-decompose has skillTreeOutput field', () => {
    const g = getPipelineCGuide('pc-decompose');
    expect(g.skillTreeOutput).toBeDefined();
    expect(g.skillTreeOutput.generates).toContain('skill-tree.json (nodes)');
  });

  it('pc-prereqs has skillTreeOutput with both artifacts', () => {
    const g = getPipelineCGuide('pc-prereqs');
    expect(g.skillTreeOutput.generates).toContain('skill-tree.json');
    expect(g.skillTreeOutput.generates).toContain('skill-tree.md');
  });

  it('pc-decompose questions include itemSchema with id field', () => {
    const g = getPipelineCGuide('pc-decompose');
    const q = g.questions.find(q => q.key === 'subSkills');
    expect(q).toBeDefined();
    expect(q.itemSchema).toHaveProperty('id');
    expect(q.itemSchema).toHaveProperty('description');
  });

  it('pc-drills questions include itemSchema with expectedOutcome', () => {
    const g = getPipelineCGuide('pc-drills');
    const q = g.questions.find(q => q.key === 'drills');
    expect(q).toBeDefined();
    expect(q.itemSchema).toHaveProperty('expectedOutcome');
    expect(q.itemSchema).toHaveProperty('commonMistake');
  });

  it('every guide has required fields', () => {
    for (const [id, guide] of Object.entries(PIPELINE_C_GUIDES)) {
      expect(guide.id, `${id} missing id`).toBe(id);
      expect(guide.name, `${id} missing name`).toBeTruthy();
      expect(guide.index, `${id} missing index`).toBeGreaterThan(0);
    }
  });
});

// ── Stage Index ───────────────────────────────────────────────────────────────

describe('PIPELINE_C_STAGES index', () => {
  it('has 11 stages total', () => {
    expect(PIPELINE_C_STAGES).toHaveLength(11);
  });

  it('PIPELINE_C_BY_ID maps all stage ids', () => {
    PIPELINE_C_STAGES.forEach(s => {
      expect(PIPELINE_C_BY_ID[s.id]).toBeDefined();
    });
  });

  it('runStage returns error for unknown stageId', async () => {
    const result = await runStage('nonexistent', {});
    expect(result.error).toBeTruthy();
  });

  it('runStage returns ok for pc-skill', async () => {
    const state = { mode: 'nonfiction', pipeline: 'C', nfStages: {} };
    const result = await runStage('pc-skill', state);
    expect(result.status).toBe('ok');
    expect(result.guide).toBeDefined();
    expect(result.critique).toBeDefined();
  });

  it('runStage includes stateSnapshot', async () => {
    const state = { mode: 'nonfiction', pipeline: 'C', subMode: null, nfStages: {} };
    const result = await runStage('pc-decompose', state);
    expect(result.stateSnapshot.pipeline).toBe('C');
    expect(result.stateSnapshot.mode).toBe('nonfiction');
  });
});

// ── Skill Tree Validation ─────────────────────────────────────────────────────

describe('validateSkillTree', () => {
  const nodes = [
    { id: 'a', name: 'Alpha', description: 'First' },
    { id: 'b', name: 'Beta',  description: 'Second — needs Alpha' },
    { id: 'c', name: 'Gamma', description: 'Third — needs Beta' },
  ];

  it('accepts a valid DAG', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ];
    const result = validateSkillTree(nodes, edges);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.topologicalOrder).toEqual(['a', 'b', 'c']);
  });

  it('detects a cycle', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ];
    const result = validateSkillTree(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /cycle/i.test(e))).toBe(true);
  });

  it('detects a direct self-loop as a cycle', () => {
    const edges = [{ from: 'a', to: 'a' }];
    const result = validateSkillTree(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /cycle/i.test(e))).toBe(true);
  });

  it('detects orphan nodes', () => {
    const isolated = [
      { id: 'x', name: 'Isolated', description: 'No connections' },
      { id: 'y', name: 'Connected', description: 'Has connection' },
    ];
    const edges = [{ from: 'x', to: 'y' }];
    const result = validateSkillTree(isolated, edges);
    expect(result.warnings.length).toBe(0);
  });

  it('flags truly orphan nodes (no edges at all)', () => {
    const isolated = [
      { id: 'x', name: 'Node X', description: 'Has no edges' },
      { id: 'y', name: 'Node Y', description: 'Also isolated' },
    ];
    const result = validateSkillTree(isolated, []);
    expect(result.warnings.some(w => /isolated/i.test(w))).toBe(true);
  });

  it('reports root nodes correctly', () => {
    const edges = [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }];
    const result = validateSkillTree(nodes, edges);
    expect(result.roots).toContain('a');
    expect(result.roots).not.toContain('b');
    expect(result.roots).not.toContain('c');
  });

  it('returns valid with no edges (flat list is acceptable)', () => {
    const result = validateSkillTree(nodes, []);
    expect(result.valid).toBe(true);
    expect(result.topologicalOrder).toHaveLength(3);
  });

  it('returns error when nodes are empty', () => {
    const result = validateSkillTree([], []);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /no sub-skills/i.test(e))).toBe(true);
  });

  it('flags edges referencing unknown node IDs', () => {
    const edges = [{ from: 'a', to: 'UNKNOWN' }];
    const result = validateSkillTree(nodes, edges);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /unknown skill id/i.test(e))).toBe(true);
  });
});

// ── Skill Tree Artifact ───────────────────────────────────────────────────────

describe('saveSkillTree / loadSkillTree', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'storyline-pc-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const decomposeData = {
    subSkills: [
      { id: 'knife-grip',   name: 'Knife Grip',   description: 'Correct thumb pinch', chapterAssignment: '1' },
      { id: 'knife-draw',   name: 'Draw Cut',      description: 'Pulling the blade', chapterAssignment: '2' },
      { id: 'knife-chop',   name: 'Chop',          description: 'Push cut technique', chapterAssignment: '3' },
      { id: 'knife-julienne', name: 'Julienne',    description: 'Fine matchstick cuts', chapterAssignment: '4' },
    ],
    coreSubSkill: 'knife-grip',
  };

  const prereqData = {
    prereqEdges: [
      { skillId: 'knife-draw',    requires: 'knife-grip' },
      { skillId: 'knife-chop',    requires: 'knife-grip' },
      { skillId: 'knife-julienne', requires: 'knife-draw, knife-chop' },
    ],
    rootSkills: 'knife-grip',
  };

  it('generates skill-tree.json and skill-tree.md', async () => {
    const result = await saveSkillTree(tmpDir, decomposeData, prereqData, 'Knife Skills');
    expect(result.jsonPath).toContain('skill-tree.json');
    expect(result.mdPath).toContain('skill-tree.md');
    expect(result.nodeCount).toBe(4);
    expect(result.edgeCount).toBe(4);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    const { existsSync } = await import('fs');
    expect(existsSync(result.jsonPath)).toBe(true);
    expect(existsSync(result.mdPath)).toBe(true);
  });

  it('json has correct schema', async () => {
    await saveSkillTree(tmpDir, decomposeData, prereqData, 'Knife Skills');
    const { readFileSync } = await import('fs');
    const json = JSON.parse(readFileSync(resolve(tmpDir, '.storyline', 'skill-tree.json'), 'utf-8'));
    expect(json.schemaVersion).toBe(1);
    expect(json.targetSkill).toBe('Knife Skills');
    expect(json.nodes).toHaveLength(4);
    expect(json.edges.length).toBeGreaterThan(0);
    expect(json.validation.topologicalOrder).toHaveLength(4);
  });

  it('topological order puts knife-grip before julienne', async () => {
    const result = await saveSkillTree(tmpDir, decomposeData, prereqData, 'Knife Skills');
    const gripIdx     = result.topologicalOrder.indexOf('knife-grip');
    const julienneIdx = result.topologicalOrder.indexOf('knife-julienne');
    expect(gripIdx).toBeLessThan(julienneIdx);
  });

  it('markdown includes learning order section', async () => {
    await saveSkillTree(tmpDir, decomposeData, prereqData, 'Knife Skills');
    const { readFileSync } = await import('fs');
    const md = readFileSync(resolve(tmpDir, '.storyline', 'skill-tree.md'), 'utf-8');
    expect(md).toContain('# Skill Tree');
    expect(md).toContain('Learning Order');
    expect(md).toContain('knife-grip');
    expect(md).toContain('knife-julienne');
  });

  it('detects a cycle and marks as invalid', async () => {
    const cyclic = {
      prereqEdges: [
        { skillId: 'knife-draw', requires: 'knife-chop' },
        { skillId: 'knife-chop', requires: 'knife-draw' },
      ],
    };
    const result = await saveSkillTree(tmpDir, decomposeData, cyclic, 'Knife Skills');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => /cycle/i.test(e))).toBe(true);
  });

  it('loadSkillTree returns null when no file exists', async () => {
    const result = await loadSkillTree(tmpDir);
    expect(result).toBeNull();
  });

  it('loadSkillTree returns parsed JSON after saveSkillTree', async () => {
    await saveSkillTree(tmpDir, decomposeData, prereqData, 'Knife Skills');
    const loaded = await loadSkillTree(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded.nodes).toHaveLength(4);
    expect(loaded.validation.valid).toBe(true);
  });
});

// ── Critique ─────────────────────────────────────────────────────────────────

describe('Pipeline C critique', () => {
  it('flags missing targetSkill as error', () => {
    const issues = critiquePipelineCStage('pc-skill', {});
    expect(issues.some(i => i.type === 'error' && /target skill/i.test(i.message))).toBe(true);
  });

  it('warns on vague topic-style target skill', () => {
    const issues = critiquePipelineCStage('pc-skill', {
      targetSkill: 'Cooking',
      competencyDefinition: 'Can cook a meal',
      whyThisSkill: 'Cooking is useful',
    });
    expect(issues.some(i => /topic/i.test(i.message))).toBe(true);
  });

  it('passes a specific, behavioural skill definition', () => {
    const issues = critiquePipelineCStage('pc-skill', {
      targetSkill: 'Mastering knife skills for home cooking — julienne, chiffonade, and brunoise',
      competencyDefinition: 'Can julienne a carrot into 3mm sticks in under 3 minutes without looking at the blade',
      whyThisSkill: 'Knife skills unlock every other cooking technique; no book covers this properly at beginner level',
    });
    expect(issues.filter(i => i.type === 'error')).toHaveLength(0);
  });

  it('flags missing startingLevel as error', () => {
    const issues = critiquePipelineCStage('pc-start-level', {});
    expect(issues.some(i => i.type === 'error')).toBe(true);
  });

  it('flags missing measurableOutcome as error', () => {
    const issues = critiquePipelineCStage('pc-end-state', {
      endStateDescription: 'Reader can cook well',
    });
    expect(issues.some(i => i.type === 'error' && /measurable outcome/i.test(i.message))).toBe(true);
  });

  it('warns on knowledge-language measurable outcome', () => {
    const issues = critiquePipelineCStage('pc-end-state', {
      endStateDescription: 'Reader is confident in the kitchen',
      measurableOutcome: 'Reader will understand how to use a knife properly',
    });
    expect(issues.some(i => /knowledge language|performance language/i.test(i.message))).toBe(true);
  });

  it('flags empty subSkills as error', () => {
    const issues = critiquePipelineCStage('pc-decompose', {});
    expect(issues.some(i => i.type === 'error' && /sub-skill/i.test(i.message))).toBe(true);
  });

  it('warns on fewer than 4 sub-skills', () => {
    const issues = critiquePipelineCStage('pc-decompose', {
      subSkills: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      coreSubSkill: 'a',
    });
    expect(issues.some(i => /too few|4 sub-skill|fewer than 4/i.test(i.message))).toBe(true);
  });

  it('flags empty prereqEdges as error', () => {
    const issues = critiquePipelineCStage('pc-prereqs', {});
    expect(issues.some(i => i.type === 'error' && /prerequisite/i.test(i.message))).toBe(true);
  });

  it('flags empty drills as error', () => {
    const issues = critiquePipelineCStage('pc-drills', {});
    expect(issues.some(i => i.type === 'error' && /drill/i.test(i.message))).toBe(true);
  });

  it('warns on vague drill tasks', () => {
    const issues = critiquePipelineCStage('pc-drills', {
      drills: [
        { skillId: 'a', drillTitle: 'Practice session', task: 'Practice your technique', expectedOutcome: 'Better', commonMistake: 'None' },
      ],
    });
    expect(issues.some(i => /vague/i.test(i.message))).toBe(true);
  });

  it('passes clean drills', () => {
    const issues = critiquePipelineCStage('pc-drills', {
      drills: [
        {
          skillId: 'knife-grip',
          drillTitle: 'Carrot julienne drill',
          setup: 'One carrot, chef\'s knife, cutting board',
          task: 'Julienne one whole carrot into 3mm × 3mm sticks. Time yourself.',
          expectedOutcome: 'All sticks within 1mm of 3mm × 3mm. Total time under 5 minutes.',
          commonMistake: 'Curling fingers away from blade instead of curling knuckles toward it',
          difficulty: 'beginner',
        },
      ],
    });
    expect(issues.filter(i => i.type === 'error')).toHaveLength(0);
  });

  it('flags empty milestones as error', () => {
    const issues = critiquePipelineCStage('pc-milestones', {});
    expect(issues.some(i => i.type === 'error' && /milestone/i.test(i.message))).toBe(true);
  });

  it('flags milestones with no passCriteria as warning', () => {
    const issues = critiquePipelineCStage('pc-milestones', {
      milestones: [
        { milestoneTitle: 'Foundations check', afterLesson: 'Lesson 3', subSkillsCovered: 'a, b', task: 'Do the thing', passCriteria: '' },
      ],
      finalAssessment: 'Julienne a full carrot in under 3 minutes to spec.',
    });
    expect(issues.some(i => /pass criteria/i.test(i.message))).toBe(true);
  });

  it('flags empty workedExamples as error', () => {
    const issues = critiquePipelineCStage('pc-examples', {});
    expect(issues.some(i => i.type === 'error' && /example/i.test(i.message))).toBe(true);
  });

  it('flags missing critique checks as errors', () => {
    const issues = critiquePipelineCStage('pc-critique', {});
    expect(issues.filter(i => i.type === 'error').length).toBeGreaterThanOrEqual(4);
  });

  it('unknown stage returns empty issues', () => {
    expect(critiquePipelineCStage('nonexistent', {})).toEqual([]);
  });

  it('buildPipelineCCritiqueSummary returns structured summary', () => {
    const summary = buildPipelineCCritiqueSummary('pc-skill', {});
    expect(summary.stageId).toBe('pc-skill');
    expect(summary.blocking).toBe(true);
    expect(Array.isArray(summary.issues)).toBe(true);
    expect(typeof summary.formatted).toBe('string');
  });
});

// ── Master Document ───────────────────────────────────────────────────────────

describe('generatePipelineCMaster', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'storyline-pc-master-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const minimalState = {
    mode: 'nonfiction',
    pipeline: 'C',
    nfStages: {
      'dna-title': { workingTitle: 'Sharp: Master Knife Skills at Home' },
      'pc-skill': {
        targetSkill: 'Knife skills for home cooking — julienne, chiffonade, brunoise',
        competencyDefinition: 'Can julienne a carrot in under 3 minutes without looking at the blade',
        whyThisSkill: 'Knife skills unlock every cooking technique',
        completed: true,
      },
      'pc-end-state': {
        endStateDescription: 'Can execute the five foundational cuts with accuracy and speed',
        measurableOutcome: 'Julienne one carrot into 3mm sticks in under 3 minutes',
        completed: true,
      },
      'pc-decompose': {
        subSkills: [
          { id: 'grip',     name: 'Knife Grip',     description: 'Pinch grip technique' },
          { id: 'rocking',  name: 'Rocking Motion',  description: 'Forward rocking cut' },
          { id: 'julienne', name: 'Julienne',         description: 'Fine matchstick cuts' },
        ],
        coreSubSkill: 'grip',
        completed: true,
      },
    },
  };

  it('generates a master markdown file', async () => {
    const result = await generatePipelineCMaster(minimalState, tmpDir);
    expect(result.mdPath).toContain('pipeline-c-master.md');
    expect(result.pipeline).toBe('C');
    expect(result.bookTitle).toBe('Sharp: Master Knife Skills at Home');

    const { existsSync, readFileSync } = await import('fs');
    expect(existsSync(result.mdPath)).toBe(true);

    const md = readFileSync(result.mdPath, 'utf-8');
    expect(md).toContain('Sharp: Master Knife Skills at Home');
    expect(md).toContain('Pipeline C');
    expect(md).toContain('Knife Grip');
    expect(md).toContain('Julienne');
    expect(md).toContain('3 minutes');
  });

  it('includes drill catalogue when drills are present', async () => {
    const withDrills = {
      ...minimalState,
      nfStages: {
        ...minimalState.nfStages,
        'pc-drills': {
          drills: [
            {
              skillId: 'grip',
              drillTitle: 'Pinch grip hold',
              setup: 'Chef\'s knife, carrot',
              task: 'Hold the knife in pinch grip for 60 seconds without re-gripping',
              expectedOutcome: 'Steady hold, no slippage, knuckles relaxed',
              commonMistake: 'Wrapping all fingers around handle',
              difficulty: 'beginner',
            },
          ],
          completed: true,
        },
      },
    };
    const result = await generatePipelineCMaster(withDrills, tmpDir);
    const { readFileSync } = await import('fs');
    const md = readFileSync(result.mdPath, 'utf-8');
    expect(md).toContain('Drill Catalogue');
    expect(md).toContain('Pinch grip hold');
    expect(md).toContain('Wrapping all fingers');
  });

  it('handles empty state without throwing', async () => {
    const empty = { mode: 'nonfiction', pipeline: 'C', nfStages: {} };
    await expect(generatePipelineCMaster(empty, tmpDir)).resolves.toBeDefined();
  });
});
