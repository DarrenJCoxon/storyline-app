import type { WritingPlan } from '../state/writing-plan.js';
export interface ResearchTodoResult {
    outputPath: string;
    totalItems: number;
    pendingCount: number;
}
export declare function generateResearchTodo(plan: WritingPlan, projectDir: string): ResearchTodoResult;
//# sourceMappingURL=research-todo.d.ts.map