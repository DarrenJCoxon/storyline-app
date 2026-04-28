import type { WritingPlan } from '../state/writing-plan.js';
export interface StoryBibleResult {
    outputPath: string;
    characterCount: number;
    locationCount: number;
}
export declare function generateStoryBible(plan: WritingPlan, projectDir: string): StoryBibleResult;
//# sourceMappingURL=story-bible.d.ts.map