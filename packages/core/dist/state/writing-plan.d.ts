import type { ProjectState, Pipeline, SubMode } from './project-state.js';
/** A research item the writer needs to gather, surfaced from any source. */
export interface ResearchTodoItem {
    id?: string;
    description: string;
    source: 'chapter' | 'evidence-stage' | 'sourcing-register' | 'research-subsystem' | 'loose';
    chapterNumber?: number | null;
    sceneNumber?: number | null;
    stageId?: string | null;
    status: 'planned' | 'captured' | 'verified' | 'cited';
}
/** A figure (diagram / chart / cast sheet / etc.) — consumed by NF-13 and fiction visual work. */
export interface FigurePlanItem {
    id: string;
    type: string;
    chapterNumber?: number | null;
    sectionTitle?: string | null;
    purpose: string;
    factualConstraints?: string;
    caption?: string;
    altText?: string;
    sourceRights?: string;
    status: 'planned' | 'generating' | 'produced' | 'accepted' | 'rejected';
    producedAssetPath?: string;
    imagePrompt?: Record<string, unknown>;
    promptHistory?: string[];
}
/** A scene within a fiction chapter. Captures everything the current
 *  schema captures plus contract slots (FIC-B will populate the contract
 *  slots; FIC-A leaves them optional so partially-planned projects normalize
 *  cleanly). */
export interface FictionScene {
    sceneNumber: number;
    pov: string | null;
    location: string | null;
    summary: string | null;
    conflict: string | null;
    whatChanges: string | null;
    notes: string | null;
    timeOfDay?: string | null;
    purpose?: string | null;
    beats?: string | null;
    estimatedWords?: number | null;
    goal?: string;
    obstacle?: string;
    stakes?: string;
    conflictSource?: string;
    valueShiftStart?: string;
    valueShiftEnd?: string;
    storyTurn?: string;
    beatFunction?: string;
    arcFunction?: string;
    threadMovement?: string;
    draftStatus?: 'not-started' | 'drafting' | 'complete';
}
/** A fiction chapter with its scenes and beat assignment. */
export interface FictionChapter {
    chapterNumber: number;
    chapterTitle: string | null;
    beat: string | null;
    estimatedWords: number | null;
    scenes: FictionScene[];
}
/** A canonical Save-the-Cat beat. */
export interface FictionBeat {
    id: string;
    scene: string | null;
    notes: string | null;
    fields: Record<string, string | null>;
}
/** A character (protagonist or supporting cast). */
export interface FictionCharacter {
    name: string;
    role: string | null;
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
    isProtagonist: boolean;
    relationshipToProtagonist: string | null;
    arcSummary: string | null;
    meetsProtagonistAt: string | null;
}
/** A relationship between two characters. */
export interface FictionRelationship {
    characterA: string;
    characterB: string;
    connection: string | null;
    conflict: string | null;
    whatTheyWantFromEachOther: string | null;
}
/** A plot thread. Drift D2 (`t.type` vs `t.threadType`) is normalized here —
 *  consumers always read `threadType`. */
export interface FictionPlotThread {
    id: string;
    name: string;
    threadType: string | null;
    introducedAt: string | null;
    status: string | null;
    resolutionPlan: string | null;
}
/** A subplot. */
export interface FictionSubplot {
    name: string;
    character: string | null;
    purpose: string | null;
    premise: string | null;
    beats: {
        setup?: string;
        complication?: string;
        resolution?: string;
    } | null;
}
/** B-story (parallel relationship/theme thread). */
export interface FictionBStory {
    character: string | null;
    premise: string | null;
    resolution: string | null;
    themeConnection: string | null;
    beats: Record<string, unknown>;
}
/** A non-fiction chapter — a section-bearing structural unit, not a scene-bearing one.
 *  Pipeline-specific fields (`linkedPrinciple` for A, `chapterQuestion` for B,
 *  `learningObjective` for C) appear together; consumers branch on what's set. */
export interface NfChapter {
    number: number;
    title: string | null;
    slug: string;
    /** Path the manuscript file will be seeded to (e.g. 'manuscript/01-the-shift.md'). */
    manuscriptFile: string;
    /** Path the chapter card lives at (e.g. 'docs/chapters/01-the-shift.md'). */
    cardFile: string;
    sections: NfChapterSection[];
    wordCountEstimate: number | null;
    keyResearch: string | null;
    linkedPrinciple?: string;
    chapterQuestion?: string;
    learningObjective?: string;
    mission?: string;
}
export interface NfChapterSection {
    title: string;
    type: string;
    notes?: string;
    keyResearch?: string;
}
export interface WritingPlan {
    mode: 'fiction' | 'nonfiction' | null;
    pipeline: Pipeline;
    subMode: SubMode;
    title: string | null;
    primaryGenre: string | null;
    audience: string | null;
    targetWordCount: number;
    protagonist: FictionCharacter | null;
    cast: FictionCharacter[];
    relationships: FictionRelationship[];
    beats: FictionBeat[];
    bStory: FictionBStory | null;
    subplots: FictionSubplot[];
    fictionChapters: FictionChapter[];
    plotThreads: FictionPlotThread[];
    logline: {
        sentence: string | null;
        setup: string | null;
        incitingIncident: string | null;
        stakes: string | null;
        resolutionHint: string | null;
        antagonistQuestion: string | null;
    };
    nfChapters: NfChapter[];
    researchItems: ResearchTodoItem[];
    figures: FigurePlanItem[];
    promises: unknown[];
    claims: unknown[];
}
/** Single entry point. Branches on `state.mode` once; downstream code is
 *  mode-aware via the populated arrays, not by branching on raw state. */
export declare function getWritingPlan(state: ProjectState): WritingPlan;
//# sourceMappingURL=writing-plan.d.ts.map