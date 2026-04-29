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
/** A tracked factual claim — NF-12. Populated from pa-evidence / pb-sourcing stages. */
export interface ClaimEvidenceItem {
    id: string;
    claimText: string;
    chapterNumber: number | null;
    sectionTitle: string | null;
    evidenceType: 'study' | 'case-study' | 'data' | 'interview' | 'personal' | 'sourced-claim' | 'unparsed';
    sources: string[];
    confidence: 'primary' | 'secondary' | 'anecdotal' | 'unknown';
    risk: 'high' | 'medium' | 'low';
    citationNeeded: boolean;
    verificationState: 'planned' | 'sourced' | 'captured' | 'verified' | 'cited';
}
/** Structured image-2 generation prompt — NF-13.1. */
export interface ImagePrompt {
    subject: string;
    composition: string;
    style: string;
    textElements: Array<{
        text: string;
        position: string;
    }>;
    colourPalette: string;
    negativeConstraints: string[];
    aspectRatio: 'square' | 'landscape' | 'portrait' | string;
}
/** A figure (diagram / chart / cast sheet / etc.) — mode-agnostic, NF-13 + future fiction visual work. */
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
    imagePrompt: ImagePrompt | null;
    promptHistory: string[];
    status: 'planned' | 'generating' | 'produced' | 'accepted' | 'rejected';
    producedAssetPath?: string;
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
 *  consumers always read `threadType`.
 *  FIC-C.2 adds dossier fields; old projects get sensible defaults. */
export interface FictionPlotThread {
    id: string;
    name: string;
    threadType: string | null;
    introducedAt: string | null;
    status: string | null;
    resolutionPlan: string | null;
    introducedScene: string | null;
    developedScenes: string | null;
    plannedResolutionScene: string | null;
    payoffScene: string | null;
    unresolvedRisk: boolean;
    linkedPromises: string[];
    lastTouchedChapter: number | null;
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
/** A location derived from scene `location` fields, with the chapters that use it. */
export interface FictionLocation {
    name: string;
    chapters: number[];
}
/** A recurring object the writer has explicitly captured (writer-provided, not derived). */
export interface FictionRecurringObject {
    name: string;
    notes: string | null;
}
/** A continuity fact the writer has explicitly captured. */
export interface FictionContinuityFact {
    fact: string;
    chapter: number | null;
}
/** Derived story-bible data — populated by normalizer; consumed by story-bible renderer. */
export interface FictionStoryBible {
    locations: FictionLocation[];
    recurringObjects: FictionRecurringObject[];
    continuityFacts: FictionContinuityFact[];
}
/** A single character's arc across the book. */
export interface CharacterArcRow {
    characterName: string;
    role: string | null;
    want: string | null;
    need: string | null;
    /** The character's core lie / false belief. */
    lie: string | null;
    /** The character's ghost / wound. */
    wound: string | null;
    /** Chapter numbers where this character appears as POV (derived from scene data). */
    chapterPresence: number[];
    /** Beat IDs where beats explicitly mention/pressure this character. */
    beatPressure: string[];
    midpointShift: string | null;
    allIsLostImpact: string | null;
    finaleChoice: string | null;
    finalState: string | null;
}
/** Derived arc-matrix — one row per protagonist/major supporting character. */
export interface FictionArcMatrix {
    characters: CharacterArcRow[];
}
export type PromiseType = 'clue' | 'secret' | 'wound' | 'weapon-on-the-wall' | 'prophecy' | 'romance-beat' | 'subplot' | 'genre-promise';
export type PromiseStatus = 'planned' | 'set-up' | 'paid-off' | 'unresolved';
export type PromiseRisk = 'low' | 'medium' | 'high';
/** A tracked narrative promise — something the writer has signalled to the
 *  reader that must eventually be paid off. Detected from plot threads and
 *  scene contracts; updated as the draft progresses. */
export interface PromisePayoffItem {
    id: string;
    type: PromiseType;
    description: string;
    setupChapter: number | null;
    setupScene: number | null;
    plannedPayoffChapter: number | null;
    plannedPayoffScene: number | null;
    actualPayoffChapter: number | null;
    actualPayoffScene: number | null;
    status: PromiseStatus;
    risk: PromiseRisk;
    notes: string | null;
}
/** A single learning outcome from the ac-syllabus stage. Textbooks use full
 *  Bloom's-level taxonomy; revision guides use recall-type classification. */
export interface AcademicLearningOutcome {
    code: string;
    text: string;
    bloom?: string | null;
    module?: string | null;
    recallType?: string | null;
    examTrap?: string | null;
}
export interface AcademicWorkedExample {
    id: string;
    title: string | null;
    difficulty: string | null;
    chapterNumber: number;
}
export interface AcademicExercise {
    id: string;
    title: string | null;
    difficulty: string | null;
    chapterNumber: number;
}
/** A single chapter / topic in an academic plan — branches on bookType. */
export interface AcademicChapter {
    number: number;
    title: string | null;
    outcomes: string[];
    keyTerms: string[];
    prerequisites: number[];
    sections: Array<{
        title: string;
        type: string;
    }>;
    wordTarget: number | null;
    workedExamples: AcademicWorkedExample[];
    exercises: AcademicExercise[];
    recallQuestions: number | null;
    examPractice: Array<{
        type: string;
        count: number;
    }>;
}
/** Top-level academic plan — populated when pipeline === 'academic'. */
export interface AcademicPlan {
    bookType: 'textbook' | 'revision-guide';
    level: string | null;
    specReference: string | null;
    assessmentShape: string | null;
    learningOutcomes: AcademicLearningOutcome[];
    keyTerms: string[];
    workedExamples: AcademicWorkedExample[];
    exercises: AcademicExercise[];
    prerequisites: Record<number, number[]>;
    chapters: AcademicChapter[];
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
    /** Path the chapter card lives at (e.g. 'planning/chapters/01-the-shift.md'). */
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
    nfPromise: {
        corePromise: string | null;
        subtitleDraft: string | null;
        endStateMeasurableOutcome: string | null;
        paThesisText: string | null;
        paFrameworkName: string | null;
    } | null;
    promises: PromisePayoffItem[];
    claims: ClaimEvidenceItem[];
    storyBible: FictionStoryBible | null;
    arcMatrix: FictionArcMatrix | null;
    academic: AcademicPlan | null;
}
/** Single entry point. Branches on `state.mode` once; downstream code is
 *  mode-aware via the populated arrays, not by branching on raw state. */
export declare function getWritingPlan(state: ProjectState): WritingPlan;
//# sourceMappingURL=writing-plan.d.ts.map