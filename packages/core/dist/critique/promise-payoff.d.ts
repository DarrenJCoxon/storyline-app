import type { WritingPlan, PromisePayoffItem } from '../state/writing-plan.js';
export interface NfCritiqueFinding {
    id: string;
    severity: 'error' | 'warning' | 'tip';
    category: string;
    source: string;
    location: string;
    message: string;
    suggestion: string | null;
}
/**
 * Extracted from extension/lib/ai/critique-api.js:checkPromisePayoff.
 * Detects whether the NF book's core promise is delivered by its chapters.
 * Returns the same finding shape as the original — byte-identical for the
 * same input (proven by tests/promise-payoff-detector.test.js).
 */
export declare function checkNfPromisePayoff(plan: WritingPlan): NfCritiqueFinding[];
export interface FictionPromiseGap {
    promise: PromisePayoffItem;
    gapDescription: string;
}
/**
 * Given the fiction promises already detected by getWritingPlan, identifies
 * which ones have gaps worth surfacing in the critique card:
 *   - Unresolved high-risk promises (no resolution plan at all)
 *   - Promises last touched many chapters ago with no planned payoff
 *   - Thread mentioned in scene contracts but never given a resolution plan
 */
export declare function findFictionPromiseGaps(plan: WritingPlan): FictionPromiseGap[];
//# sourceMappingURL=promise-payoff.d.ts.map