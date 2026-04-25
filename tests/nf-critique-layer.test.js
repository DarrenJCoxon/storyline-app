// NF-08 — Cross-harness critique layer tests
// Covers: per-check functions, full critique orchestration, report generation

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';

import {
  runFullCritique,
  generateCritiqueReport,
  buildSummaryMarkdown,
} from '../lib/ai/critique-api.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePipelineAState(overrides = {}) {
  return {
    mode: 'nonfiction',
    pipeline: 'A',
    subMode: 'argument',
    nfStages: {
      'dna-title':    { workingTitle: 'The Clarity Method' },
      'dna-reader':   { avatarName: 'Sarah', demographics: 'Busy middle manager, 35–45, overwhelmed by competing demands', biggestFear: 'Being seen as a weak leader', deepestWish: 'Team that operates without constant input' },
      'dna-promise':  { corePromise: 'Lead teams with clarity and stop firefighting', subtitleDraft: 'Lead Without Losing People' },
      'dna-transform':{ transformationSentence: 'After this book, overwhelmed managers will lead with clarity and regain team trust' },
      'dna-idea':     { bigIdea: 'Clarity is the core leadership skill — without it, authority is just noise', whyDifferent: 'Unlike generic leadership books, this focuses exclusively on clarity as the operating system' },
      'dna-comps':    { comps: [{ title: 'Radical Candor', yourGap: 'Focuses on feedback, not systemic clarity' }, { title: 'The 5 Dysfunctions', yourGap: 'Team-level, not individual leader behaviour' }], marketGap: 'No book specifically addresses clarity as a daily operating discipline' },
      'pa-thesis':    { thesis: 'Leaders who optimise for clarity outperform authority-first leaders within 6 months', thesisSentence: 'Clarity is the new authority.' },
      'pa-framework': { modelName: '4 Laws of Clear Leadership', principles: [{ number: 1, name: 'Make It Visible' }, { number: 2, name: 'Make It Honest' }, { number: 3, name: 'Make It Specific' }, { number: 4, name: 'Make It Consistent' }], subMode: 'argument' },
      'pa-chapters':  { chapters: [{ number: 1, title: 'Why Authority Fails', job: 'Establish the clarity deficit in teams', linkedPrinciple: null }, { number: 2, title: 'Law 1: Make It Visible', job: 'Deliver clarity principle and application', linkedPrinciple: '1' }, { number: 3, title: 'Law 2: Make It Honest', job: 'Deliver clarity in feedback', linkedPrinciple: '2' }, { number: 4, title: 'Law 3: Make It Specific', job: 'Deliver precision in expectation-setting', linkedPrinciple: '3' }, { number: 5, title: 'Law 4: Make It Consistent', job: 'Deliver behavioural consistency as trust-builder', linkedPrinciple: '4' }] },
      'pa-opener':    { openerScene: 'Sarah stares at a team that has stopped making decisions without her — she realised she has become the bottleneck, not the leader', openerHook: 'The most dangerous leadership failure looks like success', closerVision: 'Sarah\'s team operates with full autonomy, she has regained the trust she thought she\'d lost', closerAction: 'Run your first weekly clarity check-in' },
      ...overrides.nfStages,
    },
    ...overrides,
  };
}

function makePipelineBState(overrides = {}) {
  return {
    mode: 'nonfiction',
    pipeline: 'B',
    subMode: 'event-led',
    nfStages: {
      'dna-title':    { workingTitle: 'The Devil in the Details' },
      'dna-reader':   { avatarName: 'Alex', demographics: 'History enthusiast, 30–50', biggestFear: 'Missing the truth behind the headlines', deepestWish: 'Deep understanding of how history really happened' },
      'dna-promise':  { corePromise: 'Reveal how a serial killer operated undetected at the 1893 World\'s Fair' },
      'dna-comps':    { comps: [{ title: 'The Devil in the White City', yourGap: 'This goes deeper into Holmes\'s psychology' }], marketGap: 'Deeper psychological portrait than existing accounts' },
      'dna-idea':     { bigIdea: 'Progress and predation are not opposites — they are often partners', whyDifferent: 'Focuses on systemic failure of detection institutions, not just individual evil' },
      'pb-thesis':    { centralQuestion: 'How did a serial killer operate undetected for years at the heart of a celebrated public event?', thesis: 'The spectacle of modernity created cover for its darkest impulses.' },
      'pb-fork':      { subMode: 'event-led', forkRationale: 'The story is fundamentally chronological' },
      'pb-chapters':  { chapters: [{ number: 1, title: 'The Dream', chapterQuestion: 'What was Burnham\'s vision?', content: 'Fair planning' }, { number: 2, title: 'The Monster', chapterQuestion: 'Who was Holmes before the Fair?', content: 'Holmes backstory' }, { number: 3, title: 'The Trap', chapterQuestion: 'How did Holmes ensnare victims?', content: 'Hotel construction and murders' }, { number: 4, title: 'Unmasked', chapterQuestion: 'How did Holmes finally get caught?', content: 'Insurance fraud investigation — not the murders' }] },
      ...overrides.nfStages,
    },
    ...overrides,
  };
}

function makePipelineCState(overrides = {}) {
  return {
    mode: 'nonfiction',
    pipeline: 'C',
    nfStages: {
      'dna-title':      { workingTitle: 'Sharp: Master Knife Skills at Home' },
      'dna-reader':     { avatarName: 'Tom', demographics: 'Home cook, 25–45, comfortable with basic recipes' },
      'dna-promise':    { corePromise: 'Master the five foundational knife cuts in six weeks of daily practice' },
      'dna-comps':      { comps: [{ title: 'Knife Skills Illustrated', yourGap: 'That book has no structured drills' }], marketGap: 'No book combines structured drill progressions with knife technique' },
      'dna-idea':       { bigIdea: 'Knife skills are the gateway to every other cooking technique — most books skip the fundamentals', whyDifferent: 'The only knife book with a structured drill progression and milestone assessments' },
      'pc-skill':       { targetSkill: 'Mastering the five foundational knife cuts for home cooking', competencyDefinition: 'Can julienne one carrot into 3mm sticks in under 3 minutes without coaching', whyThisSkill: 'Unlocks every other cooking technique' },
      'pc-start-level': { startingLevel: 'Home cook who can follow a recipe but has no formal knife training', assumedKnowledge: 'Comfortable handling a chef\'s knife but no precision technique' },
      'pc-end-state':   { endStateDescription: 'Can execute all five cuts with accuracy and confidence', measurableOutcome: 'Julienne one carrot into 3mm sticks in under 3 minutes' },
      'pc-milestones':  { milestones: [{ milestoneTitle: 'Foundations', afterLesson: '3', subSkillsCovered: 'grip, draw', task: 'Julienne half a carrot in 5 minutes', passCriteria: 'All sticks within 1mm of 3mm × 3mm' }], finalAssessment: 'Julienne a full carrot in 3 minutes to spec' },
      ...overrides.nfStages,
    },
    ...overrides,
  };
}

// ── Full Critique — Pipeline A ────────────────────────────────────────────────

describe('runFullCritique — Pipeline A', () => {
  it('returns a structured result with findings, summary, and blocking flag', () => {
    const result = runFullCritique(makePipelineAState());
    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('blocking');
    expect(Array.isArray(result.findings)).toBe(true);
    expect(typeof result.blocking).toBe('boolean');
  });

  it('clean Pipeline A plan has no blocking errors', () => {
    const result = runFullCritique(makePipelineAState());
    expect(result.blocking).toBe(false);
  });

  it('detects thesis-framework drift when model name and thesis share no language', () => {
    const state = makePipelineAState({
      nfStages: {
        ...makePipelineAState().nfStages,
        'pa-framework': { modelName: 'The VIPER System', principles: [{ number: 1, name: 'V' }], subMode: 'argument' },
        'pa-thesis': { thesis: 'Clarity is what makes leaders effective' },
      },
    });
    const result = runFullCritique(state);
    expect(result.findings.some(f => f.id === 'pa-thesis-framework-drift')).toBe(true);
  });

  it('detects unlinked principles when principle count exceeds linked chapters', () => {
    const state = makePipelineAState({
      nfStages: {
        ...makePipelineAState().nfStages,
        'pa-framework': { modelName: '7 Laws of Clarity', principles: Array.from({ length: 7 }, (_, i) => ({ number: i + 1, name: `Law ${i + 1}` })), subMode: 'argument' },
        'pa-chapters':  { chapters: [{ number: 1, linkedPrinciple: '1' }, { number: 2, linkedPrinciple: '2' }] },
      },
    });
    const result = runFullCritique(state);
    expect(result.findings.some(f => f.id === 'pa-principles-unlinked')).toBe(true);
  });

  it('detects anecdote-only evidence when DNA philosophy and evidence map are both anecdote-only', () => {
    const state = makePipelineAState({
      nfStages: {
        ...makePipelineAState().nfStages,
        'dna-evidence': { evidenceTypes: 'anecdote and personal stories', sourcingRigor: 'light' },
        'pa-evidence':  { strongestEvidence: 'personal anecdotes from interviews', thinnestEvidence: 'statistics' },
      },
    });
    const result = runFullCritique(state);
    expect(result.findings.some(f => f.id === 'pa-anecdote-only-evidence')).toBe(true);
  });

  it('summary counts match findings array', () => {
    const result = runFullCritique(makePipelineAState());
    const actual = { errors: 0, warnings: 0, tips: 0 };
    result.findings.forEach(f => { actual[f.severity === 'tip' ? 'tips' : f.severity + 's']++; });
    expect(result.summary.errors).toBe(actual.errors);
    expect(result.summary.warnings).toBe(actual.warnings);
    expect(result.summary.tips).toBe(actual.tips);
    expect(result.summary.total).toBe(result.findings.length);
  });
});

// ── Full Critique — Pipeline B ────────────────────────────────────────────────

describe('runFullCritique — Pipeline B', () => {
  it('clean Pipeline B plan has no blocking errors', () => {
    const result = runFullCritique(makePipelineBState());
    expect(result.blocking).toBe(false);
  });

  it('flags closing chapter that does not address central question', () => {
    const state = makePipelineBState({
      nfStages: {
        ...makePipelineBState().nfStages,
        'pb-chapters': {
          chapters: [
            { number: 1, chapterQuestion: 'The beginning', content: 'Setup' },
            { number: 2, chapterQuestion: 'The middle', content: 'Rising action' },
            { number: 3, chapterQuestion: 'What were the flowers like?', content: 'Completely unrelated to murder or detection' },
          ],
        },
      },
    });
    const result = runFullCritique(state);
    const closingFlag = result.findings.some(f => f.id === 'pb-closing-doesnt-answer-question' || f.id === 'pb-closing-doesnt-deliver-promise');
    expect(closingFlag).toBe(true);
  });
});

// ── Full Critique — Pipeline C ────────────────────────────────────────────────

describe('runFullCritique — Pipeline C', () => {
  it('clean Pipeline C plan has no blocking errors', () => {
    const result = runFullCritique(makePipelineCState());
    expect(result.blocking).toBe(false);
  });

  it('flags end-state not assessed when measurableOutcome exists but finalAssessment is missing', () => {
    const state = makePipelineCState({
      nfStages: {
        ...makePipelineCState().nfStages,
        'pc-milestones': { milestones: [], finalAssessment: '' },
      },
    });
    const result = runFullCritique(state);
    expect(result.findings.some(f => f.id === 'pc-end-state-not-assessed')).toBe(true);
    expect(result.blocking).toBe(true);
  });

  it('flags promise-outcome drift when promise and measurable outcome share no language', () => {
    const state = makePipelineCState({
      nfStages: {
        ...makePipelineCState().nfStages,
        'dna-promise': { corePromise: 'Become a confident home baker who can produce professional-quality bread' },
        'pc-end-state': { endStateDescription: 'Can execute knife cuts correctly', measurableOutcome: 'Julienne a carrot in under 3 minutes' },
      },
    });
    const result = runFullCritique(state);
    expect(result.findings.some(f => f.id === 'pc-promise-outcome-drift')).toBe(true);
  });
});

// ── Promise-Payoff Audit ──────────────────────────────────────────────────────

describe('Promise-Payoff Audit', () => {
  it('flags undelivered promise when no chapter job reflects the core promise', () => {
    const state = makePipelineAState({
      nfStages: {
        ...makePipelineAState().nfStages,
        'dna-promise': { corePromise: 'Become a transformational servant leader in healthcare' },
        'pa-chapters': {
          chapters: [
            { number: 1, title: 'The Burnout Crisis', job: 'Set up the problem', linkedPrinciple: null },
            { number: 2, title: 'Principle 1', job: 'Core principle', linkedPrinciple: '1' },
          ],
        },
      },
    });
    const result = runFullCritique(state);
    expect(result.findings.some(f => f.id === 'pa-promise-undelivered')).toBe(true);
  });

  it('does not flag promise when chapter jobs address it', () => {
    const state = makePipelineAState();
    const result = runFullCritique(state);
    expect(result.findings.some(f => f.id === 'pa-promise-undelivered')).toBe(false);
  });
});

// ── Comp-Adjacency Check ──────────────────────────────────────────────────────

describe('Comp-Adjacency Check', () => {
  it('flags generic framework name when comps use same naming pattern', () => {
    const state = makePipelineAState({
      nfStages: {
        ...makePipelineAState().nfStages,
        'pa-framework': { modelName: 'The 5 Laws of Success', principles: [{ number: 1 }, { number: 2 }, { number: 3 }, { number: 4 }, { number: 5 }], subMode: 'argument' },
        'dna-comps': { comps: [{ title: 'The 7 Habits of Highly Effective People', yourGap: 'Older, process-focused' }, { title: 'The 4 Laws of Behaviour Change', yourGap: 'Habits-focused, not leadership' }], marketGap: 'Leadership clarity specifically' },
      },
    });
    const result = runFullCritique(state);
    expect(result.findings.some(f => f.id === 'pa-framework-generic-name')).toBe(true);
  });

  it('flags vague differentiation using comparative-only language', () => {
    const state = makePipelineAState({
      nfStages: {
        ...makePipelineAState().nfStages,
        'dna-idea': { bigIdea: 'Leaders need clarity', whyDifferent: 'Better and more unique than other books' },
      },
    });
    const result = runFullCritique(state);
    expect(result.findings.some(f => f.id === 'differentiation-vague')).toBe(true);
  });
});

// ── Research Gap Integration ──────────────────────────────────────────────────

describe('Research Gap Integration', () => {
  it('includes research findings when researchGaps is provided', () => {
    const researchGaps = {
      stats: { total: 20, primaryOrPeerReviewed: 2, verified: 5, pending: 15, disputed: 0, needsFollowUp: 0 },
      unsourcedItems: Array.from({ length: 7 }, (_, i) => ({ id: `res-00${i}`, title: `Item ${i}`, subtype: 'note' })),
      thinChapters: [{ chapterNumber: 3, chapterTitle: 'Chapter 3', linkedCount: 1 }],
      lowReliabilityOnly: [],
      unverified: [],
    };
    const result = runFullCritique(makePipelineAState(), researchGaps);
    expect(result.findings.some(f => f.id === 'research-many-unsourced')).toBe(true);
    expect(result.findings.some(f => f.id === 'research-thin-chapters')).toBe(true);
    expect(result.findings.some(f => f.id === 'research-low-primary-ratio')).toBe(true);
  });

  it('does not add research findings when researchGaps is null', () => {
    const result = runFullCritique(makePipelineAState(), null);
    expect(result.findings.some(f => f.category === 'research')).toBe(false);
  });
});

// ── Report Generation ─────────────────────────────────────────────────────────

describe('generateCritiqueReport', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'storyline-critique-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes critique-report.md to output/', async () => {
    const result = await generateCritiqueReport(makePipelineAState(), tmpDir);
    expect(result.reportPath).toContain('critique-report.md');
    const { existsSync } = await import('fs');
    expect(existsSync(result.reportPath)).toBe(true);
  });

  it('report contains expected sections', async () => {
    const result = await generateCritiqueReport(makePipelineAState(), tmpDir);
    const { readFileSync } = await import('fs');
    const md = readFileSync(result.reportPath, 'utf-8');
    expect(md).toContain('# Full-Book Critique Report');
    expect(md).toContain('The Clarity Method');
    expect(md).toContain('**Pipeline:** A');
    expect(md).toContain('## Summary');
  });

  it('returns summaryMarkdown for appending to master doc', async () => {
    const result = await generateCritiqueReport(makePipelineAState(), tmpDir);
    expect(typeof result.summaryMarkdown).toBe('string');
    expect(result.summaryMarkdown).toContain('Critique Report Summary');
  });

  it('handles empty state without throwing', async () => {
    const empty = { mode: 'nonfiction', pipeline: 'A', nfStages: {} };
    await expect(generateCritiqueReport(empty, tmpDir)).resolves.toBeDefined();
  });
});

// ── Summary Markdown ──────────────────────────────────────────────────────────

describe('buildSummaryMarkdown', () => {
  it('shows blocking status when errors present', () => {
    const critiqueResult = { blocking: true, summary: { errors: 2, warnings: 1, tips: 0, total: 3 }, findings: [{ severity: 'error', message: 'Test error', location: 'somewhere' }] };
    const md = buildSummaryMarkdown(critiqueResult);
    expect(md).toContain('Critique Report Summary');
    expect(md).toContain('blocking');
    expect(md).toContain('Test error');
  });

  it('shows clean status when no errors', () => {
    const critiqueResult = { blocking: false, summary: { errors: 0, warnings: 2, tips: 1, total: 3 }, findings: [] };
    const md = buildSummaryMarkdown(critiqueResult);
    expect(md).toContain('No blocking issues');
    expect(md).toContain('2 warning');
  });
});

// ── Finding shape ─────────────────────────────────────────────────────────────

describe('Finding shape contract', () => {
  it('every finding has required fields', () => {
    const result = runFullCritique(makePipelineAState());
    for (const f of result.findings) {
      expect(f.id,       `${f.id} missing id`).toBeTruthy();
      expect(f.severity, `${f.id} missing severity`).toMatch(/error|warning|tip/);
      expect(f.category, `${f.id} missing category`).toBeTruthy();
      expect(f.source,   `${f.id} missing source`).toBeTruthy();
      expect(f.location, `${f.id} missing location`).toBeTruthy();
      expect(f.message,  `${f.id} missing message`).toBeTruthy();
    }
  });
});
