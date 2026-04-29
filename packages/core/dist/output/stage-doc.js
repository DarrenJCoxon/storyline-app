"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeStageDoc = writeStageDoc;
// Per-stage markdown renderer — writes output/stages/<stageId>.md on every save
const fs = __importStar(require("fs"));
const fsPromises = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const line = (k, v) => v != null && v !== '' ? `**${k}:** ${v}\n\n` : '';
const heading = (txt, level = 2) => `${'#'.repeat(level)} ${txt}\n\n`;
const para = (txt) => txt ? `${txt}\n\n` : '';
const listItem = (txt) => txt ? `- ${txt}\n` : '';
const BEAT_ORDER = [
    { id: 'beat01OpeningImage', name: 'Opening Image' },
    { id: 'beat02Setup', name: 'Setup' },
    { id: 'beat03Catalyst', name: 'Catalyst' },
    { id: 'beat04Debate', name: 'Debate' },
    { id: 'beat05BreakIntoTwo', name: 'Break Into Two' },
    { id: 'beat06BStory', name: 'B Story' },
    { id: 'beat07FunAndGames', name: 'Fun and Games' },
    { id: 'beat08Midpoint', name: 'Midpoint' },
    { id: 'beat09BadGuysCloseIn', name: 'Bad Guys Close In' },
    { id: 'beat10AllIsLost', name: 'All Is Lost' },
    { id: 'beat11BlackMoment', name: 'Black Moment' },
    { id: 'beat12Beat13', name: 'Break Into Three' },
    { id: 'beat13Finale', name: 'Finale' },
    { id: 'beat14FinalImage', name: 'Final Image' },
    { id: 'beat15EndCredits', name: 'End Credits' },
];
const renderers = {
    genre(state) {
        const g = state.genre || {};
        let md = heading('Genre & Foundations');
        md += `| Field | Value |\n|-------|-------|\n`;
        md += `| Primary Genre | ${g.primaryGenre || '-'} |\n`;
        md += `| Sub-Genre | ${g.subGenre || '-'} |\n`;
        md += `| Tone | ${g.tone || '-'} |\n`;
        md += `| Audience | ${g.audience || '-'} |\n`;
        md += `| Target Word Count | ${g.targetWordCount?.toLocaleString() || '-'} |\n`;
        md += `| Save the Cat Variant | ${g.genreVariant || 'standard'} |\n\n`;
        return md;
    },
    premise(state) {
        const p = state.premise || {};
        let md = heading('Story Seed & Premise');
        md += line('Raw logline', p.rawLogline);
        md += line('Concept hook', p.conceptHook);
        if (p.seriesContext?.isSeries) {
            md += heading('Series Context', 3);
            md += line('Series title', p.seriesContext.seriesTitle);
            md += line('Book count', p.seriesContext.bookCount);
            md += line('This book', `Book ${p.seriesContext.currentBookNumber || 1}`);
            md += line('Overall arc across all books', p.seriesContext.overallArc);
            md += line('Focus of Book 1', p.seriesContext.firstBookFocus);
        }
        const sp = p.seriesPotential;
        if (sp?.detected) {
            md += heading('Series Potential Detected', 3);
            md += para(sp.reason);
            md += line('Suggestion', sp.suggestion);
        }
        return md;
    },
    protagonist(state) {
        const p = state.protagonist || {};
        let md = heading('Protagonist Deep Dive');
        md += `**${p.name || 'Unnamed'}**${p.age ? ` — age ${p.age}` : ''}${p.occupation ? ` — ${p.occupation}` : ''}\n\n`;
        md += heading('Inner Engine (wound → lie → flaw → want → need)', 3);
        md += `| Element | Content |\n|---------|---------|\n`;
        md += `| **GHOST / WOUND** | ${p.ghost || '-'} |\n`;
        md += `| **CORE LIE** | ${p.coreLie || '-'} |\n`;
        md += `| **FLAW** | ${p.flaw || '-'} |\n`;
        md += `| **WANT** | ${p.want || '-'} |\n`;
        md += `| **NEED** | ${p.need || '-'} |\n`;
        md += `| **ARC** | ${p.arcDirection || '-'} |\n\n`;
        if (p.dailyLife) {
            md += heading('Ordinary World', 3);
            md += para(p.dailyLife);
        }
        if (p.voice) {
            md += heading('Voice', 3);
            md += para(p.voice);
        }
        return md;
    },
    characters(state) {
        const chars = state.characters || [];
        let md = heading('Supporting Cast');
        if (!chars.length)
            return md + '_No supporting characters yet._\n';
        chars.forEach((c, i) => {
            md += heading(`${i + 1}. ${c.name}${c.role ? ` (${c.role})` : ''}`, 3);
            md += `| | |\n|--|--|\n`;
            md += `| **Want** | ${c.want || '-'} |\n`;
            md += `| **Need** | ${c.need || '-'} |\n`;
            md += `| **Flaw** | ${c.flaw || '-'} |\n`;
            md += `| **Ghost** | ${c.ghost || '-'} |\n`;
            md += `| **Arc** | ${c.arcSummary || '-'} |\n`;
            md += `| **Relationship to protagonist** | ${c.relationshipToProtagonist || '-'} |\n`;
            md += `| **Enters story at** | ${c.meetsProtagonistAt || '-'} |\n\n`;
        });
        return md;
    },
    relationships(state) {
        const rels = (state.relationships || []);
        let md = heading('Relationship Web');
        if (!rels.length)
            return md + '_No relationships mapped yet._\n';
        rels.forEach(r => {
            md += `### ${r.characterA} ↔ ${r.characterB}\n\n`;
            md += line('Connection', r.connection);
            md += line('Conflict', r.conflict);
            md += line('Mutual want', r.whatTheyWantFromEachOther);
        });
        return md;
    },
    logline(state) {
        const l = (state.logline || {});
        let md = heading('Logline');
        if (l.sentence)
            md += `> ${l.sentence}\n\n`;
        md += line('Setup', l.setup);
        md += line('Inciting incident', l.incitingIncident);
        md += line('Stakes', l.stakes);
        md += line('Resolution hint', l.resolutionHint);
        md += line('Antagonist question', l.antagonistQuestion);
        return md;
    },
    beatSheet(state) {
        const b = state.beatSheet || {};
        const beats = (b.beats || {});
        let md = heading('Beat Sheet');
        md += line('Genre variant', b.genreVariant || 'standard');
        BEAT_ORDER.forEach(bo => {
            const beat = beats[bo.id] || {};
            md += heading(bo.name, 3);
            md += line('Scene', beat.scene);
            md += line('Image', beat.image);
            if (bo.id === 'beat02Setup')
                md += line('Theme stated (hidden)', beat.themeStated);
            if (bo.id === 'beat03Catalyst')
                md += line('Inciting incident', beat.incitingIncident);
            if (bo.id === 'beat04Debate')
                md += line('Debate question', beat.debateQuestion);
            if (bo.id === 'beat05BreakIntoTwo') {
                md += line('Threshold choice', beat.threshold);
                md += line('False reality', beat.falseReality);
            }
            if (bo.id === 'beat06BStory') {
                md += line('B story intro', beat.bStoryIntro);
                md += line('Theme connection', beat.themeConnection);
            }
            if (bo.id === 'beat07FunAndGames')
                md += line('Promise of premise', beat.promiseOfPremise);
            if (bo.id === 'beat08Midpoint' && beat.midpointType) {
                md += line('Type', beat.midpointType === 'falseVictory' ? 'False Victory' : 'False Defeat');
                md += line('Flip/reveal', beat.flipOrReveal);
                md += line('Stakes raise', beat.stakesRaise);
            }
            if (bo.id === 'beat09BadGuysCloseIn' && Array.isArray(beat.pressures) && beat.pressures.length) {
                md += line('Pressures', beat.pressures.join('; '));
            }
            else if (bo.id === 'beat09BadGuysCloseIn') {
                md += line('Pressures', beat.pressures);
            }
            if (bo.id === 'beat10AllIsLost') {
                md += line('Whiff of death', beat.whiffOfDeath);
                md += line('Dark night of soul', beat.darkNightOfSoul);
            }
            if (bo.id === 'beat11BlackMoment') {
                md += line('What makes them try', beat.whatMakesThemTry);
                md += line('Defeat type', beat.defeatType);
                md += line('Despair', beat.despair);
            }
            if (bo.id === 'beat12Beat13') {
                md += line('Second doorway', beat.secondDoorway);
                md += line('Forced re-examination', beat.forcedReexamination);
            }
            if (bo.id === 'beat13Finale') {
                md += line('Self-revelation', beat.selfRevelation);
                md += line('New equilibrium', beat.newEquilibrium);
            }
            if (bo.id === 'beat14FinalImage')
                md += line('Contrast to opening', beat.contrastToOpening);
            md += line('Notes', beat.notes);
        });
        if (b.overallNotes) {
            md += heading('Overall Notes', 3);
            md += para(b.overallNotes);
        }
        return md;
    },
    bStory(state) {
        const b = (state.bStory || {});
        let md = heading('B Story');
        md += line('Character', b.character);
        md += line('Premise', b.premise);
        md += line('Theme connection', b.themeConnection);
        md += line('Resolution', b.resolution);
        if (b.beats && typeof b.beats === 'object' && !Array.isArray(b.beats)) {
            const bBeats = b.beats;
            md += heading('Arc Beats', 3);
            md += line('Begins', bBeats.begins);
            md += line('Deepens', bBeats.deepens);
            md += line('Resolves', bBeats.resolves);
        }
        return md;
    },
    subplots(state) {
        const subs = (state.subplots || []);
        let md = heading('Subplots');
        if (!subs.length)
            return md + '_No subplots defined yet._\n';
        subs.forEach((s, i) => {
            md += heading(`${i + 1}. ${s.name}${s.character ? ` (${s.character})` : ''}`, 3);
            md += line('Purpose', s.purpose);
            md += line('Premise', s.premise);
            if (s.beats) {
                md += line('Setup', s.beats.setup);
                md += line('Complication', s.beats.complication);
                md += line('Resolution', s.beats.resolution);
            }
        });
        return md;
    },
    sceneOutline(state) {
        const s = (state.sceneOutline || {});
        let md = heading('Scene Outline');
        md += line('Approved', s.approved ? 'Yes' : 'No — first pass only');
        if (s.highLevel?.length) {
            md += heading('High-Level Outline', 3);
            s.highLevel.forEach(item => {
                md += `- **Act ${item.act}, seq ${item.sequence}:** ${item.highLevelSummary}\n`;
            });
            md += '\n';
        }
        return md;
    },
    plotThreads(state) {
        const threads = (state.plotThreads || []);
        let md = heading('Plot Thread Registry');
        if (!threads.length)
            return md + '_No plot threads registered yet._\n';
        md += `| Thread | Type | Introduced | Status | Resolution Plan |\n`;
        md += `|--------|------|------------|--------|----------------|\n`;
        threads.forEach(t => {
            md += `| ${t.name} | ${t.threadType || t.type || '-'} | ${t.introducedAt || '-'} | ${t.status || '-'} | ${t.resolutionPlan || '-'} |\n`;
        });
        return md + '\n';
    },
    chapterOutline(state) {
        const chapters = (state.chapterOutline || []);
        let md = heading('Chapter Outline (Fleshed)');
        if (!chapters.length)
            return md + '_No chapters fleshed out yet._\n';
        chapters.forEach(ch => {
            md += heading(`Chapter ${ch.chapterNumber}: ${ch.chapterTitle || ''}`, 3);
            if (ch.beat)
                md += `*Beat: ${ch.beat}*\n\n`;
            (ch.scenes || []).forEach(sc => {
                md += `**Scene ${sc.sceneNumber}** — ${sc.location || '?'} / ${sc.timeOfDay || '?'} / POV: ${sc.pov || '?'}\n\n`;
                if (sc.summary)
                    md += `${sc.summary}\n\n`;
                md += line('Purpose', sc.purpose);
                md += line('Conflict', sc.conflict);
                md += line('What changes', sc.whatChanges);
                md += line('Serves beats', sc.beats);
            });
        });
        return md;
    },
    critique(state) {
        const c = (state.critique || {});
        let md = heading('Consistency & Critique');
        if (c.flaggedIssues?.length) {
            md += heading('Flagged Issues', 3);
            c.flaggedIssues.forEach(i => md += listItem(typeof i === 'string' ? i : i.message || JSON.stringify(i)));
            md += '\n';
        }
        if (c.resolvedIssues?.length) {
            md += heading('Resolved Issues', 3);
            c.resolvedIssues.forEach(i => md += listItem(typeof i === 'string' ? i : i.message || JSON.stringify(i)));
            md += '\n';
        }
        md += line('Pacing analysis', c.pacingAnalysis);
        md += line('Character consistency', c.characterConsistency);
        md += line('Beat sheet validation', c.beatSheetValidation);
        return md;
    },
    masterDoc(state) {
        const m = (state.masterDoc || {});
        let md = heading('Master Document');
        md += line('Generated at', m.generatedAt);
        md += line('Word count estimate', m.wordCountEstimate?.toLocaleString());
        md += `\nSee [master-document.md](../master-document.md) for the full planning output.\n`;
        return md;
    },
};
function nfStage(state, stageId) {
    const nf = (state.nfStages ?? {});
    const top = state;
    return nf[stageId] ?? top[stageId] ?? {};
}
function nfLine(k, v) {
    return v != null && v !== '' ? `**${k}:** ${v}\n\n` : '';
}
function nfList(items) {
    if (!Array.isArray(items) || items.length === 0)
        return '';
    return items.map(i => `- ${i}\n`).join('') + '\n';
}
const nfRenderers = {
    'dna-category'(state) {
        const s = nfStage(state, 'dna-category');
        let md = heading('Category & Market Positioning');
        md += nfLine('Category', s.category);
        md += nfLine('Sub-category', s.subCategory);
        md += nfLine('Audience', s.audience);
        md += nfLine('Market gap', s.marketGap);
        return md;
    },
    'dna-reader'(state) {
        const s = nfStage(state, 'dna-reader');
        let md = heading('Reader Avatar');
        md += nfLine('Reader description', s.readerDescription);
        md += nfLine('Reader situation', s.readerSituation);
        md += nfLine('Reader goal', s.readerGoal);
        md += nfLine('Reader fear', s.readerFear);
        return md;
    },
    'dna-transform'(state) {
        const s = nfStage(state, 'dna-transform');
        let md = heading('Reader Transformation');
        md += nfLine('Before state', s.beforeState);
        md += nfLine('After state', s.afterState);
        md += nfLine('Transformation mechanism', s.transformationMechanism);
        return md;
    },
    'dna-idea'(state) {
        const s = nfStage(state, 'dna-idea');
        let md = heading('The One Big Idea');
        md += nfLine('Big idea', s.bigIdea);
        md += nfLine('Why this idea', s.whyThisIdea);
        md += nfLine('Counter-intuitive element', s.counterIntuitive);
        return md;
    },
    'dna-author'(state) {
        const s = nfStage(state, 'dna-author');
        let md = heading('Author Angle & Authority');
        md += nfLine('Author angle', s.authorAngle);
        md += nfLine('Credibility', s.credibility);
        md += nfLine('Unique access', s.uniqueAccess);
        return md;
    },
    'dna-promise'(state) {
        const s = nfStage(state, 'dna-promise');
        let md = heading('Core Promise & Subtitle Engineering');
        md += nfLine('Core promise', s.corePromise);
        md += nfLine('Subtitle draft', s.subtitleDraft);
        md += nfLine('Measurable outcome', s.measurableOutcome);
        return md;
    },
    'dna-comps'(state) {
        const s = nfStage(state, 'dna-comps');
        let md = heading('Comps Deep Dive');
        if (Array.isArray(s.comps)) {
            md += heading('Comparable Titles', 3);
            md += nfList(s.comps);
        }
        md += nfLine('Positioning statement', s.positioningStatement);
        return md;
    },
    'dna-voice'(state) {
        const s = nfStage(state, 'dna-voice');
        let md = heading('Voice & Tone');
        md += nfLine('Voice', s.voice);
        md += nfLine('Tone', s.tone);
        md += nfLine('Style notes', s.styleNotes);
        return md;
    },
    'dna-evidence'(state) {
        const s = nfStage(state, 'dna-evidence');
        let md = heading('Evidence Philosophy');
        md += nfLine('Evidence approach', s.evidenceApproach);
        md += nfLine('Primary sources', s.primarySources);
        md += nfLine('Research gaps', s.researchGaps);
        return md;
    },
    'dna-commercial'(state) {
        const s = nfStage(state, 'dna-commercial');
        let md = heading('Commercial Model');
        md += nfLine('Revenue model', s.revenueModel);
        md += nfLine('Distribution', s.distribution);
        md += nfLine('Launch strategy', s.launchStrategy);
        return md;
    },
    'dna-title'(state) {
        const s = nfStage(state, 'dna-title');
        let md = heading('Working Title Pressure-Test');
        md += nfLine('Working title', s.workingTitle);
        md += nfLine('Title rationale', s.titleRationale);
        md += nfLine('Alternatives', s.alternatives);
        return md;
    },
    'dna-consolidate'(state) {
        const s = nfStage(state, 'dna-consolidate');
        let md = heading('Book DNA Consolidation');
        md += nfLine('Final title', s.finalTitle);
        md += nfLine('Core promise', s.corePromise);
        md += nfLine('Transformation', s.transformation);
        md += nfLine('Pipeline', s.pipeline);
        return md;
    },
    // Pipeline A
    'pa-thesis'(state) {
        const s = nfStage(state, 'pa-thesis');
        let md = heading('Core Thesis');
        md += nfLine('Thesis', s.thesis);
        md += nfLine('Supporting argument', s.supportingArgument);
        return md;
    },
    'pa-framework'(state) {
        const s = nfStage(state, 'pa-framework');
        let md = heading('Framework Design');
        md += nfLine('Model name', s.modelName);
        md += nfLine('Framework description', s.frameworkDescription);
        if (Array.isArray(s.steps)) {
            md += heading('Steps / Phases', 3);
            md += nfList(s.steps);
        }
        if (Array.isArray(s.principles)) {
            md += heading('Principles', 3);
            md += nfList(s.principles);
        }
        return md;
    },
    'pa-chapters'(state) {
        const s = nfStage(state, 'pa-chapters');
        const chapters = Array.isArray(s.chapters) ? s.chapters : [];
        let md = heading('Chapter Plan');
        for (const ch of chapters) {
            const num = ch.number ?? ch.chapterNumber ?? '?';
            const title = ch.title ?? ch.chapterTitle ?? `Chapter ${num}`;
            md += heading(`Chapter ${num} — ${title}`, 3);
            if (ch.linkedPrinciple)
                md += nfLine('Principle', ch.linkedPrinciple);
            if (ch.job ?? ch.mission)
                md += nfLine('Job', ch.job ?? ch.mission);
            if (ch.keyEvidence)
                md += nfLine('Key evidence', ch.keyEvidence);
            if (ch.wordCountEstimate)
                md += nfLine('Word target', ch.wordCountEstimate);
        }
        return md;
    },
    'pa-master'(state) {
        const s = nfStage(state, 'pa-master');
        let md = heading('Pipeline A Master Document');
        md += nfLine('Generated at', s.generatedAt);
        md += `\nSee [nf-master-document.md](../nf-master-document.md) for the full planning output.\n`;
        return md;
    },
    // Pipeline B
    'pb-chapters'(state) {
        const s = nfStage(state, 'pb-chapters');
        const chapters = Array.isArray(s.chapters) ? s.chapters : [];
        let md = heading('Chapter Plan');
        for (const ch of chapters) {
            const num = ch.number ?? '?';
            const title = ch.title ?? `Chapter ${num}`;
            md += heading(`Chapter ${num} — ${title}`, 3);
            if (ch.chapterQuestion)
                md += nfLine('Question', ch.chapterQuestion);
            if (ch.mission)
                md += nfLine('Mission', ch.mission);
            if (ch.keyEvidence)
                md += nfLine('Key evidence', ch.keyEvidence);
        }
        return md;
    },
    'pb-master'(state) {
        const s = nfStage(state, 'pb-master');
        let md = heading('Pipeline B Master Document');
        md += nfLine('Generated at', s.generatedAt);
        md += `\nSee [nf-master-document.md](../nf-master-document.md) for the full planning output.\n`;
        return md;
    },
    // Pipeline C
    'pc-lessons'(state) {
        const s = nfStage(state, 'pc-lessons');
        const lessons = Array.isArray(s.lessons) ? s.lessons : [];
        let md = heading('Lesson / Chapter Plan');
        for (const ch of lessons) {
            const num = ch.number ?? '?';
            const title = ch.lessonTitle ?? ch.title ?? `Lesson ${num}`;
            md += heading(`Lesson ${num} — ${title}`, 3);
            if (ch.learningObjective)
                md += nfLine('Objective', ch.learningObjective);
            if (ch.keyEvidence)
                md += nfLine('Key evidence', ch.keyEvidence);
        }
        return md;
    },
    'pc-master'(state) {
        const s = nfStage(state, 'pc-master');
        let md = heading('Pipeline C Master Document');
        md += nfLine('Generated at', s.generatedAt);
        md += `\nSee [nf-master-document.md](../nf-master-document.md) for the full planning output.\n`;
        return md;
    },
};
/**
 * Write a per-stage markdown document to
 * `<projectPath>/output/stages/<stageId>.md`.
 *
 * Returns the absolute path written, or null if no renderer exists for
 * the given stageId.
 */
async function writeStageDoc(stageId, state, projectPath) {
    const renderer = renderers[stageId] ?? nfRenderers[stageId];
    if (!renderer)
        return null;
    const outputDir = path.resolve(projectPath, 'planning', 'stages');
    fs.mkdirSync(outputDir, { recursive: true });
    const title = state._meta?.projectTitle || 'Untitled Novel';
    const header = `<!-- Stage: ${stageId} — Auto-generated by storyline save. Do not edit manually. -->\n\n`;
    const meta = `_Project: ${title} · Updated: ${new Date().toISOString()}_\n\n---\n\n`;
    const body = renderer(state);
    const filePath = path.resolve(outputDir, `${stageId}.md`);
    await fsPromises.writeFile(filePath, header + meta + body);
    return filePath;
}
//# sourceMappingURL=stage-doc.js.map