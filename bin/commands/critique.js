// `storyline critique` — CLI entry points for the /critique skill.
//
// The skill (skill-critique/SKILL.md) does the conversational work of
// invoking the draft critic via the harness's Task tool. This CLI is the
// data plane: build the JSON brief the critic reads. The skill then
// records model provenance via `storyline-vsc record-model draftCritique
// <model>` (reusing the existing M8 plumbing).
//
// Subcommands so far:
//   storyline-vsc critique-brief <chapter>
//     Emit the JSON bundle (prose + plan slice + beat slice + drift +
//     protagonist) for a chapter to stdout. The skill pipes this directly
//     into the subagent prompt.
//
// Story 3 will add filename + active-file resolution. Story 4 may add
// `critique-render` if the output-formatter needs CLI surface.

import chalk from 'chalk';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { loadState } from '../../lib/state/store.js';
import { buildCritiqueBrief } from '../../lib/critique/brief-builder.js';

export function registerCritique(program) {
  program
    .command('critique-brief')
    .description('Build the critique brief for a chapter (JSON to stdout)')
    .argument('<chapter>', 'Chapter number (e.g. 3, ch03)')
    .action(async (chapter) => {
      const projectPath = process.cwd();
      const stateFile = resolve(projectPath, '.storyline', 'state.json');
      if (!existsSync(stateFile)) {
        console.error(chalk.red('No novel project found in this directory.'));
        console.error(chalk.dim('Run `storyline init` first, or cd into an existing project.'));
        process.exit(2);
      }

      const state = loadState(projectPath);
      const brief = await buildCritiqueBrief(chapter, state, projectPath);

      // Always emit JSON on stdout — even on structured errors. The skill
      // detects the `error` field and surfaces a clear message to the
      // writer rather than silently failing into a generic critique.
      console.log(JSON.stringify(brief, null, 2));

      if (brief.error) {
        // Non-zero exit so the skill can branch on shell status if it
        // prefers — but JSON is still on stdout for parsing.
        process.exit(3);
      }
    });
}
