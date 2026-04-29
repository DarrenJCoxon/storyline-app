export type {
  Mode, Pipeline, SubMode, BookType, ProjectState, StageEntry,
  Beat, BeatSheet, Protagonist, Character,
} from './state/project-state.js'
export type { ClaimEvidenceItem, ImagePrompt } from './state/writing-plan.js'
export type { ClaimLedgerResult } from './output/claim-evidence-ledger.js'
export { generateClaimEvidenceLedger } from './output/claim-evidence-ledger.js'
export type { FigureRegistryResult } from './output/figure-registry.js'
export { generateFigureRegistry } from './output/figure-registry.js'
export type { FigureContext, BookContext } from './output/figure-prompt-synthesizer.js'
export { synthesizeImagePrompt } from './output/figure-prompt-synthesizer.js'
export {
  DEFAULT_STATE,
  STAGE_ORDER, STAGE_BY_ID,
  NF_STAGE_ORDER, NF_STAGE_BY_ID,
  NF_DNA_STAGE_ORDER,
  NF_PIPELINE_A_STAGE_ORDER,
  NF_PIPELINE_B_STAGE_ORDER,
  NF_PIPELINE_C_STAGE_ORDER,
  NF_ACADEMIC_DNA_STAGE_ORDER,
  NF_ACADEMIC_STAGE_ORDER,
  stageOrderFor,
} from './state/project-state.js'
export {
  deriveCurrentStage, calculateProgress,
  checkStageGate, getMissingRequirements, getDownstreamImpacts, isStageComplete,
} from './state/transitions.js'
export type { GateResult } from './state/transitions.js'
export { getWritingPlan } from './state/writing-plan.js'
export type {
  WritingPlan,
  FictionScene, FictionChapter, FictionBeat, FictionCharacter,
  FictionRelationship, FictionPlotThread, FictionSubplot, FictionBStory,
  FictionLocation, FictionRecurringObject, FictionContinuityFact, FictionStoryBible,
  CharacterArcRow, FictionArcMatrix,
  NfChapter, NfChapterSection,
  ResearchTodoItem, FigurePlanItem,
  AcademicPlan, AcademicChapter, AcademicLearningOutcome,
  AcademicWorkedExample, AcademicExercise,
} from './state/writing-plan.js'
export type { StageGuide, StageQuestion, BeatEntry } from './ai/stage-guides.js'
export { STAGE_GUIDES, GENRE_VARIANTS, getStageGuide, buildSystemPrompt } from './ai/stage-guides.js'
export type { NfDnaGuide } from './ai/stage-guides-nf-dna.js'
export {
  NF_DNA_GUIDES, NF_DNA_GUIDE_ORDER, CATEGORY_PIPELINE_MAP,
  getNfDnaGuide, inferPipelineFromCategory,
} from './ai/stage-guides-nf-dna.js'
export type { NfPipelineGuide } from './ai/stage-guides-nf-pipeline-a.js'
export { PIPELINE_A_GUIDES, PIPELINE_A_GUIDE_ORDER, getPipelineAGuide } from './ai/stage-guides-nf-pipeline-a.js'
export { PIPELINE_B_GUIDES, PIPELINE_B_GUIDE_ORDER, getPipelineBGuide } from './ai/stage-guides-nf-pipeline-b.js'
export { PIPELINE_C_GUIDES, PIPELINE_C_GUIDE_ORDER, getPipelineCGuide } from './ai/stage-guides-nf-pipeline-c.js'
export type { AcademicGuide } from './ai/stage-guides-nf-academic.js'
export { ACADEMIC_GUIDES, ACADEMIC_GUIDE_ORDER, getAcademicGuide } from './ai/stage-guides-nf-academic.js'

import { getNfDnaGuide as _getNfDnaGuide } from './ai/stage-guides-nf-dna.js'
import { getPipelineAGuide as _gA } from './ai/stage-guides-nf-pipeline-a.js'
import { getPipelineBGuide as _gB } from './ai/stage-guides-nf-pipeline-b.js'
import { getPipelineCGuide as _gC } from './ai/stage-guides-nf-pipeline-c.js'
import { getAcademicGuide as _gAc } from './ai/stage-guides-nf-academic.js'
import type { NfDnaGuide as _NfDnaGuide } from './ai/stage-guides-nf-dna.js'
import { getStageGuide as _getStageGuideRaw } from './ai/stage-guides.js'
import { isStageComplete as _isStageCompleteInternal, hasTransitionRequirement as _hasTransitionRequirement } from './state/transitions.js'

/** Look up an NF stage guide by id across DNA + all 3 pipelines (including academic). */
export function getNfStageGuide(stageId: string): _NfDnaGuide | null {
  return _getNfDnaGuide(stageId) ?? _gA(stageId) ?? _gB(stageId) ?? _gC(stageId) ?? (_gAc(stageId) as unknown as _NfDnaGuide) ?? null
}

/**
 * Return the list of required field keys for a stage (fiction or NF).
 * Used to gate saves: a stage cannot be marked complete unless every
 * required field has a non-empty value in the patch + existing state.
 */
export function getRequiredFieldsForStage(stageId: string, mode: 'fiction' | 'nonfiction' | undefined): string[] {
  const guide = mode === 'nonfiction' ? getNfStageGuide(stageId) : _getStageGuideRaw(stageId)
  if (!guide) return []
  const out: string[] = []
  const g = guide as { questions?: Array<{ key: string; required?: boolean }>; sections?: Array<{ questions?: Array<{ key: string; required?: boolean }> }>; repeatable?: { fields?: Array<{ key: string; required?: boolean }> } }
  for (const q of g.questions ?? []) if (q.required) out.push(q.key)
  for (const s of g.sections ?? []) for (const q of s.questions ?? []) if (q.required) out.push(q.key)
  // Repeatable fields are aggregated separately — we treat the array's
  // existence as the requirement, not individual repeatable keys.
  return out
}

/**
 * Single authoritative gate used to decide whether a stage save can be
 * marked complete and the planner advanced. Works for fiction and NF.
 *
 * Fiction stages with declarative requirements in transitions.ts (genre,
 * premise, protagonist, characters[], beatSheet beats, sceneOutline,
 * chapterOutline, etc.) use that. Other stages, including all NF stages,
 * use the stage guide's required-field list — every required field must
 * be present and non-empty in the corresponding state slot.
 *
 * Returns { complete, missing } so callers can surface what's missing.
 */
export function gateStageSave(
  stageId: string,
  state: import('./state/project-state.js').ProjectState,
): { complete: boolean; missing: string[] } {
  const mode: 'fiction' | 'nonfiction' = state.mode === 'nonfiction' ? 'nonfiction' : 'fiction'

  // Fiction with declarative transitions.ts requirement → use that
  if (mode === 'fiction' && _hasTransitionRequirement(stageId)) {
    const ok = _isStageCompleteInternal(stageId, state)
    if (ok) return { complete: true, missing: [] }
    // Couldn't satisfy the predicate — surface the field-level requirements
    // from the guide as a best-effort hint to the AI.
    return { complete: false, missing: getRequiredFieldsForStage(stageId, mode) }
  }

  // NF and lightweight fiction stages → check the guide's required fields
  // directly against the corresponding stage data slot in state.
  const required = getRequiredFieldsForStage(stageId, mode)
  if (required.length === 0) {
    // No declarative requirement → respect explicit completed flag
    return { complete: !!state.stages?.[stageId]?.completed, missing: [] }
  }

  const stageData = (state as unknown as Record<string, Record<string, unknown> | undefined>)[stageId] ?? {}
  const missing = required.filter(key => _isEmpty(stageData?.[key]))
  return { complete: missing.length === 0, missing }
}

function _isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim().length === 0 || v.trim() === '...'
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

// NF critique layer (book DNA + all 3 pipelines)
export {
  critiqueBookDnaStage,
  critiquePipelineAStage,
  critiquePipelineBStage,
  critiquePipelineCStage,
  buildCritiqueSummary,
  buildPipelineACritiqueSummary,
  buildPipelineBCritiqueSummary,
  buildPipelineCCritiqueSummary,
  formatCritique,
  hasBlockingErrors,
} from './ai/narrative-voice-nf.js'

// Research subsystem
export {
  SCHEMA_VERSION, RELIABILITY_TIERS, VERIFICATION_STATES, ITEM_SUBTYPES,
} from './research/schema.js'
export {
  addItem, getItem, editItem, removeItem, listItems,
} from './research/capture.js'
export { addLink, buildLinkSummary } from './research/linker.js'
export { buildRetrievalPayload, searchItems } from './research/retrieval.js'
export { analyzeGaps, formatGapsReport } from './research/critique.js'
export { rebuildIndex, syncResearchToMemory } from './research/index.js'
export {
  formatChicago, formatAPA, formatMLA,
  generateBibliography, generateEndnotesForChapter, generateAllEndnotes,
  generateFactCheckReport,
} from './research/compile.js'

// Memory helpers (used by research index + critique layer)
export { appendMemoryLog } from './memory/stage-memory.js'
export type { TrapResult, TrapSeverity } from './ai/story-traps.js'
export { runStoryTraps } from './ai/story-traps.js'
export type { Persona, QualityCheck } from './ai/coaching-personas.js'
export { PERSONAS, getPersonaForStage, runQualityChecklist, formatPersonaIntro } from './ai/coaching-personas.js'
export type { SeriesIndicator, SeriesPotentialResult } from './ai/series-detector.js'
export { detectSeriesPotential } from './ai/series-detector.js'
export { writeStageDoc } from './output/stage-doc.js'
export type { MasterDocResult } from './output/master-doc.js'
export { generateMasterDocument } from './output/master-doc.js'
export { seedManuscriptFromPlan, seedChapterContent, chapterManuscriptPath, seedNfChapterContent, nfChapterManuscriptPath, MANUSCRIPT_SEED_MARKER } from './scaffold/manuscript-seeder.js'
export { seedSyllabiFolder, readSyllabiFiles } from './scaffold/academic-scaffold.js'
export type { PromisePayoffItem, PromiseType, PromiseStatus, PromiseRisk } from './state/writing-plan.js'
export type { NfCritiqueFinding, FictionPromiseGap } from './critique/promise-payoff.js'
export { checkNfPromisePayoff, findFictionPromiseGaps } from './critique/promise-payoff.js'
export type { LedgerResult } from './output/promise-payoff-ledger.js'
export { generatePromisePayoffLedger } from './output/promise-payoff-ledger.js'
export type { StoryBibleResult } from './output/story-bible.js'
export { generateStoryBible } from './output/story-bible.js'
export type { ArcMatrixResult } from './output/character-arc-matrix.js'
export { generateCharacterArcMatrix } from './output/character-arc-matrix.js'
export type { NfMasterDocResult } from './output/nf-master-doc.js'
export { generateNfMasterDocument } from './output/nf-master-doc.js'
export type { ResearchTodoResult } from './output/research-todo.js'
export { generateResearchTodo } from './output/research-todo.js'
