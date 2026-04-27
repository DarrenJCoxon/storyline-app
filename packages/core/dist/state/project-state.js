"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NF_STAGE_BY_ID = exports.NF_STAGE_ORDER = exports.NF_PIPELINE_C_STAGE_ORDER = exports.NF_PIPELINE_B_STAGE_ORDER = exports.NF_PIPELINE_A_STAGE_ORDER = exports.NF_DNA_STAGE_ORDER = exports.STAGE_BY_ID = exports.STAGE_ORDER = exports.DEFAULT_STATE = void 0;
exports.stageOrderFor = stageOrderFor;
exports.DEFAULT_STATE = {
    _meta: { projectPath: null, createdAt: null, updatedAt: null },
    mode: null,
    pipeline: 'novel',
    subMode: null,
    bookDna: {},
    nfStages: {},
    stages: {},
    genre: {
        primaryGenre: null,
        subGenre: null,
        targetWordCount: 80000,
        tone: null,
        audience: null,
        genreVariant: 'standard',
    },
    premise: {
        rawLogline: null,
        conceptHook: null,
        seriesPotential: null,
        seriesContext: {
            isSeries: false,
            seriesTitle: null,
            bookCount: null,
            currentBookNumber: 1,
            overallArc: null,
            firstBookFocus: null,
        },
    },
    protagonist: {
        name: null, age: null, occupation: null, dailyLife: null,
        want: null, need: null, ghost: null, flaw: null, coreLie: null,
        arcDirection: null, voice: null,
    },
    characters: [],
    relationships: [],
    logline: {
        sentence: null, setup: null, incitingIncident: null,
        stakes: null, resolutionHint: null, antagonistQuestion: null,
    },
    beatSheet: {
        genreVariant: 'standard',
        beats: {
            beat01OpeningImage: { scene: null, image: null, notes: null },
            beat02Setup: { scene: null, themeStated: null, notes: null },
            beat03Catalyst: { scene: null, incitingIncident: null, notes: null },
            beat04Debate: { scene: null, debateQuestion: null, notes: null },
            beat05BreakIntoTwo: { scene: null, falseReality: null, threshold: null, notes: null },
            beat06BStory: { scene: null, bStoryIntro: null, themeConnection: null, notes: null },
            beat07FunAndGames: { scene: null, promiseOfPremise: null, toneParity: null, notes: null },
            beat08Midpoint: { scene: null, midpointType: null, flipOrReveal: null, stakesRaise: null, notes: null },
            beat09BadGuysCloseIn: { scene: null, pressures: null, notes: null },
            beat10AllIsLost: { scene: null, wallopMoment: null, darkNightOfSoul: null, whiffOfDeath: null, notes: null },
            beat11BlackMoment: { scene: null, defeatType: null, despair: null, whatMakesThemTry: null, notes: null },
            beat12Beat13: { scene: null, secondDoorway: null, forcedReexamination: null, notes: null },
            beat13Finale: { scene: null, climaxType: null, selfRevelation: null, newEquilibrium: null, notes: null },
            beat14FinalImage: { scene: null, contrastToOpening: null, notes: null },
            beat15EndCredits: { scene: null, reflection: null, notes: null },
        },
        overallNotes: null,
    },
    bStory: { character: null, premise: null, beats: {}, resolution: null, themeConnection: null },
    subplots: [],
    sceneOutline: { highLevel: [], approved: false, fleshedChapters: [] },
    plotThreads: [],
    chapterOutline: [],
    critique: {
        flaggedIssues: [], resolvedIssues: [],
        pacingAnalysis: null, characterConsistency: null, beatSheetValidation: null,
    },
    masterDoc: { generatedAt: null, markdown: null, wordCountEstimate: null },
    writing: { manuscriptPath: 'manuscript' },
};
exports.STAGE_ORDER = [
    { index: 0, id: 'mode', name: 'Fiction or Non-Fiction', nextPrompt: 'mode' },
    { index: 1, id: 'genre', name: 'Genre & Foundations', nextPrompt: 'genre' },
    { index: 2, id: 'premise', name: 'Story Seed & Premise', nextPrompt: 'premise' },
    { index: 3, id: 'protagonist', name: 'Protagonist Deep Dive', nextPrompt: 'protagonist' },
    { index: 4, id: 'characters', name: 'Supporting Cast', nextPrompt: 'characters' },
    { index: 5, id: 'relationships', name: 'Relationship Web', nextPrompt: 'relationships' },
    { index: 6, id: 'logline', name: 'Logline Refinement', nextPrompt: 'logline' },
    { index: 7, id: 'beatSheet', name: 'Beat Sheet', nextPrompt: 'beatSheet' },
    { index: 8, id: 'bStory', name: 'B Story', nextPrompt: 'bStory' },
    { index: 9, id: 'subplots', name: 'Subplots', nextPrompt: 'subplots' },
    { index: 10, id: 'sceneOutline', name: 'Scene Outline', nextPrompt: 'sceneOutline' },
    { index: 11, id: 'plotThreads', name: 'Plot Thread Registry', nextPrompt: 'plotThreads' },
    { index: 12, id: 'chapterOutline', name: 'Chapter Flesh-Out', nextPrompt: 'chapterOutline' },
    { index: 13, id: 'critique', name: 'Consistency & Critique', nextPrompt: 'critique' },
    { index: 14, id: 'masterDoc', name: 'Master Document', nextPrompt: 'masterDoc' },
];
exports.STAGE_BY_ID = Object.fromEntries(exports.STAGE_ORDER.map(s => [s.id, s]));
// Non-fiction harness — Phase 0 (Book DNA, 12 stages, all NF projects).
// IDs/names verbatim from lib/ai/stage-guides-nf-dna.js — do not paraphrase.
exports.NF_DNA_STAGE_ORDER = [
    { index: 0, id: 'mode', name: 'Fiction or Non-Fiction', nextPrompt: 'mode' },
    { index: 1, id: 'dna-category', name: 'Category & Market Positioning', nextPrompt: 'dna-category' },
    { index: 2, id: 'dna-reader', name: 'Reader Avatar', nextPrompt: 'dna-reader' },
    { index: 3, id: 'dna-transform', name: 'Reader Transformation', nextPrompt: 'dna-transform' },
    { index: 4, id: 'dna-idea', name: 'The One Big Idea', nextPrompt: 'dna-idea' },
    { index: 5, id: 'dna-author', name: 'Author Angle & Authority', nextPrompt: 'dna-author' },
    { index: 6, id: 'dna-promise', name: 'Core Promise & Subtitle Engineering', nextPrompt: 'dna-promise' },
    { index: 7, id: 'dna-comps', name: 'Comps Deep Dive', nextPrompt: 'dna-comps' },
    { index: 8, id: 'dna-voice', name: 'Voice & Tone', nextPrompt: 'dna-voice' },
    { index: 9, id: 'dna-evidence', name: 'Evidence Philosophy', nextPrompt: 'dna-evidence' },
    { index: 10, id: 'dna-commercial', name: 'Commercial Model', nextPrompt: 'dna-commercial' },
    { index: 11, id: 'dna-title', name: 'Working Title Pressure-Test', nextPrompt: 'dna-title' },
    { index: 12, id: 'dna-consolidate', name: 'Book DNA Consolidation', nextPrompt: 'dna-consolidate' },
];
// Phase 1A — Prescriptive (11 stages). Verbatim from stage-guides-nf-pipeline-a.js.
exports.NF_PIPELINE_A_STAGE_ORDER = [
    { index: 13, id: 'pa-thesis', name: 'Core Thesis', nextPrompt: 'pa-thesis' },
    { index: 14, id: 'pa-objections', name: 'Reader Objections', nextPrompt: 'pa-objections' },
    { index: 15, id: 'pa-framework', name: 'Framework Design', nextPrompt: 'pa-framework' },
    { index: 16, id: 'pa-principles', name: 'Principles / Laws', nextPrompt: 'pa-principles' },
    { index: 17, id: 'pa-evidence', name: 'Evidence Map', nextPrompt: 'pa-evidence' },
    { index: 18, id: 'pa-application', name: 'Application Layer', nextPrompt: 'pa-application' },
    { index: 19, id: 'pa-braid', name: 'Narrative Braid', nextPrompt: 'pa-braid' },
    { index: 20, id: 'pa-chapters', name: 'Chapter Plan', nextPrompt: 'pa-chapters' },
    { index: 21, id: 'pa-opener', name: 'Opener & Closer Design', nextPrompt: 'pa-opener' },
    { index: 22, id: 'pa-critique', name: 'Consistency & Critique', nextPrompt: 'pa-critique' },
    { index: 23, id: 'pa-master', name: 'Master Document', nextPrompt: 'pa-master' },
];
// Phase 1B — Narrative NF (10 stages). Verbatim from stage-guides-nf-pipeline-b.js.
exports.NF_PIPELINE_B_STAGE_ORDER = [
    { index: 13, id: 'pb-thesis', name: 'Central Question / Thesis', nextPrompt: 'pb-thesis' },
    { index: 14, id: 'pb-cast', name: 'Cast of Real People', nextPrompt: 'pb-cast' },
    { index: 15, id: 'pb-timeline', name: 'Timeline', nextPrompt: 'pb-timeline' },
    { index: 16, id: 'pb-fork', name: 'Structural Fork', nextPrompt: 'pb-fork' },
    { index: 17, id: 'pb-scenes', name: 'Scene List', nextPrompt: 'pb-scenes' },
    { index: 18, id: 'pb-sourcing', name: 'Sourcing Register', nextPrompt: 'pb-sourcing' },
    { index: 19, id: 'pb-theme', name: 'Thematic Through-Line', nextPrompt: 'pb-theme' },
    { index: 20, id: 'pb-chapters', name: 'Chapter Outline', nextPrompt: 'pb-chapters' },
    { index: 21, id: 'pb-critique', name: 'Consistency & Critique', nextPrompt: 'pb-critique' },
    { index: 22, id: 'pb-master', name: 'Master Document', nextPrompt: 'pb-master' },
];
// Phase 1C — How-To / Skill Ladder (11 stages). Verbatim from stage-guides-nf-pipeline-c.js.
exports.NF_PIPELINE_C_STAGE_ORDER = [
    { index: 13, id: 'pc-skill', name: 'Target Skill', nextPrompt: 'pc-skill' },
    { index: 14, id: 'pc-start-level', name: 'Reader Starting Level', nextPrompt: 'pc-start-level' },
    { index: 15, id: 'pc-end-state', name: 'End-State Competency', nextPrompt: 'pc-end-state' },
    { index: 16, id: 'pc-decompose', name: 'Skill Decomposition', nextPrompt: 'pc-decompose' },
    { index: 17, id: 'pc-prereqs', name: 'Prerequisite Graph', nextPrompt: 'pc-prereqs' },
    { index: 18, id: 'pc-lessons', name: 'Lesson Plan', nextPrompt: 'pc-lessons' },
    { index: 19, id: 'pc-drills', name: 'Exercise / Drill Design', nextPrompt: 'pc-drills' },
    { index: 20, id: 'pc-milestones', name: 'Milestone / Assessment Design', nextPrompt: 'pc-milestones' },
    { index: 21, id: 'pc-examples', name: 'Worked Examples & Common Mistakes', nextPrompt: 'pc-examples' },
    { index: 22, id: 'pc-critique', name: 'Consistency & Critique', nextPrompt: 'pc-critique' },
    { index: 23, id: 'pc-master', name: 'Master Document', nextPrompt: 'pc-master' },
];
/** Concatenate Phase 0 + the chosen Phase 1 pipeline. */
function nfStageOrderFor(pipeline) {
    switch (pipeline) {
        case 'A': return [...exports.NF_DNA_STAGE_ORDER, ...exports.NF_PIPELINE_A_STAGE_ORDER];
        case 'B': return [...exports.NF_DNA_STAGE_ORDER, ...exports.NF_PIPELINE_B_STAGE_ORDER];
        case 'C': return [...exports.NF_DNA_STAGE_ORDER, ...exports.NF_PIPELINE_C_STAGE_ORDER];
        default: return exports.NF_DNA_STAGE_ORDER; // pipeline not chosen yet → Phase 0 only
    }
}
/** Default NF order (Phase 0 only) — used when no pipeline is in state. */
exports.NF_STAGE_ORDER = exports.NF_DNA_STAGE_ORDER;
exports.NF_STAGE_BY_ID = Object.fromEntries([...exports.NF_DNA_STAGE_ORDER, ...exports.NF_PIPELINE_A_STAGE_ORDER, ...exports.NF_PIPELINE_B_STAGE_ORDER, ...exports.NF_PIPELINE_C_STAGE_ORDER]
    .map(s => [s.id, s]));
/** Returns the stage progression for the current project mode + pipeline. */
function stageOrderFor(state) {
    if (!state || state.mode !== 'nonfiction')
        return exports.STAGE_ORDER;
    return nfStageOrderFor(state.pipeline);
}
//# sourceMappingURL=project-state.js.map