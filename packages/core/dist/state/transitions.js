"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveCurrentStage = deriveCurrentStage;
exports.isStageComplete = isStageComplete;
exports.hasTransitionRequirement = hasTransitionRequirement;
exports.calculateProgress = calculateProgress;
exports.checkStageGate = checkStageGate;
exports.getMissingRequirements = getMissingRequirements;
exports.getDownstreamImpacts = getDownstreamImpacts;
const project_state_js_1 = require("./project-state.js");
const STAGE_REQUIREMENTS = {
    mode: {
        fields: [s => s.stages?.mode?.completed],
        skippable: false,
    },
    genre: {
        fields: [s => s.genre?.primaryGenre, s => s.genre?.tone, s => s.genre?.audience],
        skippable: false,
    },
    premise: {
        fields: [s => s.premise?.rawLogline, s => s.premise?.conceptHook],
        skippable: false,
    },
    protagonist: {
        fields: [
            s => s.protagonist?.name,
            s => s.protagonist?.want,
            s => s.protagonist?.need,
            s => s.protagonist?.flaw,
        ],
        skippable: false,
    },
    characters: {
        fields: [s => s.characters?.length > 0],
        skippable: false,
    },
    relationships: {
        fields: [s => s.relationships?.length > 0],
        skippable: false,
    },
    logline: {
        fields: [s => s.logline?.sentence, s => s.logline?.incitingIncident, s => s.logline?.stakes],
        skippable: false,
    },
    beatSheet: {
        fields: [s => s.beatSheet?.beats?.beat08Midpoint?.midpointType],
        skippable: false,
    },
    bStory: {
        fields: [s => s.bStory?.character, s => s.bStory?.premise],
        skippable: true,
    },
    subplots: { fields: [], skippable: true },
    sceneOutline: {
        fields: [s => s.sceneOutline?.highLevel?.length > 0, s => s.sceneOutline?.approved === true],
        skippable: false,
    },
    plotThreads: {
        fields: [s => s.plotThreads?.length > 0],
        skippable: true,
    },
    chapterOutline: {
        fields: [s => s.chapterOutline?.length > 0],
        skippable: false,
    },
    critique: { fields: [], skippable: true },
    masterDoc: { fields: [], skippable: true },
};
const VALID_NF_PIPELINES = new Set(['A', 'B', 'C']);
function deriveCurrentStage(state) {
    // The mode gate is universal — until that's set, no progression.
    if (!state.mode) {
        return project_state_js_1.STAGE_ORDER[0]; // 'mode'
    }
    // After the gate, walk the stage list for whichever harness this is
    // (fiction Save-the-Cat ladder vs NF Book-DNA + chosen pipeline).
    // Stages without explicit field requirements look at stages[id].completed.
    const order = (0, project_state_js_1.stageOrderFor)(state);
    for (const stage of order) {
        if (stage.id === 'mode')
            continue;
        const req = STAGE_REQUIREMENTS[stage.id];
        const completed = !!state.stages?.[stage.id]?.completed;
        if (req) {
            if (req.fields.length === 0 && req.skippable) {
                if (!completed)
                    return stage;
                continue;
            }
            if (!req.fields.every(fn => fn(state)))
                return stage;
        }
        else {
            // No declarative requirement — fall back to the completion flag.
            if (!completed)
                return stage;
        }
    }
    // Nonfiction guard: if all DNA stages are complete but no valid pipeline
    // was chosen (LLM saved wrong value), re-enter dna-consolidate so the AI
    // asks the pipeline question again and saves A, B, or C.
    if (state.mode === 'nonfiction' && !VALID_NF_PIPELINES.has(state.pipeline)) {
        const consolidate = order.find(s => s.id === 'dna-consolidate');
        if (consolidate)
            return consolidate;
    }
    return null;
}
/**
 * Authoritative completion check for any fiction stage. Returns true iff
 * every declarative requirement for the stage is satisfied. Stages with
 * no declared requirement (e.g. critique, masterDoc) fall back to the
 * `stages[id].completed` flag.
 *
 * Use this as the gate before marking a stage complete and advancing —
 * it's the same logic that `deriveCurrentStage` uses to decide what's next.
 */
function isStageComplete(stageId, state) {
    const req = STAGE_REQUIREMENTS[stageId];
    if (!req)
        return !!state.stages?.[stageId]?.completed;
    if (req.fields.length === 0)
        return !!state.stages?.[stageId]?.completed;
    return req.fields.every(fn => !!fn(state));
}
/** Whether a stage has any declarative field requirement (vs only a completed flag). */
function hasTransitionRequirement(stageId) {
    const req = STAGE_REQUIREMENTS[stageId];
    return !!req && req.fields.length > 0;
}
function calculateProgress(state) {
    let completed = 0;
    const total = project_state_js_1.STAGE_ORDER.length;
    for (const stage of project_state_js_1.STAGE_ORDER) {
        const req = STAGE_REQUIREMENTS[stage.id];
        if (!req) {
            completed++;
            continue;
        }
        if (req.fields.length === 0 && req.skippable) {
            if (state.stages?.[stage.id]?.completed)
                completed++;
            continue;
        }
        if (req.fields.every(fn => fn(state)))
            completed++;
    }
    return Math.round((completed / total) * 100);
}
function checkStageGate(stageId, state) {
    if (stageId === 'beatSheet') {
        const p = state.protagonist;
        const missing = ['want', 'need', 'flaw', 'coreLie'].filter(k => !p?.[k]);
        if (missing.length > 0) {
            return { passed: false, missing, message: `Protagonist needs: ${missing.join(', ')}`, stageId: 'protagonist' };
        }
    }
    if (stageId === 'masterDoc') {
        const errors = (state.critique?.flaggedIssues ?? [])
            .filter(i => i.severity === 'error' && i.resolution !== 'accepted' && i.resolution !== 'to-fix');
        if (errors.length > 0) {
            return { passed: false, message: `${errors.length} unresolved error(s) in critique`, stageId: 'critique' };
        }
    }
    if (stageId === 'sceneOutline') {
        const midpoint = state.beatSheet?.beats?.beat08Midpoint?.midpointType;
        if (!midpoint) {
            return {
                passed: false,
                message: 'Beat sheet needs a midpoint type before scene outlining.',
                stageId: 'beatSheet',
            };
        }
    }
    return null;
}
function getMissingRequirements(stageId, state) {
    const req = STAGE_REQUIREMENTS[stageId];
    if (!req)
        return [];
    const labels = {
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
    const fieldLabels = labels[stageId] ?? [];
    return req.fields
        .map((fn, i) => ({ met: fn(state), label: fieldLabels[i] ?? `requirement ${i + 1}` }))
        .filter(({ met }) => !met)
        .map(({ label }) => label);
}
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
function getDownstreamImpacts(stageId) {
    return DOWNSTREAM_MAP[stageId] ?? [];
}
//# sourceMappingURL=transitions.js.map