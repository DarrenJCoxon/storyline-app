// Compile orchestrator — stitches the pipeline phases together.
//
// Pipeline (all phases except preflight live in their own modules; Story 3.1
// ships this orchestrator + CLI wiring as stubs so we can prove the plumbing
// before adding real logic):
//
//   preflight → assembly → markdown-to-html → theme → package → output file
//
// Each phase is pure-ish: takes a context, returns a new context. The
// orchestrator is responsible for logging, error propagation, and the
// abort-on-error gate after preflight.

import chalk from 'chalk';
import { runPipeline } from './pipeline.js';
import { ensureCompileConfig } from '../config/compile-config.js';

const SUPPORTED_FORMATS = new Set(['epub', 'print-pdf', 'bundle']);

export async function compile({ format = 'epub', projectPath = process.cwd(), verbose = true } = {}) {
  if (!SUPPORTED_FORMATS.has(format)) {
    const supported = [...SUPPORTED_FORMATS].join(', ');
    throw new Error(`Unsupported format "${format}". Supported: ${supported}.`);
  }

  if (verbose) {
    const label = format === 'bundle' ? 'DISTRIBUTE (all targets)' : format.toUpperCase();
    console.log(chalk.bold(`\n📚 Storyline — Compile → ${label}\n`));
    console.log(chalk.dim(`  Project: ${projectPath}\n`));
  }

  // Self-heal: if compile.config.json doesn't exist (project was created
  // before this feature, or the writer deleted it), build one from git
  // config + state.json + directory name and write it to disk. The writer
  // can edit it later to tweak metadata, but a first compile never
  // requires any hand-editing.
  const configResult = await ensureCompileConfig(projectPath);
  if (verbose && configResult.created) {
    const author = configResult.config?.metadata?.author || '(not set)';
    const title = configResult.config?.metadata?.title || 'Untitled';
    console.log(chalk.cyan(`  ℹ Created compile.config.json (title: "${title}", author: "${author}")`));
    console.log(chalk.dim(`    Edit this file at the project root to customise metadata before publishing.\n`));
  }

  const context = {
    format,
    projectPath,
    startedAt: new Date(),
    // These get populated as phases run.
    preflight: null,
    assembly: null,
    html: null,
    theme: null,
    output: null,
  };

  try {
    const result = await runPipeline(context, { verbose });
    if (verbose) {
      const elapsed = ((Date.now() - context.startedAt.getTime()) / 1000).toFixed(2);
      console.log(chalk.green(`\n✓ Compile complete in ${elapsed}s\n`));
      if (result.outputs) {
        for (const o of result.outputs) {
          const files = o.file ? [o.file] : (o.files || []);
          const status = o.error ? chalk.red('✗') : chalk.green('✓');
          console.log(chalk.cyan(`  ${status} ${o.target}: `) + files.map(f => f.split('/').slice(-1)[0]).join(', '));
        }
        console.log('');
      } else if (result.output?.path) {
        console.log(chalk.cyan(`  Output: ${result.output.path}\n`));
      }
    }
    return result;
  } catch (err) {
    if (verbose) {
      console.error(chalk.red(`\n✗ Compile failed: ${err.message}\n`));
    }
    throw err;
  }
}
