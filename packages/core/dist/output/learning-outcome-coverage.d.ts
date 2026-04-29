import type { AcademicPlan } from '../state/writing-plan.js';
export interface OutcomeCoverageResult {
    markdown: string;
    gaps: string[];
    doubleCovered: string[];
    coverageMap: Record<string, number[]>;
}
export declare function generateLearningOutcomeCoverage(plan: AcademicPlan): OutcomeCoverageResult;
//# sourceMappingURL=learning-outcome-coverage.d.ts.map