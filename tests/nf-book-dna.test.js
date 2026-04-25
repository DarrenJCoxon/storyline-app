// NF-03 — Book DNA tests
// Covers: stage guides, critique, pipeline routing, consolidation output

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';

import {
  NF_DNA_GUIDES,
  NF_DNA_GUIDE_ORDER,
  getNfDnaGuide,
  inferPipelineFromCategory,
  CATEGORY_PIPELINE_MAP,
} from '../lib/ai/stage-guides-nf-dna.js';

import {
  critiqueBookDnaStage,
  formatCritique,
  hasBlockingErrors,
  buildCritiqueSummary,
} from '../lib/ai/narrative-voice-nf.js';

import {
  BOOK_DNA_STAGES,
  BOOK_DNA_BY_ID,
  runStage,
  derivePipelineFromCategoryData,
} from '../lib/stages-nf/book-dna/index.js';

import { generateBookDnaDoc } from '../lib/output/book-dna-doc.js';
import { routeStage } from '../lib/ai/model-router.js';

// ── Stage Guides ─────────────────────────────────────────────────────────────

describe('NF DNA Stage Guides', () => {
  it('defines all 12 stages', () => {
    expect(Object.keys(NF_DNA_GUIDES)).toHaveLength(12);
  });

  it('guide order is 1–12 with no gaps', () => {
    const indexes = NF_DNA_GUIDE_ORDER.map(g => g.index);
    expect(indexes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('getNfDnaGuide returns guide by id', () => {
    const g = getNfDnaGuide('dna-category');
    expect(g).toBeDefined();
    expect(g.id).toBe('dna-category');
    expect(g.name).toBe('Category & Market Positioning');
    expect(g.questions.length).toBeGreaterThan(0);
  });

  it('getNfDnaGuide returns null for unknown id', () => {
    expect(getNfDnaGuide('nonexistent')).toBeNull();
  });

  it('every guide has required fields', () => {
    for (const [id, guide] of Object.entries(NF_DNA_GUIDES)) {
      expect(guide.id, `${id} missing id`).toBe(id);
      expect(guide.name, `${id} missing name`).toBeTruthy();
      expect(guide.index, `${id} missing index`).toBeGreaterThan(0);
      expect(guide.opening, `${id} missing opening`).toBeTruthy();
      expect(Array.isArray(guide.questions), `${id} questions not array`).toBe(true);
      expect(guide.questions.length, `${id} no questions`).toBeGreaterThan(0);
    }
  });

  it('dna-consolidate has consolidation output info', () => {
    const g = getNfDnaGuide('dna-consolidate');
    expect(g.consolidationOutput).toBeDefined();
    expect(g.consolidationOutput.generates).toContain('book-dna.md');
  });
});

// ── Pipeline Routing ─────────────────────────────────────────────────────────

describe('Category → Pipeline Routing', () => {
  it('maps self-help to Pipeline A', () => {
    expect(inferPipelineFromCategory('self-help')).toBe('A');
    expect(inferPipelineFromCategory('Self-Help')).toBe('A');
  });

  it('maps business to Pipeline A', () => {
    expect(inferPipelineFromCategory('Business')).toBe('A');
    expect(inferPipelineFromCategory('entrepreneurship')).toBe('A');
  });

  it('maps popular science to Pipeline B', () => {
    expect(inferPipelineFromCategory('popular science')).toBe('B');
    expect(inferPipelineFromCategory('history')).toBe('B');
    expect(inferPipelineFromCategory('true crime')).toBe('B');
  });

  it('maps how-to to Pipeline C', () => {
    expect(inferPipelineFromCategory('how-to')).toBe('C');
    expect(inferPipelineFromCategory('cooking')).toBe('C');
  });

  it('returns null for unknown category', () => {
    expect(inferPipelineFromCategory('zxcvbnm')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(inferPipelineFromCategory('')).toBeNull();
    expect(inferPipelineFromCategory(null)).toBeNull();
  });

  it('derivePipelineFromCategoryData uses primaryCategory', () => {
    expect(derivePipelineFromCategoryData({ primaryCategory: 'health' })).toBe('A');
    expect(derivePipelineFromCategoryData({ primaryCategory: 'History' })).toBe('B');
    expect(derivePipelineFromCategoryData({})).toBeNull();
  });
});

// ── Critique ─────────────────────────────────────────────────────────────────

describe('Book DNA Critique', () => {
  it('critiques empty dna-category as error', () => {
    const issues = critiqueBookDnaStage('dna-category', {});
    expect(hasBlockingErrors(issues)).toBe(true);
  });

  it('flags vague category (non-fiction is not a category)', () => {
    const issues = critiqueBookDnaStage('dna-category', {
      primaryCategory: 'Non-fiction',
      shelfDescription: 'somewhere',
      competitorTitle: 'Atomic Habits',
    });
    const texts = issues.map(i => i.message);
    expect(texts.some(t => t.includes('not a category'))).toBe(true);
  });

  it('passes clean dna-category with no errors', () => {
    const issues = critiqueBookDnaStage('dna-category', {
      primaryCategory: 'self-help',
      shelfDescription: 'business section near leadership',
      competitorTitle: 'Atomic Habits — James Clear',
    });
    expect(hasBlockingErrors(issues)).toBe(false);
  });

  it('critiques thin reader avatar', () => {
    const issues = critiqueBookDnaStage('dna-reader', {
      avatarName: 'Jo',
      demographics: 'a person',
      deepestWish: 'ok',
    });
    const texts = issues.map(i => i.message);
    expect(texts.some(t => /thin|short|expand/i.test(t))).toBe(true);
  });

  it('flags missing Big Idea as error', () => {
    const issues = critiqueBookDnaStage('dna-idea', {});
    expect(hasBlockingErrors(issues)).toBe(true);
  });

  it('flags missing "because/therefore" in idea sentence', () => {
    const issues = critiqueBookDnaStage('dna-idea', {
      bigIdea: 'Leaders need to communicate better',
      whyDifferent: 'Unlike generic leadership books this focuses on clarity',
      ideaSentence: 'Leaders should speak clearly.',
    });
    const texts = issues.map(i => i.message);
    expect(texts.some(t => /because|therefore|causal/i.test(t))).toBe(true);
  });

  it('flags long subtitle', () => {
    const issues = critiqueBookDnaStage('dna-promise', {
      corePromise: 'You will lead better',
      subtitleDraft: 'A Very Long And Detailed Subtitle That Goes On And On And Never Ends For Any Reason',
    });
    const texts = issues.map(i => i.message);
    expect(texts.some(t => /subtitle is \d+ words/i.test(t))).toBe(true);
  });

  it('flags fewer than 3 comps', () => {
    const issues = critiqueBookDnaStage('dna-comps', {
      comps: [{ title: 'Book A', author: 'Author A', whatTheyGotRight: 'good', yourGap: 'my gap' }],
      marketGap: 'The gap is X',
    });
    const texts = issues.map(i => i.message);
    expect(texts.some(t => /only 1 comp/i.test(t))).toBe(true);
  });

  it('formatCritique returns no-issues message when empty', () => {
    expect(formatCritique([])).toContain('No issues');
  });

  it('buildCritiqueSummary returns structured summary', () => {
    const summary = buildCritiqueSummary('dna-category', {});
    expect(summary.stageId).toBe('dna-category');
    expect(summary.blocking).toBe(true);
    expect(Array.isArray(summary.issues)).toBe(true);
    expect(typeof summary.formatted).toBe('string');
  });

  it('unknown stage returns empty issues', () => {
    const issues = critiqueBookDnaStage('nonexistent', {});
    expect(issues).toEqual([]);
  });
});

// ── Stage Index ───────────────────────────────────────────────────────────────

describe('BOOK_DNA_STAGES index', () => {
  it('has 12 stages', () => {
    expect(BOOK_DNA_STAGES).toHaveLength(12);
  });

  it('BOOK_DNA_BY_ID maps all stage ids', () => {
    BOOK_DNA_STAGES.forEach(s => {
      expect(BOOK_DNA_BY_ID[s.id]).toBeDefined();
    });
  });

  it('runStage returns error for unknown stageId', async () => {
    const result = await runStage('nonexistent', {});
    expect(result.error).toBeTruthy();
  });

  it('runStage returns guide and empty data for null state', async () => {
    const result = await runStage('dna-reader', null);
    expect(result.status).toBe('ok');
    expect(result.guide).toBeDefined();
    expect(result.guide.id).toBe('dna-reader');
    expect(result.critique).toBeNull();
  });

  it('runStage returns critique when state provided', async () => {
    const state = { nfStages: {} };
    const result = await runStage('dna-reader', state);
    expect(result.critique).toBeDefined();
    expect(result.critique.stageId).toBe('dna-reader');
  });

  it('runStage for dna-category infers pipeline from saved data', async () => {
    const state = { nfStages: { 'dna-category': { primaryCategory: 'self-help' } } };
    const result = await runStage('dna-category', state);
    expect(result.inferredPipeline).toBe('A');
  });
});

// ── Model Routing for NF Stages ───────────────────────────────────────────────

describe('NF model routing', () => {
  it('dna-idea routes to opus (balanced)', () => {
    const r = routeStage('dna-idea', 'balanced');
    expect(r.model).toBe('opus');
  });

  it('dna-consolidate routes to opus (balanced)', () => {
    const r = routeStage('dna-consolidate', 'balanced');
    expect(r.model).toBe('opus');
  });

  it('dna-category routes to haiku (balanced)', () => {
    const r = routeStage('dna-category', 'balanced');
    expect(r.model).toBe('haiku');
  });

  it('pa-critique routes to opus', () => {
    const r = routeStage('pa-critique', 'balanced');
    expect(r.model).toBe('opus');
  });

  it('economy mode downgrades sonnet stages', () => {
    const r = routeStage('dna-reader', 'economy');
    expect(r.model).toBe('haiku');
  });
});

// ── Book DNA Doc Generation ───────────────────────────────────────────────────

describe('generateBookDnaDoc', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'storyline-dna-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates both files from minimal state', async () => {
    const state = {
      mode: 'nonfiction',
      pipeline: 'A',
      nfStages: {
        'dna-category': { primaryCategory: 'self-help', completed: true },
        'dna-consolidate': { elevatorPitch: 'This book helps X do Y', confirmedPipeline: 'A', biggestRisk: 'Too crowded market', completed: true },
        'dna-title': { workingTitle: 'The Clarity Method' },
      },
    };

    const result = await generateBookDnaDoc(state, tmpDir);
    expect(result.mdPath).toContain('book-dna.md');
    expect(result.jsonPath).toContain('book-dna.json');
    expect(result.pipeline).toBe('A');
    expect(result.bookTitle).toBe('The Clarity Method');

    const { existsSync, readFileSync } = await import('fs');
    expect(existsSync(result.mdPath)).toBe(true);
    expect(existsSync(result.jsonPath)).toBe(true);

    const md = readFileSync(result.mdPath, 'utf-8');
    expect(md).toContain('The Clarity Method');
    expect(md).toContain('Category & Market Positioning');
    expect(md).toContain('self-help');

    const json = JSON.parse(readFileSync(result.jsonPath, 'utf-8'));
    expect(json.schemaVersion).toBe(1);
    expect(json.pipeline).toBe('A');
    expect(json.bookTitle).toBe('The Clarity Method');
    expect(json.consolidation.elevatorPitch).toContain('This book helps');
  });

  it('handles missing stages gracefully (no throws)', async () => {
    const state = { mode: 'nonfiction', pipeline: 'B', nfStages: {} };
    await expect(generateBookDnaDoc(state, tmpDir)).resolves.toBeDefined();
  });
});
