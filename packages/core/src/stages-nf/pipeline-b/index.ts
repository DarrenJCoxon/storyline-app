// @ts-nocheck
// Pipeline B — Narrative Non-Fiction (Popular Science/History, True Crime)
// 10 stages. Structural fork at Stage 4: 'idea-led' | 'event-led'

import { getPipelineBGuide } from '../../ai/stage-guides-nf-pipeline-b.js';
import { critiquePipelineBStage, buildPipelineBCritiqueSummary } from '../../ai/narrative-voice-nf.js';

export const PIPELINE_B_STAGES = [
  { index: 1,  id: 'pb-thesis',    name: 'Central Question / Thesis',   subModes: null },
  { index: 2,  id: 'pb-cast',      name: 'Cast of Real People',         subModes: null },
  { index: 3,  id: 'pb-timeline',  name: 'Timeline',                    subModes: null },
  { index: 4,  id: 'pb-fork',      name: 'Structural Fork',             subModes: null },
  { index: 5,  id: 'pb-scenes',    name: 'Scene List',                  subModes: null },
  { index: 6,  id: 'pb-sourcing',  name: 'Sourcing Register',           subModes: null },
  { index: 7,  id: 'pb-theme',     name: 'Thematic Through-Line',       subModes: null },
  { index: 8,  id: 'pb-chapters',  name: 'Chapter Outline',             subModes: null },
  { index: 9,  id: 'pb-critique',  name: 'Consistency & Critique',      subModes: null },
  { index: 10, id: 'pb-master',    name: 'Master Document',             subModes: null },
];

export const PIPELINE_B_BY_ID = Object.fromEntries(PIPELINE_B_STAGES.map(s => [s.id, s]));

export async function runStage(stageId, state) {
  const stage = PIPELINE_B_BY_ID[stageId];
  if (!stage) return { error: `Unknown Pipeline B stage: ${stageId}` };

  const guide = getPipelineBGuide(stageId);
  const stageData = state?.nfStages?.[stageId] || {};
  const subMode = state?.subMode || null;

  const critique = state ? buildPipelineBCritiqueSummary(stageId, stageData, state.nfStages || {}) : null;

  return {
    status: 'ok',
    stage,
    guide,
    currentData: stageData,
    critique,
    stateSnapshot: state ? {
      mode: state.mode,
      pipeline: state.pipeline,
      subMode,
    } : null,
  };
}
