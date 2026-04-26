import type { ProjectState } from '../state/project-state.js';
export declare const GENRE_VARIANTS: Record<string, {
    name: string;
    description: string;
}>;
export interface StageQuestion {
    key: string;
    label: string;
    hint?: string;
    required?: boolean;
    type?: string;
    validate?: string;
    crossCheck?: {
        with: string;
        message: string;
    };
}
export interface StageSection {
    title: string;
    intro?: string;
    questions: StageQuestion[];
}
export interface RepeatableConfig {
    max: number;
    itemLabel: string;
    fields: StageQuestion[];
    nested?: {
        key: string;
        itemLabel: string;
        max: number;
        fields: StageQuestion[];
    };
}
export interface BeatEntry {
    id: string;
    name: string;
    position: string;
    purpose: string;
    questions: StageQuestion[];
    contrastNote?: string;
    required?: boolean;
}
export interface StageGuide {
    id: string;
    name: string;
    persona: string;
    opening: string;
    questions?: StageQuestion[];
    sections?: StageSection[];
    repeatable?: RepeatableConfig;
    beats?: BeatEntry[];
    skippable?: boolean;
    seriesDetection?: boolean;
    twoPass?: boolean;
    transition?: string;
    researchTip?: string;
}
export declare const STAGE_GUIDES: Record<string, StageGuide>;
export declare function getStageGuide(stageId: string): StageGuide | null;
export declare function buildSystemPrompt(stageId: string, state: ProjectState): string;
//# sourceMappingURL=stage-guides.d.ts.map