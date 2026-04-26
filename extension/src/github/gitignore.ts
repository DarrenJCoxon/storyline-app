import * as fs from 'fs/promises';
import * as path from 'path';

// Storyline ships an opinionated .gitignore for synced projects. Goal:
// the cloned-on-another-machine flow restores the project completely
// (including .storyline/state.json so planning/memory persist), but
// no secrets, dev caches, or regeneratable artefacts get pushed.
//
// We're additive — if the writer already has a .gitignore with their
// own entries, we preserve them and append a managed block. The block
// is fenced with marker comments so we can rewrite it cleanly on
// future updates without nuking writer-added rules.

const MARKER_START = '# >>> Storyline managed (do not edit between markers) >>>';
const MARKER_END = '# <<< Storyline managed <<<';

const STORYLINE_RULES = [
  '# Compiled outputs — regenerate with Storyline: Compile to EPUB / PDF.',
  'output/',
  '*.epub',
  '*.pdf',
  '',
  '# Secrets & env — NEVER push these.',
  '.env',
  '.env.*',
  '*.key',
  '*.pem',
  '',
  '# OS / editor cruft.',
  '.DS_Store',
  'Thumbs.db',
  'node_modules/',
  '',
  '# Storyline auth-adjacent local state.',
  '.storyline/git.json.lock',
];

export async function ensureGitignore(projectRoot: string): Promise<void> {
  const file = path.join(projectRoot, '.gitignore');
  let existing = '';
  try {
    existing = await fs.readFile(file, 'utf-8');
  } catch { /* missing, fine */ }

  const block = [MARKER_START, ...STORYLINE_RULES, MARKER_END].join('\n');

  let next: string;
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);
  if (startIdx >= 0 && endIdx > startIdx) {
    // Replace existing managed block in place.
    const before = existing.slice(0, startIdx).replace(/\s+$/, '');
    const after = existing.slice(endIdx + MARKER_END.length).replace(/^\s+/, '');
    next = [before, block, after].filter(Boolean).join('\n\n') + '\n';
  } else {
    // Append.
    const head = existing.replace(/\s+$/, '');
    next = head ? `${head}\n\n${block}\n` : `${block}\n`;
  }

  if (next !== existing) {
    await fs.writeFile(file, next, 'utf-8');
  }
}
