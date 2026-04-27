// Stage derivation and transitions — determines current stage from data completeness
// Inspired by Trellis: the current stage is never stored and trusted blindly.
// It is always re-derived by walking the requirements chain.

import { STAGE_ORDER } from './project-state.js';

// ─────────────────────────────────────────────────────────────
// Stage Requirements — what data must exist for a stage to be considered complete
// ─────────────────────────────────────────────────────────────

const STAGE_REQUIREMENTS = {
  genre: {
    fields: [
      (s) => s.genre?.primaryGenre,
      (s) => s.genre?.tone,
      (s) => s.genre?.audience,
    ],
    skippable: false,
  },
  premise: {
    fields: [
      (s) => s.premise?.rawLogline,
      (s) => s.premise?.conceptHook,
    ],
    skippable: false,
  },
  protagonist: {
    fields: [
      (s) => s.protagonist?.name,
      (s) => s.protagonist?.want,
      (s) => s.protagonist?.need,
      (s) => s.protagonist?.flaw,
    ],
    skippable: false,
  },
  characters: {
    fields: [
      (s) => s.characters?.length > 0,
    ],
    skippable: false,
  },
  relationships: {
    fields: [
      (s) => s.relationships?.length > 0,
    ],
    skippable: false,
  },
  logline: {
    fields: [
      (s) => s.logline?.sentence,
      (s) => s.logline?.incitingIncident,
      (s) => s.logline?.stakes,
    ],
    skippable: false,
  },
  beatSheet: {
    fields: [
      (s) => s.beatSheet?.beats?.beat08Midpoint?.midpointType,
    ],
    skippable: false,
  },
  bStory: {
    fields: [
      (s) => s.bStory?.character,
      (s) => s.bStory?.premise,
    ],
    skippable: true,
  },
  subplots: {
    fields: [],
    skippable: true,
  },
  sceneOutline: {
    fields: [
      (s) => s.sceneOutline?.highLevel?.length > 0,
      (s) => s.sceneOutline?.approved === true,
    ],
    skippable: false,
  },
  plotThreads: {
    fields: [
      (s) => s.plotThreads?.length > 0,
    ],
    skippable: true,
  },
  chapterOutline: {
    fields: [
      (s) => s.chapterOutline?.length > 0,
    ],
    skippable: false,
  },
  critique: {
    fields: [],
    skippable: true,
  },
  masterDoc: {
    fields: [],
    skippable: true,
  },
};

// ─────────────────────────────────────────────────────────────
// Derive current stage from state
// ─────────────────────────────────────────────────────────────

export function deriveCurrentStage(state) {
  for (const stage of STAGE_ORDER) {
    const req = STAGE_REQUIREMENTS[stage.id];
    if (!req) continue;

    // If the stage has no requirements and is skippable, it's considered met
    if (req.fields.length === 0 && req.skippable) continue;

    // Check all required fields
    const allMet = req.fields.every(checkFn => checkFn(state));
    if (!allMet) {
      return stage;
    }
  }

  // All stages complete
  return null;
}

// ─────────────────────────────────────────────────────────────
// Calculate progress percentage
// ─────────────────────────────────────────────────────────────

export function calculateProgress(state) {
  let completed = 0;
  let total = STAGE_ORDER.length;

  for (const stage of STAGE_ORDER) {
    const req = STAGE_REQUIREMENTS[stage.id];
    if (!req) { completed++; continue; }

    // Skippable stages with no required fields (e.g. subplots, critique,
    // masterDoc) are "optional" — they don't block downstream work — but
    // they are NOT automatically complete on a fresh scaffold. Count them
    // only when the writer has actually passed through them, signalled by
    // `state.stages[stageId].completed === true` (set by `storyline save`).
    // Previously this branch `completed++`'d unconditionally, which meant a
    // freshly init'd project reported ~21% progress before the writer had
    // answered a single question.
    if (req.fields.length === 0 && req.skippable) {
      if (state.stages?.[stage.id]?.completed) completed++;
      continue;
    }

    const allMet = req.fields.every(checkFn => checkFn(state));
    if (allMet) completed++;
  }

  return Math.round((completed / total) * 100);
}

// ─────────────────────────────────────────────────────────────
// Get missing requirements for a stage
// ─────────────────────────────────────────────────────────────

export function getMissingRequirements(stageId, state) {
  const req = STAGE_REQUIREMENTS[stageId];
  if (!req) return [];

  const missing = [];
  const stage = STAGE_ORDER.find(s => s.id === stageId);
  const fieldLabels = {
    genre: ['primary genre', 'tone', 'audience'],
    premise: ['raw logline / story seed', 'concept hook'],
    protagonist: ['name', 'want (external goal)', 'need (internal truth)', 'flaw (self-deception)'],
    characters: ['at least one supporting character'],
    relationships: ['at least one relationship'],
    logline: ['logline sentence', 'inciting incident', 'stakes'],
    beatSheet: ['midpoint type (False Victory or False Defeat)'],
    bStory: ['B story character', 'B story premise'],
    sceneOutline: ['high-level scene outline', 'outline approval'],
    plotThreads: ['at least one plot thread'],
    chapterOutline: ['at least one chapter'],
  };

  const labels = fieldLabels[stageId] || [];
  req.fields.forEach((checkFn, i) => {
    if (!checkFn(state)) {
      missing.push(labels[i] || `requirement ${i + 1}`);
    }
  });

  return missing;
}

// ─────────────────────────────────────────────────────────────
// Check if a specific gate can be passed
// ─────────────────────────────────────────────────────────────

export function checkGate(gateId, state) {
  const gates = {
    // Can't start beat sheet until protagonist has all core elements
    beatSheetEntry: {
      required: 'protagonist',
      check: () => {
        const p = state.protagonist;
        const missing = [];
        if (!p?.want) missing.push('want');
        if (!p?.need) missing.push('need');
        if (!p?.flaw) missing.push('flaw');
        if (!p?.coreLie) missing.push('core lie');
        return missing.length === 0
          ? { passed: true }
          : { passed: false, missing, message: `Protagonist needs: ${missing.join(', ')}` };
      },
    },
    // Can't generate master doc until critique passes
    masterDocEntry: {
      required: 'critique',
      check: () => {
        const errors = (state.critique?.flaggedIssues || [])
          .filter(i => i.severity === 'error' && i.resolution !== 'accepted' && i.resolution !== 'to-fix');
        return errors.length === 0
          ? { passed: true }
          : { passed: false, errors, message: `${errors.length} unresolved error(s) in critique` };
      },
    },
  };

  const gate = gates[gateId];
  if (!gate) return { passed: true };

  return gate.check();
}

// ─────────────────────────────────────────────────────────────
// Downstream impact analysis — what's affected by a change
// ─────────────────────────────────────────────────────────────

const DOWNSTREAM_MAP = {
  genre: ['premise', 'beatSheet', 'bStory', 'sceneOutline', 'chapterOutline'],
  premise: ['logline', 'beatSheet', 'sceneOutline'],
  protagonist: ['characters', 'relationships', 'logline', 'beatSheet', 'bStory', 'sceneOutline', 'chapterOutline', 'plotThreads'],
  characters: ['relationships', 'bStory', 'subplots', 'plotThreads'],
  relationships: ['beatSheet', 'sceneOutline'],
  logline: ['beatSheet', 'sceneOutline'],
  beatSheet: ['bStory', 'sceneOutline', 'chapterOutline', 'plotThreads'],
  bStory: ['sceneOutline', 'chapterOutline'],
  subplots: ['plotThreads', 'chapterOutline'],
  sceneOutline: ['chapterOutline'],
  plotThreads: ['chapterOutline'],
  chapterOutline: ['critique'],
};

export function getDownstreamImpacts(stageId) {
  return DOWNSTREAM_MAP[stageId] || [];
}

// ─────────────────────────────────────────────────────────────
// Stage gate enforcement — blocks progression when requirements aren't met
// Moved from engine.js — this is state logic, not interactive logic
// ─────────────────────────────────────────────────────────────

export function checkStageGate(stageId, state) {
  // Gate: Beat sheet requires protagonist core elements
  if (stageId === 'beatSheet') {
    const gate = checkGate('beatSheetEntry', state);
    if (!gate.passed) {
      return { ...gate, stageId: 'protagonist' };
    }
  }

  // Gate: Master document requires critique to pass
  if (stageId === 'masterDoc') {
    const gate = checkGate('masterDocEntry', state);
    if (!gate.passed) {
      return { ...gate, stageId: 'critique' };
    }
  }

  // Gate: Scene outline requires beat sheet midpoint
  if (stageId === 'sceneOutline') {
    if (!state.beatSheet?.beats?.beat08Midpoint?.midpointType) {
      return {
        passed: false,
        message: 'Beat sheet needs a midpoint type (False Victory or False Defeat) before scene outlining.',
        stageId: 'beatSheet',
      };
    }
  }

  return null; // No gate block
}