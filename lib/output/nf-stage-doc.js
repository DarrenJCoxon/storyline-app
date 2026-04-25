// Per-NF-stage markdown renderer — writes output/stages/<stageId>.md on every nf save.
// Mirrors lib/output/stage-doc.js for fiction stages.
// The skill reads stageDocPath from the save receipt and composes its narrative
// from already-saved state — the doc is the narration of the commit, not its substitute.

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// ── Helpers ──────────────────────────────────────────────────────────────────

const h = (text, level = 2) => `${'#'.repeat(level)} ${text}\n\n`;
const field = (label, val) => val ? `**${label}:** ${val}\n\n` : '';
const table = (headers, rows) => {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}\n\n`;
};

function renderGenericFields(data) {
  const SKIP = new Set(['completed', 'completedAt']);
  const lines = [];
  for (const [key, val] of Object.entries(data)) {
    if (SKIP.has(key) || val === null || val === undefined) continue;
    if (Array.isArray(val)) {
      lines.push(`**${key}:** (${val.length} item${val.length === 1 ? '' : 's'})\n`);
      val.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          const summary = Object.entries(item)
            .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ');
          lines.push(`${i + 1}. ${summary || JSON.stringify(item).slice(0, 80)}`);
        } else {
          lines.push(`- ${item}`);
        }
      });
      lines.push('');
    } else if (typeof val === 'object') {
      lines.push(`**${key}:**\n`);
      Object.entries(val).forEach(([k, v]) => {
        if (v !== null && v !== undefined) lines.push(`- **${k}:** ${v}`);
      });
      lines.push('');
    } else {
      lines.push(`**${key}:** ${val}\n`);
    }
  }
  return lines.join('\n');
}

// ── Specialized renderers ────────────────────────────────────────────────────

const renderers = {
  'dna-reader'(d) {
    return [
      field('Reader description', d.readerDescription || d.avatarName),
      field('Problem', d.readerProblem),
      field('Existing knowledge', d.existingKnowledge),
      field('Biggest fear', d.biggestFear),
      field('Deepest wish', d.deepestWish),
      (d.objections?.length ? h('Objections', 3) + d.objections.map(o => `- ${typeof o === 'string' ? o : o.objection || JSON.stringify(o)}`).join('\n') + '\n\n' : ''),
    ].join('');
  },

  'dna-comps'(d) {
    const comps = d.comps || [];
    let out = field('Market gap', d.marketGap || d.gap);
    if (comps.length) {
      out += table(
        ['Title', 'Author', 'Year', 'What It Does', 'Your Gap'],
        comps.map(c => [c.title || '', c.author || '', c.year || '', c.whatItDoes || c.whatTheyGotRight || '', c.yourGap || c.gap || '']),
      );
    }
    return out;
  },

  'pa-objections'(d) {
    const objs = d.objections || [];
    if (!objs.length) return renderGenericFields(d);
    return table(
      ['Objection', 'Source', 'Response', 'Chapter/Principle'],
      objs.map(o => [
        typeof o === 'string' ? o : o.objection || '',
        o.source || '',
        o.response || '',
        o.chapterOrPrinciple !== undefined ? String(o.chapterOrPrinciple) : '',
      ]),
    );
  },

  'pa-framework'(d) {
    return [
      field('Framework name', d.modelName),
      field('Shape', d.frameworkShape),
      field('Sub-mode', d.subMode),
      field('Logic', d.frameworkLogic),
      (d.principles?.length ? h('Principles', 3) + d.principles.map((p, i) => `${i + 1}. **${p.name || p}** — ${p.definition || p.claim || ''}`).join('\n') + '\n\n' : ''),
      (d.layers?.length ? h('Layers', 3) + d.layers.map((l, i) => `${i + 1}. ${l}`).join('\n') + '\n\n' : ''),
    ].join('');
  },

  'pa-principles'(d) {
    const ps = d.principleDetails || d.principles || [];
    return ps.map((p, i) => [
      h(`${i + 1}. ${p.name || p.principle || ''}`, 3),
      field('Definition', p.deepDefinition || p.definition || p.claim),
      field('Mechanism', p.mechanism),
      field('Behaviour change', p.behaviourChange),
      field('Common mistake', p.commonMistake),
    ].join('')).join('') || renderGenericFields(d);
  },

  'pa-chapters'(d) {
    const chs = d.chapters || [];
    if (!chs.length) return renderGenericFields(d);
    return table(
      ['#', 'Title', 'Principle', 'Job', 'Reader Arc'],
      chs.map(c => [
        String(c.chapterNumber || c.number || ''),
        c.title || '',
        c.linkedPrinciple || c.principle || '',
        c.job || '',
        c.readerArcStart && c.readerArcEnd ? `${c.readerArcStart} → ${c.readerArcEnd}` : '',
      ]),
    );
  },

  'pb-cast'(d) {
    const cast = d.cast || [];
    let out = field('Primary subject', d.primarySubject);
    cast.forEach(m => {
      out += h(m.name || 'Unknown', 3);
      out += field('Role', m.role);
      out += field('Why they matter', m.whyTheyMatter);
      out += field('Primary source', m.primarySource);
      out += field('Sourcing gap', m.sourcingGap);
      if (m.chapters?.length) out += `**Chapters:** ${m.chapters.join(', ')}\n\n`;
    });
    return out || renderGenericFields(d);
  },

  'pb-timeline'(d) {
    const events = d.timelineEvents || [];
    let out = field('Timeline span', d.timelineSpan);
    out += field('Pivot moment', d.pivotMoment);
    if (events.length) {
      out += table(
        ['Date', 'Event', 'Cast', 'Significance'],
        events.map(e => {
          const cast = Array.isArray(e.castInvolved || e.cast) ? (e.castInvolved || e.cast).join(', ') : (e.castInvolved || e.cast || '');
          return [e.date || '', `${e.event || e.description || ''}${e.isPivotMoment ? ' ⭐' : ''}`, cast, e.significance || ''];
        }),
      );
    }
    return out;
  },

  'pb-scenes'(d) {
    const scenes = d.scenes || [];
    if (!scenes.length) return renderGenericFields(d);
    return field('Missing scenes', d.missingScenes) + table(
      ['Scene', 'What', 'Who', 'Proves', 'Chapter'],
      scenes.map(s => [s.sceneTitle || s.title || '', s.what || '', s.who || '', s.proves || '', String(s.chapter || '')]),
    );
  },

  'pb-chapters'(d) {
    const chs = d.chapters || [];
    let out = field('Momentum note', d.momentumNote);
    if (!chs.length) return out + renderGenericFields(d);
    out += table(
      ['#', 'Title', 'Question', 'Anchor Scene', 'Role'],
      chs.map(c => [
        String(c.chapterNumber || c.number || ''),
        c.title || '',
        c.chapterQuestion || '',
        c.anchorScene || '',
        c.role || '',
      ]),
    );
    return out;
  },

  'pc-decompose'(d) {
    const skills = d.subSkills || [];
    let out = field('Core sub-skill', d.coreSubSkill);
    out += field('Hardest sub-skill', d.hardestSubSkill);
    if (skills.length) {
      out += table(
        ['ID', 'Label', 'Description'],
        skills.map(s => [s.id || '', s.label || '', s.description || '']),
      );
    }
    return out;
  },

  'pc-prereqs'(d) {
    const edges = d.prereqEdges || [];
    let out = field('Root skills (no prerequisites)', (d.rootSkills || []).join(', '));
    if (edges.length) {
      out += table(
        ['Skill', 'Requires'],
        edges.map(e => [e.skillId || '', e.requires || '']),
      );
    }
    return out;
  },

  'pc-lessons'(d) {
    const lessons = d.lessons || [];
    let out = field('Lesson pacing', d.lessonPacing);
    if (!lessons.length) return out + renderGenericFields(d);
    out += table(
      ['#', 'Lesson', 'Skill ID', 'Objective'],
      lessons.map((l, i) => [String(i + 1), l.lessonTitle || l.title || '', l.skillId || '', l.learningObjective || '']),
    );
    return out;
  },

  'pc-drills'(d) {
    const drills = d.drills || [];
    let out = field('Drill progression', d.drillProgression);
    drills.forEach((dr, i) => {
      out += h(`Drill ${i + 1}: ${dr.drillTitle || dr.title || ''}`, 3);
      out += field('Skill', dr.skillId) + field('Difficulty', dr.difficulty);
      out += field('Setup', dr.setup);
      out += field('Task', dr.task);
      out += field('Expected outcome', dr.expectedOutcome);
      out += field('Common mistake', dr.commonMistake);
    });
    return out || renderGenericFields(d);
  },

  'pc-milestones'(d) {
    const ms = d.milestones || [];
    let out = field('Final assessment', d.finalAssessment);
    ms.forEach((m, i) => {
      out += h(`Milestone ${i + 1}: ${m.milestoneTitle || m.title || ''}`, 3);
      out += field('After lesson', m.afterLesson);
      if (m.subSkillsCovered?.length) out += `**Skills covered:** ${m.subSkillsCovered.join(', ')}\n\n`;
      out += field('Task', m.task);
      out += field('Pass criteria', m.passCriteria);
      out += field('Failure guidance', m.failureGuidance);
    });
    return out || renderGenericFields(d);
  },

  'pc-examples'(d) {
    const examples = d.workedExamples || [];
    let out = '';
    examples.forEach((ex, i) => {
      out += h(`Example ${i + 1}: ${ex.exampleTitle || ex.title || ''}`, 3);
      out += field('Skill', ex.skillId);
      out += field('Scenario', ex.scenario);
      out += field('Demonstrates', ex.demonstrates);
      out += field('Anti-pattern note', ex.antiPatternNote);
    });
    if (d.canonicalAntiPatterns) out += h('Canonical Anti-Patterns', 3) + d.canonicalAntiPatterns + '\n\n';
    return out || renderGenericFields(d);
  },
};

// ── Stage heading map ────────────────────────────────────────────────────────

const STAGE_HEADINGS = {
  'dna-category': 'Category & Market Positioning',
  'dna-reader': 'Reader Avatar',
  'dna-transform': 'Reader Transformation',
  'dna-idea': 'The One Big Idea',
  'dna-author': 'Author Angle & Authority',
  'dna-promise': 'Core Promise & Subtitle Engineering',
  'dna-comps': 'Comps Deep Dive',
  'dna-voice': 'Voice & Tone',
  'dna-evidence': 'Evidence Philosophy',
  'dna-commercial': 'Commercial Model',
  'dna-title': 'Working Title Pressure-Test',
  'dna-consolidate': 'Book DNA Consolidation',
  'pa-thesis': 'Core Thesis',
  'pa-objections': 'Reader Objections',
  'pa-framework': 'Framework Design',
  'pa-principles': 'Principles / Laws',
  'pa-evidence': 'Evidence Map',
  'pa-application': 'Application Layer',
  'pa-braid': 'Narrative Braid',
  'pa-chapters': 'Chapter Plan',
  'pa-opener': 'Opener & Closer Design',
  'pa-critique': 'Consistency & Critique',
  'pa-master': 'Master Document',
  'pb-thesis': 'Central Question / Thesis',
  'pb-cast': 'Cast of Real People',
  'pb-timeline': 'Timeline',
  'pb-fork': 'Structural Fork',
  'pb-scenes': 'Scene List',
  'pb-sourcing': 'Sourcing Register',
  'pb-theme': 'Thematic Through-Line',
  'pb-chapters': 'Chapter Outline',
  'pb-critique': 'Consistency & Critique',
  'pb-master': 'Master Document',
  'pc-skill': 'Target Skill',
  'pc-start-level': 'Reader Starting Level',
  'pc-end-state': 'End-State Competency',
  'pc-decompose': 'Skill Decomposition',
  'pc-prereqs': 'Prerequisite Graph',
  'pc-lessons': 'Lesson Plan',
  'pc-drills': 'Exercise / Drill Design',
  'pc-milestones': 'Milestone / Assessment Design',
  'pc-examples': 'Worked Examples & Common Mistakes',
  'pc-critique': 'Consistency & Critique',
  'pc-master': 'Master Document',
};

// ── Public API ────────────────────────────────────────────────────────────────

export async function writeNfStageDoc(stageId, state, projectDir = process.cwd()) {
  const heading = STAGE_HEADINGS[stageId] || stageId;
  const rawData = state?.nfStages?.[stageId] || {};
  const { completed, completedAt, ...stageData } = rawData;

  const renderFn = renderers[stageId] || renderGenericFields;
  const body = renderFn(stageData);

  const pipelineLabel = state?.pipeline ? `Pipeline ${state.pipeline}` : 'Book DNA';
  const projectTitle = state?.projectTitle || 'Untitled';

  const md = [
    `# ${heading}`,
    '',
    `*Project: **${projectTitle}** | ${pipelineLabel} | Stage: \`${stageId}\` | Saved: ${completedAt || new Date().toISOString()}*`,
    '',
    body.trim(),
    '',
  ].join('\n');

  const stagesDir = path.join(projectDir, 'output', 'stages');
  await mkdir(stagesDir, { recursive: true });
  const docPath = path.join(stagesDir, `${stageId}.md`);
  await writeFile(docPath, md, 'utf-8');
  return docPath;
}
