import type { WritingPlan } from '../state/writing-plan.js';
export interface ClaimLedgerResult {
    outputPath: string;
    totalClaims: number;
    unsupportedCount: number;
    highRiskChapters: Array<{
        chapterNumber: number;
        unsupportedCount: number;
    }>;
}
export declare function generateClaimEvidenceLedger(plan: WritingPlan, projectDir: string): ClaimLedgerResult;
//# sourceMappingURL=claim-evidence-ledger.d.ts.map