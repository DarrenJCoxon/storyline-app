// FIC-A.1 — Normalized writing plan view.
//
// Single source of truth for downstream consumers (chapter cards, manuscript
// seeding, master doc, story bible, arc matrix, promise/payoff ledger,
// research register, claim ledger, figure registry, plan-vs-draft critique).
//
// Mode-aware from day one — the type is shared between fiction and
// non-fiction projects, with mode-specific fields populated only in the
// relevant branch. NF projects produce empty fiction arrays; fiction
// projects produce empty NF arrays. Downstream code reads the plan, never
// the raw `state.json`, never `state.nfStages` directly.
//
// Designed against fiction's harder shape (15 beats, scene contracts,
// multi-character arcs, plot threads) so NF fits comfortably as the
// simpler branch — this avoids the retrofit problem where an NF-shaped
// type later forces a fiction-extension hack.

import type { ProjectState, Pipeline, SubMode } from './project-state.js'

// ── Shared shapes ────────────────────────────────────────────────────────────

/** A research item the writer needs to gather, surfaced from any source. */
export interface ResearchTodoItem {
  id?: string
  description: string
  source: 'chapter' | 'evidence-stage' | 'sourcing-register' | 'research-subsystem' | 'loose'
  chapterNumber?: number | null
  sceneNumber?: number | null
  stageId?: string | null
  status: 'planned' | 'captured' | 'verified' | 'cited'
}

/** A figure (diagram / chart / cast sheet / etc.) — consumed by NF-13 and fiction visual work. */
export interface FigurePlanItem {
  id: string
  type: string
  chapterNumber?: number | null
  sectionTitle?: string | null
  purpose: string
  factualConstraints?: string
  caption?: string
  altText?: string
  sourceRights?: string
  status: 'planned' | 'generating' | 'produced' | 'accepted' | 'rejected'
  producedAssetPath?: string
  // imagePrompt + promptHistory live here once NF-13 lands; left optional for now.
  imagePrompt?: Record<string, unknown>
  promptHistory?: string[]
}

// ── Fiction shapes ───────────────────────────────────────────────────────────

/** A scene within a fiction chapter. Captures everything the current
 *  schema captures plus contract slots (FIC-B will populate the contract
 *  slots; FIC-A leaves them optional so partially-planned projects normalize
 *  cleanly). */
export interface FictionScene {
  sceneNumber: number
  pov: string | null
  location: string | null
  summary: string | null
  conflict: string | null
  whatChanges: string | null
  notes: string | null
  // Capture/render-mismatch fields (Drift D3) — currently rendered by
  // master-doc and chapter-cards but never captured. Optional in the
  // normalized view; renderers should fall back gracefully.
  timeOfDay?: string | null
  purpose?: string | null
  beats?: string | null
  estimatedWords?: number | null
  // FIC-B scene-contract slots (left undefined here; FIC-B populates).
  goal?: string
  obstacle?: string
  stakes?: string
  conflictSource?: string
  valueShiftStart?: string
  valueShiftEnd?: string
  storyTurn?: string
  beatFunction?: string
  arcFunction?: string
  threadMovement?: string
  draftStatus?: 'not-started' | 'drafting' | 'complete'
}

/** A fiction chapter with its scenes and beat assignment. */
export interface FictionChapter {
  chapterNumber: number
  chapterTitle: string | null
  beat: string | null
  estimatedWords: number | null
  scenes: FictionScene[]
}

/** A canonical Save-the-Cat beat. */
export interface FictionBeat {
  id: string
  scene: string | null
  notes: string | null
  // Beat-specific fields are kept loose — every beat shape in the schema
  // has its own slots (themeStated, threshold, midpointType, etc.).
  // Renderers that care about specific slots cast as needed.
  fields: Record<string, string | null>
}

/** A character (protagonist or supporting cast). */
export interface FictionCharacter {
  name: string
  role: string | null
  age: string | null
  occupation: string | null
  dailyLife: string | null
  want: string | null
  need: string | null
  ghost: string | null
  flaw: string | null
  coreLie: string | null
  arcDirection: string | null
  voice: string | null
  isProtagonist: boolean
  // Supporting-cast-only:
  relationshipToProtagonist: string | null
  arcSummary: string | null
  meetsProtagonistAt: string | null
}

/** A relationship between two characters. */
export interface FictionRelationship {
  characterA: string
  characterB: string
  connection: string | null
  conflict: string | null
  whatTheyWantFromEachOther: string | null
}

/** A plot thread. Drift D2 (`t.type` vs `t.threadType`) is normalized here —
 *  consumers always read `threadType`. */
export interface FictionPlotThread {
  id: string
  name: string
  threadType: string | null
  introducedAt: string | null
  status: string | null
  resolutionPlan: string | null
}

/** A subplot. */
export interface FictionSubplot {
  name: string
  character: string | null
  purpose: string | null
  premise: string | null
  beats: { setup?: string; complication?: string; resolution?: string } | null
}

/** B-story (parallel relationship/theme thread). */
export interface FictionBStory {
  character: string | null
  premise: string | null
  resolution: string | null
  themeConnection: string | null
  beats: Record<string, unknown>
}

// ── Non-fiction shapes ───────────────────────────────────────────────────────

/** A non-fiction chapter — a section-bearing structural unit, not a scene-bearing one.
 *  Pipeline-specific fields (`linkedPrinciple` for A, `chapterQuestion` for B,
 *  `learningObjective` for C) appear together; consumers branch on what's set. */
export interface NfChapter {
  number: number
  title: string | null
  slug: string
  /** Path the manuscript file will be seeded to (e.g. 'manuscript/01-the-shift.md'). */
  manuscriptFile: string
  /** Path the chapter card lives at (e.g. 'docs/chapters/01-the-shift.md'). */
  cardFile: string
  sections: NfChapterSection[]
  wordCountEstimate: number | null
  keyResearch: string | null
  // Pipeline-specific anchors (only one set populated, depending on pipeline):
  linkedPrinciple?: string  // pipeline A
  chapterQuestion?: string  // pipeline B
  learningObjective?: string  // pipeline C
  // Free-form chapter mission — pipeline-agnostic.
  mission?: string
}

export interface NfChapterSection {
  title: string
  type: string  // 'hook' | 'concept' | 'example' | 'evidence' | 'application' | 'summary' | etc. — kept open
  notes?: string
  keyResearch?: string
}

// ── Top-level WritingPlan ────────────────────────────────────────────────────

export interface WritingPlan {
  mode: 'fiction' | 'nonfiction' | null
  pipeline: Pipeline
  subMode: SubMode

  // Project metadata
  title: string | null
  primaryGenre: string | null
  audience: string | null
  targetWordCount: number

  // Fiction fields — populated when mode === 'fiction'; empty otherwise.
  protagonist: FictionCharacter | null
  cast: FictionCharacter[]
  relationships: FictionRelationship[]
  beats: FictionBeat[]
  bStory: FictionBStory | null
  subplots: FictionSubplot[]
  fictionChapters: FictionChapter[]
  plotThreads: FictionPlotThread[]
  logline: {
    sentence: string | null
    setup: string | null
    incitingIncident: string | null
    stakes: string | null
    resolutionHint: string | null
    antagonistQuestion: string | null
  }

  // NF fields — populated when mode === 'nonfiction'; empty otherwise.
  nfChapters: NfChapter[]

  // Cross-mode shared fields — both populate in their own way.
  researchItems: ResearchTodoItem[]
  figures: FigurePlanItem[]

  // Reserved slots for later milestones — empty until they land.
  // FIC-C populates `promises`; NF-12 populates `claims`.
  promises: unknown[]
  claims: unknown[]
}

// ── The normalizer ───────────────────────────────────────────────────────────

/** Single entry point. Branches on `state.mode` once; downstream code is
 *  mode-aware via the populated arrays, not by branching on raw state. */
export function getWritingPlan(state: ProjectState): WritingPlan {
  const mode = state.mode
  const base: WritingPlan = {
    mode,
    pipeline: state.pipeline,
    subMode: state.subMode,
    title: extractTitle(state),
    primaryGenre: state.genre?.primaryGenre ?? null,
    audience: state.genre?.audience ?? null,
    targetWordCount: state.genre?.targetWordCount ?? 80000,
    protagonist: null,
    cast: [],
    relationships: [],
    beats: [],
    bStory: null,
    subplots: [],
    fictionChapters: [],
    plotThreads: [],
    logline: {
      sentence: state.logline?.sentence ?? null,
      setup: state.logline?.setup ?? null,
      incitingIncident: state.logline?.incitingIncident ?? null,
      stakes: state.logline?.stakes ?? null,
      resolutionHint: state.logline?.resolutionHint ?? null,
      antagonistQuestion: state.logline?.antagonistQuestion ?? null,
    },
    nfChapters: [],
    researchItems: [],
    figures: [],
    promises: [],
    claims: [],
  }

  if (mode === 'fiction') {
    return populateFiction(base, state)
  }
  if (mode === 'nonfiction') {
    return populateNonfiction(base, state)
  }
  // Mode not yet picked — return the empty base. Consumers tolerate this.
  return base
}

// ── Fiction population ───────────────────────────────────────────────────────

function populateFiction(plan: WritingPlan, state: ProjectState): WritingPlan {
  plan.protagonist = state.protagonist?.name
    ? normalizeProtagonist(state.protagonist)
    : null
  plan.cast = (state.characters ?? []).map(normalizeCharacter)
  plan.relationships = ((state.relationships ?? []) as Array<Record<string, unknown>>).map(normalizeRelationship)
  plan.beats = normalizeBeats(state)
  plan.bStory = state.bStory?.character || state.bStory?.premise
    ? {
        character: state.bStory.character ?? null,
        premise: state.bStory.premise ?? null,
        resolution: state.bStory.resolution ?? null,
        themeConnection: state.bStory.themeConnection ?? null,
        beats: state.bStory.beats ?? {},
      }
    : null
  plan.subplots = ((state.subplots ?? []) as Array<Record<string, unknown>>).map(normalizeSubplot)
  plan.fictionChapters = ((state.chapterOutline ?? []) as Array<Record<string, unknown>>).map(normalizeFictionChapter)
  plan.plotThreads = ((state.plotThreads ?? []) as Array<Record<string, unknown>>).map(normalizePlotThread)
  return plan
}

function normalizeProtagonist(p: ProjectState['protagonist']): FictionCharacter {
  return {
    name: p.name ?? '',
    role: 'protagonist',
    age: p.age ?? null,
    occupation: p.occupation ?? null,
    dailyLife: p.dailyLife ?? null,
    want: p.want ?? null,
    need: p.need ?? null,
    ghost: p.ghost ?? null,
    flaw: p.flaw ?? null,
    coreLie: p.coreLie ?? null,
    arcDirection: p.arcDirection ?? null,
    voice: p.voice ?? null,
    isProtagonist: true,
    relationshipToProtagonist: null,
    arcSummary: null,
    meetsProtagonistAt: null,
  }
}

function normalizeCharacter(c: ProjectState['characters'][number]): FictionCharacter {
  return {
    name: c.name,
    role: c.role ?? null,
    age: null,
    occupation: null,
    dailyLife: null,
    want: c.want ?? null,
    need: c.need ?? null,
    ghost: c.ghost ?? null,
    flaw: c.flaw ?? null,
    coreLie: null,
    arcDirection: null,
    voice: null,
    isProtagonist: false,
    relationshipToProtagonist: c.relationshipToProtagonist ?? null,
    arcSummary: c.arcSummary ?? null,
    meetsProtagonistAt: c.meetsProtagonistAt ?? null,
  }
}

function normalizeRelationship(r: Record<string, unknown>): FictionRelationship {
  return {
    characterA: stringOr(r.characterA, ''),
    characterB: stringOr(r.characterB, ''),
    connection: stringOrNull(r.connection),
    conflict: stringOrNull(r.conflict),
    whatTheyWantFromEachOther: stringOrNull(r.whatTheyWantFromEachOther),
  }
}

function normalizeBeats(state: ProjectState): FictionBeat[] {
  const beats = state.beatSheet?.beats ?? {}
  // Use schema order from project-state.ts. This is the canonical order;
  // any drift in renderer-local BEAT_ORDER tables is FIC-A.4's job to fix.
  const order = [
    'beat01OpeningImage', 'beat02Setup', 'beat03Catalyst', 'beat04Debate',
    'beat05BreakIntoTwo', 'beat06BStory', 'beat07FunAndGames', 'beat08Midpoint',
    'beat09BadGuysCloseIn', 'beat10AllIsLost', 'beat11BlackMoment', 'beat12Beat13',
    'beat13Finale', 'beat14FinalImage', 'beat15EndCredits',
  ]
  return order.map(id => {
    const beat = (beats as Record<string, Record<string, string | null> | undefined>)[id] ?? {}
    const { scene, notes, ...rest } = beat
    return {
      id,
      scene: scene ?? null,
      notes: notes ?? null,
      fields: rest as Record<string, string | null>,
    }
  })
}

function normalizeSubplot(s: Record<string, unknown>): FictionSubplot {
  return {
    name: stringOr(s.name, ''),
    character: stringOrNull(s.character),
    purpose: stringOrNull(s.purpose),
    premise: stringOrNull(s.premise),
    beats: (s.beats && typeof s.beats === 'object')
      ? s.beats as { setup?: string; complication?: string; resolution?: string }
      : null,
  }
}

function normalizeFictionChapter(ch: Record<string, unknown>): FictionChapter {
  const scenes = Array.isArray(ch.scenes) ? ch.scenes as Array<Record<string, unknown>> : []
  return {
    chapterNumber: numberOr(ch.chapterNumber, 0),
    chapterTitle: stringOrNull(ch.chapterTitle),
    beat: stringOrNull(ch.beat),
    estimatedWords: numberOrNull(ch.estimatedWords),
    scenes: scenes.map(normalizeScene),
  }
}

function normalizeScene(sc: Record<string, unknown>): FictionScene {
  return {
    sceneNumber: numberOr(sc.sceneNumber, 0),
    pov: stringOrNull(sc.pov),
    location: stringOrNull(sc.location),
    summary: stringOrNull(sc.summary),
    conflict: stringOrNull(sc.conflict),
    whatChanges: stringOrNull(sc.whatChanges),
    notes: stringOrNull(sc.notes),
    // Capture/render-mismatch fields (Drift D3) — included for renderer compatibility.
    timeOfDay: stringOrNull(sc.timeOfDay),
    purpose: stringOrNull(sc.purpose),
    beats: stringOrNull(sc.beats),
    estimatedWords: numberOrNull(sc.estimatedWords),
    // FIC-B scene-contract slots — populated only if the project has captured them.
    goal: stringOrUndef(sc.goal),
    obstacle: stringOrUndef(sc.obstacle),
    stakes: stringOrUndef(sc.stakes),
    conflictSource: stringOrUndef(sc.conflictSource),
    valueShiftStart: stringOrUndef(sc.valueShiftStart),
    valueShiftEnd: stringOrUndef(sc.valueShiftEnd),
    storyTurn: stringOrUndef(sc.storyTurn),
    beatFunction: stringOrUndef(sc.beatFunction),
    arcFunction: stringOrUndef(sc.arcFunction),
    threadMovement: stringOrUndef(sc.threadMovement),
    draftStatus: sc.draftStatus as FictionScene['draftStatus'] | undefined,
  }
}

function normalizePlotThread(t: Record<string, unknown>): FictionPlotThread {
  // Drift D2: state was captured under either `threadType` (canonical) or
  // `type` (legacy reader). Normalize to `threadType`.
  const threadType = stringOrNull(t.threadType) ?? stringOrNull(t.type)
  return {
    id: stringOr(t.id, ''),
    name: stringOr(t.name, ''),
    threadType,
    introducedAt: stringOrNull(t.introducedAt),
    status: stringOrNull(t.status),
    resolutionPlan: stringOrNull(t.resolutionPlan),
  }
}

// ── Non-fiction population (NF-11.1 will deepen this; FIC-A.1 stubs it) ──────

function populateNonfiction(plan: WritingPlan, state: ProjectState): WritingPlan {
  // Non-fiction chapter data lives in pipeline-specific stage keys
  // (`pa-chapters` / `pb-chapters` / `pc-lessons`) under either
  // `state.nfStages[<id>]` (canonical) or `state[<id>]` (legacy extension
  // path). NF-11.0 standardizes on `state.nfStages`; this normalizer
  // already reads both for forward-compat.
  plan.nfChapters = readNfChapters(state)
  return plan
}

function readNfChapters(state: ProjectState): NfChapter[] {
  const pipeline = state.pipeline
  let stageKey: string | null = null
  if (pipeline === 'A') stageKey = 'pa-chapters'
  else if (pipeline === 'B') stageKey = 'pb-chapters'
  else if (pipeline === 'C') stageKey = 'pc-lessons'
  if (!stageKey) return []

  const stageData =
    (state.nfStages as Record<string, unknown>)?.[stageKey] ??
    (state as unknown as Record<string, unknown>)[stageKey] ??
    null
  if (!stageData || typeof stageData !== 'object') return []

  const raw = (stageData as Record<string, unknown>).chapters
    ?? (stageData as Record<string, unknown>).lessons
    ?? []
  if (!Array.isArray(raw)) return []

  return (raw as Array<Record<string, unknown>>).map((item, i) => {
    const num = numberOr(item.number ?? item.chapterNumber, i + 1)
    const title = stringOrNull(item.title ?? item.lessonTitle ?? item.chapterTitle)
    const slug = slugify(title ?? `chapter-${num}`)
    const sections = Array.isArray(item.sections) ? item.sections as Array<Record<string, unknown>> : []
    return {
      number: num,
      title,
      slug,
      manuscriptFile: `manuscript/${String(num).padStart(2, '0')}-${slug}.md`,
      cardFile: `docs/chapters/${String(num).padStart(2, '0')}-${slug}.md`,
      sections: sections.map(normalizeNfSection),
      wordCountEstimate: numberOrNull(item.wordCountEstimate ?? item.estimatedWords),
      keyResearch: stringOrNull(item.keyResearch),
      linkedPrinciple: stringOrUndef(item.linkedPrinciple),
      chapterQuestion: stringOrUndef(item.chapterQuestion),
      learningObjective: stringOrUndef(item.learningObjective),
      mission: stringOrUndef(item.mission ?? item.job),
    }
  })
}

function normalizeNfSection(s: Record<string, unknown>): NfChapterSection {
  return {
    title: stringOr(s.title, ''),
    type: stringOr(s.type, 'body'),
    notes: stringOrUndef(s.notes ?? s.purpose),
    keyResearch: stringOrUndef(s.keyResearch),
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractTitle(state: ProjectState): string | null {
  const meta = state._meta as Record<string, unknown>
  return (meta?.projectTitle as string | undefined) ?? null
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}
function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}
function stringOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}
function numberOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
