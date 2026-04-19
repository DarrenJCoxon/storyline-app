import { STAGE_ORDER, STAGE_BY_ID, DEFAULT_STATE } from '../state/project-state.js';
import { existsSync, readFileSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import chalk from 'chalk';
import { deriveCurrentStage, calculateProgress, getMissingRequirements } from './transitions.js';

export function loadState(projectPath = null) {
  if (!projectPath) {
    projectPath = findLatestProject();
  }
  if (!projectPath) return null;

  const statePath = resolve(projectPath, '.novel-writer', 'state.json');
  if (!existsSync(statePath)) return null;

  try {
    const raw = readFileSync(statePath, 'utf-8');
    const state = JSON.parse(raw);
    return mergeWithDefaults(state);
  } catch {
    return null;
  }
}

function findLatestProject() {
  const checkPath = process.cwd();
  const statePath = resolve(checkPath, '.novel-writer', 'state.json');
  return existsSync(statePath) ? checkPath : null;
}

// Merge loaded state with defaults so new fields are always present
function mergeWithDefaults(state) {
  return {
    ...DEFAULT_STATE,
    ...state,
    _meta: { ...DEFAULT_STATE._meta, ...state._meta },
    genre: { ...DEFAULT_STATE.genre, ...state.genre },
    premise: { ...DEFAULT_STATE.premise, ...state.premise, seriesContext: { ...DEFAULT_STATE.premise.seriesContext, ...state.premise?.seriesContext } },
    protagonist: { ...DEFAULT_STATE.protagonist, ...state.protagonist },
    logline: { ...DEFAULT_STATE.logline, ...state.logline },
    beatSheet: { ...DEFAULT_STATE.beatSheet, ...state.beatSheet, beats: { ...DEFAULT_STATE.beatSheet.beats, ...state.beatSheet?.beats } },
    bStory: { ...DEFAULT_STATE.bStory, ...state.bStory },
    sceneOutline: { ...DEFAULT_STATE.sceneOutline, ...state.sceneOutline },
    critique: { ...DEFAULT_STATE.critique, ...state.critique },
    masterDoc: { ...DEFAULT_STATE.masterDoc, ...state.masterDoc },
  };
}

export async function saveState(state) {
  const stateDir = resolve(process.cwd(), '.novel-writer');
  await mkdir(stateDir, { recursive: true });
  state._meta.updatedAt = new Date().toISOString();
  await writeFile(resolve(stateDir, 'state.json'), JSON.stringify(state, null, 2));
}

// Derive next stage from data completeness, not a stored flag
export function getNextStage(state) {
  return deriveCurrentStage(state);
}

export function markStageComplete(state, stageId, data = {}) {
  state.stages[stageId] = {
    completed: true,
    completedAt: new Date().toISOString(),
  };
  return state;
}

// Mark a stage as incomplete (for revision)
export function markStageIncomplete(state, stageId) {
  if (state.stages[stageId]) {
    delete state.stages[stageId].completed;
    delete state.stages[stageId].completedAt;
  }
  return state;
}

export function printStatus(state) {
  const progress = calculateProgress(state);
  const currentStage = deriveCurrentStage(state);

  console.log(chalk.bold('\n📖 Novel Writer — Project Status\n'));
  console.log(chalk.dim(`Project: ${state._meta?.projectPath || 'unknown'}`));
  console.log(chalk.dim(`Progress: ${progress}%\n`));

  for (const stage of STAGE_ORDER) {
    const req = getMissingRequirements(stage.id, state);
    const isComplete = req.length === 0;
    const isCurrent = currentStage && currentStage.id === stage.id;

    if (isCurrent) {
      console.log(chalk.cyan(`  → ${stage.name}`));
      if (req.length > 0) {
        console.log(chalk.dim(`    Missing: ${req.join(', ')}`));
      }
    } else if (isComplete) {
      console.log(chalk.green(`  ✓ ${stage.name}`));
    } else {
      console.log(chalk.dim(`  ○ ${stage.name}`));
    }
  }

  if (currentStage) {
    const missing = getMissingRequirements(currentStage.id, state);
    console.log(chalk.bold(`\n→ Current: ${currentStage.name}`));
    if (missing.length > 0) {
      console.log(chalk.dim(`  Still needs: ${missing.join(', ')}`));
    }
  } else {
    console.log(chalk.bold('\n✅ All stages complete — run `nw generate` to create master document\n'));
  }
  console.log();
}

export function listStages() {
  console.log(chalk.bold('\n📋 Planning Stages\n'));
  STAGE_ORDER.forEach((stage, i) => {
    console.log(`  ${String(i + 1).padStart(2)}  ${stage.name}`);
  });
  console.log();
}