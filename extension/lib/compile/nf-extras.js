// NF compile extras orchestrator — generates non-fiction-specific compile artifacts.
// Runs after the main EPUB/PDF pipeline; skips cleanly when data is absent.
// Fiction projects (state.mode !== 'nonfiction') are fully untouched.

import { generateBibliography, generateAllEndnotes, generateFactCheckReport } from '../research/compile.js';
import { generateSkillTreeSvg } from './skill-tree-svg.js';
import { generateTimelineSvg } from './timeline-svg.js';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// ── Inline generators (no extra files) ──────────────────────────────────────

export function buildObjectionIndex(state) {
  const avatarData = state.nfStages?.['dna-avatar'] || {};
  const objections = avatarData.objections || [];
  if (objections.length === 0) return null;

  const chapterData = state.nfStages?.['pa-chapters'] || state.nfStages?.['dna-chapters'] || {};
  const chapterMap = chapterData.objectionChapterMap || {};

  const lines = ['# Reader Objection Index\n'];
  objections.forEach((obj, i) => {
    const text = typeof obj === 'string' ? obj : obj.objection || obj.text || String(obj);
    const chRef = chapterMap[text] || chapterMap[i] || null;
    lines.push(`${i + 1}. **${text}**`);
    if (chRef) lines.push(`   *Addressed in Chapter ${chRef}*`);
  });

  return lines.join('\n');
}

export function buildReaderTransformSummary(state) {
  const transformData = state.nfStages?.['dna-transform'] || {};
  const before = transformData.beforeState || transformData.currentReality || '';
  const after = transformData.afterState || transformData.promisedOutcome || '';

  if (!before && !after) return null;

  const parts = ['## Reader Transformation Promise\n'];
  if (before) parts.push(`**Before:** ${before}`);
  if (after) parts.push(`**After:** ${after}`);
  return parts.join('\n\n');
}

function extractChapterNumbers(state) {
  const dnaChapters = state.nfStages?.['dna-chapters']?.chapters || [];
  const paChapters = state.nfStages?.['pa-chapters']?.chapters || [];
  const outline = state.chapterOutline || [];

  const source = dnaChapters.length > 0 ? dnaChapters
    : paChapters.length > 0 ? paChapters
    : outline;

  return source
    .map(ch => ch.chapterNumber ?? ch.number ?? ch)
    .filter(n => typeof n === 'number' || (typeof n === 'string' && n !== ''));
}

// ── Main orchestrator ────────────────────────────────────────────────────────

export async function runNfExtras(state, projectDir, {
  citationStyle = 'chicago',
  includeFactCheck = true,
  includeObjectionIndex = true,
} = {}) {
  if (!state || state.mode !== 'nonfiction') {
    return { skipped: true, reason: 'not-nonfiction' };
  }

  const outputDir = path.join(projectDir, 'output');
  await mkdir(outputDir, { recursive: true });

  const results = { pipeline: state.pipeline, artifacts: [] };

  // ── Bibliography (all pipelines) ──────────────────────────────────────────
  try {
    const bib = await generateBibliography(projectDir, { citationStyle });
    results.bibliography = bib;
    results.artifacts.push(bib.bibPath);
  } catch {
    results.bibliography = { skipped: true, reason: 'no-research-items' };
  }

  // ── Endnotes per chapter (all pipelines) ──────────────────────────────────
  const chapterNumbers = extractChapterNumbers(state);
  if (chapterNumbers.length > 0) {
    try {
      const en = await generateAllEndnotes(projectDir, chapterNumbers, { citationStyle });
      if (en) {
        results.endnotes = en;
        results.artifacts.push(en.endnotePath);
      }
    } catch {
      results.endnotes = { skipped: true, reason: 'endnote-error' };
    }
  }

  // ── Fact-check report (all pipelines) ─────────────────────────────────────
  if (includeFactCheck) {
    try {
      const fc = await generateFactCheckReport(projectDir);
      results.factCheck = fc;
      results.artifacts.push(fc.reportPath);
    } catch {
      results.factCheck = { skipped: true, reason: 'no-research-items' };
    }
  }

  // ── Pipeline B: Timeline visual ───────────────────────────────────────────
  if (state.pipeline === 'B') {
    const tl = await generateTimelineSvg(projectDir);
    results.timelineSvg = tl;
    if (!tl.skipped) results.artifacts.push(tl.svgPath);
  }

  // ── Pipeline C: Skill tree visual ─────────────────────────────────────────
  if (state.pipeline === 'C') {
    const st = await generateSkillTreeSvg(projectDir);
    results.skillTreeSvg = st;
    if (!st.skipped) results.artifacts.push(st.svgPath);
  }

  // ── Pipeline A: Objection index ───────────────────────────────────────────
  if (state.pipeline === 'A' && includeObjectionIndex) {
    const objMd = buildObjectionIndex(state);
    if (objMd) {
      const objPath = path.join(outputDir, 'objection-index.md');
      await writeFile(objPath, objMd, 'utf-8');
      results.objectionIndex = { objPath };
      results.artifacts.push(objPath);
    }
  }

  // ── Reader transformation summary (all pipelines) ─────────────────────────
  const transformMd = buildReaderTransformSummary(state);
  if (transformMd) {
    const transformPath = path.join(outputDir, 'reader-transformation.md');
    await writeFile(transformPath, transformMd, 'utf-8');
    results.readerTransform = { transformPath };
    results.artifacts.push(transformPath);
  }

  // ── Pipeline A: Framework Card cross-reference ────────────────────────────
  if (state.pipeline === 'A') {
    const { hasFramework } = await import('./framework-card/index.js');
    if (hasFramework(state)) {
      results.frameworkCard = {
        referenced: true,
        note: 'Framework card (output/framework-card.pdf) is a companion asset — include with book delivery.',
      };
    }
  }

  return results;
}
