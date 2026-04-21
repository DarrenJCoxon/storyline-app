// Install Storyline as a Codex plugin at plugins/storyline/.
//
// Codex plugin layout (per the official plugin.json spec):
//
//   plugins/storyline/
//   ├── plugin.json              ← manifest
//   ├── skills/
//   │   ├── storyline/
//   │   │   ├── SKILL.md
//   │   │   └── docs/
//   │   └── follow-up/
//   │       └── SKILL.md
//   └── .mcp.json                ← odd-flow config (populated by setup-mcp.js)
//
// Codex doesn't support user-defined slash commands (confirmed via
// context7 against openai/codex docs). Users invoke the skills via:
//   - $storyline / $follow-up (skill markers)
//   - natural language ("use storyline") primed by the AGENTS.md we
//     write separately at the project root
//
// Plugin marketplace registration (.codex/config.toml) is out of scope
// for this release — writers add the plugin manually inside Codex.

import { existsSync, mkdirSync, cpSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PLUGIN_NAME = 'storyline';

const SKILLS = [
  { src: 'skill',           slug: 'storyline' },
  { src: 'skill-follow-up', slug: 'follow-up' },
];

export default function installCodexPlugin(packageRoot, targetDir, { log, version } = {}) {
  const logFn = log || (() => {});
  const pluginDir = resolve(targetDir, 'plugins', PLUGIN_NAME);
  const skillsDir = resolve(pluginDir, 'skills');

  const alreadyPresent = existsSync(resolve(pluginDir, 'plugin.json'));
  if (alreadyPresent) {
    logFn(`Codex plugin already present at plugins/${PLUGIN_NAME}/`);
    return { installed: false, pluginDir };
  }

  mkdirSync(skillsDir, { recursive: true });

  // Copy skill bodies into skills/<slug>/
  for (const { src, slug } of SKILLS) {
    const skillSrc = resolve(packageRoot, src);
    const skillDst = resolve(skillsDir, slug);
    if (!existsSync(skillSrc)) continue;
    cpSync(skillSrc, skillDst, { recursive: true });
  }

  // Write plugin.json — manifest Codex reads to discover skills and MCP
  // config. The "skills" and "mcpServers" paths are relative to this
  // plugin.json file. The interface block seeds Codex's UI with a
  // display name and suggested prompts.
  const manifest = {
    name: PLUGIN_NAME,
    version: version || '1.0.0',
    description: 'Storyline — a planning and writing environment for novelists, built around the Save the Cat story structure.',
    author: { name: 'Storyline' },
    repository: 'https://github.com/DarrenJCoxon/storyline',
    license: 'MIT',
    keywords: ['novel', 'writing', 'save-the-cat', 'story-planning'],
    skills: './skills/',
    mcpServers: './.mcp.json',
    interface: {
      displayName: 'Storyline',
      shortDescription: 'Save the Cat novel planning + inline-note resolution',
      longDescription: 'Plan a novel end-to-end with the Save the Cat 14-stage methodology, then write prose in the same environment with AI-assisted research on the inline notes you leave as you draft.',
      category: 'Writing',
      capabilities: ['Interactive', 'Write'],
      defaultPrompt: [
        'Start a new novel — walk me through genre and the main character.',
        'Resume my novel planning from where I left off.',
        'Check my manuscript for inline research notes and help me resolve them.',
      ],
    },
  };

  writeFileSync(
    resolve(pluginDir, 'plugin.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  logFn(`Installed Codex plugin at plugins/${PLUGIN_NAME}/`);
  return { installed: true, pluginDir };
}

export { PLUGIN_NAME };
