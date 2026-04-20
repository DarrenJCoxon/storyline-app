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

const SUPPORTED_FORMATS = new Set(['epub']);

export async function compile({ format = 'epub', projectPath = process.cwd(), verbose = true } = {}) {
  if (!SUPPORTED_FORMATS.has(format)) {
    const supported = [...SUPPORTED_FORMATS].join(', ');
    throw new Error(`Unsupported format "${format}". Supported: ${supported}.`);
  }

  if (verbose) {
    console.log(chalk.bold(`\n📚 Novel Writer — Compile → ${format.toUpperCase()}\n`));
    console.log(chalk.dim(`  Project: ${projectPath}\n`));
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
      if (result.output?.path) {
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
