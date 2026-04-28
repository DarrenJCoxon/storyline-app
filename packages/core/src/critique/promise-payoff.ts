// FIC-C.3 — Mode-agnostic promise-payoff detector.
//
// Fiction branch: detects promises from plot threads and scene contracts
// (populated by getWritingPlan). Results land in WritingPlan.promises[].
//
// NF branch: detects whether the book's core promise is delivered by its
// chapters/pipeline structure. Extracted from extension/lib/ai/critique-api.js
// so both modes share one implementation — critique-api.js now delegates here
// via a thin shim.
//
// Consumers: promise-payoff-ledger.ts (renderer), ChatPanel (critique card).

import type { WritingPlan, PromisePayoffItem } from '../state/writing-plan.js'

// ── Shared finding shape ─────────────────────────────────────────────────────
// Matches the { id, severity, category, source, location, message, suggestion }
// shape from extension/lib/ai/critique-api.js so the shim is a one-liner.

export interface NfCritiqueFinding {
  id: string
  severity: 'error' | 'warning' | 'tip'
  category: string
  source: string
  location: string
  message: string
  suggestion: string | null
}

function finding(
  id: string,
  severity: NfCritiqueFinding['severity'],
  category: string,
  source: string,
  location: string,
  message: string,
  suggestion: string | null = null,
): NfCritiqueFinding {
  return { id, severity, category, source, location, message, suggestion }
}

// ── NF promise-payoff detector ───────────────────────────────────────────────

/**
 * Extracted from extension/lib/ai/critique-api.js:checkPromisePayoff.
 * Detects whether the NF book's core promise is delivered by its chapters.
 * Returns the same finding shape as the original — byte-identical for the
 * same input (proven by tests/promise-payoff-detector.test.js).
 */
export function checkNfPromisePayoff(plan: WritingPlan): NfCritiqueFinding[] {
  const findings: NfCritiqueFinding[] = []
  if (!plan.nfPromise?.corePromise) return findings

  const { corePromise, subtitleDraft, endStateMeasurableOutcome } = plan.nfPromise
  const pipeline = plan.pipeline

  const promiseKeywords = corePromise.toLowerCase()
    .split(/\s+/).filter((w: string) => w.length > 5).slice(0, 6)

  // Pipeline A: promise must be delivered by at least one chapter
  if (pipeline === 'A') {
    if (plan.nfChapters.length > 0) {
      const chapterText = plan.nfChapters
        .map(c => `${c.mission ?? ''} ${c.title ?? ''}`)
        .join(' ').toLowerCase()
      const delivered = promiseKeywords.some((w: string) => chapterText.includes(w))
      if (!delivered) {
        findings.push(finding(
          'pa-promise-undelivered',
          'warning',
          'promise-payoff',
          'promise-payoff-audit',
          'dna-promise → pa-chapters',
          "The Core Promise doesn't map to any chapter title or job description. Readers who bought the promise will not find where it's kept.",
          `Core promise: "${corePromise.slice(0, 80)}". Map it explicitly to a chapter job.`,
        ))
      }
    }

    if (subtitleDraft) {
      const subtitleWords = subtitleDraft.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4).slice(0, 4)
      // Mirror original logic: check pa-thesis.thesis + pa-framework.modelName (byte-identical).
      const planText = `${plan.nfPromise!.paThesisText ?? ''} ${plan.nfPromise!.paFrameworkName ?? ''}`.toLowerCase()
      const delivered = subtitleWords.some((w: string) => planText.includes(w))
      if (!delivered && planText.length > 20) {
        findings.push(finding(
          'pa-subtitle-not-reflected',
          'tip',
          'promise-payoff',
          'promise-payoff-audit',
          'dna-promise → pa-thesis / pa-framework',
          `The subtitle ("${subtitleDraft.slice(0, 60)}") isn't reflected in the thesis or framework name. The subtitle is the most commercially read sentence — the plan must deliver it.`,
          'Align thesis and/or framework language with the subtitle promise.',
        ))
      }
    }
  }

  // Pipeline B: promise should be answered by the closing chapter
  if (pipeline === 'B') {
    if (plan.nfChapters.length > 0) {
      const lastChapter = plan.nfChapters[plan.nfChapters.length - 1]
      const closingText = `${lastChapter.chapterQuestion ?? ''} ${lastChapter.title ?? ''}`.toLowerCase()
      const delivered = promiseKeywords.some((w: string) => closingText.includes(w))
      if (closingText.length > 20 && !delivered) {
        findings.push(finding(
          'pb-closing-doesnt-deliver-promise',
          'warning',
          'promise-payoff',
          'promise-payoff-audit',
          'dna-promise → pb-chapters (closing)',
          "The Core Promise isn't reflected in the closing chapter. The final chapter must deliver what the promise implied.",
          `Core promise: "${corePromise.slice(0, 80)}".`,
        ))
      }
    }
  }

  // Pipeline C: promise must match end-state competency
  if (pipeline === 'C' && endStateMeasurableOutcome) {
    const outcomeWords = endStateMeasurableOutcome.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4).slice(0, 4)
    const delivered = promiseKeywords.some((w: string) => endStateMeasurableOutcome.toLowerCase().includes(w))
      || outcomeWords.some((w: string) => corePromise.toLowerCase().includes(w))
    if (!delivered) {
      findings.push(finding(
        'pc-promise-outcome-drift',
        'warning',
        'promise-payoff',
        'promise-payoff-audit',
        'dna-promise → pc-end-state',
        'The Core Promise and the End-State Competency (Stage 3) share no common language. The measurable outcome must be the concrete form of the promise.',
        `Promise: "${corePromise.slice(0, 60)}". Outcome: "${endStateMeasurableOutcome.slice(0, 60)}".`,
      ))
    }
  }

  return findings
}

// ── Fiction promise-gap finder ───────────────────────────────────────────────

export interface FictionPromiseGap {
  promise: PromisePayoffItem
  gapDescription: string
}

/**
 * Given the fiction promises already detected by getWritingPlan, identifies
 * which ones have gaps worth surfacing in the critique card:
 *   - Unresolved high-risk promises (no resolution plan at all)
 *   - Promises last touched many chapters ago with no planned payoff
 *   - Thread mentioned in scene contracts but never given a resolution plan
 */
export function findFictionPromiseGaps(plan: WritingPlan): FictionPromiseGap[] {
  const gaps: FictionPromiseGap[] = []

  for (const p of plan.promises) {
    if (p.status === 'paid-off') continue

    if (p.status === 'unresolved' && p.risk === 'high') {
      gaps.push({ promise: p, gapDescription: 'No planned payoff — this promise may go unfulfilled' })
      continue
    }

    // Thread set up in scene contracts but no resolution plan in the thread registry
    const thread = plan.plotThreads.find(t => t.id === p.id || t.name === p.description)
    if (thread && thread.lastTouchedChapter !== null && !thread.resolutionPlan && !thread.plannedResolutionScene) {
      const totalChapters = plan.fictionChapters.length
      const chaptersAgo = totalChapters > 0 ? totalChapters - thread.lastTouchedChapter : 0
      if (chaptersAgo >= 3) {
        gaps.push({
          promise: p,
          gapDescription: `Last touched chapter ${thread.lastTouchedChapter}, ${chaptersAgo} chapter${chaptersAgo !== 1 ? 's' : ''} ago — no resolution plan`,
        })
      }
    }
  }

  return gaps
}
