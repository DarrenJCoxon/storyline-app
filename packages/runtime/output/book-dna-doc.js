// Book DNA Consolidation output — generates book-dna.md and book-dna.json
// Called after Stage 12 (dna-consolidate) is saved.
// Outputs to .storyline/ alongside state.json.

import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';

const PIPELINE_LABELS = {
  A: 'Pipeline A — Prescriptive (Self-Help, Business, Health, Money, Relationships)',
  B: 'Pipeline B — Narrative Non-Fiction (Popular Science, History, True Crime)',
  C: 'Pipeline C — How-To / Skill Ladder (Practical Skills)',
};

function sectionHeader(title) {
  return `\n## ${title}\n`;
}

function field(label, value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    return `**${label}:**\n${value.map((v, i) => `${i + 1}. ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n')}\n`;
  }
  return `**${label}:** ${value}\n`;
}

function formatComps(comps) {
  if (!Array.isArray(comps) || comps.length === 0) return '';
  return comps.map((c, i) => {
    const lines = [`**${i + 1}. ${c.title || 'Untitled'}**${c.author ? ` — ${c.author}` : ''}`];
    if (c.whatTheyGotRight) lines.push(`   - What they got right: ${c.whatTheyGotRight}`);
    if (c.yourGap) lines.push(`   - Your gap: ${c.yourGap}`);
    return lines.join('\n');
  }).join('\n\n');
}

export async function generateBookDnaDoc(state, projectDir = process.cwd()) {
  const dna = state.nfStages || {};

  const category    = dna['dna-category']    || {};
  const reader      = dna['dna-reader']      || {};
  const transform   = dna['dna-transform']   || {};
  const idea        = dna['dna-idea']        || {};
  const author      = dna['dna-author']      || {};
  const promise     = dna['dna-promise']     || {};
  const comps       = dna['dna-comps']       || {};
  const voice       = dna['dna-voice']       || {};
  const evidence    = dna['dna-evidence']    || {};
  const commercial  = dna['dna-commercial']  || {};
  const title       = dna['dna-title']       || {};
  const consolidate = dna['dna-consolidate'] || {};

  const pipeline = consolidate.confirmedPipeline || state.pipeline || '?';
  const bookTitle = title.workingTitle || 'Untitled';
  const updatedAt = new Date().toISOString();

  // ── Markdown ──────────────────────────────────────────────────
  const md = [
    `# Book DNA — ${bookTitle}`,
    ``,
    `*Generated: ${updatedAt}*`,
    `*Pipeline: ${PIPELINE_LABELS[pipeline] || pipeline}*`,
    ``,
    `---`,
    ``,
    `> ${consolidate.elevatorPitch || ''}`,
    ``,
    sectionHeader('1. Category & Market Positioning'),
    field('Primary Category', category.primaryCategory),
    field('Sub-category', category.amazonSubcategory),
    field('Shelf Position', category.shelfDescription),
    field('Primary Comp', category.competitorTitle),
    sectionHeader('2. Reader Avatar'),
    field('Name', reader.avatarName),
    field('Demographics / Situation', reader.demographics),
    field('Already Tried', reader.alreadyTried),
    field('Biggest Fear', reader.biggestFear),
    field('Deepest Wish', reader.deepestWish),
    sectionHeader('3. Reader Transformation'),
    field('Before', transform.beforeState),
    field('After', transform.afterState),
    field('Transformation', transform.transformationSentence),
    sectionHeader('4. The One Big Idea'),
    field('Big Idea', idea.bigIdea),
    field('In one sentence', idea.ideaSentence),
    field('Different from comp', idea.whyDifferent),
    sectionHeader('5. Author Angle & Authority'),
    field('Credibility', author.credibilitySource),
    field('Unique Access', author.uniqueAccess),
    field('Personal Stake', author.personalStake),
    author.potentialWeakness ? field('Potential Weakness', author.potentialWeakness) : '',
    sectionHeader('6. Core Promise & Subtitle'),
    field('Core Promise', promise.corePromise),
    field('Working Subtitle', promise.subtitleDraft),
    promise.subtitleAlt ? field('Alt Subtitle', promise.subtitleAlt) : '',
    sectionHeader('7. Comparable Titles'),
    comps.comps ? formatComps(comps.comps) : '*No comps logged.*',
    ``,
    field('Market Gap', comps.marketGap),
    sectionHeader('8. Voice & Tone'),
    field('Register', voice.voiceRegister),
    field('Tone', voice.toneDescriptors),
    voice.voiceExample ? field('Voice Like', voice.voiceExample) : '',
    voice.voiceNotThis ? field('Not Like', voice.voiceNotThis) : '',
    sectionHeader('9. Evidence Philosophy'),
    field('Evidence Types', evidence.evidenceTypes),
    evidence.primaryResearch ? field('Primary Research', evidence.primaryResearch) : '',
    field('Sourcing Rigor', evidence.sourcingRigor),
    evidence.evidenceWeakness ? field('Weakest Point', evidence.evidenceWeakness) : '',
    sectionHeader('10. Commercial Model'),
    field('Primary Goal', commercial.bookPrimaryGoal),
    commercial.beyondBook ? field('Beyond Book', commercial.beyondBook) : '',
    commercial.targetAudience ? field('Distribution', commercial.targetAudience) : '',
    field('Success in 12 Months', commercial.successIn12Months),
    sectionHeader('11. Working Title'),
    field('Title', title.workingTitle),
    field('Job Check', title.titleDoesJob),
    title.altTitles ? field('Alternatives', title.altTitles) : '',
    title.titleRisk ? field('Title Risk', title.titleRisk) : '',
    sectionHeader('12. Consolidation'),
    field('Elevator Pitch', consolidate.elevatorPitch),
    field('Pipeline Confirmed', PIPELINE_LABELS[pipeline] || pipeline),
    field('Biggest Risk', consolidate.biggestRisk),
    consolidate.oneThingToFix ? field('One Thing to Fix', consolidate.oneThingToFix) : '',
    ``,
    `---`,
    ``,
    `*This document is the authoritative Book DNA brief. Every pipeline stage references it.*`,
  ].filter(l => l !== undefined && l !== null).join('\n');

  // ── JSON (machine-readable for downstream pipeline stages) ────
  const json = {
    schemaVersion: 1,
    generatedAt: updatedAt,
    bookTitle,
    pipeline,
    pipelineLabel: PIPELINE_LABELS[pipeline] || pipeline,
    category: {
      primary: category.primaryCategory,
      sub: category.amazonSubcategory,
      shelf: category.shelfDescription,
      primaryComp: category.competitorTitle,
    },
    reader: {
      name: reader.avatarName,
      demographics: reader.demographics,
      alreadyTried: reader.alreadyTried,
      biggestFear: reader.biggestFear,
      deepestWish: reader.deepestWish,
    },
    transformation: {
      before: transform.beforeState,
      after: transform.afterState,
      sentence: transform.transformationSentence,
    },
    bigIdea: {
      idea: idea.bigIdea,
      sentence: idea.ideaSentence,
      differentiatedFrom: idea.whyDifferent,
    },
    author: {
      credibility: author.credibilitySource,
      uniqueAccess: author.uniqueAccess,
      personalStake: author.personalStake,
      potentialWeakness: author.potentialWeakness,
    },
    promise: {
      core: promise.corePromise,
      subtitle: promise.subtitleDraft,
      altSubtitle: promise.subtitleAlt,
    },
    comps: comps.comps || [],
    marketGap: comps.marketGap,
    voice: {
      register: voice.voiceRegister,
      tone: voice.toneDescriptors,
      like: voice.voiceExample,
      notLike: voice.voiceNotThis,
    },
    evidence: {
      types: evidence.evidenceTypes,
      primaryResearch: evidence.primaryResearch,
      rigor: evidence.sourcingRigor,
      weakness: evidence.evidenceWeakness,
    },
    commercial: {
      goal: commercial.bookPrimaryGoal,
      beyondBook: commercial.beyondBook,
      distribution: commercial.targetAudience,
      successIn12Months: commercial.successIn12Months,
    },
    title: {
      working: title.workingTitle,
      jobCheck: title.titleDoesJob,
      alternatives: title.altTitles,
      risk: title.titleRisk,
    },
    consolidation: {
      elevatorPitch: consolidate.elevatorPitch,
      biggestRisk: consolidate.biggestRisk,
      oneThingToFix: consolidate.oneThingToFix,
    },
  };

  const storyDir = resolve(projectDir, '.storyline');
  await mkdir(storyDir, { recursive: true });

  const mdPath = resolve(storyDir, 'book-dna.md');
  const jsonPath = resolve(storyDir, 'book-dna.json');

  await Promise.all([
    writeFile(mdPath, md, 'utf-8'),
    writeFile(jsonPath, JSON.stringify(json, null, 2), 'utf-8'),
  ]);

  return { mdPath, jsonPath, pipeline, bookTitle };
}
