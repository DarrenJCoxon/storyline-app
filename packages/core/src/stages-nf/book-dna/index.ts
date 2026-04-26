// @ts-nocheck
// Book DNA — Phase 0 stages (all 12, shared across all NF pipelines)
// runStage returns the stage guide + current state data from nfStages.
// Category routing (Stage 1) infers pipeline and writes state.pipeline.

import { getNfDnaGuide, inferPipelineFromCategory } from '../../ai/stage-guides-nf-dna.js';
import { critiqueBookDnaStage, buildCritiqueSummary } from '../../ai/narrative-voice-nf.js';

export const BOOK_DNA_STAGES = [
  { index: 1,  id: 'dna-category',     name: 'Category & Market Positioning' },
  { index: 2,  id: 'dna-reader',       name: 'Reader Avatar' },
  { index: 3,  id: 'dna-transform',    name: 'Reader Transformation' },
  { index: 4,  id: 'dna-idea',         name: 'The One Big Idea' },
  { index: 5,  id: 'dna-author',       name: 'Author Angle & Authority' },
  { index: 6,  id: 'dna-promise',      name: 'Core Promise & Subtitle Engineering' },
  { index: 7,  id: 'dna-comps',        name: 'Comps Deep Dive' },
  { index: 8,  id: 'dna-voice',        name: 'Voice & Tone' },
  { index: 9,  id: 'dna-evidence',     name: 'Evidence Philosophy' },
  { index: 10, id: 'dna-commercial',   name: 'Commercial Model' },
  { index: 11, id: 'dna-title',        name: 'Working Title Pressure-Test' },
  { index: 12, id: 'dna-consolidate',  name: 'Book DNA Consolidation' },
];

export const BOOK_DNA_BY_ID = Object.fromEntries(BOOK_DNA_STAGES.map(s => [s.id, s]));

// Returns the guide + current data + critique for a given stage
export async function runStage(stageId, state) {
  const stage = BOOK_DNA_BY_ID[stageId];
  if (!stage) return { error: `Unknown Book DNA stage: ${stageId}` };

  const guide = getNfDnaGuide(stageId);
  const stageData = state?.nfStages?.[stageId] || {};
  const allDnaData = state?.nfStages || {};

  // For dna-category: annotate with inferred pipeline based on saved data
  let inferredPipeline = null;
  if (stageId === 'dna-category' && stageData.primaryCategory) {
    inferredPipeline = inferPipelineFromCategory(stageData.primaryCategory);
    stageData._inferredPipeline = inferredPipeline;
  }

  const critique = state ? buildCritiqueSummary(stageId, stageData, allDnaData) : null;

  return {
    status: 'ok',
    stage,
    guide,
    currentData: stageData,
    critique,
    inferredPipeline,
    stateSnapshot: state ? {
      mode: state.mode,
      pipeline: state.pipeline,
      subMode: state.subMode,
    } : null,
  };
}

// After saving dna-category, derive and return the suggested pipeline
export function derivePipelineFromCategoryData(categoryData) {
  if (!categoryData?.primaryCategory) return null;
  return inferPipelineFromCategory(categoryData.primaryCategory);
}
