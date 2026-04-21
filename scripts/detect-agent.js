// Agent detection — decides which AI coding harness(es) to install
// Storyline into based on what's present in the user's home dir.
//
// Callers can override the auto-detection by passing an explicit agent
// string ('claude-code', 'opencode', 'codex', 'both', 'all'). Auto-mode
// picks the smallest set that covers everything installed:
//
//   Claude only         → 'claude-code'
//   OpenCode only       → 'opencode'
//   Codex only          → 'codex'
//   Claude + OpenCode   → 'both'
//   any combo with 3    → 'all'
//
// Nothing detected falls back to 'claude-code' — it's the most widely
// installed and the path of least surprise for users running `init`
// without a specific AI harness already set up.

import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CLAUDE_DIR = join(homedir(), '.claude');
const OPENCODE_DIR = join(homedir(), '.config', 'opencode');
const CODEX_DIR = join(homedir(), '.codex');

export default function detectAgent(override = 'auto', options = {}) {
  if (override !== 'auto') return override;

  const exists = options.existsSync || existsSync;
  const hasClaude = exists(CLAUDE_DIR);
  const hasOpenCode = exists(OPENCODE_DIR);
  const hasCodex = exists(CODEX_DIR);

  const count = [hasClaude, hasOpenCode, hasCodex].filter(Boolean).length;
  if (count >= 3) return 'all';
  if (hasClaude && hasOpenCode) return 'both';
  if (hasClaude && hasCodex) return 'all';
  if (hasOpenCode && hasCodex) return 'all';
  if (hasCodex) return 'codex';
  if (hasOpenCode) return 'opencode';
  return 'claude-code';
}

// Given an agent string, return booleans for each individual harness.
// Centralises the 'both'/'all' expansion so call sites don't duplicate
// the conditional logic.
export function expandAgent(agent) {
  return {
    isClaude: agent === 'claude-code' || agent === 'both' || agent === 'all',
    isOpenCode: agent === 'opencode' || agent === 'both' || agent === 'all',
    isCodex: agent === 'codex' || agent === 'all',
  };
}

export function agentLabel(agent) {
  if (agent === 'all') return 'Claude Code + OpenCode + Codex';
  if (agent === 'both') return 'Claude Code + OpenCode';
  if (agent === 'claude-code') return 'Claude Code';
  if (agent === 'opencode') return 'OpenCode';
  if (agent === 'codex') return 'Codex';
  return agent;
}
