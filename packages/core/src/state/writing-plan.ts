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

/** A tracked factual claim — NF-12. Populated from pa-evidence / pb-sourcing stages. */
export interface ClaimEvidenceItem {
  id: string
  claimText: string
  chapterNumber: number | null
  sectionTitle: string | null
  evidenceType: 'study' | 'case-study' | 'data' | 'interview' | 'personal' | 'sourced-claim' | 'unparsed'
  sources: string[]
  confidence: 'primary' | 'secondary' | 'anecdotal' | 'unknown'
  risk: 'high' | 'medium' | 'low'
  citationNeeded: boolean
  verificationState: 'planned' | 'sourced' | 'captured' | 'verified' | 'cited'
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
 *  consumers always read `threadType`.
 *  FIC-C.2 adds dossier fields; old projects get sensible defaults. */
export interface FictionPlotThread {
  id: string
  name: string
  threadType: string | null
  introducedAt: string | null
  status: string | null
  resolutionPlan: string | null
  // FIC-C.2 dossier fields — undefined for old-shape projects
  introducedScene: string | null
  developedScenes: string | null
  plannedResolutionScene: string | null
  payoffScene: string | null
  unresolvedRisk: boolean
  linkedPromises: string[]
  // Computed during normalisation from scene contracts
  lastTouchedChapter: number | null
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

// ── Story-bible shapes (FIC-D.1) ─────────────────────────────────────────────

/** A location derived from scene `location` fields, with the chapters that use it. */
export interface FictionLocation {
  name: string
  chapters: number[]
}

/** A recurring object the writer has explicitly captured (writer-provided, not derived). */
export interface FictionRecurringObject {
  name: string
  notes: string | null
}

/** A continuity fact the writer has explicitly captured. */
export interface FictionContinuityFact {
  fact: string
  chapter: number | null
}

/** Derived story-bible data — populated by normalizer; consumed by story-bible renderer. */
export interface FictionStoryBible {
  locations: FictionLocation[]
  recurringObjects: FictionRecurringObject[]
  continuityFacts: FictionContinuityFact[]
}

// ── Arc-matrix shapes (FIC-D.3) ──────────────────────────────────────────────

/** A single character's arc across the book. */
export interface CharacterArcRow {
  characterName: string
  role: string | null
  want: string | null
  need: string | null
  /** The character's core lie / false belief. */
  lie: string | null
  /** The character's ghost / wound. */
  wound: string | null
  /** Chapter numbers where this character appears as POV (derived from scene data). */
  chapterPresence: number[]
  /** Beat IDs where beats explicitly mention/pressure this character. */
  beatPressure: string[]
  midpointShift: string | null
  allIsLostImpact: string | null
  finaleChoice: string | null
  finalState: string | null
}

/** Derived arc-matrix — one row per protagonist/major supporting character. */
export interface FictionArcMatrix {
  characters: CharacterArcRow[]
}

// ── Promise / payoff shapes ──────────────────────────────────────────────────

export type PromiseType =
  | 'clue'
  | 'secret'
  | 'wound'
  | 'weapon-on-the-wall'
  | 'prophecy'
  | 'romance-beat'
  | 'subplot'
  | 'genre-promise'

export type PromiseStatus = 'planned' | 'set-up' | 'paid-off' | 'unresolved'
export type PromiseRisk = 'low' | 'medium' | 'high'

/** A tracked narrative promise — something the writer has signalled to the
 *  reader that must eventually be paid off. Detected from plot threads and
 *  scene contracts; updated as the draft progresses. */
export interface PromisePayoffItem {
  id: string
  type: PromiseType
  description: string
  setupChapter: number | null
  setupScene: number | null
  plannedPayoffChapter: number | null
  plannedPayoffScene: number | null
  actualPayoffChapter: number | null
  actualPayoffScene: number | null
  status: PromiseStatus
  risk: PromiseRisk
  notes: string | null
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
  keyResearch: string | null  // unified: populated from keyResearch, keyEvidence, or sourcingNote
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

  // NF promise-payoff fields — populated for nonfiction projects only.
  // Used by the shared checkNfPromisePayoff detector in core/critique/.
  nfPromise: {
    corePromise: string | null
    subtitleDraft: string | null
    endStateMeasurableOutcome: string | null
    // Pipeline A fields needed for subtitle-delivery check (byte-identical with
    // original critique-api.js:checkPromisePayoff).
    paThesisText: string | null
    paFrameworkName: string | null
  } | null

  // FIC-C: fiction promise/payoff items detected from plot threads + scene contracts.
  // NF-12 populates `claims` (separate vocabulary — see 00-overview.md).
  promises: PromisePayoffItem[]
  claims: ClaimEvidenceItem[]

  // FIC-D: derived artefact data — populated for fiction projects; null otherwise.
  storyBible: FictionStoryBible | null
  arcMatrix: FictionArcMatrix | null
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
    nfPromise: null,
    promises: [],
    claims: [],
    storyBible: null,
    arcMatrix: null,
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
  const rawThreads = ((state.plotThreads ?? []) as Array<Record<string, unknown>>)
  plan.plotThreads = rawThreads.map(t => normalizePlotThread(t, plan.fictionChapters))
  plan.promises = detectFictionPromises(plan.plotThreads, plan.fictionChapters)
  plan.storyBible = deriveStoryBible(plan.fictionChapters)
  plan.arcMatrix = deriveArcMatrix(plan.protagonist, plan.cast, plan.fictionChapters, plan.beats)
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

function normalizePlotThread(t: Record<string, unknown>, chapters: FictionChapter[]): FictionPlotThread {
  // Drift D2: state was captured under either `threadType` (canonical) or
  // `type` (legacy reader). Normalize to `threadType`.
  const threadType = stringOrNull(t.threadType) ?? stringOrNull(t.type)
  const name = stringOr(t.name, '')
  const id = stringOr(t.id, '')
  return {
    id,
    name,
    threadType,
    introducedAt: stringOrNull(t.introducedAt),
    status: stringOrNull(t.status),
    resolutionPlan: stringOrNull(t.resolutionPlan),
    // FIC-C.2 dossier fields
    introducedScene: stringOrNull(t.introducedScene),
    developedScenes: stringOrNull(t.developedScenes),
    plannedResolutionScene: stringOrNull(t.plannedResolutionScene),
    payoffScene: stringOrNull(t.payoffScene),
    unresolvedRisk: t.unresolvedRisk === true,
    linkedPromises: Array.isArray(t.linkedPromises)
      ? (t.linkedPromises as unknown[]).map(s => String(s))
      : [],
    lastTouchedChapter: computeLastTouchedChapter(name, id, chapters),
  }
}

function computeLastTouchedChapter(threadName: string, threadId: string, chapters: FictionChapter[]): number | null {
  let last: number | null = null
  const needle = threadName.toLowerCase()
  const needleId = threadId.toLowerCase()
  for (const ch of chapters) {
    for (const sc of ch.scenes) {
      const tm = (sc.threadMovement ?? '').toLowerCase()
      if (tm && (tm.includes(needle) || tm.includes(needleId))) {
        if (last === null || ch.chapterNumber > last) last = ch.chapterNumber
      }
    }
  }
  return last
}

// ── FIC-D derivations ────────────────────────────────────────────────────────

function deriveStoryBible(chapters: FictionChapter[]): FictionStoryBible {
  const locMap = new Map<string, Set<number>>()
  for (const ch of chapters) {
    for (const sc of ch.scenes) {
      const loc = sc.location?.trim()
      if (loc) {
        if (!locMap.has(loc)) locMap.set(loc, new Set())
        locMap.get(loc)!.add(ch.chapterNumber)
      }
    }
  }
  const locations: FictionLocation[] = Array.from(locMap.entries())
    .map(([name, chSet]) => ({ name, chapters: [...chSet].sort((a, b) => a - b) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { locations, recurringObjects: [], continuityFacts: [] }
}

function deriveArcMatrix(
  protagonist: FictionCharacter | null,
  cast: FictionCharacter[],
  chapters: FictionChapter[],
  beats: FictionBeat[],
): FictionArcMatrix {
  const rows: CharacterArcRow[] = []

  function povChapters(name: string): number[] {
    const lower = name.toLowerCase()
    const seen = new Set<number>()
    for (const ch of chapters) {
      for (const sc of ch.scenes) {
        if (sc.pov && sc.pov.toLowerCase().includes(lower)) {
          seen.add(ch.chapterNumber)
          break
        }
      }
    }
    return [...seen].sort((a, b) => a - b)
  }

  function pressureBeats(name: string): string[] {
    const lower = name.toLowerCase()
    return beats
      .filter(b => {
        const text = [b.scene ?? '', b.notes ?? '', ...Object.values(b.fields).map(v => v ?? '')].join(' ').toLowerCase()
        return text.includes(lower)
      })
      .map(b => b.id)
  }

  function beatNotes(id: string): string | null {
    const b = beats.find(bt => bt.id === id)
    if (!b) return null
    return b.notes ?? b.scene ?? null
  }

  if (protagonist) {
    rows.push({
      characterName: protagonist.name,
      role: 'protagonist',
      want: protagonist.want,
      need: protagonist.need,
      lie: protagonist.coreLie,
      wound: protagonist.ghost,
      chapterPresence: povChapters(protagonist.name),
      beatPressure: pressureBeats(protagonist.name),
      midpointShift: beatNotes('beat08Midpoint'),
      allIsLostImpact: beatNotes('beat10AllIsLost'),
      finaleChoice: beatNotes('beat13Finale'),
      finalState: beatNotes('beat14FinalImage'),
    })
  }

  for (const char of cast) {
    const hasArcFields = char.want || char.need || char.ghost || char.flaw || char.arcSummary
    if (!hasArcFields) continue
    rows.push({
      characterName: char.name,
      role: char.role,
      want: char.want,
      need: char.need,
      lie: char.coreLie,
      wound: char.ghost,
      chapterPresence: povChapters(char.name),
      beatPressure: pressureBeats(char.name),
      midpointShift: null,
      allIsLostImpact: null,
      finaleChoice: null,
      finalState: char.arcSummary,
    })
  }

  return { characters: rows }
}

// ── Fiction promise detection ────────────────────────────────────────────────

const THREAD_TYPE_TO_PROMISE_TYPE: Record<string, PromiseType> = {
  mystery:       'clue',
  'character-arc': 'wound',
  romance:       'romance-beat',
  prophecy:      'prophecy',
  'world-building': 'genre-promise',
}

function inferPromiseType(threadType: string | null): PromiseType {
  if (!threadType) return 'subplot'
  return THREAD_TYPE_TO_PROMISE_TYPE[threadType.toLowerCase()] ?? 'subplot'
}

function inferPromiseRisk(thread: FictionPlotThread): PromiseRisk {
  if (thread.unresolvedRisk) return 'high'
  if (thread.payoffScene) return 'low'
  if (thread.resolutionPlan || thread.plannedResolutionScene) return 'medium'
  if (thread.status === 'resolved') return 'low'
  return 'high'
}

function inferPromiseStatus(thread: FictionPlotThread): PromiseStatus {
  if (thread.status === 'resolved' && thread.payoffScene) return 'paid-off'
  if (thread.resolutionPlan || thread.plannedResolutionScene) return 'planned'
  if (thread.lastTouchedChapter !== null) return 'set-up'
  return 'unresolved'
}

function parseChapterRef(ref: string | null): number | null {
  if (!ref) return null
  const m = ref.match(/\d+/)
  return m ? parseInt(m[0], 10) : null
}

function detectFictionPromises(threads: FictionPlotThread[], _chapters: FictionChapter[]): PromisePayoffItem[] {
  return threads.map((thread, i) => {
    const setupChapter = parseChapterRef(thread.introducedAt)
    const payoffChapter = parseChapterRef(thread.plannedResolutionScene ?? thread.payoffScene)
    return {
      id: thread.id || `promise-${i + 1}`,
      type: inferPromiseType(thread.threadType),
      description: thread.name,
      setupChapter,
      setupScene: null,
      plannedPayoffChapter: payoffChapter,
      plannedPayoffScene: null,
      actualPayoffChapter: thread.payoffScene ? payoffChapter : null,
      actualPayoffScene: null,
      status: inferPromiseStatus(thread),
      risk: inferPromiseRisk(thread),
      notes: thread.resolutionPlan,
    }
  })
}

// ── Non-fiction population (NF-11.1 will deepen this; FIC-A.1 stubs it) ──────

function populateNonfiction(plan: WritingPlan, state: ProjectState): WritingPlan {
  // Non-fiction chapter data lives in pipeline-specific stage keys
  // (`pa-chapters` / `pb-chapters` / `pc-lessons`) under either
  // `state.nfStages[<id>]` (canonical) or `state[<id>]` (legacy extension
  // path). NF-11.0 standardizes on `state.nfStages`; this normalizer
  // already reads both for forward-compat.
  plan.nfChapters = readNfChapters(state)
  plan.nfPromise = readNfPromise(state)
  plan.claims = readClaims(state, plan.nfChapters)
  return plan
}

function readNfPromise(state: ProjectState): WritingPlan['nfPromise'] {
  const nf = (state.nfStages ?? {}) as Record<string, Record<string, unknown>>
  const top = state as unknown as Record<string, Record<string, unknown>>
  function stage(key: string): Record<string, unknown> {
    return (nf[key] ?? top[key] ?? {}) as Record<string, unknown>
  }
  const dnaPromise = stage('dna-promise')
  const corePromise = stringOrNull(dnaPromise.corePromise)
  if (!corePromise) return null
  const pcEndState = stage('pc-end-state')
  const paThesis = stage('pa-thesis')
  const paFramework = stage('pa-framework')
  return {
    corePromise,
    subtitleDraft: stringOrNull(dnaPromise.subtitleDraft),
    endStateMeasurableOutcome: stringOrNull(pcEndState.measurableOutcome),
    paThesisText: stringOrNull(paThesis.thesis),
    paFrameworkName: stringOrNull(paFramework.modelName),
  }
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
      keyResearch: stringOrNull(item.keyResearch ?? item.keyEvidence ?? item.sourcingNote),
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

// ── NF-12 claim extraction ────────────────────────────────────────────────────

function readClaims(state: ProjectState, nfChapters: NfChapter[]): ClaimEvidenceItem[] {
  const claims: ClaimEvidenceItem[] = []
  const nf = (state.nfStages ?? {}) as Record<string, Record<string, unknown>>
  const top = state as unknown as Record<string, Record<string, unknown>>
  function stg(key: string): Record<string, unknown> {
    return (nf[key] ?? top[key] ?? {}) as Record<string, unknown>
  }

  // Pipeline A: structured evidence items from pa-evidence.evidenceByPrinciple
  const paEvidence = stg('pa-evidence')
  const byPrinciple = Array.isArray(paEvidence.evidenceByPrinciple)
    ? paEvidence.evidenceByPrinciple as Array<Record<string, unknown>>
    : []
  for (const group of byPrinciple) {
    const principleNum = group.principleNumber as number
    const chapterNumber = nfChapters.find(ch =>
      String(ch.linkedPrinciple) === String(principleNum),
    )?.number ?? null
    const items = Array.isArray(group.evidenceItems)
      ? group.evidenceItems as Array<Record<string, unknown>>
      : []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const evType = normalizeEvidenceType(stringOr(item.type, ''))
      const confidence = normalizeConfidence(stringOr(item.strength, ''))
      const verificationState = 'planned' as const
      claims.push({
        id: `ev-p${principleNum}-${i + 1}`,
        claimText: stringOr(item.supportsTheClaim ?? item.claim, '(unlabelled claim)'),
        chapterNumber,
        sectionTitle: null,
        evidenceType: evType,
        sources: item.source ? [String(item.source)] : [],
        confidence,
        risk: deriveClaimRisk(confidence, verificationState),
        citationNeeded: ['study', 'case-study', 'data', 'sourced-claim'].includes(evType),
        verificationState,
      })
    }
  }

  // All pipelines: chapter-level keyResearch (normalised from keyResearch / keyEvidence / sourcingNote)
  for (const ch of nfChapters) {
    if (!ch.keyResearch) continue
    claims.push({
      id: `ch${ch.number}-evidence`,
      claimText: ch.keyResearch,
      chapterNumber: ch.number,
      sectionTitle: null,
      evidenceType: 'unparsed',
      sources: [],
      confidence: 'unknown',
      risk: 'high',
      citationNeeded: true,
      verificationState: 'planned',
    })
  }

  return claims
}

function normalizeEvidenceType(t: string): ClaimEvidenceItem['evidenceType'] {
  const map: Record<string, ClaimEvidenceItem['evidenceType']> = {
    study: 'study',
    'case-study': 'case-study',
    'case study': 'case-study',
    data: 'data',
    interview: 'interview',
    personal: 'personal',
    'sourced-claim': 'sourced-claim',
    'sourced claim': 'sourced-claim',
  }
  return map[t.toLowerCase()] ?? 'unparsed'
}

function normalizeConfidence(s: string): ClaimEvidenceItem['confidence'] {
  const map: Record<string, ClaimEvidenceItem['confidence']> = {
    primary: 'primary',
    'peer-reviewed': 'primary',
    secondary: 'secondary',
    anecdotal: 'anecdotal',
  }
  return map[s.toLowerCase()] ?? 'unknown'
}

function deriveClaimRisk(
  confidence: ClaimEvidenceItem['confidence'],
  verificationState: ClaimEvidenceItem['verificationState'],
): ClaimEvidenceItem['risk'] {
  if (verificationState === 'verified' || verificationState === 'cited') return 'low'
  if (confidence === 'primary') return 'low'
  if (confidence === 'anecdotal' || confidence === 'unknown') return 'high'
  return 'medium'
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
