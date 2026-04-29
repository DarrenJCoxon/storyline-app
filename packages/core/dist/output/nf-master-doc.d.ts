import type { WritingPlan } from '../state/writing-plan.js';
import type { ProjectState } from '../state/project-state.js';
export interface NfMasterDocResult {
    outputPath: string;
    chapterCount: number;
    researchItemCount: number;
    claimCount: number;
}
export declare function generateNfMasterDocument(plan: WritingPlan, state: ProjectState, projectDir: string): NfMasterDocResult;
//# sourceMappingURL=nf-master-doc.d.ts.map