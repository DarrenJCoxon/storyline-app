import type { ImagePrompt } from '../state/writing-plan.js';
export interface FigureContext {
    chapterTitle?: string | null;
    chapterMission?: string | null;
}
export interface BookContext {
    title?: string | null;
    audience?: string | null;
    palette?: string | null;
    frameworkName?: string | null;
}
export declare function synthesizeImagePrompt(purpose: string, type: string, figure: FigureContext, book: BookContext): ImagePrompt;
//# sourceMappingURL=figure-prompt-synthesizer.d.ts.map