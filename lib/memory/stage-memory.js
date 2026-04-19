// Stage → memory entries. Emitted by `nw save` so the /novel skill can push
// each entry to the odd-flow MCP memory (mcp__odd-flow__memory_store). Also
// appended to .novel-writer/memory.jsonl as a local audit log.
import pkg from 'fs-extra';
const { appendFile, ensureDir } = pkg;
import { resolve, dirname } from 'path';

const slugify = (s) => (s || 'untitled')
  .toString()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);

const entry = (namespace, key, value, tags = []) => (value && String(value).trim())
  ? { namespace, key, value: String(value).trim(), tags }
  : null;

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
      out.push(entry(ns, 'premise:series', `${p.seriesContext.seriesTitle} (book ${p.seriesContext.bookNumber})`, [...tags, 'series']));
      out.push(entry(ns, 'premise:series-arc', p.seriesContext.seriesArc, [...tags, 'series']));
    }
    return out;
  },

  protagonist(state, ns, tags) {
    const p = state.protagonist || {};
    const name = p.name || 'protagonist';
    return [
      entry(ns, 'protagonist:identity', `${name}${p.age ? `, age ${p.age}` : ''}${p.occupation ? `, ${p.occupation}` : ''}`, tags),
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

  characters(state, ns, tags) {
    return (state.characters || []).map((c, i) =>
      entry(ns, `character:${slugify(c.name) || i}`,
        `${c.name}${c.role ? ` (${c.role})` : ''} — want: ${c.want || '-'}; need: ${c.need || '-'}; flaw: ${c.flaw || '-'}; relation: ${c.relationshipToProtagonist || '-'}`,
        [...tags, 'supporting-cast']
      )
    );
  },

  relationships(state, ns, tags) {
    return (state.relationships || []).map((r, i) =>
      entry(ns, `relationship:${slugify(r.characterA)}-${slugify(r.characterB)}-${i}`,
        `${r.characterA} ↔ ${r.characterB}. Connection: ${r.connection || '-'}. Conflict: ${r.conflict || '-'}.`,
        tags
      )
    );
  },

  logline(state, ns, tags) {
    const l = state.logline || {};
    return [
      entry(ns, 'logline:sentence', l.sentence, tags),
      entry(ns, 'logline:setup', l.setup, tags),
      entry(ns, 'logline:inciting', l.incitingIncident, tags),
      entry(ns, 'logline:stakes', l.stakes, tags),
      entry(ns, 'logline:resolution-hint', l.resolutionHint, tags),
    ];
  },

  beatSheet(state, ns, tags) {
    const b = state.beatSheet || {};
    const beats = b.beats || {};
    const important = ['beat01OpeningImage', 'beat03Catalyst', 'beat05BreakIntoTwo', 'beat08Midpoint', 'beat10AllIsLost', 'beat13Finale', 'beat14FinalImage'];
    const out = [entry(ns, 'beats:variant', b.genreVariant, tags)];
    important.forEach(id => {
      const beat = beats[id] || {};
      if (beat.scene) out.push(entry(ns, `beats:${id}`, beat.scene, [...tags, 'beat-sheet']));
    });
    return out;
  },

  bStory(state, ns, tags) {
    const b = state.bStory || {};
    return [
      entry(ns, 'bstory:character', b.character, tags),
      entry(ns, 'bstory:premise', b.premise, tags),
      entry(ns, 'bstory:theme', b.connectionToATheme || b.themeConnection, tags),
    ];
  },

  subplots(state, ns, tags) {
    return (state.subplots || []).map((s, i) =>
      entry(ns, `subplot:${slugify(s.name) || i}`,
        `${s.name}${s.character ? ` (${s.character})` : ''} — ${s.premise || '-'}`,
        [...tags, 'subplot']
      )
    );
  },

  sceneOutline(state, ns, tags) {
    const s = state.sceneOutline || {};
    return [
      entry(ns, 'scene-outline:approved', s.approved ? 'yes' : 'no', tags),
      entry(ns, 'scene-outline:sequence-count', (s.highLevel || []).length, tags),
    ];
  },

  plotThreads(state, ns, tags) {
    return (state.plotThreads || []).map((t, i) =>
      entry(ns, `thread:${slugify(t.name) || i}`,
        `${t.name} (${t.threadType || t.type || 'unknown'}) — ${t.status || '-'} — ${t.resolutionPlan || '-'}`,
        [...tags, 'plot-thread']
      )
    );
  },

  chapterOutline(state, ns, tags) {
    const chapters = state.chapterOutline || [];
    return [
      entry(ns, 'chapters:count', chapters.length, tags),
      ...chapters.map(ch =>
        entry(ns, `chapter:${ch.chapterNumber}`,
          `Ch ${ch.chapterNumber}: ${ch.chapterTitle || '-'}${ch.beat ? ` (${ch.beat})` : ''} — ${(ch.scenes || []).length} scenes`,
          [...tags, 'chapter']
        )
      ),
    ];
  },

  critique(state, ns, tags) {
    const c = state.critique || {};
    return [
      entry(ns, 'critique:flagged-count', (c.flaggedIssues || []).length, tags),
      entry(ns, 'critique:resolved-count', (c.resolvedIssues || []).length, tags),
    ];
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
  const baseTags = ['novel-writer', stageId, projectSlug];
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
  const logDir = resolve(process.cwd(), '.novel-writer');
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
