// Core engine utilities — state-only, no interactive prompts
// The /novel skill drives the conversation. This module provides data access.

import { loadState, saveState } from './state/store.js';
import { STAGE_BY_ID, DEFAULT_STATE } from './state/project-state.js';
import { getDownstreamImpacts, getMissingRequirements, checkStageGate, deriveCurrentStage, calculateProgress } from './state/transitions.js';

// Create a new project state
export function createNewProject() {
  return {
    ...DEFAULT_STATE,
    _meta: {
      projectPath: process.cwd(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    stages: {},
  };
}

// Load current state — convenience wrapper
export function getState() {
  return loadState();
}

// Save state — convenience wrapper
export async function setState(state) {
  return saveState(state);
}

// Get the next stage to work on
export function getNextStageInfo(state) {
  const currentStage = deriveCurrentStage(state);
  const progress = calculateProgress(state);

  if (!currentStage) {
    return { complete: true, progress };
  }

  const missing = getMissingRequirements(currentStage.id, state);
  const gate = checkStageGate(currentStage.id, state);

  return {
    complete: false,
    progress,
    stage: currentStage,
    missing,
    gateBlocked: gate ? gate : null,
  };
}

// Get revision info — downstream impacts for a stage
export function getRevisionInfo(stageId) {
  const state = loadState();
  if (!state) return { error: 'No project found' };

  const stage = STAGE_BY_ID[stageId];
  if (!stage) return { error: `Unknown stage: ${stageId}` };

  const impacts = getDownstreamImpacts(stageId);
  const completedDownstream = impacts.filter(id => state.stages[id]?.completed);

  return {
    stage,
    downstreamImpacts: impacts.map(impactId => {
      const impactStage = STAGE_BY_ID[impactId];
      return {
        id: impactId,
        name: impactStage?.name || impactId,
        completed: !!state.stages[impactId]?.completed,
      };
    }),
    completedDownstream,
  };
}

// AI-powered critique (falls back to rule-based)
export async function aiCritique(stageId, state) {
  const { aiCritique: critique } = await import('./ai/openrouter-client.js');
  return critique(stageId, state);
}