// Novel Writer project state — all planning stages and their data

export const DEFAULT_STATE = {
  _meta: {
    projectPath: null,
    createdAt: null,
    updatedAt: null,
  },

  // Stage completion tracking
  stages: {},

  // ─────────────────────────────────────────────────────────────
  // STAGE 1 — GENRE & Foundations
  // ─────────────────────────────────────────────────────────────
  genre: {
    primaryGenre: null,       // e.g. "Thriller", "Romance", "Fantasy"
    subGenre: null,           // e.g. "Psychological Thriller", "Romantic Comedy"
    targetWordCount: 80000,
    tone: null,               // "dark", "whimsical", "gritty", "uplifting"
    audience: null,           // "adult", "YA", "Middle Grade"
    genreVariant: 'standard',  // Save the Cat genre variant
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 2 — Premise / Story Seed (conversational brainstorm)
  // ─────────────────────────────────────────────────────────────
  premise: {
    rawLogline: null,        // "What is this story about?" — unfiltered first pass
    conceptHook: null,       // What makes this story compelling in one line
    seriesPotential: null,   // { detected: bool, indicators: [], suggestion: string } — populated by series-detector
    seriesContext: {
      isSeries: false,
      seriesTitle: null,
      bookCount: null,          // Total number of books planned in the series
      currentBookNumber: 1,     // Which book this project is (defaults to book 1)
      overallArc: null,         // The arc that spans ALL books in the series
      firstBookFocus: null,     // What Book 1 specifically is about
    },
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 3 — Protagonist (character-first, always)
  // ─────────────────────────────────────────────────────────────
  protagonist: {
    name: null,
    age: null,
    occupation: null,
    dailyLife: null,         // Their ordinary world — what does a day look like?
    want: null,              // The tangible thing they're chasing (external goal)
    need: null,              // The emotional truth they must learn (internal)
    ghost: null,             // The past wound they're running from / repeating
    flaw: null,              // The self-deception that blocks them
    coreLie: null,           // The false belief they tell themselves (need = opposite of flaw)
    arcDirection: null,      // "broken → whole" | "cold → open" | "fake → authentic"
    voice: null,             // Speech patterns, vocabulary, quirks
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 4 — Supporting Cast
  // ─────────────────────────────────────────────────────────────
  characters: [],            // Array of character objects
  // {
  //   name, role, want, need, ghost, flaw,
  //   relationshipToProtagonist,
  //   arcSummary,
  //   meetsProtagonistAt: "Beat 3" etc.
  // }

  // ─────────────────────────────────────────────────────────────
  // STAGE 5 — Relationship Web / Dynamics
  // ─────────────────────────────────────────────────────────────
  relationships: [],          // How characters connect and conflict

  // ─────────────────────────────────────────────────────────────
  // STAGE 6 — Logline (refined after character work)
  // ─────────────────────────────────────────────────────────────
  logline: {
    sentence: null,          // Final refined logline
    setup: null,            // Who is the protagonist and what is their world
    incitingIncident: null, // What disrupts their world
    stakes: null,           // What do they stand to lose
    resolutionHint: null,   // How might it end (not spoiled)
    antagonistQuestion: null, // Who or what opposes them
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 7 — Beat Sheet (15 beats, genre-adjusted)
  // ─────────────────────────────────────────────────────────────
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
      beat09BadGuysCloseIn: { scene: null, pressures: [], notes: null },
      beat10AllIsLost: { scene: null, wallopMoment: null, darkNightOfSoul: null, whiffOfDeath: null, notes: null },
      beat11BlackMoment: { scene: null, defeatType: null, despair: null, whatMakesThemTry: null, notes: null },
      beat12Beat13: { scene: null, secondDoorway: null, forcedReexamination: null, notes: null },
      beat13Finale: { scene: null, climaxType: null, selfRevelation: null, newEquilibrium: null, notes: null },
      beat14FinalImage: { scene: null, contrastToOpening: null, notes: null },
      beat15EndCredits: { scene: null, reflection: null, notes: null },
    },
    overallNotes: null,
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 8 — B Story (typically love interest or mentor)
  // ─────────────────────────────────────────────────────────────
  bStory: {
    character: null,        // Who is the B story character
    premise: null,          // What is the B story about
    beats: {},              // { begins, deepens, resolves } — arc beats for the B story
    resolution: null,
    themeConnection: null,  // How the B story connects to the A story's theme (statement voiced by the B story character)
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 9 — Subplots (C, D stories)
  // ─────────────────────────────────────────────────────────────
  subplots: [],             // Array of { name, character, premise, beats, resolution }

  // ─────────────────────────────────────────────────────────────
  // STAGE 10 — High-Level Scene Outline (approved, then fleshed)
  // ─────────────────────────────────────────────────────────────
  sceneOutline: {
    highLevel: [],          // First pass: array of { act, sequence, highLevelSummary }
    approved: false,
    fleshedChapters: [],    // After approval: chapters with scenes
    // {
    //   chapterNumber: 1,
    //   chapterTitle: "...",
    //   scenes: [
    //     { sceneNumber, location, timeOfDay, pov, purpose, conflict, whatChanges, beats, notes }
    //   ]
    // }
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 11 — Plot Thread Registry
  // ─────────────────────────────────────────────────────────────
  plotThreads: [],          // { id, threadType, name, introducedAt, status, resolutionPlan }

  // ─────────────────────────────────────────────────────────────
  // STAGE 12 — Chapter-by-Chapter Fleshed Outline
  // ─────────────────────────────────────────────────────────────
  chapterOutline: [],       // Full scene-level breakdown per chapter

  // ─────────────────────────────────────────────────────────────
  // STAGE 13 — Consistency & Critique Pass
  // ─────────────────────────────────────────────────────────────
  critique: {
    flaggedIssues: [],      // Things that need addressing
    resolvedIssues: [],     // Things that have been fixed
    pacingAnalysis: null,
    characterConsistency: null,
    beatSheetValidation: null,
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 14 — Master Document
  // ─────────────────────────────────────────────────────────────
  masterDoc: {
    generatedAt: null,
    markdown: null,
    wordCountEstimate: null,
  },
};

// Ordered stage sequence — conversational, not templated
export const STAGE_ORDER = [
  { index: 1,  id: 'genre',          name: 'Genre & Foundations',      nextPrompt: 'genre' },
  { index: 2,  id: 'premise',        name: 'Story Seed & Premise',     nextPrompt: 'premise' },
  { index: 3,  id: 'protagonist',    name: 'Protagonist Deep Dive',    nextPrompt: 'protagonist' },
  { index: 4,  id: 'characters',     name: 'Supporting Cast',          nextPrompt: 'characters' },
  { index: 5,  id: 'relationships',  name: 'Relationship Web',         nextPrompt: 'relationships' },
  { index: 6,  id: 'logline',        name: 'Logline Refinement',       nextPrompt: 'logline' },
  { index: 7,  id: 'beatSheet',      name: 'Beat Sheet',               nextPrompt: 'beatSheet' },
  { index: 8,  id: 'bStory',         name: 'B Story',                  nextPrompt: 'bStory' },
  { index: 9,  id: 'subplots',       name: 'Subplots',                 nextPrompt: 'subplots' },
  { index: 10, id: 'sceneOutline',   name: 'Scene Outline',            nextPrompt: 'sceneOutline' },
  { index: 11, id: 'plotThreads',    name: 'Plot Thread Registry',     nextPrompt: 'plotThreads' },
  { index: 12, id: 'chapterOutline', name: 'Chapter Flesh-Out',        nextPrompt: 'chapterOutline' },
  { index: 13, id: 'critique',       name: 'Consistency & Critique',  nextPrompt: 'critique' },
  { index: 14, id: 'masterDoc',      name: 'Master Document',          nextPrompt: 'masterDoc' },
];

export const STAGE_BY_ID = Object.fromEntries(STAGE_ORDER.map(s => [s.id, s]));