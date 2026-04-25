// NF-06 — Pipeline B (Narrative Non-Fiction) tests
// Covers: stage guides, sub-mode fork, critique, timeline, sourcing register, master doc

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';

import {
  PIPELINE_B_GUIDES,
  PIPELINE_B_GUIDE_ORDER,
  getPipelineBGuide,
} from '../lib/ai/stage-guides-nf-pipeline-b.js';

import {
  PIPELINE_B_STAGES,
  PIPELINE_B_BY_ID,
  runStage,
} from '../lib/stages-nf/pipeline-b/index.js';

import {
  critiquePipelineBStage,
  buildPipelineBCritiqueSummary,
} from '../lib/ai/narrative-voice-nf.js';

import { saveTimeline, loadTimeline } from '../lib/stages-nf/pipeline-b/timeline.js';
import { buildSourcingRegister } from '../lib/stages-nf/pipeline-b/sourcing-register.js';
import { generatePipelineBMaster } from '../lib/output/pipeline-b-master.js';

// ── Stage Guides ─────────────────────────────────────────────────────────────

describe('Pipeline B stage guides', () => {
  it('defines all 10 stages', () => {
    expect(Object.keys(PIPELINE_B_GUIDES)).toHaveLength(10);
  });

  it('guide order is 1–10 with no gaps', () => {
    const indexes = PIPELINE_B_GUIDE_ORDER.map(g => g.index);
    expect(indexes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('getPipelineBGuide returns guide by id', () => {
    const g = getPipelineBGuide('pb-thesis');
    expect(g).toBeDefined();
    expect(g.id).toBe('pb-thesis');
    expect(g.questions.length).toBeGreaterThan(0);
  });

  it('getPipelineBGuide returns null for unknown id', () => {
    expect(getPipelineBGuide('nonexistent')).toBeNull();
  });

  it('pb-fork has subModeDecision flag', () => {
    const g = getPipelineBGuide('pb-fork');
    expect(g.subModeDecision).toBe(true);
  });

  it('pb-fork subMode options are idea-led and event-led', () => {
    const g = getPipelineBGuide('pb-fork');
    const q = g.questions.find(q => q.key === 'subMode');
    expect(q).toBeDefined();
    expect(q.options).toContain('idea-led');
    expect(q.options).toContain('event-led');
  });

  it('pb-timeline has timelineOutput field', () => {
    const g = getPipelineBGuide('pb-timeline');
    expect(g.timelineOutput).toBeDefined();
    expect(g.timelineOutput.generates).toContain('timeline.json');
  });

  it('pb-sourcing has researchIntegration field', () => {
    const g = getPipelineBGuide('pb-sourcing');
    expect(g.researchIntegration).toBeDefined();
    expect(g.researchIntegration.command).toContain('sourcing-register');
  });

  it('pb-cast has itemSchema with sourcingGap', () => {
    const g = getPipelineBGuide('pb-cast');
    const castQ = g.questions.find(q => q.key === 'cast');
    expect(castQ).toBeDefined();
    expect(castQ.itemSchema).toHaveProperty('sourcingGap');
  });

  it('every guide has required fields', () => {
    for (const [id, guide] of Object.entries(PIPELINE_B_GUIDES)) {
      expect(guide.id, `${id} missing id`).toBe(id);
      expect(guide.name, `${id} missing name`).toBeTruthy();
      expect(guide.index, `${id} missing index`).toBeGreaterThan(0);
    }
  });
});

// ── Stage Index ───────────────────────────────────────────────────────────────

describe('PIPELINE_B_STAGES index', () => {
  it('has 10 stages total', () => {
    expect(PIPELINE_B_STAGES).toHaveLength(10);
  });

  it('PIPELINE_B_BY_ID maps all stage ids', () => {
    PIPELINE_B_STAGES.forEach(s => {
      expect(PIPELINE_B_BY_ID[s.id]).toBeDefined();
    });
  });

  it('runStage returns error for unknown stageId', async () => {
    const result = await runStage('nonexistent', {});
    expect(result.error).toBeTruthy();
  });

  it('runStage returns ok for pb-thesis', async () => {
    const state = { mode: 'nonfiction', pipeline: 'B', subMode: null, nfStages: {} };
    const result = await runStage('pb-thesis', state);
    expect(result.status).toBe('ok');
    expect(result.guide).toBeDefined();
    expect(result.critique).toBeDefined();
  });

  it('runStage returns ok for pb-fork', async () => {
    const state = { mode: 'nonfiction', pipeline: 'B', subMode: null, nfStages: {} };
    const result = await runStage('pb-fork', state);
    expect(result.status).toBe('ok');
    expect(result.guide.subModeDecision).toBe(true);
  });

  it('stateSnapshot reflects current pipeline and subMode', async () => {
    const state = { mode: 'nonfiction', pipeline: 'B', subMode: 'idea-led', nfStages: {} };
    const result = await runStage('pb-chapters', state);
    expect(result.stateSnapshot.subMode).toBe('idea-led');
    expect(result.stateSnapshot.pipeline).toBe('B');
  });
});

// ── Critique ─────────────────────────────────────────────────────────────────

describe('Pipeline B critique', () => {
  it('flags missing centralQuestion as error', () => {
    const issues = critiquePipelineBStage('pb-thesis', {});
    expect(issues.some(i => i.type === 'error' && /central question/i.test(i.message))).toBe(true);
  });

  it('passes clean thesis', () => {
    const issues = critiquePipelineBStage('pb-thesis', {
      centralQuestion: 'Why do some cities become the site of mass atrocity while others do not?',
      thesis: 'Proximity to political transition, not ethnic composition, is the strongest predictor of mass violence.',
      readerTakeaway: 'Historical atrocity is not inevitable but structurally conditioned.',
    });
    expect(issues.filter(i => i.type === 'error')).toHaveLength(0);
  });

  it('warns on instructional thesis', () => {
    const issues = critiquePipelineBStage('pb-thesis', {
      centralQuestion: 'How do great leaders think?',
      thesis: 'How to build a leadership mindset in 10 steps',
      readerTakeaway: 'They understand leadership better',
    });
    expect(issues.some(i => /instructional|prescriptive/i.test(i.message))).toBe(true);
  });

  it('flags empty cast as error', () => {
    const issues = critiquePipelineBStage('pb-cast', {});
    expect(issues.some(i => i.type === 'error' && /cast/i.test(i.message))).toBe(true);
  });

  it('warns on cast with no primarySource', () => {
    const issues = critiquePipelineBStage('pb-cast', {
      primarySubject: 'Rudolf Hoess',
      cast: [
        { name: 'Rudolf Hoess', role: 'protagonist', whyTheyMatter: 'Commandant of Auschwitz' },
      ],
    });
    expect(issues.some(i => /primary source/i.test(i.message))).toBe(true);
  });

  it('flags missing timelineEvents as error', () => {
    const issues = critiquePipelineBStage('pb-timeline', {});
    expect(issues.some(i => i.type === 'error' && /timeline event/i.test(i.message))).toBe(true);
  });

  it('flags missing pivotMoment as error', () => {
    const issues = critiquePipelineBStage('pb-timeline', {
      timelineEvents: [{ date: '1940', event: 'Construction begins', castInvolved: 'Hoess', significance: 'Origin', sourceNote: 'Archives' }],
      timelineSpan: '1940–1945',
    });
    expect(issues.some(i => i.type === 'error' && /pivot/i.test(i.message))).toBe(true);
  });

  it('flags invalid subMode in pb-fork as error', () => {
    const issues = critiquePipelineBStage('pb-fork', { subMode: 'random', forkRationale: 'Because' });
    expect(issues.some(i => i.type === 'error' && /structural fork/i.test(i.message))).toBe(true);
  });

  it('passes clean pb-fork', () => {
    const issues = critiquePipelineBStage('pb-fork', {
      subMode: 'event-led',
      forkRationale: 'The book is fundamentally about what happened — the chronological sequence of events IS the argument.',
    });
    expect(issues.filter(i => i.type === 'error')).toHaveLength(0);
  });

  it('flags empty scenes as error', () => {
    const issues = critiquePipelineBStage('pb-scenes', {});
    expect(issues.some(i => i.type === 'error' && /scene/i.test(i.message))).toBe(true);
  });

  it('flags missing sourcingStrategy as error', () => {
    const issues = critiquePipelineBStage('pb-sourcing', {});
    expect(issues.some(i => i.type === 'error' && /sourcing strategy/i.test(i.message))).toBe(true);
  });

  it('flags missing primaryTheme as error', () => {
    const issues = critiquePipelineBStage('pb-theme', {});
    expect(issues.some(i => i.type === 'error' && /primary theme/i.test(i.message))).toBe(true);
  });

  it('warns on theme that describes subject not universal idea', () => {
    const issues = critiquePipelineBStage('pb-theme', {
      primaryTheme: 'The story of how the Holocaust unfolded in a small town',
      emotionalArc: 'Growing dread to grief',
      themeInClosingChapter: 'Survivors speak',
    });
    expect(issues.some(i => /subject|universal/i.test(i.message))).toBe(true);
  });

  it('flags empty chapters as error', () => {
    const issues = critiquePipelineBStage('pb-chapters', {});
    expect(issues.some(i => i.type === 'error' && /chapter/i.test(i.message))).toBe(true);
  });

  it('flags missing critique checks as errors', () => {
    const issues = critiquePipelineBStage('pb-critique', {});
    expect(issues.filter(i => i.type === 'error').length).toBeGreaterThanOrEqual(4);
  });

  it('unknown stage returns empty issues', () => {
    expect(critiquePipelineBStage('nonexistent', {})).toEqual([]);
  });

  it('buildPipelineBCritiqueSummary returns structured summary', () => {
    const summary = buildPipelineBCritiqueSummary('pb-thesis', {});
    expect(summary.stageId).toBe('pb-thesis');
    expect(summary.blocking).toBe(true);
    expect(Array.isArray(summary.issues)).toBe(true);
    expect(typeof summary.formatted).toBe('string');
  });
});

// ── Timeline Artifact ────────────────────────────────────────────────────────

describe('saveTimeline', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'storyline-pb-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleData = {
    timelineSpan: '1893–1894',
    pivotMoment: 'Holmes murders his first victim at the World\'s Fair hotel',
    timelineEvents: [
      { date: 'May 1893', event: 'World\'s Fair opens', castInvolved: 'Burnham, Holmes', significance: 'Stage is set', sourceNote: 'Official records' },
      { date: 'July 1893', event: 'Holmes completes the "murder castle"', castInvolved: 'Holmes', significance: 'Murders begin', sourceNote: 'Larson research' },
    ],
  };

  it('generates timeline.json in .storyline/', async () => {
    const result = await saveTimeline(tmpDir, sampleData);
    expect(result.jsonPath).toContain('timeline.json');
    expect(result.eventCount).toBe(2);

    const { existsSync, readFileSync } = await import('fs');
    expect(existsSync(result.jsonPath)).toBe(true);
    const json = JSON.parse(readFileSync(result.jsonPath, 'utf-8'));
    expect(json.schemaVersion).toBe(1);
    expect(json.events).toHaveLength(2);
    expect(json.pivotMoment).toContain('Holmes');
    expect(json.timelineSpan).toBe('1893–1894');
  });

  it('generates timeline.md with table rows', async () => {
    const result = await saveTimeline(tmpDir, sampleData);
    const { readFileSync } = await import('fs');
    const md = readFileSync(result.mdPath, 'utf-8');
    expect(md).toContain('# Timeline');
    expect(md).toContain('1893–1894');
    expect(md).toContain('World\'s Fair opens');
    expect(md).toContain('| Date | Event |');
  });

  it('loadTimeline returns null when no file exists', async () => {
    const result = await loadTimeline(tmpDir);
    expect(result).toBeNull();
  });

  it('loadTimeline returns parsed JSON after saveTimeline', async () => {
    await saveTimeline(tmpDir, sampleData);
    const loaded = await loadTimeline(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded.events).toHaveLength(2);
  });

  it('handles empty events without throwing', async () => {
    const empty = { timelineSpan: 'unknown', pivotMoment: '', timelineEvents: [] };
    const result = await saveTimeline(tmpDir, empty);
    expect(result.eventCount).toBe(0);
    const { existsSync } = await import('fs');
    expect(existsSync(result.mdPath)).toBe(true);
  });
});

// ── Sourcing Register ────────────────────────────────────────────────────────

describe('buildSourcingRegister', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'storyline-pb-src-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeResearchItem(projectDir, filename, meta, content) {
    const itemsDir = join(projectDir, '.storyline', 'research', 'items');
    mkdirSync(itemsDir, { recursive: true });
    const frontmatter = Object.entries(meta)
      .map(([k, v]) => {
        if (Array.isArray(v)) return `${k}: [${v.join(', ')}]`;
        return `${k}: ${v}`;
      }).join('\n');
    writeFileSync(join(itemsDir, filename), `---\n${frontmatter}\n---\n${content}`, 'utf8');
  }

  it('returns zero items when research dir is empty', async () => {
    const result = await buildSourcingRegister(tmpDir);
    expect(result.itemCount).toBe(0);
    const { existsSync } = await import('fs');
    expect(existsSync(result.jsonPath)).toBe(true);
  });

  it('filters only sourced-claim items', async () => {
    writeResearchItem(tmpDir, 'item-note.md', {
      id: 'res-001',
      subtype: 'note',
      reliability: 'secondary',
      verification: 'pending',
      tags: [],
      links: [],
      sources: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'A general note');

    writeResearchItem(tmpDir, 'item-claim.md', {
      id: 'res-002',
      subtype: 'sourced-claim',
      reliability: 'primary',
      verification: 'verified',
      title: 'Holmes\'s conviction record',
      tags: ['holmes'],
      links: ['scene:ch5-s1'],
      sources: ['Chicago Tribune, 1895'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'Holmes was convicted on 9 counts.');

    const result = await buildSourcingRegister(tmpDir);
    expect(result.itemCount).toBe(1);
  });

  it('groups items by link', async () => {
    writeResearchItem(tmpDir, 'item-a.md', {
      id: 'res-010',
      subtype: 'sourced-claim',
      reliability: 'primary',
      verification: 'verified',
      title: 'Source A',
      tags: [],
      links: ['scene:ch1-s1'],
      sources: ['Archive A'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'Content A');

    writeResearchItem(tmpDir, 'item-b.md', {
      id: 'res-011',
      subtype: 'sourced-claim',
      reliability: 'primary',
      verification: 'pending',
      title: 'Source B',
      tags: [],
      links: ['scene:ch1-s1'],
      sources: ['Archive B'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'Content B');

    const result = await buildSourcingRegister(tmpDir);
    const { readFileSync } = await import('fs');
    const json = JSON.parse(readFileSync(result.jsonPath, 'utf-8'));
    expect(json.byLink['scene:ch1-s1']).toHaveLength(2);
    expect(json.byLink['scene:ch1-s1']).toContain('res-010');
    expect(json.byLink['scene:ch1-s1']).toContain('res-011');
  });

  it('generates readable markdown register', async () => {
    writeResearchItem(tmpDir, 'item-c.md', {
      id: 'res-020',
      subtype: 'sourced-claim',
      reliability: 'primary',
      verification: 'verified',
      title: 'The opening of the Fair',
      tags: ['burnham'],
      links: ['chapter:1'],
      sources: ['Chicago Tribune, May 1893'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, 'The World\'s Columbian Exposition opened on 1 May 1893.');

    const result = await buildSourcingRegister(tmpDir);
    const { readFileSync } = await import('fs');
    const md = readFileSync(result.mdPath, 'utf-8');
    expect(md).toContain('# Sourcing Register');
    expect(md).toContain('chapter:1');
    expect(md).toContain('The opening of the Fair');
  });
});

// ── Master Document ───────────────────────────────────────────────────────────

describe('generatePipelineBMaster', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'storyline-pb-master-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const minimalState = {
    mode: 'nonfiction',
    pipeline: 'B',
    subMode: 'event-led',
    nfStages: {
      'dna-title': { workingTitle: 'The Devil in the Details' },
      'pb-thesis': {
        centralQuestion: 'How did a serial killer operate undetected at the 1893 World\'s Fair?',
        thesis: 'The spectacle of modernity created cover for its darkest impulses.',
        readerTakeaway: 'Progress and predation are not opposites — they are sometimes partners.',
        completed: true,
      },
      'pb-fork': {
        subMode: 'event-led',
        forkRationale: 'The story is fundamentally chronological — what happened and when.',
        completed: true,
      },
      'pb-cast': {
        primarySubject: 'H.H. Holmes',
        cast: [
          { name: 'H.H. Holmes', role: 'antagonist', whyTheyMatter: 'Serial killer', primarySource: 'Trial transcripts', sourcingGap: 'Early life records' },
          { name: 'Daniel Burnham', role: 'protagonist', whyTheyMatter: 'Fair architect', primarySource: 'Personal papers', sourcingGap: 'None known' },
        ],
        completed: true,
      },
      'pb-timeline': {
        timelineSpan: '1890–1896',
        pivotMoment: 'Holmes arrested in Philadelphia',
        timelineEvents: [
          { date: 'May 1893', event: 'Fair opens', castInvolved: 'Burnham', significance: 'Stage set', sourceNote: 'Records' },
        ],
        completed: true,
      },
    },
  };

  it('generates a master markdown file', async () => {
    const result = await generatePipelineBMaster(minimalState, tmpDir);
    expect(result.mdPath).toContain('pipeline-b-master.md');
    expect(result.pipeline).toBe('B');
    expect(result.bookTitle).toBe('The Devil in the Details');

    const { existsSync, readFileSync } = await import('fs');
    expect(existsSync(result.mdPath)).toBe(true);

    const md = readFileSync(result.mdPath, 'utf-8');
    expect(md).toContain('The Devil in the Details');
    expect(md).toContain('Event-Led');
    expect(md).toContain('H.H. Holmes');
    expect(md).toContain('1890–1896');
  });

  it('labels idea-led structure correctly', async () => {
    const ideaState = {
      ...minimalState,
      subMode: 'idea-led',
      nfStages: {
        ...minimalState.nfStages,
        'pb-fork': { subMode: 'idea-led', forkRationale: 'Thesis drives structure', completed: true },
      },
    };
    const result = await generatePipelineBMaster(ideaState, tmpDir);
    const { readFileSync } = await import('fs');
    const md = readFileSync(result.mdPath, 'utf-8');
    expect(md).toContain('Idea-Led');
    expect(md).not.toContain('Event-Led (Larson)');
  });

  it('includes chapter outline when present', async () => {
    const withChapters = {
      ...minimalState,
      nfStages: {
        ...minimalState.nfStages,
        'pb-chapters': {
          chapters: [
            { number: 1, title: 'The Dream', chapterQuestion: 'What was the vision?', content: 'Burnham pitches', anchorScene: 'The pitch meeting', role: 'Setting the stage' },
            { number: 2, title: 'The Monster', chapterQuestion: 'Who was Holmes?', content: 'Holmes arrives in Chicago', anchorScene: 'Arrival at hotel site', role: 'Introducing Holmes' },
          ],
          momentumNote: 'Chapter 1 is slow — intentionally, to establish stakes before the darkness arrives.',
          completed: true,
        },
      },
    };
    const result = await generatePipelineBMaster(withChapters, tmpDir);
    const { readFileSync } = await import('fs');
    const md = readFileSync(result.mdPath, 'utf-8');
    expect(md).toContain('The Dream');
    expect(md).toContain('The Monster');
    expect(md).toContain('intentionally');
  });

  it('handles empty state without throwing', async () => {
    const empty = { mode: 'nonfiction', pipeline: 'B', subMode: 'event-led', nfStages: {} };
    await expect(generatePipelineBMaster(empty, tmpDir)).resolves.toBeDefined();
  });
});
