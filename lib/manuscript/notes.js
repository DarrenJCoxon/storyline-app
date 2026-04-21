// Inline notes — writers embed questions / research stubs / TBDs
// directly in their manuscript prose wrapped in angle brackets:
//
//   She opened the laptop — <need to research the specifications of
//   this laptop> — and began typing.
//
// This lets the writer stay in flow: leave a `<...>` where a fact
// should go, keep drafting. Later (at end of session, or when
// invoked via the /novel skill) the notes are collected, resolved
// by Claude, and the answers either inserted inline, memory-banked,
// or fed back as proposals.
//
// Scanner rules (intentionally conservative to avoid false positives
// on legitimate prose angle brackets like <Jane> as a style device):
//
//   - Content between < and > is 1-500 chars, no angle brackets inside
//   - Contains whitespace OR ends with `?`  (single-word tokens like
//     <p> or <script> get filtered out)
//   - Does NOT start with `!` (HTML comments) or `/` (closing tags)
//   - Does NOT contain `=` (attribute syntax)
//   - Is NOT a URL (e.g. `<https://example.com>`)
//   - Allow-list the common writing-prompt openings explicitly (need,
//     research, check, verify, confirm, what, how, when, where, why,
//     who, tbd, todo, xxx) — if one of these leads the note, the
//     other rules are relaxed.

import { promises as fs } from 'fs';
import { resolve, basename } from 'path';

const NOTE_KEYWORDS = /^\s*(need|research|check|verify|confirm|fact-check|look\s?up|what|how|when|where|why|who|tbd|to-?do|xxx|question|source)\b/i;
const URL_PATTERN = /^(https?:|mailto:|www\.)/i;

export function isProseNote(content) {
  const c = content.trim();
  if (!c || c.length > 500) return false;
  if (c.startsWith('!') || c.startsWith('/')) return false;
  if (c.includes('=')) return false;
  if (URL_PATTERN.test(c)) return false;
  // Known writer-intent prefix — accept even if single-token.
  if (NOTE_KEYWORDS.test(c)) return true;
  // Otherwise require it to look like prose (has whitespace OR ends with ?).
  if (/\s/.test(c)) return true;
  if (c.endsWith('?')) return true;
  return false;
}

// Match a note: single line, no nested angle brackets, no newlines.
const NOTE_RE = /<([^<>\n]{1,500})>/g;

// Scan a single markdown body for notes. Returns [{ line, column, note,
// contextBefore, contextAfter }] with 1-indexed line numbers.
export function findNotesInBody(body) {
  const notes = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    NOTE_RE.lastIndex = 0;
    let m;
    while ((m = NOTE_RE.exec(line)) !== null) {
      const content = m[1];
      if (!isProseNote(content)) continue;
      const column = m.index + 1;
      // Surrounding context: up to 40 chars either side on the same line.
      const before = line.slice(Math.max(0, m.index - 40), m.index).trimStart();
      const after = line.slice(m.index + m[0].length, m.index + m[0].length + 40).trimEnd();
      notes.push({
        line: i + 1,
        column,
        note: content.trim(),
        contextBefore: before,
        contextAfter: after,
        raw: m[0],
      });
    }
  }
  return notes;
}

// Scan the whole manuscript directory for notes across every chapter.
// Returns [{ file, chapterNumber, ...noteFields }] flattened.
async function listChapterFiles(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter(name => /\.md$/i.test(name))
      .filter(name => !name.startsWith('_'))
      .filter(name => name.toLowerCase() !== 'readme.md')
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  } catch {
    return [];
  }
}

// Scan a single file for notes. Used when the /notes skill is invoked
// on the writer's currently-open editor tab — scope stays tight to the
// file they're looking at. chapterNumber is best-effort: derived from
// the file's position in the manuscript directory if it lives there,
// otherwise null.
export async function scanFileNotes(projectPath, filePath, { manuscriptPath = 'manuscript' } = {}) {
  const absolute = resolve(projectPath, filePath);
  let body;
  try {
    body = await fs.readFile(absolute, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read file "${filePath}": ${err instanceof Error ? err.message : String(err)}`);
  }
  const found = findNotesInBody(body);
  const filename = basename(absolute);
  // Derive chapterNumber from the file's alphabetical position in the
  // manuscript dir (if it's a manuscript chapter). Best-effort.
  let chapterNumber = null;
  try {
    const dir = resolve(projectPath, manuscriptPath);
    const siblings = await listChapterFiles(dir);
    const idx = siblings.indexOf(filename);
    if (idx >= 0) chapterNumber = idx + 1;
  } catch {
    // Not in manuscript dir — chapterNumber stays null.
  }
  const relPath = absolute.startsWith(projectPath)
    ? absolute.slice(projectPath.length + 1)
    : absolute;
  return found.map(n => ({
    ...n,
    file: relPath,
    filename,
    chapterNumber,
  }));
}

export async function scanManuscriptNotes(projectPath, { manuscriptPath = 'manuscript' } = {}) {
  const dir = resolve(projectPath, manuscriptPath);
  const files = await listChapterFiles(dir);
  const all = [];
  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const body = await fs.readFile(resolve(dir, filename), 'utf-8');
    const found = findNotesInBody(body);
    for (const n of found) {
      all.push({
        ...n,
        file: `${manuscriptPath}/${filename}`,
        filename,
        chapterNumber: i + 1,
      });
    }
  }
  return all;
}

const slugify = (s) => (s || 'note')
  .toString()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40) || 'note';

// Translate a notes list into memory entries so odd-flow holds them
// as "pending research" that survives session boundaries. Each note
// gets a stable-ish key based on chapter + slug of the first few words.
export function buildNotesMemoryEntries(notes, state) {
  const projectSlug = slugify(state?._meta?.projectTitle || 'novel');
  const namespace = `novel:${projectSlug}`;
  const baseTags = ['novel-writer', 'manuscript', 'draft', 'note', 'pending', projectSlug];
  return notes.map((n, i) => {
    const noteSlug = slugify(n.note) || `note-${i}`;
    const key = `draft:note:ch${n.chapterNumber}:${noteSlug}`;
    const value = `[${n.file}:${n.line}] ${n.note}`;
    return {
      namespace,
      key,
      value,
      tags: [...baseTags, `ch${n.chapterNumber}`, noteSlug],
    };
  });
}

// Human-readable summary.
export function formatNotesReport(notes) {
  if (notes.length === 0) {
    return 'No inline notes in the manuscript.';
  }
  const byChapter = new Map();
  for (const n of notes) {
    if (!byChapter.has(n.chapterNumber)) byChapter.set(n.chapterNumber, []);
    byChapter.get(n.chapterNumber).push(n);
  }
  const lines = [`${notes.length} note${notes.length === 1 ? '' : 's'} across ${byChapter.size} chapter${byChapter.size === 1 ? '' : 's'}:`];
  lines.push('');
  for (const [chNum, list] of [...byChapter.entries()].sort((a, b) => a[0] - b[0])) {
    lines.push(`Chapter ${chNum} (${list[0].file}):`);
    for (const n of list) {
      lines.push(`  L${n.line}  <${n.note}>`);
      if (n.contextBefore || n.contextAfter) {
        lines.push(`         … ${n.contextBefore}[•]${n.contextAfter} …`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}
