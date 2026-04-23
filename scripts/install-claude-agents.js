// Install Storyline critic agents into a project's .claude/agents/
// directory so Claude Code recognises them as named subagents and the
// /storyline skill can invoke them by name (subagent_type: "storyline-critic-<tier>").
//
// Scoped per-project (not ~/.claude) so each novel pins its own agent
// versions and writers who use Claude Code for non-Storyline work don't
// see these agents in unrelated projects.
//
// Idempotent: if an agent file already exists at its destination, leave
// it alone — writers may have locally patched an agent's system prompt
// and we shouldn't overwrite on repeat init.

import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'fs';
import { resolve } from 'path';

export default function installClaudeAgents(packageRoot, targetDir, { log } = {}) {
  const logFn = log || (() => {});
  const agentsSrc = resolve(packageRoot, 'agents');
  const agentsDst = resolve(targetDir, '.claude', 'agents');

  if (!existsSync(agentsSrc)) {
    return { installed: [], alreadyPresent: [] };
  }

  mkdirSync(agentsDst, { recursive: true });

  const installed = [];
  const alreadyPresent = [];

  for (const file of readdirSync(agentsSrc)) {
    if (!file.endsWith('.md')) continue;
    const src = resolve(agentsSrc, file);
    const dst = resolve(agentsDst, file);
    if (existsSync(dst)) {
      alreadyPresent.push(file);
      logFn(`Agent already present: .claude/agents/${file}`);
      continue;
    }
    copyFileSync(src, dst);
    installed.push(file);
    logFn(`Installed agent: .claude/agents/${file}`);
  }

  return { installed, alreadyPresent };
}
