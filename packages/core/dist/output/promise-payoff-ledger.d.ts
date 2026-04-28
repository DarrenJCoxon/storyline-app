import type { WritingPlan } from '../state/writing-plan.js';
export interface LedgerResult {
    outputPath: string;
    totalPromises: number;
    unresolvedCount: number;
    highRiskCount: number;
}
export declare function generatePromisePayoffLedger(plan: WritingPlan, projectDir: string): LedgerResult;
//# sourceMappingURL=promise-payoff-ledger.d.ts.map