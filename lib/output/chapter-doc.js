// Per-chapter planning card — one file per chapter under docs/chapters/.
// Writer opens the card in one VS Code pane and the matching manuscript/chapter-NN.md
// in the other, working scene by scene. The card is the Scrivener-style index card
// for that chapter: what it must do, POV, beat it serves, scene breakdown with
// entry/exit/conflict/what-changes for each scene.
//
// Generated from state.chapterOutline[n] on every `storyline save chapterOutline`.
// Replaces the previous single docs/13-chapter-flesh-out.md — one card per chapter
// is what a writer actually drafts from.

import { writeFile, mkdir, readdir, unlink } from 'fs/promises';
import path from 'path';

// Canonical beat IDs match lib/state/project-state.js. The schema-coverage
// test in tests/fiction-drift.test.js fails loudly if these ever diverge.
const BEAT_NAMES = {
  beat01OpeningImage: 'Opening Image',
  beat02Setup: 'Setup',
  beat03Catalyst: 'Catalyst',
  beat04Debate: 'Debate',
  beat05BreakIntoTwo: 'Break Into Two',
  beat06BStory: 'B Story',
  beat07FunAndGames: 'Fun and Games',
  beat08Midpoint: 'Midpoint',
  beat09BadGuysCloseIn: 'Bad Guys Close In',
  beat10AllIsLost: 'All Is Lost',
  beat11BlackMoment: 'Black Moment',
  beat12Beat13: 'Break Into Three',
  beat13Finale: 'Finale',
  beat14FinalImage: 'Final Image',
  beat15EndCredits: 'End Credits',
};

function beatLabel(beatKey) {
  if (!beatKey) return null;
  return BEAT_NAMES[beatKey] || beatKey;
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function chapterFileName(chapter) {
  const num = String(chapter.chapterNumber ?? 0).padStart(2, '0');
  const slug = slugify(chapter.chapterTitle);
  return slug ? `${num}-${slug}.md` : `${num}.md`;
}

// Renders one chapter planning card. Pure function — no FS.
export function renderChapterCard(chapter, state = {}) {
  const num = chapter.chapterNumber ?? '?';
  const title = chapter.chapterTitle || `Chapter ${num}`;
  const beat = beatLabel(chapter.beat);
  const scenes = chapter.scenes || [];

  const lines = [];
  lines.push(`# Chapter ${num} — ${title}`);
  lines.push('');

  // Chapter-level metadata strip
  const meta = [];
  if (beat) meta.push(`**Beat:** ${beat}`);
  if (scenes.length) {
    const povs = [...new Set(scenes.map(s => s.pov).filter(Boolean))];
    if (povs.length) meta.push(`**POV:** ${povs.join(', ')}`);
    const locs = scenes.map(s => s.location).filter(Boolean);
    if (locs.length) meta.push(`**Location:** ${locs.join(' → ')}`);
  }
  if (chapter.estimatedWords) meta.push(`**Target length:** ~${chapter.estimatedWords.toLocaleString()} words`);
  if (scenes.length) meta.push(`**Scenes:** ${scenes.length}`);
  if (meta.length) {
    lines.push(meta.join('  ·  '));
    lines.push('');
  }

  // Protagonist anchor — one line, so the writer sees the arc context
  // while drafting without having to flip to another file.
  const proto = state.protagonist;
  if (proto?.name) {
    const want = proto.want ? ` · wants **${proto.want}**` : '';
    const need = proto.need ? ` · needs **${proto.need}**` : '';
    const flaw = proto.flaw ? ` · flaw: ${proto.flaw}` : '';
    lines.push(`> *${proto.name}${want}${need}${flaw}*`);
    lines.push('');
  }

  if (!scenes.length) {
    lines.push('_No scenes fleshed out for this chapter yet._');
    lines.push('');
    return lines.join('\n');
  }

  // Scenes
  scenes.forEach((sc) => {
    const n = sc.sceneNumber ?? '?';
    const title = sc.summary ? ` — ${sc.summary}` : '';
    const wc = typeof sc.estimatedWords === 'number' ? ` (~${sc.estimatedWords.toLocaleString()} words)` : '';
    lines.push(`## Scene ${n}${title}${wc}`);
    lines.push('');

    const scMeta = [];
    if (sc.pov) scMeta.push(`**POV:** ${sc.pov}`);
    if (sc.location) scMeta.push(`**Location:** ${sc.location}`);
    if (sc.timeOfDay) scMeta.push(`**Time:** ${sc.timeOfDay}`);
    if (scMeta.length) {
      lines.push(scMeta.join('  ·  '));
      lines.push('');
    }

    if (sc.purpose)     lines.push(`**Purpose:** ${sc.purpose}`);
    if (sc.conflict)    lines.push(`**Conflict:** ${sc.conflict}`);
    if (sc.whatChanges) lines.push(`**What changes:** ${sc.whatChanges}`);
    if (sc.beats)       lines.push(`**Serves beats:** ${sc.beats}`);
    if (sc.notes)       lines.push(`**Notes:** ${sc.notes}`);
    lines.push('');
  });

  return lines.join('\n').trimEnd() + '\n';
}

// Writes every chapter in state.chapterOutline to docs/chapters/NN-slug.md.
// Removes any stale chapter files not present in the current outline so the
// folder is always an accurate reflection of state. The combined legacy
// docs/13-chapter-flesh-out.md is not touched here — it's deleted by the
// save flow if present.
export async function writeAllChapterCards(state, projectDir = process.cwd()) {
  const chapters = state?.chapterOutline || [];
  const chaptersDir = path.join(projectDir, 'docs', 'chapters');
  await mkdir(chaptersDir, { recursive: true });

  const written = [];
  const expectedFiles = new Set();

  for (const ch of chapters) {
    const fileName = chapterFileName(ch);
    expectedFiles.add(fileName);
    const body = renderChapterCard(ch, state);
    const filePath = path.join(chaptersDir, fileName);
    await writeFile(filePath, body, 'utf-8');
    written.push(path.join('docs', 'chapters', fileName));
  }

  // Reconcile — remove chapter cards that no longer correspond to a chapter
  // in state. Only touches files matching our naming pattern; leaves any
  // writer-authored files in docs/chapters/ alone.
  const removed = [];
  let existing;
  try { existing = await readdir(chaptersDir); }
  catch { existing = []; }
  const CARD_RX = /^\d{2}(-[a-z0-9-]+)?\.md$/;
  for (const name of existing) {
    if (!CARD_RX.test(name)) continue;
    if (expectedFiles.has(name)) continue;
    await unlink(path.join(chaptersDir, name));
    removed.push(path.join('docs', 'chapters', name));
  }

  return { written, removed, chaptersDir: path.join('docs', 'chapters') };
}
