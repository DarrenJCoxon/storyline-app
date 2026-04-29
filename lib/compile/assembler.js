// Chapter assembly — reads the manuscript from disk into a structured
// object the rest of the compile pipeline consumes.
//
// Convention (set by `storyline init`):
//   manuscript/
//   ├── _front-matter/   — title page, copyright, dedication (optional)
//   │   ├── 01-title-page.md
//   │   └── 02-copyright.md
//   ├── _back-matter/    — acknowledgements, about author (optional)
//   │   └── 01-acknowledgements.md
//   ├── README.md        — ignored
//   ├── ch01-opening.md  — chapters, read in alphabetical order
//   ├── ch02-arrival.md
//   └── ...
//
// The manuscript path is configurable via state.json's
// writing.manuscriptPath (default "manuscript").
//
// Metadata sources, in precedence order (later overrides earlier):
//   1. Derived from .storyline/state.json (_meta, genre, premise)
//   2. compile.config.json at project root (if present)

import { resolve, relative } from 'path';
import pkg from 'fs-extra';
const { readFile, readdir, pathExists } = pkg;

const FRONT_DIR_NAME = '_front-matter';
const BACK_DIR_NAME = '_back-matter';

export async function assemble(context) {
  const { projectPath } = context;
  const [state, config] = await Promise.all([
    readState(projectPath),
    readCompileConfig(projectPath),
  ]);

  const manuscriptPath = state?.writing?.manuscriptPath || 'manuscript';
  const manuscriptDir = resolve(projectPath, manuscriptPath);

  if (!(await pathExists(manuscriptDir))) {
    throw new Error(
      `Manuscript folder not found at "${manuscriptPath}/". ` +
      `Run \`storyline init\` to create it, or edit .storyline/state.json ` +
      `writing.manuscriptPath to point at your prose folder.`,
    );
  }

  const [frontMatter, chapters, backMatter] = await Promise.all([
    loadSection(resolve(manuscriptDir, FRONT_DIR_NAME), 'front', projectPath),
    loadChapters(manuscriptDir, projectPath),
    loadSection(resolve(manuscriptDir, BACK_DIR_NAME), 'back', projectPath),
  ]);

  const metadata = buildMetadata(state, config);

  context.assembly = {
    manuscriptPath,
    metadata,
    frontMatter,
    chapters,
    backMatter,
  };

  return context;
}

// ── private helpers ─────────────────────────────────────────────

async function readState(projectPath) {
  const statePath = resolve(projectPath, '.storyline', 'state.json');
  if (!(await pathExists(statePath))) {
    throw new Error('Could not find .storyline/state.json — is this a novel project?');
  }
  try {
    const raw = await readFile(statePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Could not parse .storyline/state.json: ${err.message}`);
  }
}

async function readCompileConfig(projectPath) {
  const configPath = resolve(projectPath, 'compile.config.json');
  if (!(await pathExists(configPath))) return null;
  try {
    const raw = await readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Could not parse compile.config.json: ${err.message}`);
  }
}

// List .md files in a directory, alphabetical order, excluding README.md
async function listMarkdownFiles(dir) {
  if (!(await pathExists(dir))) return [];
  const entries = await readdir(dir);
  return entries
    .filter(name => /\.md$/i.test(name))
    .filter(name => name.toLowerCase() !== 'readme.md')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

async function loadSection(dir, kind, projectPath) {
  const files = await listMarkdownFiles(dir);
  const titles = projectPath ? await readChapterTitles(projectPath) : {};
  return Promise.all(files.map(async (filename, i) => {
    const filePath = resolve(dir, filename);
    const body = await readFile(filePath, 'utf-8');
    const relPath = projectPath ? relative(projectPath, filePath) : filename;
    const sidecarTitle = titles[relPath] || null;
    return {
      id: `${kind}-${String(i + 1).padStart(2, '0')}`,
      filename,
      title: sidecarTitle || extractTitle(body, filename),
      body,
    };
  }));
}

async function loadChapters(manuscriptDir, projectPath) {
  const files = await listMarkdownFiles(manuscriptDir);
  const titles = projectPath ? await readChapterTitles(projectPath) : {};
  return Promise.all(files.map(async (filename, i) => {
    const filePath = resolve(manuscriptDir, filename);
    const body = await readFile(filePath, 'utf-8');
    const relPath = projectPath ? relative(projectPath, filePath) : filename;
    const sidecarTitle = titles[relPath] || null;
    return {
      id: `chapter-${String(i + 1).padStart(2, '0')}`,
      number: i + 1,
      filename,
      title: sidecarTitle || extractTitle(body, filename),
      body,
    };
  }));
}

async function readChapterTitles(projectPath) {
  const p = resolve(projectPath, '.storyline', 'chapter-titles.json');
  if (!(await pathExists(p))) return {};
  try {
    return JSON.parse(await readFile(p, 'utf-8'));
  } catch {
    return {};
  }
}

// Pull the first # heading off the markdown, fall back to a humanised filename.
function extractTitle(body, filename) {
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return filename
    .replace(/\.md$/i, '')
    .replace(/^[\d_]+[\s\-_]*/, '') // drop leading numeric prefix
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function buildMetadata(state, config) {
  const meta = state?._meta || {};
  const override = config?.metadata || {};
  const genre = state?.genre || {};
  const premise = state?.premise || {};

  return {
    title: override.title || meta.projectTitle || 'Untitled',
    subtitle: override.subtitle || null,
    author: override.author || meta.author || null,
    language: override.language || 'en',
    identifier: override.identifier || null,   // Story 3.5 generates UUID if null
    publisher: override.publisher || 'Independent',
    copyrightYear: override.copyrightYear || new Date().getFullYear(),
    isbn: override.isbn || null,
    description: override.description || premise.conceptHook || premise.rawLogline || null,
    genre: override.genre || genre.primaryGenre || null,
    subGenre: override.subGenre || genre.subGenre || null,
    tags: override.tags || [],
  };
}
