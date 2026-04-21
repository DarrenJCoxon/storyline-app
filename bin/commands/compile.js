// `storyline compile` — compile the novel project's manuscript to a publishable
// format. Story 3.1 wires the CLI; later stories fill in the pipeline phases.

import chalk from 'chalk';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { compile } from '../../lib/compile/index.js';

const SUPPORTED_FORMATS = ['epub', 'print-pdf']; // docx etc. in later milestones

export function registerCompile(program) {
  program
    .command('compile')
    .description('Compile the current novel project to a publishable format')
    .option('-f, --format <format>', `Output format (${SUPPORTED_FORMATS.join(', ')})`, 'epub')
    .option('--no-color', 'Disable colour output')
    .option('-q, --quiet', 'Suppress progress output (errors still shown)')
    .action(async (options) => {
      const format = options.format.toLowerCase();
      if (!SUPPORTED_FORMATS.includes(format)) {
        console.error(chalk.red(`Unsupported format: ${format}`));
        console.error(chalk.dim(`Supported: ${SUPPORTED_FORMATS.join(', ')}`));
        process.exit(2);
      }

      const projectPath = process.cwd();
      const stateFile = resolve(projectPath, '.storyline', 'state.json');
      if (!existsSync(stateFile)) {
        console.error(chalk.red('No novel project found in this directory.'));
        console.error(chalk.dim('Run `storyline init` first, or cd into an existing project.'));
        process.exit(2);
      }

      try {
        await compile({
          format,
          projectPath,
          verbose: !options.quiet,
        });
      } catch (err) {
        if (options.quiet) {
          console.error(chalk.red(err.message));
        }
        process.exit(1);
      }
    });
}
