import type { AcademicPlan } from '../state/writing-plan.js';
export interface ExerciseIndexResult {
    markdown: string;
    chaptersWithoutExercises: number[];
    difficultyDistribution: Record<string, number>;
}
export declare function generateExerciseIndex(plan: AcademicPlan): ExerciseIndexResult;
//# sourceMappingURL=exercise-index.d.ts.map