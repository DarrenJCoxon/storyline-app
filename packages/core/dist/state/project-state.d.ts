export type Mode = 'fiction' | 'nonfiction';
export type Pipeline = 'novel' | 'A' | 'B' | 'C' | 'academic';
export type SubMode = 'argument' | 'braid' | 'idea-led' | 'event-led' | null;
export type BookType = 'textbook' | 'revision-guide' | null;
export interface Beat {
    scene: string | null;
    notes: string | null;
    [key: string]: string | null;
}
export interface BeatSheet {
    genreVariant: string;
    beats: Record<string, Beat>;
    overallNotes: string | null;
}
export interface Protagonist {
    name: string | null;
    age: string | null;
    occupation: string | null;
    dailyLife: string | null;
    want: string | null;
    need: string | null;
    ghost: string | null;
    flaw: string | null;
    coreLie: string | null;
    arcDirection: string | null;
    voice: string | null;
}
export interface Character {
    name: string;
    role: string;
    want: string | null;
    need: string | null;
    ghost: string | null;
    flaw: string | null;
    relationshipToProtagonist: string | null;
    arcSummary: string | null;
    meetsProtagonistAt: string | null;
}
export interface ProjectState {
    _meta: {
        projectPath: string | null;
        createdAt: string | null;
        updatedAt: string | null;
    };
    mode: Mode | null;
    pipeline: Pipeline;
    subMode: SubMode;
    bookType: BookType;
    bookDna: Record<string, unknown>;
    nfStages: Record<string, unknown>;
    stages: Record<string, {
        completed?: boolean;
    }>;
    genre: {
        primaryGenre: string | null;
        subGenre: string | null;
        targetWordCount: number;
        tone: string | null;
        audience: string | null;
        genreVariant: string;
    };
    premise: {
        rawLogline: string | null;
        conceptHook: string | null;
        seriesPotential: unknown;
        seriesContext: {
            isSeries: boolean;
            seriesTitle: string | null;
            bookCount: number | null;
            currentBookNumber: number;
            overallArc: string | null;
            firstBookFocus: string | null;
        };
    };
    protagonist: Protagonist;
    characters: Character[];
    relationships: unknown[];
    logline: {
        sentence: string | null;
        setup: string | null;
        incitingIncident: string | null;
        stakes: string | null;
        resolutionHint: string | null;
        antagonistQuestion: string | null;
    };
    beatSheet: BeatSheet;
    bStory: {
        character: string | null;
        premise: string | null;
        beats: Record<string, unknown>;
        resolution: string | null;
        themeConnection: string | null;
    };
    subplots: unknown[];
    sceneOutline: {
        highLevel: unknown[];
        approved: boolean;
        fleshedChapters: unknown[];
    };
    plotThreads: unknown[];
    chapterOutline: unknown[];
    critique: {
        flaggedIssues: unknown[];
        resolvedIssues: unknown[];
        pacingAnalysis: string | null;
        characterConsistency: string | null;
        beatSheetValidation: string | null;
    };
    masterDoc: {
        generatedAt: string | null;
        markdown: string | null;
        wordCountEstimate: number | null;
    };
    writing: {
        manuscriptPath: string;
    };
}
export declare const DEFAULT_STATE: ProjectState;
export interface StageEntry {
    index: number;
    id: string;
    name: string;
    nextPrompt: string;
}
export declare const STAGE_ORDER: StageEntry[];
export declare const STAGE_BY_ID: {
    [k: string]: StageEntry;
};
export declare const NF_DNA_STAGE_ORDER: StageEntry[];
export declare const NF_PIPELINE_A_STAGE_ORDER: StageEntry[];
export declare const NF_PIPELINE_B_STAGE_ORDER: StageEntry[];
export declare const NF_PIPELINE_C_STAGE_ORDER: StageEntry[];
export declare const NF_ACADEMIC_STAGE_ORDER: StageEntry[];
/** Default NF order (Phase 0 only) — used when no pipeline is in state. */
export declare const NF_STAGE_ORDER: StageEntry[];
export declare const NF_STAGE_BY_ID: {
    [k: string]: StageEntry;
};
/** Returns the stage progression for the current project mode + pipeline. */
export declare function stageOrderFor(state: Pick<ProjectState, 'mode' | 'pipeline'> | undefined): StageEntry[];
//# sourceMappingURL=project-state.d.ts.map