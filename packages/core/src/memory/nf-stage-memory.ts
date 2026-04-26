// @ts-nocheck
// NF stage → memory entries. Mirrors lib/memory/stage-memory.js for fiction.
// Appended to .storyline/memory.jsonl and returned in nf save payload so the
// /storyline-nf skill can push entries to mcp__odd-flow__memory_store.
//
// Coverage invariant: every material field in nfStages should have at least
// one entry here. Generic fallback handles stages not explicitly listed.

import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

const entry = (namespace, key, value, tags = []) =>
  value !== undefined && value !== null && String(value).trim()
    ? { namespace, key, value: String(value).trim(), tags }
    : null;

function compact(arr) { return arr.filter(Boolean); }

function slug(str) {
  return (str || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

// ── Per-stage builders ───────────────────────────────────────────────────────

const builders = {
  'dna-category': (state, ns, tags) => {
    const d = state.nfStages?.['dna-category'] || {};
    return compact([
      entry(ns, 'dna:category:primary', d.primaryCategory, tags),
      entry(ns, 'dna:category:sub', d.subCategory, tags),
      entry(ns, 'dna:category:amazon', d.amazonCategory, tags),
      entry(ns, 'dna:category:shelf', d.shelfDescription, tags),
      entry(ns, 'dna:category:competitor', d.competitorTitle, tags),
    ]);
  },

  'dna-reader': (state, ns, tags) => {
    const d = state.nfStages?.['dna-reader'] || {};
    const objs = (d.objections || []).map(o => typeof o === 'string' ? o : o.objection || '').filter(Boolean);
    return compact([
      entry(ns, 'dna:reader:description', d.readerDescription, tags),
      entry(ns, 'dna:reader:problem', d.readerProblem, tags),
      entry(ns, 'dna:reader:knowledge', d.existingKnowledge, tags),
      entry(ns, 'dna:reader:avatar', d.avatarName, tags),
      entry(ns, 'dna:reader:fear', d.biggestFear, tags),
      entry(ns, 'dna:reader:wish', d.deepestWish, tags),
      entry(ns, 'dna:reader:already-tried', d.alreadyTried, tags),
      objs.length ? entry(ns, 'dna:reader:objections', objs.join(' | '), tags) : null,
    ]);
  },

  'dna-transform': (state, ns, tags) => {
    const d = state.nfStages?.['dna-transform'] || {};
    return compact([
      entry(ns, 'dna:transform:before', d.beforeState || d.currentReality, tags),
      entry(ns, 'dna:transform:after', d.afterState || d.promisedOutcome, tags),
      entry(ns, 'dna:transform:sentence', d.transformationSentence, tags),
    ]);
  },

  'dna-idea': (state, ns, tags) => {
    const d = state.nfStages?.['dna-idea'] || {};
    return compact([
      entry(ns, 'dna:idea:big', d.bigIdea, tags),
      entry(ns, 'dna:idea:one-line', d.ideaSentence || d.oneLineSummary, tags),
      entry(ns, 'dna:idea:why-different', d.whyDifferent, tags),
    ]);
  },

  'dna-author': (state, ns, tags) => {
    const d = state.nfStages?.['dna-author'] || {};
    return compact([
      entry(ns, 'dna:author:angle', d.authorAngle, tags),
      entry(ns, 'dna:author:type', d.authorityType, tags),
      entry(ns, 'dna:author:access', d.uniqueAccess, tags),
      entry(ns, 'dna:author:stake', d.personalStake, tags),
      entry(ns, 'dna:author:weakness', d.potentialWeakness, tags),
      entry(ns, 'dna:author:credential', d.credibilitySource, tags),
    ]);
  },

  'dna-promise': (state, ns, tags) => {
    const d = state.nfStages?.['dna-promise'] || {};
    return compact([
      entry(ns, 'dna:promise:core', d.corePromise, tags),
      entry(ns, 'dna:promise:subtitle', d.workingSubtitle || d.subtitleDraft, tags),
      entry(ns, 'dna:promise:alt-subtitle', d.subtitleAlt, tags),
    ]);
  },

  'dna-comps': (state, ns, tags) => {
    const d = state.nfStages?.['dna-comps'] || {};
    const out = compact([entry(ns, 'dna:comps:gap', d.marketGap || d.gap, tags)]);
    (d.comps || []).forEach((c, i) => {
      out.push(...compact([
        entry(ns, `dna:comps:${i}:title`, c.title, tags),
        entry(ns, `dna:comps:${i}:author`, c.author, tags),
        entry(ns, `dna:comps:${i}:gap`, c.yourGap || c.gap, tags),
        entry(ns, `dna:comps:${i}:what-it-does`, c.whatItDoes || c.whatTheyGotRight, tags),
      ]));
    });
    return out;
  },

  'dna-voice': (state, ns, tags) => {
    const d = state.nfStages?.['dna-voice'] || {};
    return compact([
      entry(ns, 'dna:voice:register', d.voiceRegister, tags),
      entry(ns, 'dna:voice:adjectives', (d.voiceAdjectives || d.toneDescriptors || []).join(', '), tags),
      entry(ns, 'dna:voice:example', d.voiceExample, tags),
      entry(ns, 'dna:voice:not-this', d.voiceNotThis, tags),
      entry(ns, 'dna:voice:references', (d.voiceReferences || []).join(', '), tags),
      entry(ns, 'dna:voice:range', d.voiceRange, tags),
    ]);
  },

  'dna-evidence': (state, ns, tags) => {
    const d = state.nfStages?.['dna-evidence'] || {};
    return compact([
      entry(ns, 'dna:evidence:primary-type', d.primaryEvidenceType, tags),
      entry(ns, 'dna:evidence:secondary-type', d.secondaryEvidenceType, tags),
      entry(ns, 'dna:evidence:uncertainty', d.uncertaintyHandling, tags),
      entry(ns, 'dna:evidence:rigor', d.sourcingRigor, tags),
      entry(ns, 'dna:evidence:weakness', d.evidenceWeakness, tags),
    ]);
  },

  'dna-commercial': (state, ns, tags) => {
    const d = state.nfStages?.['dna-commercial'] || {};
    return compact([
      entry(ns, 'dna:commercial:model', d.commercialModel || d.bookPrimaryGoal, tags),
      entry(ns, 'dna:commercial:success', d.successMetric || d.successIn12Months, tags),
      entry(ns, 'dna:commercial:series', d.seriesPlanned !== undefined ? String(d.seriesPlanned) : null, tags),
      entry(ns, 'dna:commercial:beyond-book', d.beyondBook, tags),
    ]);
  },

  'dna-title': (state, ns, tags) => {
    const d = state.nfStages?.['dna-title'] || {};
    return compact([
      entry(ns, 'dna:title:north-star', d.northStar || d.workingTitle, tags),
      entry(ns, 'dna:title:risk', d.titleRisk, tags),
      entry(ns, 'dna:title:does-job', d.titleDoesJob, tags),
      entry(ns, 'dna:title:alternates', (d.workingTitles || d.altTitles || []).join(' | '), tags),
    ]);
  },

  'dna-consolidate': (state, ns, tags) => {
    const d = state.nfStages?.['dna-consolidate'] || {};
    return compact([
      entry(ns, 'dna:consolidate:pipeline', d.confirmedPipeline, tags),
      entry(ns, 'dna:consolidate:positioning', d.positioningStatement || d.elevatorPitch, tags),
      entry(ns, 'dna:consolidate:risk', d.biggestRisk, tags),
      entry(ns, 'dna:consolidate:fix', d.oneThingToFix, tags),
    ]);
  },

  'pa-thesis': (state, ns, tags) => {
    const d = state.nfStages?.['pa-thesis'] || {};
    return compact([
      entry(ns, 'pa:thesis', d.thesis, tags),
      entry(ns, 'pa:thesis:before', d.thesisBefore, tags),
      entry(ns, 'pa:thesis:after', d.thesisAfter, tags),
      entry(ns, 'pa:thesis:sentence', d.thesisSentence, tags),
    ]);
  },

  'pa-objections': (state, ns, tags) => {
    const d = state.nfStages?.['pa-objections'] || {};
    const objs = d.objections || [];
    const out = compact([entry(ns, 'pa:objections:unanswered', d.unansweredObjection, tags)]);
    objs.forEach((o, i) => {
      out.push(...compact([
        entry(ns, `pa:objections:${i}:text`, typeof o === 'string' ? o : o.objection, tags),
        entry(ns, `pa:objections:${i}:response`, o.response, tags),
        entry(ns, `pa:objections:${i}:chapter`, o.chapterOrPrinciple !== undefined ? String(o.chapterOrPrinciple) : null, tags),
      ]));
    });
    return out;
  },

  'pa-framework': (state, ns, tags) => {
    const d = state.nfStages?.['pa-framework'] || {};
    return compact([
      entry(ns, 'pa:framework:name', d.modelName, tags),
      entry(ns, 'pa:framework:shape', d.frameworkShape, tags),
      entry(ns, 'pa:framework:sub-mode', d.subMode, tags),
      entry(ns, 'pa:framework:logic', d.frameworkLogic, tags),
      entry(ns, 'pa:framework:cover-accent', d.coverAccent, tags),
    ]);
  },

  'pa-principles': (state, ns, tags) => {
    const d = state.nfStages?.['pa-principles'] || {};
    const ps = d.principleDetails || d.principles || [];
    const out = [];
    ps.forEach((p, i) => {
      out.push(...compact([
        entry(ns, `pa:principle:${i}:name`, p.name || p.principle, tags),
        entry(ns, `pa:principle:${i}:definition`, p.deepDefinition || p.definition || p.claim, tags),
        entry(ns, `pa:principle:${i}:mechanism`, p.mechanism, tags),
        entry(ns, `pa:principle:${i}:behaviour`, p.behaviourChange, tags),
        entry(ns, `pa:principle:${i}:mistake`, p.commonMistake, tags),
      ]));
    });
    return out;
  },

  'pa-chapters': (state, ns, tags) => {
    const d = state.nfStages?.['pa-chapters'] || {};
    const chs = d.chapters || [];
    const out = [];
    chs.forEach(c => {
      out.push(...compact([
        entry(ns, `pa:chapter:${c.chapterNumber || c.number}:title`, c.title, tags),
        entry(ns, `pa:chapter:${c.chapterNumber || c.number}:principle`, c.linkedPrinciple || c.principle, tags),
        entry(ns, `pa:chapter:${c.chapterNumber || c.number}:job`, c.job, tags),
      ]));
    });
    return out;
  },

  'pa-opener': (state, ns, tags) => {
    const d = state.nfStages?.['pa-opener'] || {};
    return compact([
      entry(ns, 'pa:opener:scene', d.openerScene, tags),
      entry(ns, 'pa:opener:hook', d.openerHook, tags),
      entry(ns, 'pa:closer:vision', d.closerVision, tags),
      entry(ns, 'pa:closer:action', d.closerAction, tags),
    ]);
  },

  'pb-thesis': (state, ns, tags) => {
    const d = state.nfStages?.['pb-thesis'] || {};
    return compact([
      entry(ns, 'pb:thesis:question', d.centralQuestion, tags),
      entry(ns, 'pb:thesis:answer', d.thesisAnswer || d.thesis, tags),
      entry(ns, 'pb:thesis:takeaway', d.readerTakeaway, tags),
      entry(ns, 'pb:thesis:mode', d.narrativeMode, tags),
    ]);
  },

  'pb-cast': (state, ns, tags) => {
    const d = state.nfStages?.['pb-cast'] || {};
    const cast = d.cast || [];
    const out = compact([entry(ns, 'pb:cast:primary-subject', d.primarySubject, tags)]);
    cast.forEach((m, i) => {
      out.push(...compact([
        entry(ns, `pb:cast:${i}:name`, m.name, tags),
        entry(ns, `pb:cast:${i}:role`, m.role, tags),
        entry(ns, `pb:cast:${i}:why`, m.whyTheyMatter, tags),
        entry(ns, `pb:cast:${i}:source`, m.primarySource, tags),
      ]));
    });
    return out;
  },

  'pb-timeline': (state, ns, tags) => {
    const d = state.nfStages?.['pb-timeline'] || {};
    const events = d.timelineEvents || [];
    const out = compact([
      entry(ns, 'pb:timeline:span', d.timelineSpan, tags),
      entry(ns, 'pb:timeline:pivot', d.pivotMoment, tags),
      entry(ns, 'pb:timeline:event-count', String(events.length), tags),
    ]);
    events.forEach((e, i) => {
      out.push(...compact([
        entry(ns, `pb:timeline:${i}:date`, e.date, tags),
        entry(ns, `pb:timeline:${i}:event`, e.event || e.description, tags),
        entry(ns, `pb:timeline:${i}:significance`, e.significance, tags),
      ]));
    });
    return out;
  },

  'pb-fork': (state, ns, tags) => {
    const d = state.nfStages?.['pb-fork'] || {};
    return compact([
      entry(ns, 'pb:fork:sub-mode', d.subMode, tags),
      entry(ns, 'pb:fork:rationale', d.forkRationale, tags),
      entry(ns, 'pb:fork:challenge', d.structureChallenge, tags),
    ]);
  },

  'pb-theme': (state, ns, tags) => {
    const d = state.nfStages?.['pb-theme'] || {};
    return compact([
      entry(ns, 'pb:theme:primary', d.primaryTheme, tags),
      entry(ns, 'pb:theme:emotional-arc', d.emotionalArc, tags),
      entry(ns, 'pb:theme:closing', d.themeInClosingChapter, tags),
      entry(ns, 'pb:theme:secondary', (d.secondaryThemes || []).join(' | '), tags),
    ]);
  },

  'pb-chapters': (state, ns, tags) => {
    const d = state.nfStages?.['pb-chapters'] || {};
    const chs = d.chapters || [];
    const out = compact([entry(ns, 'pb:chapters:momentum', d.momentumNote, tags)]);
    chs.forEach(c => {
      out.push(...compact([
        entry(ns, `pb:chapter:${c.chapterNumber || c.number}:title`, c.title, tags),
        entry(ns, `pb:chapter:${c.chapterNumber || c.number}:question`, c.chapterQuestion, tags),
        entry(ns, `pb:chapter:${c.chapterNumber || c.number}:anchor`, c.anchorScene, tags),
      ]));
    });
    return out;
  },

  'pc-skill': (state, ns, tags) => {
    const d = state.nfStages?.['pc-skill'] || {};
    return compact([
      entry(ns, 'pc:skill:target', d.targetSkill, tags),
      entry(ns, 'pc:skill:category', d.skillCategory, tags),
      entry(ns, 'pc:skill:why', d.whyThisSkill, tags),
      entry(ns, 'pc:skill:definition', d.competencyDefinition, tags),
    ]);
  },

  'pc-start-level': (state, ns, tags) => {
    const d = state.nfStages?.['pc-start-level'] || {};
    return compact([
      entry(ns, 'pc:start:description', d.startingLevel, tags),
      entry(ns, 'pc:start:knowledge', d.assumedKnowledge, tags),
      entry(ns, 'pc:start:barrier', d.entryBarrier, tags),
      entry(ns, 'pc:start:misconceptions', (d.commonMisconceptions || []).join(' | '), tags),
    ]);
  },

  'pc-end-state': (state, ns, tags) => {
    const d = state.nfStages?.['pc-end-state'] || {};
    return compact([
      entry(ns, 'pc:end-state:description', d.endStateDescription, tags),
      entry(ns, 'pc:end-state:measurable', d.measurableOutcome, tags),
      entry(ns, 'pc:end-state:time', d.timeToCompetency, tags),
      entry(ns, 'pc:end-state:criteria', (d.measurableCriteria || []).join(' | '), tags),
    ]);
  },

  'pc-decompose': (state, ns, tags) => {
    const d = state.nfStages?.['pc-decompose'] || {};
    const skills = d.subSkills || [];
    const out = compact([
      entry(ns, 'pc:decompose:core', d.coreSubSkill, tags),
      entry(ns, 'pc:decompose:hardest', d.hardestSubSkill, tags),
      entry(ns, 'pc:decompose:count', String(skills.length), tags),
    ]);
    skills.forEach(s => {
      out.push(...compact([
        entry(ns, `pc:skill:${s.id}:label`, s.label, tags),
        entry(ns, `pc:skill:${s.id}:description`, s.description, tags),
      ]));
    });
    return out;
  },

  'pc-prereqs': (state, ns, tags) => {
    const d = state.nfStages?.['pc-prereqs'] || {};
    const edges = d.prereqEdges || [];
    const out = compact([
      entry(ns, 'pc:prereqs:roots', (d.rootSkills || []).join(', '), tags),
      entry(ns, 'pc:prereqs:edge-count', String(edges.length), tags),
    ]);
    edges.forEach((e, i) => {
      out.push(entry(ns, `pc:prereq:${i}`, `${e.skillId} requires ${e.requires}`, tags));
    });
    return compact(out);
  },

  'pc-lessons': (state, ns, tags) => {
    const d = state.nfStages?.['pc-lessons'] || {};
    const lessons = d.lessons || [];
    const out = compact([
      entry(ns, 'pc:lessons:pacing', d.lessonPacing, tags),
      entry(ns, 'pc:lessons:count', String(lessons.length), tags),
    ]);
    lessons.forEach((l, i) => {
      out.push(...compact([
        entry(ns, `pc:lesson:${i}:title`, l.lessonTitle || l.title, tags),
        entry(ns, `pc:lesson:${i}:skill`, l.skillId, tags),
        entry(ns, `pc:lesson:${i}:objective`, l.learningObjective, tags),
      ]));
    });
    return out;
  },

  'pc-drills': (state, ns, tags) => {
    const d = state.nfStages?.['pc-drills'] || {};
    const drills = d.drills || [];
    const out = compact([entry(ns, 'pc:drills:progression', d.drillProgression, tags)]);
    drills.forEach((dr, i) => {
      out.push(...compact([
        entry(ns, `pc:drill:${i}:title`, dr.drillTitle || dr.title, tags),
        entry(ns, `pc:drill:${i}:skill`, dr.skillId, tags),
        entry(ns, `pc:drill:${i}:task`, dr.task, tags),
        entry(ns, `pc:drill:${i}:outcome`, dr.expectedOutcome, tags),
        entry(ns, `pc:drill:${i}:mistake`, dr.commonMistake, tags),
      ]));
    });
    return out;
  },

  'pc-milestones': (state, ns, tags) => {
    const d = state.nfStages?.['pc-milestones'] || {};
    const ms = d.milestones || [];
    const out = compact([entry(ns, 'pc:milestones:final', d.finalAssessment, tags)]);
    ms.forEach((m, i) => {
      out.push(...compact([
        entry(ns, `pc:milestone:${i}:title`, m.milestoneTitle || m.title, tags),
        entry(ns, `pc:milestone:${i}:criteria`, m.passCriteria, tags),
        entry(ns, `pc:milestone:${i}:task`, m.task, tags),
      ]));
    });
    return out;
  },

  'pc-examples': (state, ns, tags) => {
    const d = state.nfStages?.['pc-examples'] || {};
    const examples = d.workedExamples || [];
    const out = compact([entry(ns, 'pc:examples:anti-patterns', d.canonicalAntiPatterns, tags)]);
    examples.forEach((ex, i) => {
      out.push(...compact([
        entry(ns, `pc:example:${i}:title`, ex.exampleTitle || ex.title, tags),
        entry(ns, `pc:example:${i}:demonstrates`, ex.demonstrates, tags),
        entry(ns, `pc:example:${i}:anti-pattern`, ex.antiPatternNote, tags),
      ]));
    });
    return out;
  },
};

// Generic fallback for stages without a specific builder
function genericBuilder(stageId, state, ns, tags) {
  const data = state?.nfStages?.[stageId] || {};
  const SKIP = new Set(['completed', 'completedAt']);
  const out = [];
  for (const [key, val] of Object.entries(data)) {
    if (SKIP.has(key)) continue;
    if (Array.isArray(val)) {
      out.push(entry(ns, `${stageId}:${key}:count`, String(val.length), tags));
      val.slice(0, 5).forEach((item, i) => {
        const text = typeof item === 'string' ? item
          : item.label || item.name || item.title || item.description || JSON.stringify(item).slice(0, 80);
        out.push(entry(ns, `${stageId}:${key}:${i}`, text, tags));
      });
    } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      out.push(entry(ns, `${stageId}:${key}`, String(val), tags));
    }
  }
  return compact(out);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function buildNfMemoryEntries(stageId, state) {
  const projectSlug = slug(state?.projectTitle);
  const ns = `nf:${projectSlug}`;
  const tags = [stageId, `pipeline:${state?.pipeline || 'dna'}`, 'nonfiction'];
  const builder = builders[stageId] || ((s, n, t) => genericBuilder(stageId, s, n, t));
  return builder(state, ns, tags);
}

export async function appendNfMemoryLog(entries, projectDir = process.cwd()) {
  if (!entries || entries.length === 0) return { entriesWithIds: [], logPath: null };

  const now = new Date().toISOString();
  const entriesWithIds = entries.map((e, i) => ({
    ...e,
    id: `${e.namespace}:${e.key}:${Date.now()}:${i}`,
    recordedAt: now,
  }));

  const storyDir = path.join(projectDir, '.storyline');
  await mkdir(storyDir, { recursive: true });
  const logPath = path.join(storyDir, 'memory.jsonl');
  const lines = entriesWithIds.map(e => JSON.stringify(e)).join('\n') + '\n';
  await appendFile(logPath, lines, 'utf-8');

  return { entriesWithIds, logPath };
}
