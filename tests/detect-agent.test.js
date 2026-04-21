// Agent auto-detection — given which home directories exist for
// supported AI coding agents, pick the right install target.
//
// The detector exists so writers don't need to remember to pass
// --agent on install: we look at what's present and install into
// everything sensible. These tests lock down the matrix.

import { describe, it, expect } from 'vitest';
import detectAgent, { expandAgent, agentLabel } from '../scripts/detect-agent.js';

// Helper: build a fake existsSync that returns true for specific paths.
function fakeExists(...presentDirs) {
  const set = new Set(presentDirs);
  return (p) => set.has(p);
}

// The detector uses these exact absolute paths (computed from $HOME).
// We reconstruct them here so the fake existsSync matches what the
// detector queries.
import { homedir } from 'os';
import { join } from 'path';
const CLAUDE = join(homedir(), '.claude');
const OPENCODE = join(homedir(), '.config', 'opencode');
const CODEX = join(homedir(), '.codex');

describe('detectAgent — override', () => {
  it('returns the override verbatim when not auto', () => {
    expect(detectAgent('claude-code')).toBe('claude-code');
    expect(detectAgent('opencode')).toBe('opencode');
    expect(detectAgent('codex')).toBe('codex');
    expect(detectAgent('both')).toBe('both');
    expect(detectAgent('all')).toBe('all');
  });
});

describe('detectAgent — auto mode', () => {
  it('claude-code alone', () => {
    expect(detectAgent('auto', { existsSync: fakeExists(CLAUDE) })).toBe('claude-code');
  });

  it('opencode alone', () => {
    expect(detectAgent('auto', { existsSync: fakeExists(OPENCODE) })).toBe('opencode');
  });

  it('codex alone', () => {
    expect(detectAgent('auto', { existsSync: fakeExists(CODEX) })).toBe('codex');
  });

  it('claude + opencode → both', () => {
    expect(detectAgent('auto', { existsSync: fakeExists(CLAUDE, OPENCODE) })).toBe('both');
  });

  it('claude + codex → all (no "both" with codex)', () => {
    expect(detectAgent('auto', { existsSync: fakeExists(CLAUDE, CODEX) })).toBe('all');
  });

  it('opencode + codex → all', () => {
    expect(detectAgent('auto', { existsSync: fakeExists(OPENCODE, CODEX) })).toBe('all');
  });

  it('all three → all', () => {
    expect(detectAgent('auto', { existsSync: fakeExists(CLAUDE, OPENCODE, CODEX) })).toBe('all');
  });

  it('nothing detected → claude-code fallback', () => {
    expect(detectAgent('auto', { existsSync: fakeExists() })).toBe('claude-code');
  });
});

describe('expandAgent — boolean flag expansion', () => {
  it('claude-code expands to Claude only', () => {
    expect(expandAgent('claude-code')).toEqual({ isClaude: true, isOpenCode: false, isCodex: false });
  });

  it('opencode expands to OpenCode only', () => {
    expect(expandAgent('opencode')).toEqual({ isClaude: false, isOpenCode: true, isCodex: false });
  });

  it('codex expands to Codex only', () => {
    expect(expandAgent('codex')).toEqual({ isClaude: false, isOpenCode: false, isCodex: true });
  });

  it('both expands to Claude + OpenCode', () => {
    expect(expandAgent('both')).toEqual({ isClaude: true, isOpenCode: true, isCodex: false });
  });

  it('all expands to all three', () => {
    expect(expandAgent('all')).toEqual({ isClaude: true, isOpenCode: true, isCodex: true });
  });
});

describe('agentLabel — human-readable', () => {
  it('prints all three names for all', () => {
    expect(agentLabel('all')).toMatch(/Claude Code/);
    expect(agentLabel('all')).toMatch(/OpenCode/);
    expect(agentLabel('all')).toMatch(/Codex/);
  });

  it('prints two names for both', () => {
    expect(agentLabel('both')).toMatch(/Claude Code/);
    expect(agentLabel('both')).toMatch(/OpenCode/);
    expect(agentLabel('both')).not.toMatch(/Codex/);
  });

  it('prints individual agents', () => {
    expect(agentLabel('claude-code')).toBe('Claude Code');
    expect(agentLabel('opencode')).toBe('OpenCode');
    expect(agentLabel('codex')).toBe('Codex');
  });
});
