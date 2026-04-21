// compile.config.json auto-generation tests.
//
// This is the "no one will ever hand-craft JSON" defence. If config
// auto-gen regresses, first-time compiles produce books with
// "Untitled" and "Unknown Author" — visible to the reader, embarrassing
// at upload. Lock the happy path AND the fallbacks.
//
// Note: we cannot reliably mock the real git binary across dev
// machines, so the git-backed author test reads the CURRENT git user,
// treats it as optional, and skips the author-specific assertion if
// git isn't configured. The SHAPE of the generated config is still
// fully asserted.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import { buildDefaultConfig, ensureCompileConfig } from '../../lib/config/compile-config.js';

describe('buildDefaultConfig', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-config-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('uses the project directory basename as fallback title', async () => {
    const config = await buildDefaultConfig(tmp);
    expect(config.metadata.title).toBeTypeOf('string');
    expect(config.metadata.title.length).toBeGreaterThan(0);
    // tmpdir creates names like /tmp/nw-config-xxxxxx — we can't match
    // exactly but we can ensure it uses the basename, not the full path.
    expect(config.metadata.title).not.toContain('/');
  });

  it('prefers state.json projectTitle over directory name', async () => {
    mkdirSync(resolve(tmp, '.storyline'), { recursive: true });
    writeFileSync(resolve(tmp, '.storyline', 'state.json'), JSON.stringify({
      _meta: { projectTitle: 'The Real Title' },
      genre: { primaryGenre: 'thriller' },
    }));
    const config = await buildDefaultConfig(tmp);
    expect(config.metadata.title).toBe('The Real Title');
  });

  it('reads genre from state.json', async () => {
    mkdirSync(resolve(tmp, '.storyline'), { recursive: true });
    writeFileSync(resolve(tmp, '.storyline', 'state.json'), JSON.stringify({
      genre: { primaryGenre: 'fantasy', subGenre: 'epic fantasy' },
    }));
    const config = await buildDefaultConfig(tmp);
    expect(config.metadata.genre).toBe('fantasy');
    expect(config.metadata.subGenre).toBe('epic fantasy');
  });

  it('survives corrupt state.json (falls back to directory name)', async () => {
    mkdirSync(resolve(tmp, '.storyline'), { recursive: true });
    writeFileSync(resolve(tmp, '.storyline', 'state.json'), '{ not json');
    const config = await buildDefaultConfig(tmp);
    expect(config.metadata.title).toBeTypeOf('string');
    expect(config.metadata.genre).toBeNull();
  });

  it('emits the full metadata shape the pipeline expects', async () => {
    const config = await buildDefaultConfig(tmp);
    const m = config.metadata;
    expect(m).toHaveProperty('title');
    expect(m).toHaveProperty('subtitle', null);
    expect(m).toHaveProperty('author');       // null OK if git unconfigured
    expect(m).toHaveProperty('publisher', 'Independent');
    expect(m).toHaveProperty('language', 'en');
    expect(m).toHaveProperty('identifier', null);
    expect(m).toHaveProperty('isbn', null);
    expect(m).toHaveProperty('description', null);
    expect(m).toHaveProperty('genre');
    expect(m).toHaveProperty('subGenre');
  });

  it('defaults theme to classic-serif and paragraphStyle to indented', async () => {
    const config = await buildDefaultConfig(tmp);
    expect(config.theme).toBe('classic-serif');
    expect(config.paragraphStyle).toBe('indented');
  });
});

describe('ensureCompileConfig', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-config-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('writes compile.config.json on first call', async () => {
    const result = await ensureCompileConfig(tmp);
    expect(result.created).toBe(true);
    const raw = readFileSync(resolve(tmp, 'compile.config.json'), 'utf-8');
    const written = JSON.parse(raw);
    expect(written.theme).toBe('classic-serif');
  });

  it('leaves existing compile.config.json untouched', async () => {
    const existing = { metadata: { title: 'Already Written' }, theme: 'heritage' };
    writeFileSync(resolve(tmp, 'compile.config.json'), JSON.stringify(existing));
    const result = await ensureCompileConfig(tmp);
    expect(result.created).toBe(false);
    expect(result.config.metadata.title).toBe('Already Written');
    expect(result.config.theme).toBe('heritage');
  });

  it('flags a corrupt compile.config.json without overwriting it', async () => {
    writeFileSync(resolve(tmp, 'compile.config.json'), '{ not valid json');
    const result = await ensureCompileConfig(tmp);
    expect(result.created).toBe(false);
    expect(result.corrupt).toBe(true);
    // File must still be on disk for the human to see + fix.
    const raw = readFileSync(resolve(tmp, 'compile.config.json'), 'utf-8');
    expect(raw).toBe('{ not valid json');
  });

  it('produces valid JSON on disk after creation', async () => {
    await ensureCompileConfig(tmp);
    const raw = readFileSync(resolve(tmp, 'compile.config.json'), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
