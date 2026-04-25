// Install Storyline commands into a project's .opencode/ directory so
// OpenCode recognises /storyline, /follow-up, and /critique as slash
// commands.
//
// OpenCode's command layout (learned from odd-studio's implementation):
//
//   .opencode/
//   ├── commands/
//   │   ├── storyline.md         ← thin wrapper: frontmatter + "read SKILL.md"
//   │   └── follow-up.md
//   ├── storyline/               ← full skill tree copied verbatim
//   │   ├── SKILL.md
//   │   └── docs/
//   └── follow-up/
//       └── SKILL.md
//
// The wrapper files are what OpenCode discovers as slash commands. Each
// wrapper points at the canonical SKILL.md under .opencode/<slug>/ so
// the rich skill body stays single-sourced from the npm package.

import { existsSync, mkdirSync, cpSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

const COMMANDS = [
  {
    src: 'skill',
    slug: 'storyline',
    name: 'storyline',
    role: 'planning coach',
    description: 'Start or resume a Storyline novel planning session using the Save the Cat methodology. Character-first, beat-driven, with AI critique at every stage.',
  },
  {
    src: 'skill-follow-up',
    slug: 'follow-up',
    name: 'follow-up',
    role: 'inline-notes resolver',
    description: "Resolve inline {{bracketed notes}} the writer has left in their manuscript as research stubs or TBDs. Classifies each note and applies approved edits in place.",
  },
  {
    src: 'skill-critique',
    slug: 'critique',
    name: 'critique',
    role: 'draft-faithfulness critic',
    description: 'Faithfulness critique of a drafted manuscript chapter against the Storyline plan. Reads the prose and the matching plan slice; delegates to the storyline-critic-draft subagent for structured findings on beat function, POV, conflict, and what-changes.',
  },
  {
    src: 'skill-nf',
    slug: 'storyline-nf',
    name: 'storyline-nf',
    role: 'non-fiction planning coach',
    description: 'Start or resume a Storyline NF non-fiction book planning session. Guides authors through Book DNA (12 stages) then one of three pipelines: A (Prescriptive), B (Narrative Non-Fiction), or C (How-To / Skill Ladder).',
  },
];

export default function installOpenCodeCommands(packageRoot, targetDir, { log } = {}) {
  const logFn = log || (() => {});
  const openCodeDir = resolve(targetDir, '.opencode');
  const commandsDir = resolve(openCodeDir, 'commands');
  mkdirSync(commandsDir, { recursive: true });

  const installed = [];
  const alreadyPresent = [];

  for (const cmd of COMMANDS) {
    const skillSrc = resolve(packageRoot, cmd.src);
    if (!existsSync(skillSrc)) continue;

    const skillDst = resolve(openCodeDir, cmd.slug);
    const wrapperPath = resolve(commandsDir, `${cmd.name}.md`);
    const bothPresent = existsSync(skillDst) && existsSync(wrapperPath);

    if (bothPresent) {
      alreadyPresent.push({ slug: cmd.slug, name: cmd.name });
      logFn(`/${cmd.name} command already present in .opencode/`);
      continue;
    }

    // Copy the full skill tree so OpenCode can reference docs/ etc
    // via relative paths. Overwrite: we want a clean sync of the
    // skill body to what ships in the installed package version.
    if (!existsSync(skillDst)) {
      mkdirSync(dirname(skillDst), { recursive: true });
      cpSync(skillSrc, skillDst, { recursive: true });
    }

    // Thin wrapper — tells OpenCode "when the user types /storyline,
    // read the canonical skill file and execute the protocol".
    const wrapperBody = [
      '---',
      `description: "${cmd.description.replace(/"/g, '\\"')}"`,
      '---',
      '',
      `# /${cmd.name}`,
      '',
      `You are now operating as the Storyline ${cmd.role || cmd.name}.`,
      '',
      'Read this file now:',
      `- \`.opencode/${cmd.slug}/SKILL.md\` — the canonical Storyline skill`,
      '',
      'Then execute the protocol exactly as documented, starting from the startup state check.',
      '',
    ].join('\n');

    writeFileSync(wrapperPath, wrapperBody);
    installed.push({ slug: cmd.slug, name: cmd.name });
    logFn(`Installed /${cmd.name} into .opencode/commands/${cmd.name}.md (skill body at .opencode/${cmd.slug}/)`);
  }

  return { installed, alreadyPresent };
}
