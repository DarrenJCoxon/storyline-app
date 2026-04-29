// Pipeline A master document generator
// Produces output/nf-pipeline-a-master.md — the full prescriptive book plan.
// Referenced by `storyline nf generate` when state.pipeline === 'A'.

import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';

function field(label, value) {
  if (!value) return '';
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    return `**${label}:**\n${value.map((v, i) => `${i + 1}. ${typeof v === 'object' ? formatObject(v) : v}`).join('\n')}\n`;
  }
  return `**${label}:** ${value}\n`;
}

function formatObject(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ');
}

function h2(t) { return `\n## ${t}\n`; }
function h3(t) { return `\n### ${t}\n`; }

function formatPrinciples(principles) {
  if (!Array.isArray(principles) || principles.length === 0) return '*No principles defined.*\n';
  return principles.map(p => {
    const lines = [`**${p.number}. ${p.name || p.definition || ''}**`];
    if (p.definition) lines.push(`   ${p.definition}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function formatPrincipleDetails(details) {
  if (!Array.isArray(details) || details.length === 0) return '*No principle details defined.*\n';
  return details.map(p => {
    const lines = [`${h3(`Principle ${p.number}: ${p.name || ''}`)}`];
    if (p.deepDefinition) lines.push(`**Definition:** ${p.deepDefinition}\n`);
    if (p.mechanism)      lines.push(`**Mechanism:** ${p.mechanism}\n`);
    if (p.behaviourChange)lines.push(`**Behaviour change:** ${p.behaviourChange}\n`);
    if (p.commonMistake)  lines.push(`**Common mistake:** ${p.commonMistake}\n`);
    return lines.join('\n');
  }).join('\n');
}

function formatObjections(objections) {
  if (!Array.isArray(objections) || objections.length === 0) return '*No objections documented.*\n';
  return objections.map((o, i) => {
    const lines = [`**${i + 1}. "${o.objection || ''}"**`];
    if (o.source)            lines.push(`   *Why they hold it:* ${o.source}`);
    if (o.response)          lines.push(`   *Book's answer:* ${o.response}`);
    if (o.chapterOrPrinciple)lines.push(`   *Addressed in:* ${o.chapterOrPrinciple}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function formatApplications(apps) {
  if (!Array.isArray(apps) || apps.length === 0) return '*No applications defined.*\n';
  return apps.map(a => {
    const lines = [`**Principle ${a.number}** — ${a.primaryAction || ''}`];
    if (a.tool)              lines.push(`   Tool/exercise: ${a.tool}`);
    if (a.timeToFirstResult) lines.push(`   First result: ${a.timeToFirstResult}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function formatChapters(chapters) {
  if (!Array.isArray(chapters) || chapters.length === 0) return '*No chapter plan defined.*\n';
  return chapters.map(c => {
    const lines = [`**Chapter ${c.number}: ${c.title || ''}**`];
    if (c.linkedPrinciple) lines.push(`   Principle(s): ${c.linkedPrinciple}`);
    if (c.job)             lines.push(`   Job: ${c.job}`);
    if (c.readerArcStart)  lines.push(`   Reader starts: ${c.readerArcStart}`);
    if (c.readerArcEnd)    lines.push(`   Reader ends: ${c.readerArcEnd}`);
    if (c.keyEvidence)     lines.push(`   Key evidence: ${c.keyEvidence}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function formatBraidBeats(beats) {
  if (!Array.isArray(beats) || beats.length === 0) return '*No braid beats defined.*\n';
  return beats.map(b => {
    const lines = [`**${b.beat || ''}** *(${b.placement || ''})*`];
    if (b.storyContent)    lines.push(`   Story: ${b.storyContent}`);
    if (b.linkedPrinciple) lines.push(`   Illuminates: ${b.linkedPrinciple}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

export async function generatePipelineAMaster(state, projectDir = process.cwd()) {
  const dna = state.nfStages || {};
  const thesis      = dna['pa-thesis']      || {};
  const objections  = dna['pa-objections']  || {};
  const framework   = dna['pa-framework']   || {};
  const principles  = dna['pa-principles']  || {};
  const evidence    = dna['pa-evidence']    || {};
  const application = dna['pa-application'] || {};
  const braid       = dna['pa-braid']       || {};
  const chapters    = dna['pa-chapters']    || {};
  const opener      = dna['pa-opener']      || {};
  const critique    = dna['pa-critique']    || {};

  const dnaTitle    = dna['dna-title']      || {};
  const dnaReader   = dna['dna-reader']     || {};
  const dnaPromise  = dna['dna-promise']    || {};

  const bookTitle   = dnaTitle.workingTitle || 'Untitled';
  const subMode     = state.subMode || 'argument';
  const updatedAt   = new Date().toISOString();

  const md = [
    `# ${bookTitle} — Pipeline A Master Plan`,
    ``,
    `*Generated: ${updatedAt}*`,
    `*Structure: ${subMode === 'braid' ? 'Narrative Braid' : 'Argument-Led'}*`,
    ``,
    `---`,
    ``,
    h2('Executive Summary'),
    field('Working title', bookTitle),
    field('Subtitle', dnaPromise.subtitleDraft),
    field('Reader', dnaReader.avatarName ? `${dnaReader.avatarName} — ${dnaReader.demographics}` : null),
    field('Core promise', dnaPromise.corePromise),
    field('Thesis', thesis.thesisSentence),
    field('Framework', framework.modelName),
    field('Structure', subMode === 'braid' ? 'Narrative Braid' : 'Argument-Led'),
    field('Chapters', chapters.chapterCount),
    ``,
    h2('Part 1 — The Argument'),
    h3('Stage 1: Core Thesis'),
    field('Thesis', thesis.thesis),
    field('Before belief', thesis.thesisBefore),
    field('After belief + capability', thesis.thesisAfter),
    field('One-sentence thesis', thesis.thesisSentence),
    h3('Stage 2: Reader Objections'),
    formatObjections(objections.objections),
    objections.unansweredObjection ? field('Acknowledged limitation', objections.unansweredObjection) : '',
    h2('Part 2 — The Framework'),
    h3('Stage 3: Framework Design'),
    field('Model name', framework.modelName),
    field('Framework logic', framework.frameworkLogic),
    formatPrinciples(framework.principles),
    h3('Stage 4: Principles / Laws'),
    formatPrincipleDetails(principles.principleDetails),
    principles.principleInterplay ? field('Principle interplay', principles.principleInterplay) : '',
    h2('Part 3 — Evidence & Application'),
    h3('Stage 5: Evidence Map'),
    field('Strongest evidence', evidence.strongestEvidence),
    field('Thinnest evidence', evidence.thinnestEvidence),
    evidence.principleMap ? `**Evidence by principle:**\n\`\`\`json\n${JSON.stringify(evidence.principleMap, null, 2)}\n\`\`\`\n` : '',
    h3('Stage 6: Application Layer'),
    formatApplications(application.applicationByPrinciple),
    field('Implementation sequence', application.implementationSequence),
    field('Quick win (Day 1)', application.quickWin),
    subMode === 'braid' ? [
      h2('Part 4 — Narrative Braid'),
      field('Story', braid.braidStory),
      formatBraidBeats(braid.braidBeats),
      field('Resolution', braid.braidResolution),
    ].join('') : '',
    h2('Part 5 — Book Structure'),
    h3('Stage 8: Chapter Plan'),
    formatChapters(chapters.chapters),
    h3('Stage 9: Opener & Closer Design'),
    field('Opening scene', opener.openerScene),
    field('Hook', opener.openerHook),
    field('Closing vision', opener.closerVision),
    field('Final action', opener.closerAction),
    h2('Part 6 — Structural Critique'),
    field('Thesis drift check', critique.thesisDriftCheck),
    field('Framework coherence', critique.frameworkCoherenceCheck),
    field('Evidence coverage', critique.evidenceCoverageCheck),
    field('Objections answered', critique.objectionsAnsweredCheck),
    field('Biggest remaining risk', critique.critiqueSummary),
    ``,
    `---`,
    ``,
    `*This document is the authoritative Pipeline A plan. Draft from this — do not replan.*`,
  ].filter(l => l !== undefined && l !== null).join('\n');

  const outputDir = resolve(projectDir, 'planning');
  await mkdir(outputDir, { recursive: true });

  const slug = bookTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  const mdPath = resolve(outputDir, `${slug}-pipeline-a-master.md`);
  await writeFile(mdPath, md, 'utf-8');

  return { mdPath, bookTitle, subMode, pipeline: 'A' };
}
