// Inline notes — writers embed questions / research stubs / TBDs
// directly in their manuscript prose. This lets them stay in flow:
// leave a marker where a fact should go, keep drafting. Later (at end
// of session, or when invoked via the /follow-up skill) the notes are
// collected, resolved by Claude, and the answers either inserted
// inline, memory-banked, or fed back as proposals.
//
// Marker formats (in decreasing preference):
//
//   {{...}}           — Primary. Cannot collide with any Markdown
//                       construct, cannot be HTML-encoded by a
//                       rich-text editor's save path, and rare in
//                       natural prose. Example:
//                         She opened the laptop — {{need to research
//                         the specifications of a 2019 MacBook Pro}} —
//                         and began typing.
//
//   <...>             — Legacy. Accepted for backward compatibility
//                       with projects that started on earlier versions.
//                       Needs a conservative filter (isProseNote) to
//                       avoid false positives on HTML-like tokens,
//                       autolinks, and attribute syntax.
//
//   &lt;...&gt;       — Legacy. Produced by TipTap / other rich-text
//                       editors that HTML-encode angle brackets before
//                       writing markdown to disk. Same filter applies,
//                       but against the decoded content.
//
// All three are accepted by findNotesInBody; the `style` field on each
// returned note identifies which format matched. The
// `migrateNoteMarkers` helper rewrites the two legacy formats to the
// current {{...}} form.

import { promises as fs } from 'fs';
import { resolve, basename } from 'path';

const NOTE_KEYWORDS = /^\s*(need|research|check|verify|confirm|fact-check|look\s?up|what|how|when|where|why|who|tbd|to-?do|xxx|question|source)\b/i;
const URL_PATTERN = /^(https?:|mailto:|www\.)/i;

// Conservative filter, applied only to angle-bracket legacy markers.
// {{...}} markers bypass this because curly-brace-in-prose is
// essentially zero-collision — we accept them on length alone.
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

// Match a literal {{...}} on a single line. Lazy quantifier so a run
// of close-braces doesn't get swallowed into the content.
const CURLY_RE = /\{\{([^{}\n]{1,500}?)\}\}/g;
// Match literal <...> on a single line. Legacy.
const ANGLE_RE = /<([^<>\n]{1,500})>/g;
// Match HTML-encoded &lt;...&gt; on a single line. Legacy.
const ANGLE_ENCODED_RE = /&lt;((?:(?!&gt;).){1,500}?)&gt;/g;

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function buildNote({ match, note, lineIdx, line, style }) {
  const column = match.index + 1;
  const before = line.slice(Math.max(0, match.index - 40), match.index).trimStart();
  const after = line.slice(match.index + match[0].length, match.index + match[0].length + 40).trimEnd();
  return {
    line: lineIdx + 1,
    column,
    note,
    contextBefore: before,
    contextAfter: after,
    raw: match[0],
    style,
  };
}

// Scan a single markdown body for notes across all supported formats.
// Returns notes in reading order (line, then column).
export function findNotesInBody(body) {
  const notes = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // {{...}} — primary format. No prose filter; just non-empty + length.
    CURLY_RE.lastIndex = 0;
    let m;
    while ((m = CURLY_RE.exec(line)) !== null) {
      const content = m[1].trim();
      if (!content) continue;
      if (content.length > 500) continue;
      notes.push(buildNote({ match: m, note: content, lineIdx: i, line, style: 'curly' }));
    }

    // <...> — legacy literal angle brackets. Needs filter.
    ANGLE_RE.lastIndex = 0;
    while ((m = ANGLE_RE.exec(line)) !== null) {
      const content = m[1];
      if (!isProseNote(content)) continue;
      notes.push(buildNote({ match: m, note: content.trim(), lineIdx: i, line, style: 'angle-literal' }));
    }

    // &lt;...&gt; — legacy HTML-encoded. Decode, then apply filter.
    ANGLE_ENCODED_RE.lastIndex = 0;
    while ((m = ANGLE_ENCODED_RE.exec(line)) !== null) {
      const decoded = decodeEntities(m[1]);
      if (!isProseNote(decoded)) continue;
      notes.push(buildNote({ match: m, note: decoded.trim(), lineIdx: i, line, style: 'angle-encoded' }));
    }
  }
  // Sort by line, then column — multi-format files come out in reading order.
  notes.sort((a, b) => a.line - b.line || a.column - b.column);
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

// Scan a single file for notes. Used when /follow-up resolves the
// active-file breadcrumb to a specific chapter.
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
  // manuscript dir (if it lives there). Best-effort.
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

// Rewrite legacy angle-bracket markers in a single body to the current
// {{...}} form. Curly markers are left alone. Returns the rewritten
// body plus a list of per-line migrations for preview / reporting.
export function migrateNoteMarkers(body) {
  const notes = findNotesInBody(body);
  const legacy = notes.filter(n => n.style !== 'curly');
  if (legacy.length === 0) {
    return { body, migrations: [] };
  }
  // Apply replacements right-to-left within each line so earlier
  // matches' offsets remain valid as we splice.
  const lines = body.split('\n');
  const byLine = new Map();
  for (const n of legacy) {
    if (!byLine.has(n.line)) byLine.set(n.line, []);
    byLine.get(n.line).push(n);
  }
  const migrations = [];
  for (const [lineNum, list] of byLine) {
    list.sort((a, b) => b.column - a.column);  // right-to-left
    let lineText = lines[lineNum - 1];
    for (const n of list) {
      const newMarker = `{{${n.note}}}`;
      const start = n.column - 1;
      const end = start + n.raw.length;
      lineText = lineText.slice(0, start) + newMarker + lineText.slice(end);
    }
    lines[lineNum - 1] = lineText;
    // Record migrations in reading order for the report.
    for (const n of [...list].reverse()) {
      migrations.push({
        line: n.line,
        column: n.column,
        from: n.raw,
        to: `{{${n.note}}}`,
        style: n.style,
      });
    }
  }
  return { body: lines.join('\n'), migrations };
}

// Walk the whole manuscript, migrate legacy markers, optionally write
// the updates. `preview: true` returns the planned migrations without
// touching any file (used by the --yes gate in the CLI).
export async function migrateManuscriptMarkers(projectPath, {
  manuscriptPath = 'manuscript',
  preview = false,
} = {}) {
  const dir = resolve(projectPath, manuscriptPath);
  const files = await listChapterFiles(dir);
  const result = {
    files: [],
    filesAffected: 0,
    totalMigrations: 0,
    applied: !preview,
    manuscriptPath,
  };
  for (const filename of files) {
    const filepath = resolve(dir, filename);
    const body = await fs.readFile(filepath, 'utf-8');
    const { body: rewritten, migrations } = migrateNoteMarkers(body);
    if (migrations.length === 0) continue;
    result.files.push({
      path: `${manuscriptPath}/${filename}`,
      migrations,
    });
    result.filesAffected += 1;
    result.totalMigrations += migrations.length;
    if (!preview) {
      await fs.writeFile(filepath, rewritten, 'utf-8');
    }
  }
  return result;
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
  const baseTags = ['storyline', 'manuscript', 'draft', 'note', 'pending', projectSlug];
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
      const marker = n.raw ?? `{{${n.note}}}`;
      lines.push(`  L${n.line}  ${marker}`);
      if (n.contextBefore || n.contextAfter) {
        lines.push(`         … ${n.contextBefore}[•]${n.contextAfter} …`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}
