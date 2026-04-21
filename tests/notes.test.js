// Inline manuscript notes — writer's `<bracketed TBDs>` in prose.
//
// The scanner walks a line for patterns like "<need to research this>"
// and returns them with location. It has to be conservative: prose
// sometimes contains angle brackets that AREN'T writer notes (HTML-ish
// markup, style devices like `<Jane>`, email addresses in brackets,
// URL-in-brackets). These tests lock down both the positive-detection
// and the false-positive filters.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { DEFAULT_STATE } from '../lib/state/project-state.js';
import {
  isProseNote,
  findNotesInBody,
  scanManuscriptNotes,
  buildNotesMemoryEntries,
  formatNotesReport,
  migrateNoteMarkers,
  migrateManuscriptMarkers,
} from '../lib/manuscript/notes.js';

describe('isProseNote — positives', () => {
  it('accepts multi-word prose', () => {
    expect(isProseNote('need to research the specifications of this laptop')).toBe(true);
    expect(isProseNote('check the opening times of the museum')).toBe(true);
    expect(isProseNote('what year did the Voynich manuscript appear')).toBe(true);
  });
  it('accepts a single-word note that ends with a question mark', () => {
    expect(isProseNote('plausible?')).toBe(true);
  });
  it('accepts writer-intent keyword prefixes even without whitespace', () => {
    expect(isProseNote('TBD')).toBe(true);
    expect(isProseNote('XXX')).toBe(true);
    expect(isProseNote('todo')).toBe(true);
  });
});

describe('isProseNote — false-positive guards', () => {
  it('rejects HTML tags (single lowercase token)', () => {
    expect(isProseNote('p')).toBe(false);
    expect(isProseNote('br/')).toBe(false);
    expect(isProseNote('script')).toBe(false);
  });
  it('rejects HTML closing tags (start with /)', () => {
    expect(isProseNote('/p')).toBe(false);
    expect(isProseNote('/div')).toBe(false);
  });
  it('rejects HTML comments (start with !)', () => {
    expect(isProseNote('!-- a real comment --')).toBe(false);
  });
  it('rejects attribute syntax', () => {
    expect(isProseNote('a href="x"')).toBe(false);
    expect(isProseNote('img src=".."')).toBe(false);
  });
  it('rejects URL-in-brackets', () => {
    expect(isProseNote('https://example.com')).toBe(false);
    expect(isProseNote('http://example.com/path')).toBe(false);
    expect(isProseNote('mailto:a@b.com')).toBe(false);
  });
  it('rejects empty / whitespace-only content', () => {
    expect(isProseNote('')).toBe(false);
    expect(isProseNote('   ')).toBe(false);
  });
  it('rejects content over 500 chars', () => {
    expect(isProseNote('word '.repeat(120))).toBe(false);
  });
});

describe('findNotesInBody — {{curly}} format (primary)', () => {
  it('finds a {{curly}} note and marks its style', () => {
    const body = 'She opened the laptop — {{need to research the specs}} — and typed.';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe('need to research the specs');
    expect(notes[0].raw).toBe('{{need to research the specs}}');
    expect(notes[0].style).toBe('curly');
  });

  it('accepts short or unusual notes without the isProseNote filter', () => {
    // Curly markers bypass the prose filter entirely — collision risk is
    // near zero so we trust the writer.
    const body = '{{x}} and {{!!}} and {{a=b}} and {{https://ex.com}}';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(4);
    expect(notes.map(n => n.note)).toEqual(['x', '!!', 'a=b', 'https://ex.com']);
  });

  it('handles multiple {{...}} on the same line', () => {
    const body = '{{check A}} and also {{verify B}}';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(2);
    expect(notes[0].note).toBe('check A');
    expect(notes[1].note).toBe('verify B');
  });

  it('does not match {{...}} spanning newlines', () => {
    const body = 'She thought {{about this\nfor a long time}}.';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(0);
  });

  it('rejects empty {{}} markers', () => {
    const body = 'Nothing here: {{}} and then {{real note}}.';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe('real note');
  });
});

describe('findNotesInBody — <angle> format (legacy)', () => {
  it('finds one note with line + column and marks its style', () => {
    const body = '# Ch 1\n\nShe opened the laptop — <need to research the specs> — and typed.\n';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(1);
    expect(notes[0].line).toBe(3);
    expect(notes[0].column).toBeGreaterThan(1);
    expect(notes[0].note).toBe('need to research the specs');
    expect(notes[0].raw).toBe('<need to research the specs>');
    expect(notes[0].style).toBe('angle-literal');
  });

  it('finds multiple notes across lines', () => {
    const body = [
      '# Ch 1',
      '',
      'Paragraph one mentions <check the museum hours>.',
      '',
      '<verify when the train runs at night> she wondered.',
    ].join('\n');
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(2);
    expect(notes[0].line).toBe(3);
    expect(notes[1].line).toBe(5);
    expect(notes[0].note).toContain('museum');
    expect(notes[1].note).toContain('train');
  });

  it('captures surrounding context on the same line', () => {
    const body = 'She checked the <need to research what kind of watch> on her wrist.';
    const notes = findNotesInBody(body);
    expect(notes[0].contextBefore).toContain('checked');
    expect(notes[0].contextAfter).toContain('wrist');
  });

  it('ignores HTML-like tags in the same body', () => {
    const body = 'Here is an <a href="https://x">link</a> and a real note: <check if this spec is right>.';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toMatch(/check if this spec/);
  });

  it('does not match angle brackets spanning newlines', () => {
    const body = 'She thought <about this\nfor a long time>.';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(0);
  });

  it('handles two notes on the same line', () => {
    const body = '<check a> and also <verify b>';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(2);
    expect(notes[0].note).toBe('check a');
    expect(notes[1].note).toBe('verify b');
  });
});

describe('findNotesInBody — &lt;encoded&gt; format (legacy, from rich-text editors)', () => {
  it('finds an HTML-encoded note and marks its style', () => {
    const body = 'She opened the laptop — &lt;need to research the specs&gt; — and typed.';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe('need to research the specs');
    expect(notes[0].raw).toBe('&lt;need to research the specs&gt;');
    expect(notes[0].style).toBe('angle-encoded');
  });

  it('decodes &amp; in encoded note content', () => {
    const body = '&lt;check A &amp; B timing&gt;';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe('check A & B timing');
  });

  it('applies the isProseNote filter after decoding', () => {
    // Decoded form is "p" — filtered out as HTML-like.
    const body = 'No match: &lt;p&gt;. Match: &lt;check the British Museum hours&gt;.';
    const notes = findNotesInBody(body);
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toContain('British Museum');
  });
});

describe('findNotesInBody — mixed formats', () => {
  it('returns notes in reading order regardless of format', () => {
    const body = [
      'Line 1 has {{first curly}}.',
      'Line 2 has &lt;second encoded&gt;.',
      'Line 3 has <third literal angle>.',
    ].join('\n');
    const notes = findNotesInBody(body);
    expect(notes.map(n => n.note)).toEqual([
      'first curly',
      'second encoded',
      'third literal angle',
    ]);
    expect(notes.map(n => n.style)).toEqual(['curly', 'angle-encoded', 'angle-literal']);
  });
});

describe('scanManuscriptNotes', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-notes-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  function writeChapter(name, body) {
    const dir = resolve(tmp, 'manuscript');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, name), body);
  }

  it('scans all chapters in order and tags each note with its chapter number', async () => {
    writeChapter('ch01.md', '# Ch 1\n\n<need to check laptop specs>\n');
    writeChapter('ch02.md', '# Ch 2\n\nContent with <research museum hours> inline.\n');
    writeChapter('ch03.md', '# Ch 3\n\nNo notes here.\n');
    const notes = await scanManuscriptNotes(tmp);
    expect(notes).toHaveLength(2);
    expect(notes[0].chapterNumber).toBe(1);
    expect(notes[0].file).toBe('manuscript/ch01.md');
    expect(notes[1].chapterNumber).toBe(2);
    expect(notes[1].note).toContain('museum');
  });

  it('returns empty array when no manuscript directory exists', async () => {
    const notes = await scanManuscriptNotes(tmp);
    expect(notes).toEqual([]);
  });

  it('returns empty array when no chapters have notes', async () => {
    writeChapter('ch01.md', '# Ch 1\n\nClean prose, no TBDs.\n');
    const notes = await scanManuscriptNotes(tmp);
    expect(notes).toEqual([]);
  });
});

describe('buildNotesMemoryEntries', () => {
  function state(title = 'The Voynich Curse') {
    return { ...DEFAULT_STATE, _meta: { ...DEFAULT_STATE._meta, projectTitle: title } };
  }

  it('emits one entry per note under draft:note:* keys', () => {
    const notes = [
      { chapterNumber: 1, note: 'need to check laptop specs', file: 'manuscript/ch01.md', line: 3, column: 5 },
      { chapterNumber: 2, note: 'research museum hours', file: 'manuscript/ch02.md', line: 7, column: 12 },
    ];
    const entries = buildNotesMemoryEntries(notes, state());
    expect(entries).toHaveLength(2);
    expect(entries[0].key).toMatch(/^draft:note:ch1:/);
    expect(entries[1].key).toMatch(/^draft:note:ch2:/);
  });

  it('shares the novel:<slug> namespace with plan + draft memory', () => {
    const notes = [{ chapterNumber: 1, note: 'x', file: 'manuscript/ch01.md', line: 1, column: 1 }];
    const entries = buildNotesMemoryEntries(notes, state('The Voynich Curse'));
    expect(entries[0].namespace).toBe('novel:the-voynich-curse');
  });

  it('tags entries as pending + note + draft so odd-flow can filter by status', () => {
    const notes = [{ chapterNumber: 1, note: 'x', file: 'manuscript/ch01.md', line: 1, column: 1 }];
    const entries = buildNotesMemoryEntries(notes, state());
    for (const t of ['storyline', 'manuscript', 'draft', 'note', 'pending', 'ch1']) {
      expect(entries[0].tags).toContain(t);
    }
  });

  it('includes file:line location in the entry value for traceability', () => {
    const notes = [{ chapterNumber: 3, note: 'verify the train schedule', file: 'manuscript/ch03.md', line: 42, column: 8 }];
    const entries = buildNotesMemoryEntries(notes, state());
    expect(entries[0].value).toContain('manuscript/ch03.md:42');
    expect(entries[0].value).toContain('verify the train schedule');
  });
});

describe('formatNotesReport', () => {
  it('reports clean state', () => {
    expect(formatNotesReport([])).toContain('No inline notes');
  });

  it('groups by chapter with location + context', () => {
    const notes = [
      { chapterNumber: 1, note: 'check A', file: 'manuscript/ch01.md', line: 5, column: 10, contextBefore: 'The hero', contextAfter: 'paused.' },
      { chapterNumber: 1, note: 'check B', file: 'manuscript/ch01.md', line: 8, column: 3, contextBefore: '', contextAfter: '' },
      { chapterNumber: 3, note: 'check C', file: 'manuscript/ch03.md', line: 12, column: 4, contextBefore: '', contextAfter: '' },
    ];
    const text = formatNotesReport(notes);
    expect(text).toContain('3 notes');
    expect(text).toContain('Chapter 1');
    expect(text).toContain('Chapter 3');
    expect(text).toContain('check A');
    expect(text).toContain('check C');
    expect(text).toContain('paused.');
  });
});

describe('migrateNoteMarkers', () => {
  it('returns the body unchanged when there is nothing to migrate', () => {
    const body = 'Clean prose with {{already curly}} and no legacy markers.';
    const { body: out, migrations } = migrateNoteMarkers(body);
    expect(out).toBe(body);
    expect(migrations).toHaveLength(0);
  });

  it('rewrites <angle> markers to {{curly}}', () => {
    const body = 'She opened the laptop — <need to research the specs> — and typed.';
    const { body: out, migrations } = migrateNoteMarkers(body);
    expect(out).toBe('She opened the laptop — {{need to research the specs}} — and typed.');
    expect(migrations).toHaveLength(1);
    expect(migrations[0]).toMatchObject({
      line: 1,
      from: '<need to research the specs>',
      to: '{{need to research the specs}}',
      style: 'angle-literal',
    });
  });

  it('rewrites &lt;encoded&gt; markers to {{curly}} and decodes entities', () => {
    const body = 'Check &lt;A &amp; B timing&gt; please.';
    const { body: out, migrations } = migrateNoteMarkers(body);
    expect(out).toBe('Check {{A & B timing}} please.');
    expect(migrations[0].style).toBe('angle-encoded');
  });

  it('leaves existing {{curly}} markers untouched', () => {
    const body = '{{keep me}} and <convert me>';
    const { body: out } = migrateNoteMarkers(body);
    expect(out).toBe('{{keep me}} and {{convert me}}');
  });

  it('preserves line-level offsets when migrating multiple markers on one line', () => {
    const body = '<check first thing> and also <verify second thing>';
    const { body: out, migrations } = migrateNoteMarkers(body);
    expect(out).toBe('{{check first thing}} and also {{verify second thing}}');
    expect(migrations).toHaveLength(2);
    expect(migrations[0].line).toBe(1);
    expect(migrations[1].line).toBe(1);
  });

  it('preserves content across mixed formats in one body', () => {
    const body = [
      'Line with <check the museum hours> legacy.',
      'Line with &lt;verify the train schedule&gt; encoded.',
      'Line with {{already curly}} that stays.',
    ].join('\n');
    const { body: out, migrations } = migrateNoteMarkers(body);
    expect(out).toContain('{{check the museum hours}}');
    expect(out).toContain('{{verify the train schedule}}');
    expect(out).toContain('{{already curly}}');
    expect(migrations).toHaveLength(2);
  });
});

describe('migrateManuscriptMarkers', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-migrate-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  function writeChapter(name, body) {
    const dir = resolve(tmp, 'manuscript');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, name), body);
  }

  it('in preview mode does not write files but reports what would change', async () => {
    writeChapter('ch01.md', '# Ch 1\n\nShe saw <check laptop specs> on the desk.\n');
    writeChapter('ch02.md', '# Ch 2\n\nThe &lt;verify museum hours&gt; detail.\n');
    const result = await migrateManuscriptMarkers(tmp, { preview: true });
    expect(result.applied).toBe(false);
    expect(result.filesAffected).toBe(2);
    expect(result.totalMigrations).toBe(2);
    // Files on disk unchanged.
    const ch01 = readFileSync(resolve(tmp, 'manuscript/ch01.md'), 'utf-8');
    expect(ch01).toContain('<check laptop specs>');
    expect(ch01).not.toContain('{{check laptop specs}}');
  });

  it('applies migrations when preview: false', async () => {
    writeChapter('ch01.md', 'She saw <check laptop specs> on the desk.\n');
    const result = await migrateManuscriptMarkers(tmp, { preview: false });
    expect(result.applied).toBe(true);
    expect(result.totalMigrations).toBe(1);
    const ch01 = readFileSync(resolve(tmp, 'manuscript/ch01.md'), 'utf-8');
    expect(ch01).toContain('{{check laptop specs}}');
    expect(ch01).not.toContain('<check laptop specs>');
  });

  it('respects a custom manuscriptPath', async () => {
    const dir = resolve(tmp, 'output/manuscript');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'scene-1.md'), 'A &lt;check the specs&gt; moment.\n');
    const result = await migrateManuscriptMarkers(tmp, {
      manuscriptPath: 'output/manuscript',
      preview: false,
    });
    expect(result.totalMigrations).toBe(1);
    const out = readFileSync(resolve(dir, 'scene-1.md'), 'utf-8');
    expect(out).toContain('{{check the specs}}');
  });

  it('leaves files with only {{curly}} markers untouched', async () => {
    writeChapter('ch01.md', 'Already modern: {{check the specs}}.\n');
    const result = await migrateManuscriptMarkers(tmp, { preview: false });
    expect(result.totalMigrations).toBe(0);
    expect(result.filesAffected).toBe(0);
  });
});
