// Pipeline B master document generator
// Produces output/nf-pipeline-b-master.md — the full narrative non-fiction book plan.
// Referenced by `storyline nf generate` when state.pipeline === 'B'.

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

function formatCast(cast) {
  if (!Array.isArray(cast) || cast.length === 0) return '*No cast defined.*\n';
  return cast.map(c => {
    const lines = [`**${c.name || '(unnamed)'}** — ${c.role || ''}`];
    if (c.whyTheyMatter) lines.push(`   Why they matter: ${c.whyTheyMatter}`);
    if (c.primarySource)  lines.push(`   Primary source: ${c.primarySource}`);
    if (c.sourcingGap)    lines.push(`   Sourcing gap: ${c.sourcingGap}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function formatTimelineEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return '*No timeline events.*\n';
  const rows = events.map(e =>
    `| ${e.date || ''} | ${e.event || ''} | ${e.castInvolved || ''} | ${e.significance || ''} |`,
  );
  return [
    '| Date | Event | Cast | Significance |',
    '|------|-------|------|--------------|',
    ...rows,
    '',
  ].join('\n');
}

function formatScenes(scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) return '*No scenes defined.*\n';
  return scenes.map((s, i) => {
    const lines = [`**${i + 1}. ${s.sceneTitle || ''}**`];
    if (s.what)    lines.push(`   What: ${s.what}`);
    if (s.who)     lines.push(`   Who: ${s.who}`);
    if (s.proves)  lines.push(`   Proves: ${s.proves}`);
    if (s.source)  lines.push(`   Source: ${s.source}`);
    if (s.chapter) lines.push(`   Chapter: ${s.chapter}`);
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

function formatChapters(chapters, subMode) {
  if (!Array.isArray(chapters) || chapters.length === 0) return '*No chapter outline defined.*\n';
  return chapters.map(c => {
    const lines = [`**Chapter ${c.number}: ${c.title || ''}**`];
    if (c.chapterQuestion)  lines.push(`   Question: ${c.chapterQuestion}`);
    if (c.content)          lines.push(`   Content: ${c.content}`);
    if (c.anchorScene)      lines.push(`   Anchor scene: ${c.anchorScene}`);
    if (c.sourcingNote)     lines.push(`   Sourcing: ${c.sourcingNote}`);
    if (c.role) {
      const roleLabel = subMode === 'idea-led' ? 'Argument step' : 'Period/sequence';
      lines.push(`   ${roleLabel}: ${c.role}`);
    }
    return lines.join('\n');
  }).join('\n\n') + '\n';
}

export async function generatePipelineBMaster(state, projectDir = process.cwd()) {
  const nf = state.nfStages || {};

  const thesis    = nf['pb-thesis']   || {};
  const cast      = nf['pb-cast']     || {};
  const timeline  = nf['pb-timeline'] || {};
  const fork      = nf['pb-fork']     || {};
  const scenes    = nf['pb-scenes']   || {};
  const sourcing  = nf['pb-sourcing'] || {};
  const theme     = nf['pb-theme']    || {};
  const chapters  = nf['pb-chapters'] || {};
  const critique  = nf['pb-critique'] || {};

  const dnaTitle  = nf['dna-title']   || {};
  const dnaReader = nf['dna-reader']  || {};

  const bookTitle = dnaTitle.workingTitle || 'Untitled';
  const subMode   = fork.subMode || state.subMode || 'event-led';
  const updatedAt = new Date().toISOString();

  const structureLabel = subMode === 'idea-led' ? 'Idea-Led (Gladwell)' : 'Event-Led (Larson)';

  const md = [
    `# ${bookTitle} — Pipeline B Master Plan`,
    ``,
    `*Generated: ${updatedAt}*`,
    `*Structure: ${structureLabel}*`,
    ``,
    `---`,
    ``,
    h2('Executive Summary'),
    field('Working title', bookTitle),
    field('Reader', dnaReader.avatarName ? `${dnaReader.avatarName} — ${dnaReader.demographics}` : null),
    field('Central question', thesis.centralQuestion),
    field('Thesis', thesis.thesis),
    field('Reader takeaway', thesis.readerTakeaway),
    field('Structure', structureLabel),
    field('Timeline span', timeline.timelineSpan),
    field('Primary subject', cast.primarySubject),
    ``,
    h2('Part 1 — The Question & Thesis'),
    h3('Stage 1: Central Question / Thesis'),
    field('Central question', thesis.centralQuestion),
    field('Thesis', thesis.thesis),
    field('Reader takeaway', thesis.readerTakeaway),
    thesis.narrativeMode ? field('Initial narrative mode', thesis.narrativeMode) : '',
    h2('Part 2 — The World'),
    h3('Stage 2: Cast of Real People'),
    field('Primary subject', cast.primarySubject),
    formatCast(cast.cast),
    cast.castChallenge ? field('Access challenge', cast.castChallenge) : '',
    h3('Stage 3: Timeline'),
    field('Span', timeline.timelineSpan),
    field('Pivot moment', timeline.pivotMoment),
    formatTimelineEvents(timeline.timelineEvents),
    h2('Part 3 — Structure'),
    h3('Stage 4: Structural Fork'),
    field('Structure', structureLabel),
    field('Rationale', fork.forkRationale),
    fork.structureChallenge ? field('Structural challenge', fork.structureChallenge) : '',
    h3('Stage 5: Scene List'),
    formatScenes(scenes.scenes),
    field('Scene gaps', scenes.missingScenes),
    h2('Part 4 — Sourcing & Theme'),
    h3('Stage 6: Sourcing Register'),
    field('Strategy', sourcing.sourcingStrategy),
    sourcing.primaryArchives ? field('Primary archives', sourcing.primaryArchives) : '',
    field('Sourcing gaps', sourcing.sourcingGaps),
    sourcing.factsAtRisk ? field('Facts at risk', sourcing.factsAtRisk) : '',
    h3('Stage 7: Thematic Through-Line'),
    field('Primary theme', theme.primaryTheme),
    field('Emotional arc', theme.emotionalArc),
    field('Theme in closing', theme.themeInClosingChapter),
    theme.secondaryThemes ? field('Secondary themes', theme.secondaryThemes) : '',
    h2('Part 5 — Book Architecture'),
    h3(`Stage 8: Chapter Outline (${structureLabel})`),
    formatChapters(chapters.chapters, subMode),
    field('Momentum note', chapters.momentumNote),
    h2('Part 6 — Structural Critique'),
    field('Sourcing coverage', critique.sourcingCoverageCheck),
    field('Momentum', critique.momentumCheck),
    field('Theme delivery', critique.themeDeliveryCheck),
    field('Central question answered', critique.centralQuestionAnsweredCheck),
    field('Biggest remaining risk', critique.critiqueSummary),
    ``,
    `---`,
    ``,
    `*This document is the authoritative Pipeline B plan. Draft from this — do not replan.*`,
  ].filter(l => l !== undefined && l !== null).join('\n');

  const outputDir = resolve(projectDir, 'output');
  await mkdir(outputDir, { recursive: true });

  const slug = bookTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  const mdPath = resolve(outputDir, `${slug}-pipeline-b-master.md`);
  await writeFile(mdPath, md, 'utf-8');

  return { mdPath, bookTitle, subMode, pipeline: 'B' };
}
