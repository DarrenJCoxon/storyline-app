import type { AcademicPlan } from '../state/writing-plan.js';
export interface PrerequisiteChainResult {
    markdown: string;
    cycles: number[][];
    forwardRefs: Array<{
        chapter: number;
        prereq: number;
    }>;
    topologicalOrder: number[];
}
export declare function generatePrerequisiteChain(plan: AcademicPlan): PrerequisiteChainResult;
//# sourceMappingURL=prerequisite-chain.d.ts.map