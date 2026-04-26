import { STAGE_ORDER } from './project-state.js';
const STAGE_REQUIREMENTS = {
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
export function deriveCurrentStage(state) {
    for (const stage of STAGE_ORDER) {
        const req = STAGE_REQUIREMENTS[stage.id];
        if (!req)
            continue;
        if (req.fields.length === 0 && req.skippable)
            continue;
        if (!req.fields.every(fn => fn(state)))
            return stage;
    }
    return null;
}
export function calculateProgress(state) {
    let completed = 0;
    const total = STAGE_ORDER.length;
    for (const stage of STAGE_ORDER) {
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
export function checkStageGate(stageId, state) {
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
export function getMissingRequirements(stageId, state) {
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
export function getDownstreamImpacts(stageId) {
    return DOWNSTREAM_MAP[stageId] ?? [];
}
//# sourceMappingURL=transitions.js.map