import type { WritingPlan } from '../state/writing-plan.js';
import type { ProjectState } from '../state/project-state.js';
export interface AcademicMasterDocResult {
    outputPath: string;
    chapterCount: number;
    outcomeCount: number;
    gaps: number;
    cycles: number;
}
export declare function generateAcademicMasterDocument(plan: WritingPlan, state: ProjectState, projectDir: string): AcademicMasterDocResult;
//# sourceMappingURL=academic-master-doc.d.ts.map