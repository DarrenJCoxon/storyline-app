import type { AcademicPlan } from '../state/writing-plan.js';
export interface GlossaryResult {
    markdown: string;
    terms: Array<{
        term: string;
        firstChapter: number;
    }>;
}
export declare function generateGlossary(plan: AcademicPlan): GlossaryResult;
//# sourceMappingURL=glossary.d.ts.map