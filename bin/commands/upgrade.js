// storyline upgrade — reinstall the skill + agents from the current
// storyline-vsc package, overwriting whatever is in .claude/skills/ and
// .claude/agents/. Safe: does NOT touch state.json, manuscript/, output/,
// compile.config.json, or .storyline/config.json.
//
// The regular `storyline init` is intentionally idempotent (leaves
// existing .claude/skills/* alone so local edits survive repeat inits).
// That's the right default but makes it impossible to pick up skill /
// agent changes from a new storyline-vsc version. `upgrade` is the
// explicit escape hatch for "give me the latest skill wiring without
// touching my project data".

import chalk from 'chalk';
import { existsSync, rmSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import installClaudeSkills from '../../scripts/install-claude-skills.js';
import installClaudeAgents from '../../scripts/install-claude-agents.js';
import installOpenCodeCommands from '../../scripts/install-opencode-commands.js';
import installCodexPlugin from '../../scripts/install-codex-plugin.js';
import detectAgent, { expandAgent, agentLabel } from '../../scripts/detect-agent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '../..');

export function registerUpgrade(program) {
  program
    .command('upgrade')
    .description('Reinstall skill + agents from the current storyline-vsc version. Safe — leaves state.json, manuscript/, output/ untouched.')
    .option('--agent <type>', 'Target agent: claude-code, opencode, codex, both, all, or auto', 'auto')
    .option('--keep-agents', 'Only upgrade the skill; leave .claude/agents/ alone')
    .action(async (opts) => {
      const targetDir = process.cwd();
      const agent = detectAgent(opts.agent);
      const flags = expandAgent(agent);

      console.log(chalk.bold('\n✏️  Storyline — Upgrading harness\n'));
      console.log(chalk.dim(`  Agent:   ${agentLabel(agent)}`));
      console.log(chalk.dim(`  Project: ${targetDir}\n`));

      const log = msg => console.log(chalk.dim(`  ✓ ${msg}`));

      // 1. Claude Code — force-reinstall skills (rm then re-copy)
      if (flags.isClaude) {
        const skillsDir = resolve(targetDir, '.claude', 'skills');
        for (const slug of ['storyline', 'follow-up']) {
          const dst = resolve(skillsDir, slug);
          if (existsSync(dst)) {
            rmSync(dst, { recursive: true, force: true });
            log(`Removed stale .claude/skills/${slug}/`);
          }
        }
        installClaudeSkills(PACKAGE_ROOT, targetDir, { log });

        // 2. Claude Code — agents (re-copy, overwriting this time unless --keep-agents)
        if (opts.keepAgents) {
          console.log(chalk.dim('  ↳ --keep-agents passed; not touching .claude/agents/'));
        } else {
          const agentsDir = resolve(targetDir, '.claude', 'agents');
          if (existsSync(agentsDir)) {
            const shipped = existsSync(resolve(PACKAGE_ROOT, 'agents'))
              ? readdirSync(resolve(PACKAGE_ROOT, 'agents')).filter(f => f.endsWith('.md'))
              : [];
            for (const file of shipped) {
              const dst = resolve(agentsDir, file);
              if (existsSync(dst)) {
                rmSync(dst, { force: true });
                log(`Removed stale .claude/agents/${file}`);
              }
            }
          }
          installClaudeAgents(PACKAGE_ROOT, targetDir, { log });
        }
      }

      // 3. OpenCode — reinstall commands (force)
      if (flags.isOpenCode) {
        const ocDir = resolve(targetDir, '.opencode', 'commands');
        if (existsSync(ocDir)) {
          // Best-effort: let installOpenCodeCommands overwrite whatever it ships.
          rmSync(ocDir, { recursive: true, force: true });
          log('Removed stale .opencode/commands/');
        }
        installOpenCodeCommands(PACKAGE_ROOT, targetDir, { log });
      }

      // 4. Codex — reinstall plugin (force)
      if (flags.isCodex) {
        const codexDir = resolve(targetDir, '.codex');
        if (existsSync(codexDir)) {
          rmSync(codexDir, { recursive: true, force: true });
          log('Removed stale .codex/');
        }
        const { readFileSync } = await import('fs');
        const pkg = JSON.parse(readFileSync(resolve(PACKAGE_ROOT, 'package.json'), 'utf-8'));
        installCodexPlugin(PACKAGE_ROOT, targetDir, { log, version: pkg.version });
      }

      console.log(chalk.bold('\n✅ Upgrade complete.'));
      console.log(chalk.dim('\n  Next: restart your /storyline session so the new skill loads.\n'));
    });
}
