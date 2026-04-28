// Cross-harness critique API — NF-08
// Detects drift that per-stage critique cannot see: coherence across Book DNA,
// pipeline stages, promise-payoff gaps, reader avatar drift, and comp-adjacency.
//
// Finding shape:
// { id, severity, category, source, location, message, suggestion }

import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { checkNfPromisePayoff, getWritingPlan } from '../../../packages/core/dist/index.js';

// ── Finding builder ───────────────────────────────────────────────────────────

function finding(id, severity, category, source, location, message, suggestion = null) {
  return { id, severity, category, source, location, message, suggestion };
}

// ── NF-8.3 DNA ↔ Pipeline Coherence ──────────────────────────────────────────

function checkDnaToPipelineCoherence(state) {
  const findings = [];
  const nf = state?.nfStages || {};
  const pipeline = state?.pipeline;

  const dnaPromise   = nf['dna-promise']   || {};
  const dnaEvidence  = nf['dna-evidence']  || {};
  const dnaReader    = nf['dna-reader']    || {};
  const dnaTransform = nf['dna-transform'] || {};
  const dnaIdea      = nf['dna-idea']      || {};

  // Pipeline A: framework principle count vs chapter count
  if (pipeline === 'A') {
    const paFramework = nf['pa-framework'] || {};
    const paChapters  = nf['pa-chapters']  || {};
    const principles  = Array.isArray(paFramework.principles) ? paFramework.principles : [];
    const chapters    = Array.isArray(paChapters.chapters)    ? paChapters.chapters    : [];
    const bodyChapters = chapters.filter(c => c.linkedPrinciple);

    if (principles.length > 0 && chapters.length > 0) {
      if (principles.length > bodyChapters.length + 2) {
        findings.push(finding(
          'pa-principles-unlinked',
          'warning',
          'coherence',
          'dna-pipeline-coherence',
          'pa-framework → pa-chapters',
          `${principles.length} framework principles but only ${bodyChapters.length} chapter(s) linked to a principle. ${principles.length - bodyChapters.length} principle(s) may have no chapter home.`,
          'Add linkedPrinciple to all body chapters or consolidate principles.',
        ));
      }
    }

    // Thesis vs framework: thesis should contain language related to framework model
    const paThesis = nf['pa-thesis'] || {};
    if (paFramework.modelName && paThesis.thesis) {
      const modelWords = paFramework.modelName.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const thesisText = paThesis.thesis.toLowerCase();
      const anyMatch = modelWords.some(w => thesisText.includes(w));
      if (!anyMatch && modelWords.length > 0) {
        findings.push(finding(
          'pa-thesis-framework-drift',
          'warning',
          'drift',
          'dna-pipeline-coherence',
          'pa-thesis → pa-framework',
          `The thesis and framework model name ("${paFramework.modelName}") share no common language. They may have drifted apart during planning.`,
          'Ensure the framework is the answer to the thesis — the names should share conceptual vocabulary.',
        ));
      }
    }

    // Evidence philosophy vs evidence map
    if (dnaEvidence.evidenceTypes && /anecdote/i.test(dnaEvidence.evidenceTypes)
        && !/research|data|study|peer|case/i.test(dnaEvidence.evidenceTypes)) {
      const paEvidence = nf['pa-evidence'] || {};
      if (!paEvidence.strongestEvidence || /anecdote|story|personal/i.test(paEvidence.strongestEvidence)) {
        findings.push(finding(
          'pa-anecdote-only-evidence',
          'warning',
          'coherence',
          'dna-pipeline-coherence',
          'dna-evidence → pa-evidence',
          'Evidence philosophy relies on anecdote only, and the Evidence Map reflects this. Prescriptive books built on anecdote alone face credibility challenges.',
          'Identify at least one statistic, case study, or peer-reviewed finding per principle.',
        ));
      }
    }

    // Opener must address reader's biggest fear
    if (dnaReader.biggestFear) {
      const paOpener = nf['pa-opener'] || {};
      const fearWords = dnaReader.biggestFear.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 3);
      const openerText = (paOpener.openerScene || '').toLowerCase();
      const anyMatch = fearWords.some(w => openerText.includes(w));
      if (openerText && !anyMatch) {
        findings.push(finding(
          'pa-opener-fear-mismatch',
          'tip',
          'drift',
          'dna-pipeline-coherence',
          'dna-reader → pa-opener',
          'The opening scene may not address the reader\'s biggest fear from Book DNA Stage 2. The opener should make that fear viscerally real.',
          `Reader's biggest fear: "${dnaReader.biggestFear}". Check that the opener scene resonates with it.`,
        ));
      }
    }
  }

  // Pipeline B: central question vs closing chapter
  if (pipeline === 'B') {
    const pbThesis    = nf['pb-thesis']   || {};
    const pbChapters  = nf['pb-chapters'] || {};
    const pbCritique  = nf['pb-critique'] || {};
    const chapters    = Array.isArray(pbChapters.chapters) ? pbChapters.chapters : [];

    if (pbThesis.centralQuestion && chapters.length > 0) {
      const lastChapter = chapters[chapters.length - 1];
      const questionWords = pbThesis.centralQuestion.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 4);
      const closingText = (lastChapter?.chapterQuestion || lastChapter?.content || '').toLowerCase();
      const anyMatch = questionWords.some(w => closingText.includes(w));
      if (closingText && !anyMatch && !pbCritique.centralQuestionAnsweredCheck) {
        findings.push(finding(
          'pb-closing-doesnt-answer-question',
          'warning',
          'promise-payoff',
          'dna-pipeline-coherence',
          'pb-thesis → pb-chapters (final)',
          'The last chapter may not answer the central question from Stage 1. Narrative non-fiction that doesn\'t answer its own question fails structurally.',
          `Central question: "${pbThesis.centralQuestion}". Verify the closing chapter explicitly answers it.`,
        ));
      }
    }

    // Timeline span vs chapter count: very long span with very few chapters
    const pbTimeline = nf['pb-timeline'] || {};
    if (pbTimeline.timelineSpan && chapters.length > 0 && chapters.length < 5) {
      findings.push(finding(
        'pb-few-chapters-for-span',
        'tip',
        'coherence',
        'dna-pipeline-coherence',
        'pb-timeline → pb-chapters',
        `Timeline spans "${pbTimeline.timelineSpan}" but only ${chapters.length} chapter(s) are planned. This ratio may compress important events into thin coverage.`,
        'Consider whether the timeline scope and chapter count are calibrated correctly.',
      ));
    }
  }

  // Pipeline C: end-state measurable outcome vs final assessment
  if (pipeline === 'C') {
    const pcEndState  = nf['pc-end-state']  || {};
    const pcMilestones = nf['pc-milestones'] || {};
    if (pcEndState.measurableOutcome && !pcMilestones.finalAssessment) {
      findings.push(finding(
        'pc-end-state-not-assessed',
        'error',
        'promise-payoff',
        'dna-pipeline-coherence',
        'pc-end-state → pc-milestones',
        `End-state competency is defined ("${pcEndState.measurableOutcome.slice(0, 60)}…") but there is no final assessment milestone. The book cannot verify its own outcome.`,
        'Design a final assessment in Stage 8 that directly tests the measurable outcome.',
      ));
    }

    // Starting level vs drill difficulty
    const pcStartLevel = nf['pc-start-level'] || {};
    const pcDrills     = nf['pc-drills']      || {};
    const drills = Array.isArray(pcDrills.drills) ? pcDrills.drills : [];
    if (pcStartLevel.startingLevel && drills.length > 0) {
      const isAbsBeginner = /absolute beginner|no experience|zero|never|brand new/i.test(pcStartLevel.startingLevel);
      const hasBeginnerDrill = drills.some(d => d.difficulty === 'beginner');
      if (isAbsBeginner && !hasBeginnerDrill) {
        findings.push(finding(
          'pc-drill-level-mismatch',
          'warning',
          'drift',
          'dna-pipeline-coherence',
          'pc-start-level → pc-drills',
          'Reader is defined as an absolute beginner, but no drills are marked as "beginner" difficulty.',
          'Mark entry-level drills as difficulty: "beginner" to match the reader starting level.',
        ));
      }
    }
  }

  // All pipelines: core promise vs transformation sentence coherence
  if (dnaPromise.corePromise && dnaTransform.transformationSentence) {
    const promiseWords = dnaPromise.corePromise.toLowerCase().split(/\s+/).filter(w => w.length > 5).slice(0, 5);
    const transformText = dnaTransform.transformationSentence.toLowerCase();
    const anyMatch = promiseWords.some(w => transformText.includes(w));
    if (!anyMatch) {
      findings.push(finding(
        'promise-transform-drift',
        'warning',
        'coherence',
        'dna-pipeline-coherence',
        'dna-promise → dna-transform',
        'The Core Promise (Stage 6) and the Transformation Sentence (Stage 3) share no common language. They should reinforce the same reader journey.',
        'Align the transformation sentence with the language of the core promise.',
      ));
    }
  }

  // Big Idea vs pipeline output: idea should be visible in the final framework/thesis
  if (dnaIdea.bigIdea && pipeline === 'A') {
    const paThesis = nf['pa-thesis'] || {};
    const ideaWords = dnaIdea.bigIdea.toLowerCase().split(/\s+/).filter(w => w.length > 5).slice(0, 4);
    const thesisText = (paThesis.thesis || '').toLowerCase();
    if (thesisText && !ideaWords.some(w => thesisText.includes(w))) {
      findings.push(finding(
        'pa-big-idea-thesis-drift',
        'tip',
        'drift',
        'dna-pipeline-coherence',
        'dna-idea → pa-thesis',
        'The Big Idea from Book DNA Stage 4 and the Pipeline A thesis share no common language. The thesis should be a sharpened expression of the Big Idea.',
        `Big Idea: "${dnaIdea.bigIdea.slice(0, 80)}". Ensure the thesis refines rather than departs from it.`,
      ));
    }
  }

  return findings;
}

// ── NF-8.4 Reader Avatar Drift ────────────────────────────────────────────────

function checkReaderAvatarDrift(state) {
  const findings = [];
  const nf = state?.nfStages || {};
  const pipeline = state?.pipeline;

  const dnaReader = nf['dna-reader'] || {};
  if (!dnaReader.avatarName) return findings; // No avatar defined — nothing to drift from

  const avatarName = dnaReader.avatarName;

  // Pipeline A: reader's deepest wish should appear somewhere in closer vision
  if (pipeline === 'A') {
    const paOpener = nf['pa-opener'] || {};
    if (dnaReader.deepestWish && paOpener.closerVision) {
      const wishWords = dnaReader.deepestWish.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 4);
      const closerText = paOpener.closerVision.toLowerCase();
      if (!wishWords.some(w => closerText.includes(w))) {
        findings.push(finding(
          'pa-closer-avatar-drift',
          'warning',
          'drift',
          'reader-avatar-drift',
          `dna-reader → pa-opener (closer)`,
          `Closer vision may not speak to ${avatarName}'s deepest wish. The closer should deliver what the reader came for.`,
          `Deepest wish: "${dnaReader.deepestWish}". Review the closer vision against it.`,
        ));
      }
    }

    // Check application actions match reader profile
    const paApplication = nf['pa-application'] || {};
    const apps = Array.isArray(paApplication.applicationByPrinciple) ? paApplication.applicationByPrinciple : [];
    if (dnaReader.demographics && apps.length > 0) {
      const isBusy = /busy|time-poor|overwhelmed|executive|parent/i.test(dnaReader.demographics);
      const hasLongAction = apps.some(a => /month|year|program|overhaul/i.test(a.primaryAction || ''));
      if (isBusy && hasLongAction) {
        findings.push(finding(
          'pa-actions-dont-fit-reader',
          'tip',
          'drift',
          'reader-avatar-drift',
          'dna-reader → pa-application',
          `${avatarName} is described as busy/time-poor, but some application actions require months or major overhauls. Actions should fit the reader's constraints.`,
          'Trim or reframe long-horizon actions for the defined reader profile.',
        ));
      }
    }
  }

  // Pipeline B: cast should include people the reader can relate to (idea-led check)
  if (pipeline === 'B') {
    const pbCast = nf['pb-cast'] || {};
    const pbFork = nf['pb-fork'] || {};
    const cast = Array.isArray(pbCast.cast) ? pbCast.cast : [];
    if (pbFork.subMode === 'idea-led' && cast.length > 0) {
      const hasRelatable = cast.some(c => c.role === 'witness' || /relatable|everyman|ordinary|reader stand-in/i.test(c.whyTheyMatter || ''));
      if (!hasRelatable && cast.length <= 3) {
        findings.push(finding(
          'pb-cast-no-reader-anchor',
          'tip',
          'drift',
          'reader-avatar-drift',
          'dna-reader → pb-cast',
          'In idea-led narrative NF, the reader needs a human anchor in the cast — someone whose experience they can follow. Consider whether the cast has such a figure.',
          'Review cast roles. A "witness" or reader-surrogate character aids the idea-led structure.',
        ));
      }
    }
  }

  // Pipeline C: starting level vocabulary should match drill language
  if (pipeline === 'C') {
    const pcStartLevel = nf['pc-start-level'] || {};
    const pcLessons    = nf['pc-lessons']     || {};
    const lessons = Array.isArray(pcLessons.lessons) ? pcLessons.lessons : [];

    if (pcStartLevel.assumedKnowledge && /none|nothing|no knowledge|zero/i.test(pcStartLevel.assumedKnowledge)) {
      const technicalLessons = lessons.filter(l =>
        l.keyConceptsCount && parseInt(l.keyConceptsCount) > 3,
      );
      if (technicalLessons.length > lessons.length / 2) {
        findings.push(finding(
          'pc-lessons-too-dense-for-beginner',
          'warning',
          'drift',
          'reader-avatar-drift',
          'pc-start-level → pc-lessons',
          `Reader starts with zero assumed knowledge, but ${technicalLessons.length} of ${lessons.length} lesson(s) introduce more than 3 concepts. Concept-dense lessons lose beginners.`,
          'Limit beginner lessons to 1–2 core concepts. Split dense lessons across chapters.',
        ));
      }
    }
  }

  return findings;
}

// ── NF-8.5 Promise-Payoff Audit ───────────────────────────────────────────────
// FIC-C.3: logic extracted to packages/core/src/critique/promise-payoff.ts.
// This shim converts raw state → WritingPlan and delegates, keeping all
// existing callers working without change.

function checkPromisePayoff(state) {
  const plan = getWritingPlan(state);
  return checkNfPromisePayoff(plan);
}

// ── NF-8.6 Comp-Adjacency Check ───────────────────────────────────────────────

function checkCompAdjacency(state) {
  const findings = [];
  const nf = state?.nfStages || {};
  const pipeline = state?.pipeline;

  const dnaComps = nf['dna-comps'] || {};
  const dnaIdea  = nf['dna-idea']  || {};

  const comps = Array.isArray(dnaComps.comps) ? dnaComps.comps : [];
  if (comps.length === 0) return findings;

  // Pipeline A: check if framework name sounds generic (potential comp overlap)
  if (pipeline === 'A') {
    const paFramework = nf['pa-framework'] || {};
    if (paFramework.modelName) {
      const genericPatterns = /^the\s+\d+\s+(laws|rules|habits|steps|principles|keys|pillars|secrets)/i;
      if (genericPatterns.test(paFramework.modelName)) {
        const compTitles = comps.map(c => c.title || '').join(' ').toLowerCase();
        if (compTitles.includes('laws') || compTitles.includes('habits') || compTitles.includes('rules')) {
          findings.push(finding(
            'pa-framework-generic-name',
            'warning',
            'comps',
            'comp-adjacency',
            'dna-comps → pa-framework',
            `Framework name "${paFramework.modelName}" follows the same naming pattern as one or more comps. This reduces differentiation.`,
            'Rename the framework to something more conceptually specific — the model name is a brand asset.',
          ));
        }
      }
    }
  }

  // All pipelines: if whyDifferent from dna-idea is short and vague, flag comp risk
  if (dnaIdea.whyDifferent) {
    if (/(better|more|less|new|fresh|unique|different)/i.test(dnaIdea.whyDifferent)
        && dnaIdea.whyDifferent.length < 60) {
      findings.push(finding(
        'differentiation-vague',
        'warning',
        'comps',
        'comp-adjacency',
        'dna-idea (whyDifferent)',
        'Differentiation from comps relies on comparative language ("better", "new", "unique") without specifics. This won\'t survive a pitch meeting or an Amazon reader comparing two books.',
        'Name exactly what is different — the specific mechanism, approach, or evidence that comps lack.',
      ));
    }
  } else if (comps.length >= 3) {
    findings.push(finding(
      'differentiation-undefined',
      'error',
      'comps',
      'comp-adjacency',
      'dna-idea → dna-comps',
      `${comps.length} comps identified but differentiation ("whyDifferent") is not defined. Without it, the book occupies the same market space as the comps.`,
      'Complete dna-idea with a specific differentiation statement.',
    ));
  }

  // Check comps without gap analysis
  const noGap = comps.filter(c => !c.yourGap || c.yourGap.length < 20);
  if (noGap.length > 1) {
    findings.push(finding(
      'comps-no-gap-analysis',
      'warning',
      'comps',
      'comp-adjacency',
      'dna-comps',
      `${noGap.length} comp(s) have no gap analysis. The gap is why your book exists — without naming it per comp, adjacency risk is unquantified.`,
      'Add specific gap analysis for each comp: what does it not do that your book does?',
    ));
  }

  return findings;
}

// ── NF-8.7 Research Gap Integration ──────────────────────────────────────────

function integrateResearchFindings(researchGaps) {
  if (!researchGaps) return [];
  const findings = [];
  const { thinChapters = [], unsourcedItems = [], lowReliabilityOnly = [], stats = {} } = researchGaps;

  if (unsourcedItems.length > 5) {
    findings.push(finding(
      'research-many-unsourced',
      'warning',
      'research',
      'research-gap-integration',
      'research subsystem',
      `${unsourcedItems.length} research items are pending with no sources attached. Unsourced items are a publication liability.`,
      'Prioritise sourcing these items before drafting the chapters they support.',
    ));
  }

  if (thinChapters.length > 0) {
    const chapterList = thinChapters.map(c => `Ch${c.chapterNumber}`).join(', ');
    findings.push(finding(
      'research-thin-chapters',
      'warning',
      'research',
      'research-gap-integration',
      `chapters: ${chapterList}`,
      `${thinChapters.length} chapter(s) have fewer than 2 linked research items: ${chapterList}.`,
      'Add research items linked to these chapters or accept they will be under-evidenced.',
    ));
  }

  if (lowReliabilityOnly.length > 0) {
    const chapterList = lowReliabilityOnly.map(c => `Ch${c.chapterNumber}`).join(', ');
    findings.push(finding(
      'research-anecdote-only-chapters',
      'warning',
      'research',
      'research-gap-integration',
      `chapters: ${chapterList}`,
      `${lowReliabilityOnly.length} chapter(s) have only anecdotal evidence: ${chapterList}.`,
      'Add at least one primary, peer-reviewed, or secondary source to each of these chapters.',
    ));
  }

  if (stats.total > 0 && stats.primaryOrPeerReviewed / stats.total < 0.2) {
    findings.push(finding(
      'research-low-primary-ratio',
      'tip',
      'research',
      'research-gap-integration',
      'research subsystem',
      `Only ${stats.primaryOrPeerReviewed} of ${stats.total} research items (${Math.round(stats.primaryOrPeerReviewed / stats.total * 100)}%) are primary or peer-reviewed. Commercial non-fiction typically benefits from a higher ratio.`,
      'Identify key claims that need primary or peer-reviewed backing and add them to the research subsystem.',
    ));
  }

  return findings;
}

// ── In-stage critique wrapper ─────────────────────────────────────────────────

function wrapInStageCritique(state) {
  const findings = [];
  const nf = state?.nfStages || {};
  const pipeline = state?.pipeline;

  // We include the final critique stage findings in the unified report
  let critiqueStageId = null;
  let critiqueData = {};

  if (pipeline === 'A') critiqueStageId = 'pa-critique';
  if (pipeline === 'B') critiqueStageId = 'pb-critique';
  if (pipeline === 'C') critiqueStageId = 'pc-critique';

  if (critiqueStageId) {
    critiqueData = nf[critiqueStageId] || {};
    // Flag the biggest structural risk as a named finding
    if (critiqueData.critiqueSummary) {
      findings.push(finding(
        `${critiqueStageId}-summary`,
        'warning',
        'in-stage',
        'in-stage-critique',
        critiqueStageId,
        `Writer-identified risk: "${critiqueData.critiqueSummary}"`,
        'This was flagged in the per-stage critique. Ensure it is addressed before drafting.',
      ));
    }
  }

  return findings;
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export function runFullCritique(state, researchGaps = null) {
  const all = [
    ...checkDnaToPipelineCoherence(state),
    ...checkReaderAvatarDrift(state),
    ...checkPromisePayoff(state),
    ...checkCompAdjacency(state),
    ...integrateResearchFindings(researchGaps),
    ...wrapInStageCritique(state),
  ];

  const errors   = all.filter(f => f.severity === 'error');
  const warnings = all.filter(f => f.severity === 'warning');
  const tips     = all.filter(f => f.severity === 'tip');
  const blocking = errors.length > 0;

  return {
    findings: all,
    summary: {
      total:    all.length,
      errors:   errors.length,
      warnings: warnings.length,
      tips:     tips.length,
    },
    blocking,
  };
}

// ── Report generation ─────────────────────────────────────────────────────────

function formatFinding(f) {
  const prefix = f.severity === 'error' ? '✗' : f.severity === 'warning' ? '⚠' : '→';
  const lines = [
    `${prefix} **[${f.category}]** ${f.message}`,
    `   *Location:* ${f.location}`,
  ];
  if (f.suggestion) lines.push(`   *Suggestion:* ${f.suggestion}`);
  return lines.join('\n');
}

function buildReportMarkdown(critiqueResult, state) {
  const { findings, summary, blocking } = critiqueResult;
  const pipeline = state?.pipeline || '?';
  const bookTitle = state?.nfStages?.['dna-title']?.workingTitle || 'Untitled';
  const now = new Date().toISOString();

  const sections = [
    `# Full-Book Critique Report`,
    ``,
    `**Book:** ${bookTitle}`,
    `**Pipeline:** ${pipeline}`,
    `**Generated:** ${now}`,
    `**Status:** ${blocking ? '✗ Blocking issues found' : '✓ No blocking issues'}`,
    ``,
    `## Summary`,
    ``,
    `| Severity | Count |`,
    `|----------|-------|`,
    `| Errors   | ${summary.errors}   |`,
    `| Warnings | ${summary.warnings} |`,
    `| Tips     | ${summary.tips}     |`,
    `| **Total**| **${summary.total}** |`,
    ``,
  ];

  const CATEGORIES = ['coherence', 'drift', 'promise-payoff', 'comps', 'research', 'in-stage'];
  const LABELS = {
    'coherence':      'DNA ↔ Pipeline Coherence',
    'drift':          'Reader Avatar Drift',
    'promise-payoff': 'Promise-Payoff Audit',
    'comps':          'Comp-Adjacency Check',
    'research':       'Research Gap Integration',
    'in-stage':       'In-Stage Critique Summary',
  };

  for (const cat of CATEGORIES) {
    const catFindings = findings.filter(f => f.category === cat);
    if (catFindings.length === 0) continue;
    sections.push(`## ${LABELS[cat]}`, ``);
    catFindings.forEach(f => { sections.push(formatFinding(f), ''); });
  }

  if (findings.length === 0) {
    sections.push(`## Findings`, ``, `*No cross-stage issues detected. The book plan is internally consistent.*`, ``);
  }

  sections.push(
    `---`,
    ``,
    `*This report is generated automatically at \`nf generate\` time.*`,
    `*Per-stage critique (in-stage errors) is available via \`nf stage-info <stageId>\`.*`,
  );

  return sections.join('\n');
}

export function buildSummaryMarkdown(critiqueResult) {
  const { summary, blocking } = critiqueResult;
  const lines = [
    ``,
    `---`,
    ``,
    `## Critique Report Summary`,
    ``,
    `*Full report: \`output/critique-report.md\`*`,
    ``,
    blocking
      ? `**Status: ✗ ${summary.errors} blocking issue(s) detected.** Address errors before drafting.`
      : `**Status: ✓ No blocking issues.** ${summary.warnings} warning(s), ${summary.tips} tip(s).`,
  ];
  if (critiqueResult.findings.filter(f => f.severity === 'error').length > 0) {
    lines.push('');
    critiqueResult.findings
      .filter(f => f.severity === 'error')
      .slice(0, 3)
      .forEach(f => lines.push(`- ✗ ${f.message}`));
  }
  return lines.join('\n');
}

export async function generateCritiqueReport(state, projectDir = process.cwd(), researchGaps = null) {
  const critiqueResult = runFullCritique(state, researchGaps);
  const reportMd = buildReportMarkdown(critiqueResult, state);
  const summaryMd = buildSummaryMarkdown(critiqueResult);

  const outputDir = resolve(projectDir, 'output');
  await mkdir(outputDir, { recursive: true });
  const reportPath = resolve(outputDir, 'critique-report.md');
  await writeFile(reportPath, reportMd, 'utf-8');

  return {
    reportPath,
    summaryMarkdown: summaryMd,
    ...critiqueResult,
  };
}
