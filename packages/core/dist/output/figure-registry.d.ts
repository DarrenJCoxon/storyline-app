import type { WritingPlan } from '../state/writing-plan.js';
export interface FigureRegistryResult {
    outputPath: string;
    totalFigures: number;
    producedCount: number;
}
export declare function generateFigureRegistry(plan: WritingPlan, projectDir: string): FigureRegistryResult;
//# sourceMappingURL=figure-registry.d.ts.map