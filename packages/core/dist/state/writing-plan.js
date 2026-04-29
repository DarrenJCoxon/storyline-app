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
        storyBible: null,
        arcMatrix: null,
        academic: null,
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
    plan.storyBible = deriveStoryBible(plan.fictionChapters);
    plan.arcMatrix = deriveArcMatrix(plan.protagonist, plan.cast, plan.fictionChapters, plan.beats);
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
// ── FIC-D derivations ────────────────────────────────────────────────────────
function deriveStoryBible(chapters) {
    const locMap = new Map();
    for (const ch of chapters) {
        for (const sc of ch.scenes) {
            const loc = sc.location?.trim();
            if (loc) {
                if (!locMap.has(loc))
                    locMap.set(loc, new Set());
                locMap.get(loc).add(ch.chapterNumber);
            }
        }
    }
    const locations = Array.from(locMap.entries())
        .map(([name, chSet]) => ({ name, chapters: [...chSet].sort((a, b) => a - b) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return { locations, recurringObjects: [], continuityFacts: [] };
}
function deriveArcMatrix(protagonist, cast, chapters, beats) {
    const rows = [];
    function povChapters(name) {
        const lower = name.toLowerCase();
        const seen = new Set();
        for (const ch of chapters) {
            for (const sc of ch.scenes) {
                if (sc.pov && sc.pov.toLowerCase().includes(lower)) {
                    seen.add(ch.chapterNumber);
                    break;
                }
            }
        }
        return [...seen].sort((a, b) => a - b);
    }
    function pressureBeats(name) {
        const lower = name.toLowerCase();
        return beats
            .filter(b => {
            const text = [b.scene ?? '', b.notes ?? '', ...Object.values(b.fields).map(v => v ?? '')].join(' ').toLowerCase();
            return text.includes(lower);
        })
            .map(b => b.id);
    }
    function beatNotes(id) {
        const b = beats.find(bt => bt.id === id);
        if (!b)
            return null;
        return b.notes ?? b.scene ?? null;
    }
    if (protagonist) {
        rows.push({
            characterName: protagonist.name,
            role: 'protagonist',
            want: protagonist.want,
            need: protagonist.need,
            lie: protagonist.coreLie,
            wound: protagonist.ghost,
            chapterPresence: povChapters(protagonist.name),
            beatPressure: pressureBeats(protagonist.name),
            midpointShift: beatNotes('beat08Midpoint'),
            allIsLostImpact: beatNotes('beat10AllIsLost'),
            finaleChoice: beatNotes('beat13Finale'),
            finalState: beatNotes('beat14FinalImage'),
        });
    }
    for (const char of cast) {
        const hasArcFields = char.want || char.need || char.ghost || char.flaw || char.arcSummary;
        if (!hasArcFields)
            continue;
        rows.push({
            characterName: char.name,
            role: char.role,
            want: char.want,
            need: char.need,
            lie: char.coreLie,
            wound: char.ghost,
            chapterPresence: povChapters(char.name),
            beatPressure: pressureBeats(char.name),
            midpointShift: null,
            allIsLostImpact: null,
            finaleChoice: null,
            finalState: char.arcSummary,
        });
    }
    return { characters: rows };
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
    plan.claims = readClaims(state, plan.nfChapters);
    plan.figures = readFigures(state);
    if (state.pipeline === 'academic') {
        plan.academic = readAcademic(state);
    }
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
    else if (pipeline === 'academic')
        stageKey = 'ac-chapters';
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
            keyResearch: stringOrNull(item.keyResearch ?? item.keyEvidence ?? item.sourcingNote),
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
function readFigureStatus(state) {
    const nf = (state.nfStages ?? {});
    return nf['figure-status'] ?? {};
}
function readFigures(state) {
    const figures = [];
    const pipeline = state.pipeline;
    let stageKey = null;
    if (pipeline === 'A')
        stageKey = 'pa-chapters';
    else if (pipeline === 'B')
        stageKey = 'pb-chapters';
    else if (pipeline === 'C')
        stageKey = 'pc-lessons';
    else if (pipeline === 'academic')
        stageKey = 'ac-chapters';
    if (!stageKey)
        return [];
    const nf = (state.nfStages ?? {});
    const top = state;
    const stageData = (nf[stageKey] ?? top[stageKey]);
    if (!stageData)
        return [];
    const raw = (stageData.chapters ?? stageData.lessons ?? []);
    const figureStatus = readFigureStatus(state);
    for (const chapter of raw) {
        const chNum = numberOr(chapter.number ?? chapter.chapterNumber, 0);
        const rawFigs = Array.isArray(chapter.figures) ? chapter.figures : [];
        for (let i = 0; i < rawFigs.length; i++) {
            const fig = rawFigs[i];
            const id = `fig-ch${chNum}-${i + 1}`;
            const persisted = figureStatus[id];
            figures.push({
                id,
                type: stringOr(fig.type, 'diagram'),
                chapterNumber: chNum,
                sectionTitle: stringOrNull(fig.sectionTitle ?? fig.section) ?? undefined,
                purpose: stringOr(fig.purpose ?? fig.description ?? fig.intent, ''),
                factualConstraints: stringOrNull(fig.factualConstraints) ?? undefined,
                caption: stringOrNull(fig.caption) ?? undefined,
                altText: stringOrNull(fig.altText) ?? undefined,
                sourceRights: stringOrNull(fig.sourceRights) ?? undefined,
                imagePrompt: (persisted?.imagePrompt ?? fig.imagePrompt ?? null),
                status: (persisted?.status ?? 'planned'),
                producedAssetPath: persisted?.producedAssetPath ?? undefined,
                promptHistory: persisted?.promptHistory ?? [],
            });
        }
    }
    return figures;
}
// ── NF-12 claim extraction ────────────────────────────────────────────────────
function readClaims(state, nfChapters) {
    const claims = [];
    const nf = (state.nfStages ?? {});
    const top = state;
    function stg(key) {
        return (nf[key] ?? top[key] ?? {});
    }
    // Pipeline A: structured evidence items from pa-evidence.evidenceByPrinciple
    const paEvidence = stg('pa-evidence');
    const byPrinciple = Array.isArray(paEvidence.evidenceByPrinciple)
        ? paEvidence.evidenceByPrinciple
        : [];
    for (const group of byPrinciple) {
        const principleNum = group.principleNumber;
        const chapterNumber = nfChapters.find(ch => String(ch.linkedPrinciple) === String(principleNum))?.number ?? null;
        const items = Array.isArray(group.evidenceItems)
            ? group.evidenceItems
            : [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const evType = normalizeEvidenceType(stringOr(item.type, ''));
            const confidence = normalizeConfidence(stringOr(item.strength, ''));
            const verificationState = 'planned';
            claims.push({
                id: `ev-p${principleNum}-${i + 1}`,
                claimText: stringOr(item.supportsTheClaim ?? item.claim, '(unlabelled claim)'),
                chapterNumber,
                sectionTitle: null,
                evidenceType: evType,
                sources: item.source ? [String(item.source)] : [],
                confidence,
                risk: deriveClaimRisk(confidence, verificationState),
                citationNeeded: ['study', 'case-study', 'data', 'sourced-claim'].includes(evType),
                verificationState,
            });
        }
    }
    // All pipelines: chapter-level keyResearch (normalised from keyResearch / keyEvidence / sourcingNote)
    for (const ch of nfChapters) {
        if (!ch.keyResearch)
            continue;
        claims.push({
            id: `ch${ch.number}-evidence`,
            claimText: ch.keyResearch,
            chapterNumber: ch.number,
            sectionTitle: null,
            evidenceType: 'unparsed',
            sources: [],
            confidence: 'unknown',
            risk: 'high',
            citationNeeded: true,
            verificationState: 'planned',
        });
    }
    return claims;
}
function normalizeEvidenceType(t) {
    const map = {
        study: 'study',
        'case-study': 'case-study',
        'case study': 'case-study',
        data: 'data',
        interview: 'interview',
        personal: 'personal',
        'sourced-claim': 'sourced-claim',
        'sourced claim': 'sourced-claim',
    };
    return map[t.toLowerCase()] ?? 'unparsed';
}
function normalizeConfidence(s) {
    const map = {
        primary: 'primary',
        'peer-reviewed': 'primary',
        secondary: 'secondary',
        anecdotal: 'anecdotal',
    };
    return map[s.toLowerCase()] ?? 'unknown';
}
function deriveClaimRisk(confidence, verificationState) {
    if (verificationState === 'verified' || verificationState === 'cited')
        return 'low';
    if (confidence === 'primary')
        return 'low';
    if (confidence === 'anecdotal' || confidence === 'unknown')
        return 'high';
    return 'medium';
}
// ── NF-14.5 academic extraction ───────────────────────────────────────────────
function stageData(state, key) {
    const nf = (state.nfStages ?? {});
    const top = state;
    return (nf[key] ?? top[key] ?? {});
}
function readAcademic(state) {
    const bookType = state.bookType;
    if (bookType !== 'textbook' && bookType !== 'revision-guide')
        return null;
    const syllabus = stageData(state, 'ac-syllabus');
    const chaptersStage = stageData(state, 'ac-chapters');
    const acLevel = stageData(state, 'dna-ac-level');
    const acSpec = stageData(state, 'dna-ac-spec');
    const acAssess = stageData(state, 'dna-ac-assessment');
    const rawOutcomes = Array.isArray(syllabus.outcomes)
        ? syllabus.outcomes
        : [];
    const learningOutcomes = rawOutcomes.map(o => ({
        code: stringOr(o.code, ''),
        text: stringOr(o.text, ''),
        bloom: stringOrNull(o.bloom),
        module: stringOrNull(o.module),
        recallType: stringOrNull(o.recallType),
        examTrap: stringOrNull(o.examTrap),
    }));
    const rawChapters = Array.isArray(chaptersStage.chapters)
        ? chaptersStage.chapters
        : [];
    const allWorkedExamples = [];
    const allExercises = [];
    const allKeyTerms = new Set();
    const prereqMap = {};
    const chapters = rawChapters.map((ch, i) => {
        const num = numberOr(ch.number ?? ch.chapterNumber, i + 1);
        const title = stringOrNull(ch.title ?? ch.chapterTitle);
        const outcomes = Array.isArray(ch.outcomes) ? ch.outcomes.map(String) : [];
        const keyTerms = Array.isArray(ch.keyTerms) ? ch.keyTerms.map(String) : [];
        keyTerms.forEach(t => allKeyTerms.add(t));
        const prerequisites = Array.isArray(ch.prerequisites)
            ? ch.prerequisites.map(n => numberOr(n, 0)).filter(n => n > 0)
            : [];
        prereqMap[num] = prerequisites;
        const sections = Array.isArray(ch.sections)
            ? ch.sections.map(s => ({
                title: stringOr(s.title, ''),
                type: stringOr(s.type, 'body'),
            }))
            : [];
        const wordTarget = numberOrNull(ch.wordTarget ?? ch.wordCountEstimate);
        // Textbook: workedExamples + exercises
        const rawWE = Array.isArray(ch.workedExamples) ? ch.workedExamples : [];
        const workedExamples = rawWE.map(we => {
            const item = {
                id: stringOr(we.id, `we-${num}.${rawWE.indexOf(we) + 1}`),
                title: stringOrNull(we.title),
                difficulty: stringOrNull(we.difficulty),
                chapterNumber: num,
            };
            allWorkedExamples.push(item);
            return item;
        });
        const rawEx = Array.isArray(ch.exercises) ? ch.exercises : [];
        const exercises = rawEx.map(ex => {
            const item = {
                id: stringOr(ex.id, `ex-${num}.${rawEx.indexOf(ex) + 1}`),
                title: stringOrNull(ex.title),
                difficulty: stringOrNull(ex.difficulty),
                chapterNumber: num,
            };
            allExercises.push(item);
            return item;
        });
        // Revision guide: recallQuestions + examPractice
        const recallQuestions = numberOrNull(ch.recallQuestions);
        const rawEP = Array.isArray(ch.examPractice) ? ch.examPractice : [];
        const examPractice = rawEP.map(ep => ({
            type: stringOr(ep.type, 'short-answer'),
            count: numberOr(ep.count, 0),
        }));
        return {
            number: num,
            title,
            outcomes,
            keyTerms,
            prerequisites,
            sections,
            wordTarget,
            workedExamples,
            exercises,
            recallQuestions,
            examPractice,
        };
    });
    return {
        bookType,
        level: stringOrNull(acLevel.level ?? acLevel.academicLevel),
        specReference: stringOrNull(acSpec.specReference ?? acSpec.specificationReference ?? acSpec.syllabus),
        assessmentShape: stringOrNull(acAssess.assessmentShape ?? acAssess.assessment),
        learningOutcomes,
        keyTerms: [...allKeyTerms].sort(),
        workedExamples: allWorkedExamples,
        exercises: allExercises,
        prerequisites: prereqMap,
        chapters,
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