// Pipeline C master document generator
// Produces output/nf-pipeline-c-master.md — the full how-to book plan.
// Referenced by `storyline nf generate` when state.pipeline === 'C'.

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

function formatSubSkills(subSkills) {
  if (!Array.isArray(subSkills) || subSkills.length === 0) return '*No sub-skills defined.*\n';
  return subSkills.map((s, i) => {
    const lines = [`**${i + 1}. ${s.name || s.id || ''}** \`${s.id || ''}\``];
    if (s.description)         lines.push(`   ${s.description}`);
    if (s.chapterAssignment)   lines.push(`   Chapter: ${s.chapterAssignment}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function formatLessons(lessons) {
  if (!Array.isArray(lessons) || lessons.length === 0) return '*No lessons defined.*\n';
  return lessons.map((l, i) => {
    const lines = [`**Lesson ${i + 1}: ${l.lessonTitle || l.skillId || ''}**`];
    if (l.skillId)            lines.push(`   Sub-skill: ${l.skillId}`);
    if (l.learningObjective)  lines.push(`   Objective: ${l.learningObjective}`);
    if (l.exampleType)        lines.push(`   Example: ${l.exampleType}`);
    if (l.drillType)          lines.push(`   Drill: ${l.drillType}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function formatDrills(drills) {
  if (!Array.isArray(drills) || drills.length === 0) return '*No drills defined.*\n';
  return drills.map((d, i) => {
    const lines = [`**Drill ${i + 1}: ${d.drillTitle || d.skillId || ''}** *(${d.difficulty || 'beginner'})*`];
    if (d.setup)           lines.push(`   Setup: ${d.setup}`);
    if (d.task)            lines.push(`   Task: ${d.task}`);
    if (d.expectedOutcome) lines.push(`   Success: ${d.expectedOutcome}`);
    if (d.commonMistake)   lines.push(`   Common mistake: ${d.commonMistake}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function formatMilestones(milestones) {
  if (!Array.isArray(milestones) || milestones.length === 0) return '*No milestones defined.*\n';
  return milestones.map((m, i) => {
    const lines = [`**Milestone ${i + 1}: ${m.milestoneTitle || ''}**`];
    if (m.afterLesson)        lines.push(`   After: ${m.afterLesson}`);
    if (m.subSkillsCovered)   lines.push(`   Skills assessed: ${m.subSkillsCovered}`);
    if (m.task)               lines.push(`   Task: ${m.task}`);
    if (m.passCriteria)       lines.push(`   Pass criteria: ${m.passCriteria}`);
    if (m.failureGuidance)    lines.push(`   If you fail: ${m.failureGuidance}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function formatExamples(examples) {
  if (!Array.isArray(examples) || examples.length === 0) return '*No worked examples defined.*\n';
  return examples.map((e, i) => {
    const lines = [`**Example ${i + 1}: ${e.exampleTitle || ''}** *(${e.skillId || ''})*`];
    if (e.scenario)         lines.push(`   Scenario: ${e.scenario}`);
    if (e.demonstrates)     lines.push(`   Demonstrates: ${e.demonstrates}`);
    if (e.antiPatternNote)  lines.push(`   Anti-pattern: ${e.antiPatternNote}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

export async function generatePipelineCMaster(state, projectDir = process.cwd()) {
  const nf = state.nfStages || {};

  const skill       = nf['pc-skill']       || {};
  const startLevel  = nf['pc-start-level'] || {};
  const endState    = nf['pc-end-state']   || {};
  const decompose   = nf['pc-decompose']   || {};
  const prereqs     = nf['pc-prereqs']     || {};
  const lessons     = nf['pc-lessons']     || {};
  const drills      = nf['pc-drills']      || {};
  const milestones  = nf['pc-milestones']  || {};
  const examples    = nf['pc-examples']    || {};
  const critique    = nf['pc-critique']    || {};

  const dnaTitle    = nf['dna-title']      || {};
  const dnaReader   = nf['dna-reader']     || {};

  const bookTitle   = dnaTitle.workingTitle || 'Untitled';
  const updatedAt   = new Date().toISOString();

  const md = [
    `# ${bookTitle} — Pipeline C Master Plan`,
    ``,
    `*Generated: ${updatedAt}*`,
    `*Pipeline: How-To / Skill Ladder*`,
    ``,
    `---`,
    ``,
    h2('Executive Summary'),
    field('Working title', bookTitle),
    field('Reader', dnaReader.avatarName ? `${dnaReader.avatarName} — ${dnaReader.demographics}` : null),
    field('Target skill', skill.targetSkill),
    field('Starting level', startLevel.startingLevel),
    field('Measurable outcome', endState.measurableOutcome),
    field('Most foundational sub-skill', decompose.coreSubSkill),
    ``,
    h2('Part 1 — The Skill'),
    h3('Stage 1: Target Skill'),
    field('Target skill', skill.targetSkill),
    field('Competency definition', skill.competencyDefinition),
    field('Why a full book', skill.whyThisSkill),
    skill.skillCategory ? field('Skill category', skill.skillCategory) : '',
    h3('Stage 2: Reader Starting Level'),
    field('Starting level', startLevel.startingLevel),
    field('Assumed knowledge', startLevel.assumedKnowledge),
    startLevel.entryBarrier ? field('Entry barrier', startLevel.entryBarrier) : '',
    startLevel.commonMisconceptions ? field('Common misconceptions', startLevel.commonMisconceptions) : '',
    h3('Stage 3: End-State Competency'),
    field('End state', endState.endStateDescription),
    field('Measurable outcome', endState.measurableOutcome),
    endState.timeToCompetency ? field('Time to competency', endState.timeToCompetency) : '',
    endState.expertCeiling ? field('Expert ceiling', endState.expertCeiling) : '',
    h2('Part 2 — The Skill Tree'),
    h3('Stage 4: Skill Decomposition'),
    field('Most foundational', decompose.coreSubSkill),
    decompose.hardestSubSkill ? field('Hardest sub-skill', decompose.hardestSubSkill) : '',
    formatSubSkills(decompose.subSkills),
    h3('Stage 5: Prerequisite Graph'),
    field('Root skills (entry points)', prereqs.rootSkills),
    prereqs.learningOrder ? field('Learning order', prereqs.learningOrder) : '',
    `*Run \`npx storyline-vsc nf skill-tree\` to view and validate the full graph.*\n`,
    h2('Part 3 — Teaching Plan'),
    h3('Stage 6: Lesson Plan'),
    formatLessons(lessons.lessons),
    lessons.lessonPacing ? field('Lesson pacing', lessons.lessonPacing) : '',
    lessons.longestLesson ? field('Most demanding lesson', lessons.longestLesson) : '',
    h3('Stage 7: Drill Catalogue'),
    formatDrills(drills.drills),
    drills.drillProgression ? field('Drill progression', drills.drillProgression) : '',
    h3('Stage 8: Milestone Map'),
    formatMilestones(milestones.milestones),
    field('Final assessment', milestones.finalAssessment),
    h2('Part 4 — Examples & Anti-Patterns'),
    h3('Stage 9: Worked Examples'),
    formatExamples(examples.workedExamples),
    examples.canonicalAntiPatterns ? field('Canonical anti-patterns', examples.canonicalAntiPatterns) : '',
    h2('Part 5 — Structural Critique'),
    field('Skill tree gaps', critique.skillTreeGapCheck),
    field('Drill specificity', critique.drillSpecificityCheck),
    field('Milestone rigor', critique.milestoneRigorCheck),
    field('End-state delivery', critique.endStateDeliveryCheck),
    field('Biggest remaining risk', critique.critiqueSummary),
    ``,
    `---`,
    ``,
    `*This document is the authoritative Pipeline C plan. Draft from this — do not replan.*`,
  ].filter(l => l !== undefined && l !== null).join('\n');

  const outputDir = resolve(projectDir, 'planning');
  await mkdir(outputDir, { recursive: true });

  const slug = bookTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  const mdPath = resolve(outputDir, `${slug}-pipeline-c-master.md`);
  await writeFile(mdPath, md, 'utf-8');

  return { mdPath, bookTitle, pipeline: 'C' };
}
