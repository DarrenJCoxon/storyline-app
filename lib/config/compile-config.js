// Auto-generates a compile.config.json with sensible defaults so writers
// never have to hand-craft JSON. Sources, in precedence order:
//
//   1. Existing compile.config.json at project root (left untouched)
//   2. .novel-writer/state.json metadata (projectTitle, genre, etc.)
//   3. `git config user.name` / `user.email` for author
//   4. Directory basename as last-resort title
//
// Called by `nw init` (for new projects) and by the compile pipeline
// (for existing projects that predate this auto-config behaviour).

import { execSync } from 'child_process';
import { basename, resolve } from 'path';
import pkg from 'fs-extra';
const { readFile, writeFile, pathExists } = pkg;

// Read git config safely — returns empty string if git isn't configured
// or isn't installed. Never throws.
function gitConfig(key) {
  try {
    const value = execSync(`git config --get ${key}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    });
    return value.trim();
  } catch {
    return '';
  }
}

// Build a default config object from whatever data is available.
export async function buildDefaultConfig(projectPath) {
  const dirName = basename(resolve(projectPath));
  let state = null;

  const statePath = resolve(projectPath, '.novel-writer', 'state.json');
  if (await pathExists(statePath)) {
    try {
      state = JSON.parse(await readFile(statePath, 'utf-8'));
    } catch {
      // malformed state.json — fall back to directory name
    }
  }

  const stateMeta = state?._meta || {};
  const stateGenre = state?.genre || {};

  const authorName = gitConfig('user.name') || null;
  const title = stateMeta.projectTitle || dirName || 'Untitled';

  return {
    metadata: {
      title,
      subtitle: null,
      author: authorName,     // null if git isn't configured — preflight flags it
      publisher: 'Independent',
      language: 'en',
      identifier: null,       // generated at compile time if still null
      isbn: null,
      description: null,
      genre: stateGenre.primaryGenre || null,
      subGenre: stateGenre.subGenre || null,
    },
    theme: 'classic-serif',
    paragraphStyle: 'indented',
  };
}

// Write compile.config.json if it doesn't exist. Returns { path, created,
// config } so the caller can tell the user what happened.
export async function ensureCompileConfig(projectPath) {
  const path = resolve(projectPath, 'compile.config.json');
  if (await pathExists(path)) {
    try {
      const config = JSON.parse(await readFile(path, 'utf-8'));
      return { path, created: false, config };
    } catch {
      // existing file is corrupt — leave it alone, caller decides what to do
      return { path, created: false, config: null, corrupt: true };
    }
  }

  const config = await buildDefaultConfig(projectPath);
  await writeFile(path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return { path, created: true, config };
}
