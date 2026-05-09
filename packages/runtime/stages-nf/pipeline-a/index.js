// Pipeline A — Prescriptive (Self-Help, Business, Health, Money, Relationships)
// 11 stages. Sub-mode fork at Stage 3: 'argument' | 'braid'
// Stage 7 (pa-braid) is only active in braid mode.

import { getPipelineAGuide } from '../../ai/stage-guides-nf-pipeline-a.js';
import { critiquePipelineAStage, buildPipelineACritiqueSummary } from '../../ai/narrative-voice-nf.js';

export const PIPELINE_A_STAGES = [
  { index: 1,  id: 'pa-thesis',       name: 'Core Thesis',              subModes: null },
  { index: 2,  id: 'pa-objections',   name: 'Reader Objections',        subModes: null },
  { index: 3,  id: 'pa-framework',    name: 'Framework Design',         subModes: null },
  { index: 4,  id: 'pa-principles',   name: 'Principles / Laws',        subModes: null },
  { index: 5,  id: 'pa-evidence',     name: 'Evidence Map',             subModes: null },
  { index: 6,  id: 'pa-application',  name: 'Application Layer',        subModes: null },
  { index: 7,  id: 'pa-braid',        name: 'Narrative Braid',          subModes: ['braid'] },
  { index: 8,  id: 'pa-chapters',     name: 'Chapter Plan',             subModes: null },
  { index: 9,  id: 'pa-opener',       name: 'Opener & Closer Design',   subModes: null },
  { index: 10, id: 'pa-critique',     name: 'Consistency & Critique',   subModes: null },
  { index: 11, id: 'pa-master',       name: 'Master Document',          subModes: null },
];

export const PIPELINE_A_BY_ID = Object.fromEntries(PIPELINE_A_STAGES.map(s => [s.id, s]));

// Active stages filtered by subMode — braid stage only shows in braid mode
export function getActiveStages(subMode) {
  return PIPELINE_A_STAGES.filter(s =>
    !s.subModes || s.subModes.includes(subMode),
  );
}

export async function runStage(stageId, state) {
  const stage = PIPELINE_A_BY_ID[stageId];
  if (!stage) return { error: `Unknown Pipeline A stage: ${stageId}` };

  const guide = getPipelineAGuide(stageId);
  const stageData = state?.nfStages?.[stageId] || {};
  const subMode = state?.subMode || 'argument';

  // If this stage is braid-only and subMode isn't braid, skip it
  if (stage.subModes && !stage.subModes.includes(subMode)) {
    return {
      status: 'skipped',
      stage,
      reason: `pa-braid is only active in braid mode. Current sub-mode: ${subMode}`,
    };
  }

  const critique = state ? buildPipelineACritiqueSummary(stageId, stageData, state.nfStages || {}) : null;

  return {
    status: 'ok',
    stage,
    guide,
    currentData: stageData,
    critique,
    stateSnapshot: state ? {
      mode: state.mode,
      pipeline: state.pipeline,
      subMode: state.subMode,
    } : null,
  };
}

// Extract framework block from pa-framework stage data (for NF-04 Framework Card)
export function extractFrameworkFromStage(nfStages) {
  const fw = nfStages?.['pa-framework'];
  if (!fw?.modelName) return null;
  return {
    title:       fw.title || nfStages?.['dna-title']?.workingTitle || '',
    subtitle:    fw.subtitle || nfStages?.['dna-promise']?.subtitleDraft || '',
    modelName:   fw.modelName,
    principles:  (fw.principles || []).map((p, i) => ({
      number:      p.number ?? i + 1,
      name:        p.name || '',
      description: p.definition || p.description || '',
    })),
    author:      fw.author || '',
    coverAccent: fw.coverAccent || '#1e3a5f',
  };
}
