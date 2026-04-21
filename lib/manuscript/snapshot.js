// Manuscript snapshot — reads the prose currently on disk under
// manuscript/ and emits memory entries describing the book's CURRENT
// drafted state. Separate namespace-key prefix (`draft:`) from the
// plan's (`chapter:`, `beats:`, etc.) so both can coexist in odd-flow
// and a future session can diff one against the other.
//
// What this captures, per chapter:
//   - word count
//   - scene count (detected from ---, * * *, or blank-line breaks)
//   - title (H1 or humanised filename)
//   - POV (first-person detection via opening lines)
//   - opening sentence
//   - closing sentence
//
// Manuscript-level:
//   - total word count
//   - chapter count
//   - progress-vs-target ratio if genre.targetWordCount is set
//
// Writers invoke this via `storyline manuscript sync`. The /storyline skill's
// writing-session protocol (see SKILL.md) runs it after each writing
// session so odd-flow always holds a recent draft snapshot.

import { promises as fs } from 'fs';
import { resolve, basename } from 'path';

// Mirror of the compile pipeline's chapter ordering: alphabetical by
// filename with numeric awareness so "ch10" sorts after "ch2".
async function listChapterFiles(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter(name => /\.md$/i.test(name))
      .filter(name => !name.startsWith('_'))  // skip _front-matter, _back-matter
      .filter(name => name.toLowerCase() !== 'readme.md')
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  } catch {
    return [];
  }
}

// Strip YAML frontmatter, code fences, and markdown punctuation so the
// word count roughly matches what a human would count (and what the VS
// Code status bar shows). Tokens must contain at least one letter or
// digit to count.
export function countWords(markdown) {
  if (!markdown) return 0;
  return markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')    // YAML frontmatter
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[*_~#>|[\]()]/g, ' ')
    .split(/\s+/)
    .filter(tok => /[\p{L}\p{N}]/u.test(tok))
    .length;
}

// Scene breaks — mirror the preview/compile convention plus the
// blank-paragraph soft break. Count how many chunks the chapter
// separates into; a chapter with any prose has at least 1 scene,
// but an empty chapter (H1 only, or blank) has 0.
export function countScenes(markdown) {
  if (!markdown || !markdown.trim()) return 0;
  // Strip YAML frontmatter and all headings so "# Chapter\n" alone
  // doesn't register as a scene.
  const stripped = markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/^#+[^\n]*\n?/gm, '')
    .trim();
  if (!stripped) return 0;
  // Split on scene-break ornaments that sit on their own line, flanked
  // by blank lines (the published convention in manuscript markdown).
  // Then additionally split on blank-paragraph soft breaks (3+ consecutive
  // newlines) for writers who prefer implicit section shifts.
  // Trailing blank line uses a lookahead so it isn't consumed — the same
  // blank line serves as the LEADING context of the next ornament if two
  // scene breaks are adjacent in the chapter (common in fast-cut prose).
  const ORNAMENT_LINE = /(?:\n[ \t]*\n|^)[ \t]*(?:---+|\*\s*\*\s*\*|· · ·|❦)[ \t]*(?=\n[ \t]*\n|$)/g;
  const SOFT_BREAK = /\n[\s\n]*\n[\s\n]*\n/;
  const chunks = stripped
    .split(ORNAMENT_LINE)
    .flatMap(c => c.split(SOFT_BREAK))
    .map(c => c.trim())
    .filter(c => c.length > 0);
  return Math.max(1, chunks.length);
}

function extractTitle(body, filename) {
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return filename
    .replace(/\.md$/i, '')
    .replace(/^[\d_]+[\s\-_]*/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// POV detection — coarse. Looks at the first few hundred chars of
// prose content (after stripping the H1). If "I" / "me" / "my" /
// "we" appear in the opening sentences at roughly first-person
// density, mark it first-person; otherwise third. Not perfect, but
// flags the common "writer accidentally shifted POV" class of drift.
export function detectPov(body) {
  if (!body) return null;
  const content = body.replace(/^#[^\n]*\n/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim().slice(0, 800);
  if (!content) return null;
  // Count first-person singular markers vs pronouns; require at least
  // a handful to avoid classifying on stray dialogue "I".
  const fpMatches = content.match(/\b(I|I'm|I've|I'd|I'll|me|my|mine)\b/g) || [];
  const wordCount = content.split(/\s+/).length;
  if (wordCount < 20) return null;
  const density = fpMatches.length / wordCount;
  if (density > 0.04) return 'first-person';
  return 'third-person';
}

function firstSentence(body) {
  if (!body) return null;
  const content = body.replace(/^#[^\n]*\n/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  if (!content) return null;
  // Take up to the first sentence-ending punctuation, capped at 200 chars.
  const match = content.match(/^[^.!?]{1,200}[.!?]/);
  return match ? match[0].trim() : content.slice(0, 200).trim();
}

function lastSentence(body) {
  if (!body) return null;
  const content = body.replace(/^#[^\n]*\n/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  if (!content) return null;
  const tail = content.slice(-400);
  const sentences = tail.match(/[^.!?]+[.!?]/g);
  if (!sentences || sentences.length === 0) return tail.trim().slice(-200);
  return sentences[sentences.length - 1].trim();
}

// Read a manuscript directory and return a structured summary. Callers
// pass this to buildManuscriptMemoryEntries() or compareManuscriptToPlan().
export async function snapshotManuscript(projectPath, { manuscriptPath = 'manuscript' } = {}) {
  const dir = resolve(projectPath, manuscriptPath);
  const files = await listChapterFiles(dir);
  const chapters = await Promise.all(files.map(async (filename, i) => {
    const body = await fs.readFile(resolve(dir, filename), 'utf-8');
    return {
      number: i + 1,
      filename,
      title: extractTitle(body, filename),
      wordCount: countWords(body),
      sceneCount: countScenes(body),
      pov: detectPov(body),
      opening: firstSentence(body),
      closing: lastSentence(body),
      byteLength: Buffer.byteLength(body, 'utf-8'),
    };
  }));
  const totalWords = chapters.reduce((sum, c) => sum + c.wordCount, 0);
  return { manuscriptPath, chapters, totalWords, chapterCount: chapters.length };
}

const slugify = (s) => (s || 'untitled')
  .toString()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);

const entry = (namespace, key, value, tags = []) => (value !== undefined && value !== null && String(value).trim())
  ? { namespace, key, value: String(value).trim(), tags }
  : null;

// Translate a manuscript snapshot into odd-flow memory entries.
// Keys use the `draft:` prefix so they don't collide with plan memory.
export function buildManuscriptMemoryEntries(snapshot, state) {
  const projectSlug = slugify(state?._meta?.projectTitle || 'novel');
  const namespace = `novel:${projectSlug}`;
  const baseTags = ['storyline', 'manuscript', 'draft', projectSlug];

  const out = [];
  out.push(entry(namespace, 'draft:total-word-count', snapshot.totalWords, baseTags));
  out.push(entry(namespace, 'draft:chapter-count', snapshot.chapterCount, baseTags));
  out.push(entry(namespace, 'draft:snapshot-at', new Date().toISOString(), baseTags));

  // Progress versus target, if we have one.
  const target = state?.genre?.targetWordCount;
  if (typeof target === 'number' && target > 0) {
    const pct = Math.round((snapshot.totalWords / target) * 100);
    out.push(entry(namespace, 'draft:progress-pct', pct, baseTags));
    out.push(entry(namespace, 'draft:words-remaining', Math.max(0, target - snapshot.totalWords), baseTags));
  }

  for (const ch of snapshot.chapters) {
    const ctags = [...baseTags, `ch${ch.number}`];
    out.push(entry(namespace, `draft:chapter:${ch.number}:title`, ch.title, ctags));
    out.push(entry(namespace, `draft:chapter:${ch.number}:filename`, ch.filename, ctags));
    out.push(entry(namespace, `draft:chapter:${ch.number}:word-count`, ch.wordCount, ctags));
    out.push(entry(namespace, `draft:chapter:${ch.number}:scene-count`, ch.sceneCount, ctags));
    out.push(entry(namespace, `draft:chapter:${ch.number}:pov`, ch.pov, ctags));
    out.push(entry(namespace, `draft:chapter:${ch.number}:opening`, ch.opening, ctags));
    out.push(entry(namespace, `draft:chapter:${ch.number}:closing`, ch.closing, ctags));
  }

  return out.filter(Boolean);
}
