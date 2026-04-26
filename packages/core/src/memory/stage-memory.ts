// @ts-nocheck
// Stage → memory entries. Emitted by `storyline save` so the /storyline skill can push
// each entry to the odd-flow MCP memory (mcp__odd-flow__memory_store). Also
// appended to .storyline/memory.jsonl as a local audit log.
//
// Coverage invariant: every material field in project-state.js's DEFAULT_STATE
// should have a corresponding memory entry (except generated blobs like
// masterDoc.markdown). This is what makes the project's long-term memory
// genuinely comprehensive — a future /storyline session can answer any question
// about any stage without re-reading the whole state file. Tests in
// tests/stage-memory.test.js lock this by iterating all 14 stages.

import pkg from 'fs-extra';
const { appendFile, ensureDir } = pkg;
import { resolve, dirname } from 'path';

const slugify = (s) => (s || 'untitled')
  .toString()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);

const entry = (namespace, key, value, tags = []) => (value !== undefined && value !== null && String(value).trim())
  ? { namespace, key, value: String(value).trim(), tags }
  : null;

// All 15 Save the Cat beats + every field we want preserved. Keys match
// DEFAULT_STATE.beatSheet.beats.<beatId>.<field>. Adding a beat here is the
// only step needed to lift it into long-term memory — the loop below
// emits one entry per populated field.
const BEAT_FIELDS = {
  beat01OpeningImage:   ['scene', 'image', 'notes'],
  beat02Setup:          ['scene', 'themeStated', 'notes'],
  beat03Catalyst:       ['scene', 'incitingIncident', 'notes'],
  beat04Debate:         ['scene', 'debateQuestion', 'notes'],
  beat05BreakIntoTwo:   ['scene', 'falseReality', 'threshold', 'notes'],
  beat06BStory:         ['scene', 'bStoryIntro', 'themeConnection', 'notes'],
  beat07FunAndGames:    ['scene', 'promiseOfPremise', 'toneParity', 'notes'],
  beat08Midpoint:       ['scene', 'midpointType', 'flipOrReveal', 'stakesRaise', 'notes'],
  beat09BadGuysCloseIn: ['scene', 'pressures', 'notes'],
  beat10AllIsLost:      ['scene', 'wallopMoment', 'darkNightOfSoul', 'whiffOfDeath', 'notes'],
  beat11BlackMoment:    ['scene', 'defeatType', 'despair', 'whatMakesThemTry', 'notes'],
  beat12Beat13:         ['scene', 'secondDoorway', 'forcedReexamination', 'notes'],
  beat13Finale:         ['scene', 'climaxType', 'selfRevelation', 'newEquilibrium', 'notes'],
  beat14FinalImage:     ['scene', 'contrastToOpening', 'notes'],
  beat15EndCredits:     ['scene', 'reflection'],
};

// Per-chapter fields worth lifting out of chapterOutline[] alongside the
// nested scenes[]. Missing: `scenes` is expanded separately below.
const CHAPTER_META_FIELDS = ['chapterTitle', 'beat', 'estimatedWords'];

// Per-scene fields, one entry each. This is what makes chapter-level
// memory useful: a future session can ask "what does Jane do in Ch 18,
// Scene 2?" and the answer is one lookup, not re-reading the whole plan.
const SCENE_FIELDS = [
  'pov', 'location', 'timeOfDay', 'summary', 'purpose',
  'conflict', 'whatChanges', 'beats', 'notes',
];

const builders = {
  genre(state, ns, tags) {
    const g = state.genre || {};
    return [
      entry(ns, 'genre:primary', g.primaryGenre, tags),
      entry(ns, 'genre:sub', g.subGenre, tags),
      entry(ns, 'genre:tone', g.tone, tags),
      entry(ns, 'genre:audience', g.audience, tags),
      entry(ns, 'genre:variant', g.genreVariant, tags),
      entry(ns, 'genre:target-word-count', g.targetWordCount, tags),
    ];
  },

  premise(state, ns, tags) {
    const p = state.premise || {};
    const out = [
      entry(ns, 'premise:logline', p.rawLogline, tags),
      entry(ns, 'premise:hook', p.conceptHook, tags),
    ];
    if (p.seriesContext?.isSeries) {
      const sc = p.seriesContext;
      out.push(entry(ns, 'premise:series-title', sc.seriesTitle, [...tags, 'series']));
      out.push(entry(ns, 'premise:series-book-count', sc.bookCount, [...tags, 'series']));
      out.push(entry(ns, 'premise:series-current-book', sc.currentBookNumber, [...tags, 'series']));
      out.push(entry(ns, 'premise:series-arc', sc.overallArc, [...tags, 'series']));
      out.push(entry(ns, 'premise:series-book-focus', sc.firstBookFocus, [...tags, 'series']));
    }
    if (p.seriesPotential?.detected) {
      out.push(entry(ns, 'premise:series-potential', p.seriesPotential.suggestion, [...tags, 'series-detection']));
    }
    return out;
  },

  protagonist(state, ns, tags) {
    const p = state.protagonist || {};
    return [
      entry(ns, 'protagonist:name', p.name, tags),
      entry(ns, 'protagonist:age', p.age, tags),
      entry(ns, 'protagonist:occupation', p.occupation, tags),
      entry(ns, 'protagonist:wound', p.ghost, [...tags, 'inner-engine']),
      entry(ns, 'protagonist:lie', p.coreLie, [...tags, 'inner-engine']),
      entry(ns, 'protagonist:flaw', p.flaw, [...tags, 'inner-engine']),
      entry(ns, 'protagonist:want', p.want, [...tags, 'inner-engine']),
      entry(ns, 'protagonist:need', p.need, [...tags, 'inner-engine']),
      entry(ns, 'protagonist:arc', p.arcDirection, tags),
      entry(ns, 'protagonist:voice', p.voice, tags),
      entry(ns, 'protagonist:ordinary-world', p.dailyLife, tags),
    ];
  },

  // One entry per field per character, not one summary line. A future
  // session asking "what's Bob's flaw?" gets a direct lookup.
  characters(state, ns, tags) {
    const out = [];
    (state.characters || []).forEach((c, i) => {
      const slug = slugify(c.name) || `character-${i}`;
      const ctags = [...tags, 'supporting-cast', slug];
      out.push(entry(ns, `character:${slug}:role`, c.role, ctags));
      out.push(entry(ns, `character:${slug}:want`, c.want, ctags));
      out.push(entry(ns, `character:${slug}:need`, c.need, ctags));
      out.push(entry(ns, `character:${slug}:flaw`, c.flaw, ctags));
      out.push(entry(ns, `character:${slug}:ghost`, c.ghost, ctags));
      out.push(entry(ns, `character:${slug}:relation-to-protagonist`, c.relationshipToProtagonist, ctags));
      out.push(entry(ns, `character:${slug}:arc`, c.arcSummary, ctags));
      out.push(entry(ns, `character:${slug}:enters-at`, c.meetsProtagonistAt, ctags));
    });
    return out;
  },

  relationships(state, ns, tags) {
    const out = [];
    (state.relationships || []).forEach((r, i) => {
      const slug = `${slugify(r.characterA)}-${slugify(r.characterB)}-${i}`;
      const rtags = [...tags, 'relationship', slug];
      out.push(entry(ns, `relationship:${slug}:pair`, `${r.characterA} ↔ ${r.characterB}`, rtags));
      out.push(entry(ns, `relationship:${slug}:connection`, r.connection, rtags));
      out.push(entry(ns, `relationship:${slug}:conflict`, r.conflict, rtags));
      out.push(entry(ns, `relationship:${slug}:mutual-want`, r.whatTheyWantFromEachOther, rtags));
    });
    return out;
  },

  logline(state, ns, tags) {
    const l = state.logline || {};
    return [
      entry(ns, 'logline:sentence', l.sentence, tags),
      entry(ns, 'logline:setup', l.setup, tags),
      entry(ns, 'logline:inciting', l.incitingIncident, tags),
      entry(ns, 'logline:stakes', l.stakes, tags),
      entry(ns, 'logline:resolution-hint', l.resolutionHint, tags),
      entry(ns, 'logline:antagonist', l.antagonistQuestion, tags),
    ];
  },

  // Every beat, every populated field. Roughly 60–90 entries when the beat
  // sheet is fully worked — which is correct: the beat sheet IS the spine
  // of the book.
  beatSheet(state, ns, tags) {
    const b = state.beatSheet || {};
    const beats = b.beats || {};
    const out = [entry(ns, 'beats:variant', b.genreVariant, tags)];
    if (b.overallNotes) out.push(entry(ns, 'beats:overall-notes', b.overallNotes, tags));
    for (const [beatId, fields] of Object.entries(BEAT_FIELDS)) {
      const beat = beats[beatId] || {};
      for (const field of fields) {
        const value = beat[field];
        if (value === undefined || value === null) continue;
        // Arrays (e.g. beat09 pressures[]) join into a single value string.
        const str = Array.isArray(value) ? value.filter(Boolean).join(' · ') : value;
        if (!String(str).trim()) continue;
        out.push(entry(ns, `beats:${beatId}:${field}`, str, [...tags, 'beat-sheet', beatId]));
      }
    }
    return out;
  },

  bStory(state, ns, tags) {
    const b = state.bStory || {};
    return [
      entry(ns, 'bstory:character', b.character, tags),
      entry(ns, 'bstory:premise', b.premise, tags),
      entry(ns, 'bstory:theme-connection', b.themeConnection, tags),
      entry(ns, 'bstory:resolution', b.resolution, tags),
    ];
  },

  subplots(state, ns, tags) {
    const out = [];
    (state.subplots || []).forEach((s, i) => {
      const slug = slugify(s.name) || `subplot-${i}`;
      const stags = [...tags, 'subplot', slug];
      out.push(entry(ns, `subplot:${slug}:driver`, s.character, stags));
      out.push(entry(ns, `subplot:${slug}:premise`, s.premise, stags));
      out.push(entry(ns, `subplot:${slug}:purpose`, s.purpose, stags));
      out.push(entry(ns, `subplot:${slug}:resolution`, s.resolution, stags));
    });
    return out;
  },

  // Each high-level sequence as its own entry. A 12-sequence outline
  // produces 12 searchable "what happens in Act 2B sequence 3" memories.
  sceneOutline(state, ns, tags) {
    const s = state.sceneOutline || {};
    const out = [
      entry(ns, 'scene-outline:approved', s.approved ? 'yes' : 'no', tags),
      entry(ns, 'scene-outline:sequence-count', (s.highLevel || []).length, tags),
    ];
    (s.highLevel || []).forEach((seq, i) => {
      const key = `scene-outline:act${seq.act || '?'}-seq${seq.sequence || i + 1}`;
      const value = [
        seq.highLevelSummary,
        seq.servesBeats ? `(serves: ${seq.servesBeats})` : null,
      ].filter(Boolean).join(' ');
      out.push(entry(ns, key, value, [...tags, 'scene-outline']));
    });
    return out;
  },

  plotThreads(state, ns, tags) {
    const out = [];
    (state.plotThreads || []).forEach((t, i) => {
      const slug = t.id || slugify(t.name) || `thread-${i}`;
      const ttags = [...tags, 'plot-thread', slug];
      out.push(entry(ns, `thread:${slug}:name`, t.name, ttags));
      out.push(entry(ns, `thread:${slug}:type`, t.threadType || t.type, ttags));
      out.push(entry(ns, `thread:${slug}:introduced-at`, t.introducedAt, ttags));
      out.push(entry(ns, `thread:${slug}:status`, t.status, ttags));
      out.push(entry(ns, `thread:${slug}:resolution`, t.resolutionPlan, ttags));
    });
    return out;
  },

  // The heavyweight. Chapter-level meta + EVERY scene as its own entry.
  // For a 33-chapter book with 2–3 scenes per chapter this produces ~100
  // scene memories — one per scene — each queryable by POV, location,
  // beat, or what-changes. This is what makes the plan genuinely usable
  // as agent memory during drafting.
  chapterOutline(state, ns, tags) {
    const chapters = state.chapterOutline || [];
    const out = [entry(ns, 'chapters:count', chapters.length, tags)];
    chapters.forEach(ch => {
      const num = ch.chapterNumber ?? '?';
      const ctags = [...tags, 'chapter', `ch${num}`];
      for (const field of CHAPTER_META_FIELDS) {
        if (ch[field] === undefined || ch[field] === null) continue;
        out.push(entry(ns, `chapter:${num}:${field.replace(/([A-Z])/g, '-$1').toLowerCase()}`, ch[field], ctags));
      }
      const scenes = ch.scenes || [];
      out.push(entry(ns, `chapter:${num}:scene-count`, scenes.length, ctags));
      scenes.forEach(sc => {
        const sNum = sc.sceneNumber ?? '?';
        const stags = [...ctags, 'scene', `ch${num}-s${sNum}`];
        for (const field of SCENE_FIELDS) {
          const value = sc[field];
          if (value === undefined || value === null) continue;
          const str = Array.isArray(value) ? value.filter(Boolean).join(' · ') : value;
          if (!String(str).trim()) continue;
          out.push(entry(ns, `chapter:${num}:scene:${sNum}:${field.replace(/([A-Z])/g, '-$1').toLowerCase()}`, str, stags));
        }
      });
    });
    return out;
  },

  // Each flagged issue as its own entry (with severity + resolution state)
  // PLUS the three narrative analysis fields as separate memories. A
  // future session can query "what pacing concerns did we raise?" or
  // "what was the character consistency note?" directly.
  critique(state, ns, tags) {
    const c = state.critique || {};
    const out = [
      entry(ns, 'critique:flagged-count', (c.flaggedIssues || []).length, tags),
      entry(ns, 'critique:resolved-count', (c.resolvedIssues || []).length, tags),
      entry(ns, 'critique:pacing-analysis', c.pacingAnalysis, [...tags, 'pacing']),
      entry(ns, 'critique:character-consistency', c.characterConsistency, [...tags, 'character-arc']),
      entry(ns, 'critique:beat-validation', c.beatSheetValidation, [...tags, 'beat-sheet']),
    ];
    (c.flaggedIssues || []).forEach((issue, i) => {
      const slug = slugify(issue.check || issue.message || `issue-${i}`) || `issue-${i}`;
      out.push(entry(ns, `critique:flagged:${slug}`,
        `[${issue.severity || 'note'}] ${issue.check ? issue.check + ': ' : ''}${issue.message || ''}${issue.resolution ? ` (resolution: ${issue.resolution})` : ''}`,
        [...tags, 'critique-issue', issue.severity || 'note'],
      ));
    });
    (c.resolvedIssues || []).forEach((issue, i) => {
      const slug = slugify(issue.check || issue.message || `resolved-${i}`) || `resolved-${i}`;
      out.push(entry(ns, `critique:resolved:${slug}`,
        `${issue.check ? issue.check + ': ' : ''}${issue.message || ''}${issue.resolution ? ` → ${issue.resolution}` : ''}`,
        [...tags, 'critique-resolved'],
      ));
    });
    return out;
  },

  masterDoc(state, ns, tags) {
    const m = state.masterDoc || {};
    return [
      entry(ns, 'masterdoc:generated-at', m.generatedAt, tags),
      entry(ns, 'masterdoc:word-count', m.wordCountEstimate, tags),
    ];
  },
};

export function buildMemoryEntries(stageId, state) {
  const projectSlug = slugify(state._meta?.projectTitle || dirname(state._meta?.projectPath || '') || 'novel');
  const namespace = `novel:${projectSlug}`;
  const baseTags = ['storyline', stageId, projectSlug];
  const builder = builders[stageId];
  if (!builder) return [];
  return builder(state, namespace, baseTags).filter(Boolean);
}

// Append entries to the durable jsonl log. Each entry gets an `id` so the
// sync layer can track which entries have been pushed to odd-flow MCP.
// Returns { logPath, entriesWithIds } — the entries now carry stable IDs
// that callers (save command) can include in stdout for the skill to use.
export async function appendMemoryLog(entries) {
  if (!entries.length) return { logPath: null, entriesWithIds: [] };
  const logDir = resolve(process.cwd(), '.storyline');
  await ensureDir(logDir);
  const logPath = resolve(logDir, 'memory.jsonl');
  const ts = new Date().toISOString();

  const entriesWithIds = entries.map((e, i) => ({
    ...e,
    id: `${ts}-${i}-${e.key}`,
    ts,
  }));
  const rows = entriesWithIds.map(e => JSON.stringify(e)).join('\n') + '\n';
  await appendFile(logPath, rows);
  return { logPath, entriesWithIds };
}
