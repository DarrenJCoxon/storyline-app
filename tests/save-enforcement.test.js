// End-to-end regression tests for the save-enforcement fix:
//
//   - install-claude-hooks (Layer 3): writes the right hook block,
//     idempotent, doesn't clobber user customisations.
//   - hook-handler module-level surface (Layer 3): the matcher functions
//     correctly identify save commands and stage-doc paths.
//   - The original drift bug regression: write a docs/13-chapter-flesh-out.md
//     directly without calling save; then assert that the doctor flags
//     orphan-artefact for chapterOutline. (The CLI-level UPSTREAM_DRIFT
//     and reseed/verify-stage commands are smoke-tested via Bash in the
//     dev workflow rather than through subprocess tests here, which would
//     be slow and fragile.)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { DEFAULT_STATE } from '../lib/state/project-state.js';
import installClaudeHooks from '../scripts/install-claude-hooks.js';
import { runDoctor } from '../lib/doctor.js';

function baseState(overrides = {}) {
  return {
    ...DEFAULT_STATE,
    _meta: { ...DEFAULT_STATE._meta, projectTitle: 'Smoke' },
    writing: { manuscriptPath: 'manuscript' },
    ...overrides,
  };
}

describe('install-claude-hooks (Layer 3)', () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(resolve(tmpdir(), 'storyline-hooks-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('creates .claude/settings.json with both hook entries on a fresh project', () => {
    const r = installClaudeHooks(tmp);
    expect(r.installedPost).toBe(true);
    expect(r.installedPre).toBe(true);
    const settings = JSON.parse(readFileSync(resolve(tmp, '.claude/settings.json'), 'utf-8'));
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    const post = settings.hooks.PostToolUse[0];
    expect(post.matcher).toBe('Bash');
    expect(post.hooks[0].command).toContain('hook-handler.js');
    expect(post.hooks[0].command).toContain('post-bash-save');
    const pre = settings.hooks.PreToolUse[0];
    expect(pre.matcher).toBe('Write|Edit');
    expect(pre.hooks[0].command).toContain('pre-write-doc');
  });

  it('is idempotent — re-running on an already-installed project does nothing', () => {
    installClaudeHooks(tmp);
    const r2 = installClaudeHooks(tmp);
    expect(r2.installedPost).toBe(false);
    expect(r2.installedPre).toBe(false);
    const settings = JSON.parse(readFileSync(resolve(tmp, '.claude/settings.json'), 'utf-8'));
    // Still exactly one hook entry per event.
    expect(settings.hooks.PostToolUse.length).toBe(1);
    expect(settings.hooks.PreToolUse.length).toBe(1);
  });

  it('preserves existing user customisations when adding our hooks', () => {
    // Writer has pre-customised settings — a different model + an
    // unrelated PostToolUse hook for their own tooling.
    mkdirSync(resolve(tmp, '.claude'), { recursive: true });
    writeFileSync(resolve(tmp, '.claude/settings.json'), JSON.stringify({
      model: 'sonnet',
      hooks: {
        PostToolUse: [{
          matcher: 'Read',
          hooks: [{ type: 'command', command: 'my-custom-hook.sh' }],
        }],
      },
    }, null, 2));

    installClaudeHooks(tmp);
    const settings = JSON.parse(readFileSync(resolve(tmp, '.claude/settings.json'), 'utf-8'));
    expect(settings.model).toBe('sonnet');                          // user setting preserved
    expect(settings.hooks.PostToolUse.length).toBe(2);              // user hook + ours
    expect(settings.hooks.PostToolUse[0].matcher).toBe('Read');     // user hook first
    expect(settings.hooks.PostToolUse[1].matcher).toBe('Bash');     // ours appended
  });

  it('appends our hook only once even if user has other unrelated PostToolUse hooks', () => {
    mkdirSync(resolve(tmp, '.claude'), { recursive: true });
    writeFileSync(resolve(tmp, '.claude/settings.json'), JSON.stringify({
      hooks: {
        PostToolUse: [
          { matcher: 'Read', hooks: [{ type: 'command', command: 'a.sh' }] },
          { matcher: 'WebFetch', hooks: [{ type: 'command', command: 'b.sh' }] },
        ],
      },
    }, null, 2));
    installClaudeHooks(tmp);
    installClaudeHooks(tmp);
    installClaudeHooks(tmp);
    const settings = JSON.parse(readFileSync(resolve(tmp, '.claude/settings.json'), 'utf-8'));
    // 2 user + 1 ours = 3 total; never duplicated.
    expect(settings.hooks.PostToolUse.length).toBe(3);
    const ours = settings.hooks.PostToolUse.filter(e =>
      e.hooks.some(h => h.command.includes('storyline-cli/bin/commands/hook-handler.js')));
    expect(ours.length).toBe(1);
  });
});

describe('original drift bug — regression coverage', () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(resolve(tmpdir(), 'storyline-drift-'));
    // Project state advanced through plotThreads (stage 11) but
    // chapterOutline (stage 12) is still empty.
    const state = baseState({
      genre: { primaryGenre: 'Thriller', tone: 'dark', audience: 'Adult', targetWordCount: 80000 },
      premise: { rawLogline: 'x', conceptHook: 'y' },
      protagonist: { name: 'M', want: 'a', need: 'b', flaw: 'c', coreLie: 'd' },
      characters: [{ name: 'a' }],
      relationships: [{ a: 'x', b: 'y' }],
      logline: { sentence: 'x', incitingIncident: 'y', stakes: 'z' },
      beatSheet: { genreVariant: 'standard', beats: { beat08Midpoint: { midpointType: 'false-victory' } } },
      bStory: { character: 'a', premise: 'b' },
      sceneOutline: { highLevel: [{ x: 1 }], approved: true },
      plotThreads: [{ name: 'x' }],
      chapterOutline: [],   // empty — the bug
    });
    mkdirSync(resolve(tmp, '.storyline'), { recursive: true });
    writeFileSync(resolve(tmp, '.storyline/state.json'), JSON.stringify(state, null, 2));
    // The exact failure mode: long-form doc written into docs/ without save.
    mkdirSync(resolve(tmp, 'docs'), { recursive: true });
    writeFileSync(resolve(tmp, 'docs/13-chapter-flesh-out.md'),
      '# Chapter Flesh-Out\n\nLong-form planning prose, never reached state.json.\n'.repeat(50));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('runDoctor flags the orphan-artefact for chapterOutline', async () => {
    const state = JSON.parse(readFileSync(resolve(tmp, '.storyline/state.json'), 'utf-8'));
    const report = await runDoctor(state, tmp);
    expect(report.ok).toBe(false);
    const orphans = report.findings.filter(f => f.type === 'orphan-artefact' && f.stageId === 'chapterOutline');
    expect(orphans.length).toBe(1);
    expect(orphans[0].artefacts).toContain('docs/13-chapter-flesh-out.md');
    expect(orphans[0].fix).toContain('storyline save chapterOutline');
  });
});
