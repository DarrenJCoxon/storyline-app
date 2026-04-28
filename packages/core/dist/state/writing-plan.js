"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWritingPlan = getWritingPlan;
// ── The normalizer ───────────────────────────────────────────────────────────
/** Single entry point. Branches on `state.mode` once; downstream code is
 *  mode-aware via the populated arrays, not by branching on raw state. */
function getWritingPlan(state) {
    const mode = state.mode;
    const base = {
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
    };
    if (mode === 'fiction') {
        return populateFiction(base, state);
    }
    if (mode === 'nonfiction') {
        return populateNonfiction(base, state);
    }
    // Mode not yet picked — return the empty base. Consumers tolerate this.
    return base;
}
// ── Fiction population ───────────────────────────────────────────────────────
function populateFiction(plan, state) {
    plan.protagonist = state.protagonist?.name
        ? normalizeProtagonist(state.protagonist)
        : null;
    plan.cast = (state.characters ?? []).map(normalizeCharacter);
    plan.relationships = (state.relationships ?? []).map(normalizeRelationship);
    plan.beats = normalizeBeats(state);
    plan.bStory = state.bStory?.character || state.bStory?.premise
        ? {
            character: state.bStory.character ?? null,
            premise: state.bStory.premise ?? null,
            resolution: state.bStory.resolution ?? null,
            themeConnection: state.bStory.themeConnection ?? null,
            beats: state.bStory.beats ?? {},
        }
        : null;
    plan.subplots = (state.subplots ?? []).map(normalizeSubplot);
    plan.fictionChapters = (state.chapterOutline ?? []).map(normalizeFictionChapter);
    const rawThreads = (state.plotThreads ?? []);
    plan.plotThreads = rawThreads.map(t => normalizePlotThread(t, plan.fictionChapters));
    plan.promises = detectFictionPromises(plan.plotThreads, plan.fictionChapters);
    return plan;
}
function normalizeProtagonist(p) {
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
    };
}
function normalizeCharacter(c) {
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
    };
}
function normalizeRelationship(r) {
    return {
        characterA: stringOr(r.characterA, ''),
        characterB: stringOr(r.characterB, ''),
        connection: stringOrNull(r.connection),
        conflict: stringOrNull(r.conflict),
        whatTheyWantFromEachOther: stringOrNull(r.whatTheyWantFromEachOther),
    };
}
function normalizeBeats(state) {
    const beats = state.beatSheet?.beats ?? {};
    // Use schema order from project-state.ts. This is the canonical order;
    // any drift in renderer-local BEAT_ORDER tables is FIC-A.4's job to fix.
    const order = [
        'beat01OpeningImage', 'beat02Setup', 'beat03Catalyst', 'beat04Debate',
        'beat05BreakIntoTwo', 'beat06BStory', 'beat07FunAndGames', 'beat08Midpoint',
        'beat09BadGuysCloseIn', 'beat10AllIsLost', 'beat11BlackMoment', 'beat12Beat13',
        'beat13Finale', 'beat14FinalImage', 'beat15EndCredits',
    ];
    return order.map(id => {
        const beat = beats[id] ?? {};
        const { scene, notes, ...rest } = beat;
        return {
            id,
            scene: scene ?? null,
            notes: notes ?? null,
            fields: rest,
        };
    });
}
function normalizeSubplot(s) {
    return {
        name: stringOr(s.name, ''),
        character: stringOrNull(s.character),
        purpose: stringOrNull(s.purpose),
        premise: stringOrNull(s.premise),
        beats: (s.beats && typeof s.beats === 'object')
            ? s.beats
            : null,
    };
}
function normalizeFictionChapter(ch) {
    const scenes = Array.isArray(ch.scenes) ? ch.scenes : [];
    return {
        chapterNumber: numberOr(ch.chapterNumber, 0),
        chapterTitle: stringOrNull(ch.chapterTitle),
        beat: stringOrNull(ch.beat),
        estimatedWords: numberOrNull(ch.estimatedWords),
        scenes: scenes.map(normalizeScene),
    };
}
function normalizeScene(sc) {
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
        draftStatus: sc.draftStatus,
    };
}
function normalizePlotThread(t, chapters) {
    // Drift D2: state was captured under either `threadType` (canonical) or
    // `type` (legacy reader). Normalize to `threadType`.
    const threadType = stringOrNull(t.threadType) ?? stringOrNull(t.type);
    const name = stringOr(t.name, '');
    const id = stringOr(t.id, '');
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
            ? t.linkedPromises.map(s => String(s))
            : [],
        lastTouchedChapter: computeLastTouchedChapter(name, id, chapters),
    };
}
function computeLastTouchedChapter(threadName, threadId, chapters) {
    let last = null;
    const needle = threadName.toLowerCase();
    const needleId = threadId.toLowerCase();
    for (const ch of chapters) {
        for (const sc of ch.scenes) {
            const tm = (sc.threadMovement ?? '').toLowerCase();
            if (tm && (tm.includes(needle) || tm.includes(needleId))) {
                if (last === null || ch.chapterNumber > last)
                    last = ch.chapterNumber;
            }
        }
    }
    return last;
}
// ── Fiction promise detection ────────────────────────────────────────────────
const THREAD_TYPE_TO_PROMISE_TYPE = {
    mystery: 'clue',
    'character-arc': 'wound',
    romance: 'romance-beat',
    prophecy: 'prophecy',
    'world-building': 'genre-promise',
};
function inferPromiseType(threadType) {
    if (!threadType)
        return 'subplot';
    return THREAD_TYPE_TO_PROMISE_TYPE[threadType.toLowerCase()] ?? 'subplot';
}
function inferPromiseRisk(thread) {
    if (thread.unresolvedRisk)
        return 'high';
    if (thread.payoffScene)
        return 'low';
    if (thread.resolutionPlan || thread.plannedResolutionScene)
        return 'medium';
    if (thread.status === 'resolved')
        return 'low';
    return 'high';
}
function inferPromiseStatus(thread) {
    if (thread.status === 'resolved' && thread.payoffScene)
        return 'paid-off';
    if (thread.resolutionPlan || thread.plannedResolutionScene)
        return 'planned';
    if (thread.lastTouchedChapter !== null)
        return 'set-up';
    return 'unresolved';
}
function parseChapterRef(ref) {
    if (!ref)
        return null;
    const m = ref.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
}
function detectFictionPromises(threads, _chapters) {
    return threads.map((thread, i) => {
        const setupChapter = parseChapterRef(thread.introducedAt);
        const payoffChapter = parseChapterRef(thread.plannedResolutionScene ?? thread.payoffScene);
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
        };
    });
}
// ── Non-fiction population (NF-11.1 will deepen this; FIC-A.1 stubs it) ──────
function populateNonfiction(plan, state) {
    // Non-fiction chapter data lives in pipeline-specific stage keys
    // (`pa-chapters` / `pb-chapters` / `pc-lessons`) under either
    // `state.nfStages[<id>]` (canonical) or `state[<id>]` (legacy extension
    // path). NF-11.0 standardizes on `state.nfStages`; this normalizer
    // already reads both for forward-compat.
    plan.nfChapters = readNfChapters(state);
    plan.nfPromise = readNfPromise(state);
    return plan;
}
function readNfPromise(state) {
    const nf = (state.nfStages ?? {});
    const top = state;
    function stage(key) {
        return (nf[key] ?? top[key] ?? {});
    }
    const dnaPromise = stage('dna-promise');
    const corePromise = stringOrNull(dnaPromise.corePromise);
    if (!corePromise)
        return null;
    const pcEndState = stage('pc-end-state');
    const paThesis = stage('pa-thesis');
    const paFramework = stage('pa-framework');
    return {
        corePromise,
        subtitleDraft: stringOrNull(dnaPromise.subtitleDraft),
        endStateMeasurableOutcome: stringOrNull(pcEndState.measurableOutcome),
        paThesisText: stringOrNull(paThesis.thesis),
        paFrameworkName: stringOrNull(paFramework.modelName),
    };
}
function readNfChapters(state) {
    const pipeline = state.pipeline;
    let stageKey = null;
    if (pipeline === 'A')
        stageKey = 'pa-chapters';
    else if (pipeline === 'B')
        stageKey = 'pb-chapters';
    else if (pipeline === 'C')
        stageKey = 'pc-lessons';
    if (!stageKey)
        return [];
    const stageData = state.nfStages?.[stageKey] ??
        state[stageKey] ??
        null;
    if (!stageData || typeof stageData !== 'object')
        return [];
    const raw = stageData.chapters
        ?? stageData.lessons
        ?? [];
    if (!Array.isArray(raw))
        return [];
    return raw.map((item, i) => {
        const num = numberOr(item.number ?? item.chapterNumber, i + 1);
        const title = stringOrNull(item.title ?? item.lessonTitle ?? item.chapterTitle);
        const slug = slugify(title ?? `chapter-${num}`);
        const sections = Array.isArray(item.sections) ? item.sections : [];
        return {
            number: num,
            title,
            slug,
            manuscriptFile: `manuscript/${String(num).padStart(2, '0')}-${slug}.md`,
            cardFile: `docs/chapters/${String(num).padStart(2, '0')}-${slug}.md`,
            sections: sections.map(normalizeNfSection),
            wordCountEstimate: numberOrNull(item.wordCountEstimate ?? item.estimatedWords),
            keyResearch: stringOrNull(item.keyResearch),
            linkedPrinciple: stringOrUndef(item.linkedPrinciple),
            chapterQuestion: stringOrUndef(item.chapterQuestion),
            learningObjective: stringOrUndef(item.learningObjective),
            mission: stringOrUndef(item.mission ?? item.job),
        };
    });
}
function normalizeNfSection(s) {
    return {
        title: stringOr(s.title, ''),
        type: stringOr(s.type, 'body'),
        notes: stringOrUndef(s.notes ?? s.purpose),
        keyResearch: stringOrUndef(s.keyResearch),
    };
}
// ── Helpers ──────────────────────────────────────────────────────────────────
function extractTitle(state) {
    const meta = state._meta;
    return meta?.projectTitle ?? null;
}
function stringOr(v, fallback) {
    return typeof v === 'string' ? v : fallback;
}
function stringOrNull(v) {
    return typeof v === 'string' && v.length > 0 ? v : null;
}
function stringOrUndef(v) {
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function numberOr(v, fallback) {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function numberOrNull(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function slugify(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}
//# sourceMappingURL=writing-plan.js.map