// Per-stage markdown renderer — writes output/stages/<stageId>.md on every save
import pkg from 'fs-extra';
const { writeFile, ensureDir } = pkg;
import { resolve } from 'path';

const line = (k, v) => v ? `**${k}:** ${v}\n\n` : '';
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
      md += line('Book number', p.seriesContext.bookNumber);
      md += line('Series arc', p.seriesContext.seriesArc);
    }
    if (p.seriesPotential?.detected) {
      md += heading('Series Potential Detected', 3);
      md += para(p.seriesPotential.reason);
      md += line('Suggestion', p.seriesPotential.suggestion);
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
    if (!chars.length) return md + '_No supporting characters yet._\n';
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
    const rels = state.relationships || [];
    let md = heading('Relationship Web');
    if (!rels.length) return md + '_No relationships mapped yet._\n';
    rels.forEach(r => {
      md += `### ${r.characterA} ↔ ${r.characterB}\n\n`;
      md += line('Connection', r.connection);
      md += line('Conflict', r.conflict);
      md += line('Mutual want', r.whatTheyWantFromEachOther);
    });
    return md;
  },

  logline(state) {
    const l = state.logline || {};
    let md = heading('Logline');
    if (l.sentence) md += `> ${l.sentence}\n\n`;
    md += line('Setup', l.setup);
    md += line('Inciting incident', l.incitingIncident);
    md += line('Stakes', l.stakes);
    md += line('Resolution hint', l.resolutionHint);
    md += line('Antagonist question', l.antagonistQuestion);
    return md;
  },

  beatSheet(state) {
    const b = state.beatSheet || {};
    const beats = b.beats || {};
    let md = heading('Beat Sheet');
    md += line('Genre variant', b.genreVariant || 'standard');
    BEAT_ORDER.forEach(bo => {
      const beat = beats[bo.id] || {};
      md += heading(bo.name, 3);
      md += line('Scene', beat.scene);
      md += line('Image', beat.image);
      md += line('Notes', beat.notes);
      if (bo.id === 'beat08Midpoint' && beat.midpointType) {
        md += line('Type', beat.midpointType === 'falseVictory' ? 'False Victory' : 'False Defeat');
        md += line('Flip/reveal', beat.flipOrReveal);
      }
      if (bo.id === 'beat10AllIsLost') {
        md += line('Whiff of death', beat.whiffOfDeath);
      }
      if (bo.id === 'beat13Finale') {
        md += line('Self-revelation', beat.selfRevelation);
        md += line('New equilibrium', beat.newEquilibrium);
      }
    });
    if (b.overallNotes) {
      md += heading('Overall Notes', 3);
      md += para(b.overallNotes);
    }
    return md;
  },

  bStory(state) {
    const b = state.bStory || {};
    let md = heading('B Story');
    md += line('Character', b.character);
    md += line('Premise', b.premise);
    md += line('Theme connection', b.connectionToATheme || b.themeConnection);
    md += line('Resolution', b.resolution);
    if (b.beats && typeof b.beats === 'object' && !Array.isArray(b.beats)) {
      md += heading('Arc Beats', 3);
      md += line('Begins', b.beats.begins);
      md += line('Deepens', b.beats.deepens);
      md += line('Resolves', b.beats.resolves);
    }
    return md;
  },

  subplots(state) {
    const subs = state.subplots || [];
    let md = heading('Subplots');
    if (!subs.length) return md + '_No subplots defined yet._\n';
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
    const s = state.sceneOutline || {};
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
    const threads = state.plotThreads || [];
    let md = heading('Plot Thread Registry');
    if (!threads.length) return md + '_No plot threads registered yet._\n';
    md += `| Thread | Type | Introduced | Status | Resolution Plan |\n`;
    md += `|--------|------|------------|--------|----------------|\n`;
    threads.forEach(t => {
      md += `| ${t.name} | ${t.threadType || t.type || '-'} | ${t.introducedAt || '-'} | ${t.status || '-'} | ${t.resolutionPlan || '-'} |\n`;
    });
    return md + '\n';
  },

  chapterOutline(state) {
    const chapters = state.chapterOutline || [];
    let md = heading('Chapter Outline (Fleshed)');
    if (!chapters.length) return md + '_No chapters fleshed out yet._\n';
    chapters.forEach(ch => {
      md += heading(`Chapter ${ch.chapterNumber}: ${ch.chapterTitle || ''}`, 3);
      if (ch.beat) md += `*Beat: ${ch.beat}*\n\n`;
      (ch.scenes || []).forEach(sc => {
        md += `**Scene ${sc.sceneNumber}** — ${sc.location || '?'} / ${sc.timeOfDay || '?'} / POV: ${sc.pov || '?'}\n\n`;
        if (sc.summary) md += `${sc.summary}\n\n`;
        md += line('Purpose', sc.purpose);
        md += line('Conflict', sc.conflict);
        md += line('What changes', sc.whatChanges);
        md += line('Serves beats', sc.beats);
      });
    });
    return md;
  },

  critique(state) {
    const c = state.critique || {};
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
    const m = state.masterDoc || {};
    let md = heading('Master Document');
    md += line('Generated at', m.generatedAt);
    md += line('Word count estimate', m.wordCountEstimate?.toLocaleString());
    md += `\nSee [master-document.md](../master-document.md) for the full planning output.\n`;
    return md;
  },
};

export async function writeStageDoc(stageId, state) {
  const renderer = renderers[stageId];
  if (!renderer) return null;

  const outputDir = resolve(process.cwd(), 'output', 'stages');
  await ensureDir(outputDir);

  const title = state._meta?.projectTitle || 'Untitled Novel';
  const header = `<!-- Stage: ${stageId} — Auto-generated by nw save. Do not edit manually. -->\n\n`;
  const meta = `_Project: ${title} · Updated: ${new Date().toISOString()}_\n\n---\n\n`;
  const body = renderer(state);

  const filePath = resolve(outputDir, `${stageId}.md`);
  await writeFile(filePath, header + meta + body);
  return filePath;
}
