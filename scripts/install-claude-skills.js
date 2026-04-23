// Install Storyline skills into a project's .claude/skills/ directory
// so Claude Code recognises /storyline, /follow-up, and /critique as
// slash commands.
//
// Scoped per-project (not ~/.claude) so each novel project pins its own
// skill version and multi-project writers don't hit cross-contamination.
// Idempotent: if a skill already exists at its destination, leave it
// alone rather than overwriting — writers may have locally patched
// their skills and we shouldn't blow that away on a repeat init.

import { existsSync, mkdirSync, cpSync } from 'fs';
import { resolve, dirname } from 'path';

const SKILLS = [
  { src: 'skill',           slug: 'storyline', slash: '/storyline' },
  { src: 'skill-follow-up', slug: 'follow-up', slash: '/follow-up' },
  { src: 'skill-critique',  slug: 'critique',  slash: '/critique'  },
];

export default function installClaudeSkills(packageRoot, targetDir, { log } = {}) {
  const logFn = log || (() => {});
  const installed = [];
  const alreadyPresent = [];

  for (const { src, slug, slash } of SKILLS) {
    const skillSrc = resolve(packageRoot, src);
    const skillDst = resolve(targetDir, '.claude', 'skills', slug);
    if (!existsSync(skillSrc)) continue;
    if (existsSync(skillDst)) {
      alreadyPresent.push({ slug, slash });
      logFn(`${slash} skill already present at .claude/skills/${slug}/`);
      continue;
    }
    mkdirSync(dirname(skillDst), { recursive: true });
    cpSync(skillSrc, skillDst, { recursive: true });
    installed.push({ slug, slash });
    logFn(`Installed ${slash} into .claude/skills/${slug}/`);
  }

  return { installed, alreadyPresent };
}
