// Plan-vs-draft comparison — how does the book I'm actually writing
// differ from the book I planned?
//
// This is the linchpin of genuine long-term memory during drafting.
// The plan (stages 1-14) is the canonical intent. The manuscript is
// the emerging reality. They will drift — that's fine, that's writing.
// But the writer needs to know WHEN they drift so they can either
// (a) update the plan to match the draft's new direction, or
// (b) steer the draft back toward the plan.
//
// `storyline manuscript compare` produces a structured diff report surfacing
// specific drift points the writer can act on. It does NOT auto-
// update the plan — that's an intentional editorial decision.

import { snapshotManuscript } from './snapshot.js';

function chapterFromPlan(state, number) {
  return (state?.chapterOutline || []).find(ch => ch.chapterNumber === number);
}

function extractPlanPovs(state, chapterNumber) {
  const ch = chapterFromPlan(state, chapterNumber);
  if (!ch || !ch.scenes) return [];
  return [...new Set(ch.scenes.map(s => s.pov).filter(Boolean))];
}

// Project a plan-side chapter down to the same shape as a draft-side
// chapter so the diff below is line-for-line symmetrical.
function planChapterShape(state, number) {
  const ch = chapterFromPlan(state, number);
  if (!ch) return null;
  return {
    number,
    title: ch.chapterTitle || null,
    plannedWords: typeof ch.estimatedWords === 'number' ? ch.estimatedWords : null,
    plannedScenes: (ch.scenes || []).length,
    plannedPovs: extractPlanPovs(state, number),
    beat: ch.beat || null,
  };
}

// Ratio-based "drift" threshold for word count / scene count: by
// default, a chapter whose actual word count deviates ≥35% from plan
// gets flagged. Scene count drift triggers at any delta ≥ 1 scene.
const WORD_COUNT_DRIFT_THRESHOLD = 0.35;

export async function compareManuscriptToPlan(state, projectPath = process.cwd(), options = {}) {
  const snapshot = options.snapshot || await snapshotManuscript(projectPath, {
    manuscriptPath: state?.writing?.manuscriptPath || 'manuscript',
  });

  const findings = [];
  const plannedCount = (state?.chapterOutline || []).length;
  const draftedCount = snapshot.chapterCount;

  // ── Chapter-count drift ─────────────────────────────────────
  if (plannedCount > 0 && draftedCount !== plannedCount) {
    findings.push({
      type: 'chapter-count-mismatch',
      severity: draftedCount > plannedCount ? 'info' : 'warning',
      plannedCount,
      draftedCount,
      message: draftedCount > plannedCount
        ? `Draft has ${draftedCount} chapters vs ${plannedCount} planned — you may be expanding beyond the outline.`
        : `Draft has ${draftedCount} of ${plannedCount} planned chapters — ${plannedCount - draftedCount} still to draft.`,
    });
  }

  // ── Word count vs target ────────────────────────────────────
  const target = state?.genre?.targetWordCount;
  if (typeof target === 'number' && target > 0 && snapshot.totalWords > 0) {
    const pct = snapshot.totalWords / target;
    const progressInfo = {
      type: 'progress',
      severity: 'info',
      totalWords: snapshot.totalWords,
      targetWords: target,
      percent: Math.round(pct * 100),
      message: `${snapshot.totalWords.toLocaleString()} / ${target.toLocaleString()} words (${Math.round(pct * 100)}%).`,
    };
    findings.push(progressInfo);
    if (pct > 1.2) {
      findings.push({
        type: 'target-exceeded',
        severity: 'warning',
        message: `Draft is ${Math.round((pct - 1) * 100)}% above target. Consider whether this is expansion or bloat.`,
      });
    }
  }

  // ── Per-chapter drift ───────────────────────────────────────
  for (const draft of snapshot.chapters) {
    const plan = planChapterShape(state, draft.number);
    if (!plan) {
      findings.push({
        type: 'unplanned-chapter',
        severity: 'warning',
        chapterNumber: draft.number,
        filename: draft.filename,
        message: `Chapter ${draft.number} (${draft.filename}) exists in manuscript but not in the chapter outline.`,
        fix: `Either add it to the plan (storyline save chapterOutline) or remove/merge the draft chapter.`,
      });
      continue;
    }

    // Word count drift vs plan estimate
    if (plan.plannedWords && draft.wordCount > 0) {
      const delta = Math.abs(draft.wordCount - plan.plannedWords) / plan.plannedWords;
      if (delta >= WORD_COUNT_DRIFT_THRESHOLD) {
        findings.push({
          type: 'chapter-word-drift',
          severity: 'info',
          chapterNumber: draft.number,
          plannedWords: plan.plannedWords,
          draftedWords: draft.wordCount,
          deltaPercent: Math.round(delta * 100 * Math.sign(draft.wordCount - plan.plannedWords)),
          message: `Ch ${draft.number}: drafted ${draft.wordCount.toLocaleString()} words vs planned ${plan.plannedWords.toLocaleString()} (${draft.wordCount > plan.plannedWords ? '+' : ''}${Math.round(delta * 100 * Math.sign(draft.wordCount - plan.plannedWords))}%).`,
        });
      }
    }

    // Scene count drift
    if (plan.plannedScenes > 0 && draft.sceneCount !== plan.plannedScenes) {
      findings.push({
        type: 'chapter-scene-drift',
        severity: 'warning',
        chapterNumber: draft.number,
        plannedScenes: plan.plannedScenes,
        draftedScenes: draft.sceneCount,
        message: `Ch ${draft.number}: drafted ${draft.sceneCount} scene${draft.sceneCount === 1 ? '' : 's'} vs planned ${plan.plannedScenes}.`,
        fix: `Either update the plan's scene breakdown (storyline save chapterOutline) or adjust the draft's scene structure.`,
      });
    }

    // POV drift — if the plan specifies POV(s) and the draft uses a
    // different one
    if (plan.plannedPovs.length > 0 && draft.pov) {
      const plannedLower = plan.plannedPovs.map(p => String(p).toLowerCase());
      const draftLower = draft.pov.toLowerCase();
      // Plan POV is usually a character name; draft POV is 'first-
      // person' / 'third-person' category. We can only meaningfully
      // compare when the plan labels first/third itself.
      const planLabelsStance = plannedLower.some(p => /first|third|close|omniscient/.test(p));
      if (planLabelsStance && !plannedLower.some(p => p.includes(draftLower.replace('-person', '')))) {
        findings.push({
          type: 'chapter-pov-drift',
          severity: 'warning',
          chapterNumber: draft.number,
          plannedPov: plan.plannedPovs.join(', '),
          draftedPov: draft.pov,
          message: `Ch ${draft.number}: draft reads as ${draft.pov}, plan specified ${plan.plannedPovs.join(', ')}.`,
        });
      }
    }
  }

  return {
    drift: findings.some(f => f.type !== 'progress'),
    summary: {
      plannedChapters: plannedCount,
      draftedChapters: draftedCount,
      totalWords: snapshot.totalWords,
      targetWords: target || null,
    },
    findings,
  };
}

// Human-readable formatter.
export function formatCompareReport(report) {
  const lines = [];
  const { summary, findings } = report;
  lines.push(`Plan: ${summary.plannedChapters} chapter${summary.plannedChapters === 1 ? '' : 's'} outlined`);
  lines.push(`Draft: ${summary.draftedChapters} chapter${summary.draftedChapters === 1 ? '' : 's'}, ${summary.totalWords.toLocaleString()} words` + (summary.targetWords ? ` (target ${summary.targetWords.toLocaleString()})` : ''));
  lines.push('');
  if (findings.length === 0) {
    lines.push('No plan-vs-draft drift detected.');
    return lines.join('\n');
  }
  const byType = { warning: [], info: [] };
  for (const f of findings) {
    (byType[f.severity] || byType.info).push(f);
  }
  if (byType.warning.length) {
    lines.push(`${byType.warning.length} warning${byType.warning.length === 1 ? '' : 's'}:`);
    for (const f of byType.warning) {
      lines.push(`  ⚠ ${f.message}`);
      if (f.fix) lines.push(`    fix: ${f.fix}`);
    }
    lines.push('');
  }
  if (byType.info.length) {
    lines.push(`${byType.info.length} note${byType.info.length === 1 ? '' : 's'}:`);
    for (const f of byType.info) lines.push(`  · ${f.message}`);
  }
  return lines.join('\n');
}
