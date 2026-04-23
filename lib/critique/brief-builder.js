// Critique brief builder — assembles the JSON bundle the draft critic
// reads when the writer invokes /critique on a chapter.
//
// The brief is the single source of truth for the critic. Anything the
// agent quotes (prose or plan) must come from this bundle; the agent
// is instructed to refuse otherwise. Keep the shape stable and the
// fields well-named — this is a contract, not an internal helper.
//
// Shape:
//   {
//     chapter:        { number, filename, title, wordCount, sceneCount, pov },
//     prose:          "...full markdown...",
//     chapterPlan:    state.chapterOutline entry (or null),
//     beatPlan:       state.beatSheet.beats[chapterPlan.beat] (or null),
//     driftFindings:  [...findings filtered to this chapter],
//     protagonist:    state.protagonist (or null),
//   }
//
// On failure, returns { error: { code, message, chapterNumber } } — never
// a half-empty bundle. Callers (the CLI verb, the skill) decide whether
// to surface or recover.

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { snapshotManuscript } from '../manuscript/snapshot.js';
import { compareManuscriptToPlan } from '../manuscript/compare.js';

// Stage-doc filename patterns that indicate the writer ran the planning
// stage but the structured slice never reached state.json. Mirrors
// lib/doctor.js DOC_PATTERNS — kept in sync deliberately. When the
// brief-builder hits NO_CHAPTER_PLAN we scan for these and surface a
// much more diagnostic error than "you haven't planned this stage."
const STAGE_DOC_PATTERNS = [
  { match: /chapter[-_]flesh[-_]out/i, stageId: 'chapterOutline', stageName: 'Stage 12 (Chapter Flesh-Out)' },
  { match: /beat[-_]sheet/i,            stageId: 'beatSheet',      stageName: 'Stage 7 (Beat Sheet)' },
  { match: /protagonist/i,              stageId: 'protagonist',    stageName: 'Stage 3 (Protagonist)' },
];

async function findOrphanStageDocs(projectPath, stageId) {
  const docsDir = resolve(projectPath, 'docs');
  let entries;
  try {
    entries = await fs.readdir(docsDir);
  } catch {
    return [];
  }
  const matchers = STAGE_DOC_PATTERNS.filter(p => p.stageId === stageId);
  if (matchers.length === 0) return [];
  return entries
    .filter(name => /\.md$/i.test(name))
    .filter(name => matchers.some(p => p.match.test(name)))
    .map(name => `docs/${name}`);
}

// Accept "3", 3, "ch03", "ch3", "chapter-03" → 3.
// Returns null if the input doesn't parse as a positive integer chapter
// reference. Story 1 is numeric-only; filename-form resolution lands in
// Story 3 alongside the chapter-resolver split.
export function parseChapterRef(ref) {
  if (ref === null || ref === undefined) return null;
  if (typeof ref === 'number' && Number.isInteger(ref) && ref > 0) return ref;
  const s = String(ref).trim().toLowerCase();
  if (!s) return null;
  // Strip a leading "ch" or "chapter-" or "chapter " prefix.
  const stripped = s.replace(/^chapter[-\s]?/, '').replace(/^ch[-\s]?/, '');
  const n = Number.parseInt(stripped, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function chapterFromPlan(state, number) {
  return (state?.chapterOutline || []).find(ch => ch.chapterNumber === number) || null;
}

function beatFromPlan(state, beatId) {
  if (!beatId) return null;
  return state?.beatSheet?.beats?.[beatId] || null;
}

function protagonistSlice(state) {
  const p = state?.protagonist;
  if (!p) return null;
  // Project to the fields the critic actually uses for arc-visibility
  // checks. Hide voice/age/occupation noise — the critic doesn't use them.
  const { name, want, need, ghost, flaw, coreLie, arcDirection } = p;
  if (!name && !want && !need && !ghost && !flaw && !coreLie) return null;
  return { name, want, need, ghost, flaw, coreLie, arcDirection };
}

function err(code, message, chapterNumber) {
  return { error: { code, message, chapterNumber } };
}

export async function buildCritiqueBrief(chapterRef, state, projectPath = process.cwd()) {
  const number = parseChapterRef(chapterRef);
  if (!number) {
    return err(
      'INVALID_CHAPTER_REF',
      `Could not parse "${chapterRef}" as a chapter number. Use a positive integer (e.g. 3) or "ch03".`,
      null,
    );
  }

  if (!state) {
    return err(
      'NO_STATE',
      'No .storyline/state.json found. Run `storyline init` and complete at least Stage 12 (Chapter Flesh-Out) before critiquing.',
      number,
    );
  }

  const manuscriptPath = state?.writing?.manuscriptPath || 'manuscript';
  const snapshot = await snapshotManuscript(projectPath, { manuscriptPath });

  const chapterMeta = snapshot.chapters.find(c => c.number === number);
  if (!chapterMeta) {
    return err(
      'CHAPTER_NOT_FOUND',
      `Chapter ${number} has no file under ${manuscriptPath}/. Drafted ${snapshot.chapterCount} chapter${snapshot.chapterCount === 1 ? '' : 's'} so far.`,
      number,
    );
  }

  const proseAbs = resolve(projectPath, manuscriptPath, chapterMeta.filename);
  let prose;
  try {
    prose = await fs.readFile(proseAbs, 'utf-8');
  } catch {
    return err(
      'CHAPTER_READ_FAILED',
      `Could not read ${proseAbs}.`,
      number,
    );
  }

  const chapterPlan = chapterFromPlan(state, number);
  if (!chapterPlan) {
    // Before reporting "no plan," check whether the writer actually DID
    // plan this stage but the data never reached state.json. This is a
    // recurring drift class: the /storyline skill writes long-form
    // docs/13-chapter-flesh-out.md but the parent harness sometimes
    // skips the corresponding `storyline-vsc save chapterOutline`
    // call. Detecting that here gives the writer a precise recovery
    // direction instead of asking them to redo work they've already done.
    const orphanDocs = await findOrphanStageDocs(projectPath, 'chapterOutline');
    if (orphanDocs.length > 0) {
      return {
        error: {
          code: 'STATE_DOC_DRIFT',
          message:
            `Chapter ${number} appears to be planned in ${orphanDocs.join(', ')} ` +
            `but state.chapterOutline is empty — the /storyline skill wrote the ` +
            `prose doc without invoking \`storyline-vsc save chapterOutline\`. ` +
            `Run \`storyline-vsc doctor\` to confirm the drift across all stages, ` +
            `then either (a) re-run /storyline and have it migrate the doc into ` +
            `state, or (b) hand-populate \`.storyline/state.json\`'s chapterOutline ` +
            `array from the doc. /critique cannot proceed until the structured ` +
            `slice reaches state.`,
          chapterNumber: number,
          orphanDocs,
        },
      };
    }
    return err(
      'NO_CHAPTER_PLAN',
      `No plan slice for chapter ${number} in state.chapterOutline. Run /storyline and complete Stage 12 (Chapter Flesh-Out) for this chapter — the critic needs the planned beat, scenes, and what-changes to do faithfulness work.`,
      number,
    );
  }

  const beatPlan = beatFromPlan(state, chapterPlan.beat);

  // Reuse the existing drift report; filter to this chapter so the
  // brief stays scoped. Pass the snapshot we already built to avoid a
  // second filesystem walk.
  const compareReport = await compareManuscriptToPlan(state, projectPath, { snapshot });
  const driftFindings = compareReport.findings.filter(f => f.chapterNumber === number);

  return {
    chapter: {
      number,
      filename: chapterMeta.filename,
      title: chapterMeta.title,
      wordCount: chapterMeta.wordCount,
      sceneCount: chapterMeta.sceneCount,
      pov: chapterMeta.pov,
    },
    prose,
    chapterPlan,
    beatPlan,
    driftFindings,
    protagonist: protagonistSlice(state),
  };
}
