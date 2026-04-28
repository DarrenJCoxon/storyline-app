import type { WritingPlan } from '../state/writing-plan.js';
export interface ArcMatrixResult {
    outputPath: string;
    characterCount: number;
}
export declare function generateCharacterArcMatrix(plan: WritingPlan, projectDir: string): ArcMatrixResult;
//# sourceMappingURL=character-arc-matrix.d.ts.map