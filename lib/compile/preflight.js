// Pre-flight validation — runs after assembly, before the expensive
// HTML/theme/packaging phases. Catches problems the writer can fix
// quickly rather than discovering them after upload to KDP.
//
// Two tiers:
//   - errors: block the compile (exit non-zero, no EPUB produced)
//   - warnings: surface but don't block (compile proceeds)
//
// Philosophy: be strict about things that produce genuinely broken
// output (zero chapters), lenient about things the packager can
// paper over (missing title → "Untitled", missing author → "Unknown
// Author", missing identifier → generated UUID). The writer deserves
// to see warnings about the soft defaults so they can upgrade them
// before publishing.

import { STAGE_GUIDES } from '../ai/stage-guides.js';

const WORD_COUNT_GUIDANCE = STAGE_GUIDES?.genre?.wordCountGuidance || {};

// Print-PDF constants (KDP Paperback minima as of 2026).
const PRINT_MIN_PAGES = 24;          // KDP absolute minimum
const PRINT_WORDS_PER_PAGE = 350;    // Rough estimate for 6x9 at 11pt serif — used
                                     // only for pre-render page-count warnings.

export async function runPreflight(context) {
  if (!context.assembly) {
    throw new Error('Pre-flight requires the assembly phase to run first');
  }

  const errors = [];
  const warnings = [];
  const { metadata, chapters, frontMatter } = context.assembly;

  // ── Structural checks ────────────────────────────────────────

  if (!chapters || chapters.length === 0) {
    errors.push({
      code: 'NO_CHAPTERS',
      message: `No chapter files found in ${context.assembly.manuscriptPath}/. Add at least one .md file before compiling.`,
    });
  }

  if (!frontMatter || frontMatter.length === 0) {
    warnings.push({
      code: 'NO_FRONT_MATTER',
      message: 'No front matter files found. Most published books include at least a title page and copyright page. Add files to manuscript/_front-matter/ (e.g. 01-title-page.md, 02-copyright.md).',
    });
  }

  // ── Metadata checks ──────────────────────────────────────────

  if (!metadata.title || metadata.title === 'Untitled') {
    warnings.push({
      code: 'NO_TITLE',
      message: 'No title set — the EPUB will use "Untitled". Set metadata.title in compile.config.json or _meta.projectTitle in .novel-writer/state.json.',
    });
  }

  if (!metadata.author) {
    warnings.push({
      code: 'NO_AUTHOR',
      message: 'No author set — the EPUB will use "Unknown Author". Set metadata.author in compile.config.json.',
    });
  }

  // NO_IDENTIFIER is EPUB-specific (print PDF doesn't carry a UUID).
  if (!metadata.identifier && context.format !== 'print-pdf') {
    warnings.push({
      code: 'NO_IDENTIFIER',
      message: 'No EPUB identifier set — a random UUID will be generated each compile. For stable identifiers across rebuilds (recommended before publishing), set metadata.identifier in compile.config.json to e.g. "urn:uuid:<your-uuid>".',
    });
  }

  if (!metadata.isbn) {
    warnings.push({
      code: 'NO_ISBN',
      message: 'No ISBN set (optional for KDP, required for IngramSpark). Add metadata.isbn to compile.config.json if distributing to bookstores via IngramSpark.',
    });
  }

  // ── Word count check against genre minimum ──────────────────

  const totalWords = chapters.reduce((sum, c) => sum + countWords(c.body), 0);
  const genreKey = (metadata.genre || '').toLowerCase().trim();
  const guidance = WORD_COUNT_GUIDANCE[genreKey];

  if (guidance && totalWords > 0 && totalWords < guidance.min) {
    warnings.push({
      code: 'LOW_WORD_COUNT',
      message: `Manuscript is ${totalWords.toLocaleString()} words. The typical minimum for ${metadata.genre} is ${guidance.min.toLocaleString()}; agents and readers expect ${guidance.ideal.toLocaleString()}. Compiling anyway.`,
    });
  } else if (totalWords < 500 && chapters.length > 0) {
    // Very short content even ignoring genre — probably a test compile.
    warnings.push({
      code: 'VERY_SHORT_MANUSCRIPT',
      message: `Manuscript is only ${totalWords.toLocaleString()} words across ${chapters.length} chapter${chapters.length === 1 ? '' : 's'}. If this is a test, ignore this warning; otherwise add more prose before publishing.`,
    });
  }

  // ── Print-specific checks ───────────────────────────────────

  let estimatedPages = null;
  if (context.format === 'print-pdf') {
    estimatedPages = Math.max(1, Math.ceil(totalWords / PRINT_WORDS_PER_PAGE));

    if (totalWords > 0 && estimatedPages < PRINT_MIN_PAGES) {
      warnings.push({
        code: 'PRINT_TOO_SHORT',
        message: `Estimated ${estimatedPages} pages at 6x9 (${totalWords.toLocaleString()} words × ~${PRINT_WORDS_PER_PAGE} words/page). KDP Paperback requires a minimum of ${PRINT_MIN_PAGES} pages. Add more prose, or compile to EPUB only if you don't need paperback distribution.`,
      });
    }

    if (chapters.length > 100) {
      warnings.push({
        code: 'UNUSUAL_CHAPTER_COUNT',
        message: `${chapters.length} chapters is unusually high for a novel. Check that each manuscript/*.md file is intended to be a separate chapter; subsections within chapters usually live in a single file as ## headings.`,
      });
    }
  }

  context.preflight = {
    errors,
    warnings,
    wordCount: totalWords,
    chapterCount: chapters.length,
    estimatedPages,
  };

  return context;
}

// Simple markdown-aware word counter. Strips code blocks, treats
// markdown punctuation as word separators, counts tokens containing
// at least one letter or digit. Matches the editor's word-count logic.
function countWords(markdown) {
  if (!markdown) return 0;
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[*_~#>|[\]()]/g, ' ')
    .split(/\s+/)
    .filter(tok => /[\p{L}\p{N}]/u.test(tok))
    .length;
}
