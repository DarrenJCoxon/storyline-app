// Pipeline runner — executes each phase in sequence, logs progress.
//
// Each phase is an async function: (context, options) → context.
// The runner mutates context rather than deep-cloning; all phases should
// treat their inputs as read-only by convention.
//
// Story 3.1 ships the phase list as stubs. Subsequent stories replace
// each stub with real logic:
//   - 3.2 assembly
//   - 3.3 markdown-to-html
//   - 3.4 theme
//   - 3.5 package (EPUB zip)
//   - 3.6 preflight

import chalk from 'chalk';

const PHASES = [
  {
    id: 'preflight',
    label: 'Pre-flight check',
    run: async (ctx) => {
      // STUB — Story 3.6 replaces this with real validation.
      ctx.preflight = { errors: [], warnings: [], stub: true };
      return ctx;
    },
  },
  {
    id: 'assembly',
    label: 'Assemble chapters',
    run: async (ctx) => {
      // STUB — Story 3.2 reads manuscript/*.md + front/back matter here.
      ctx.assembly = { chapters: [], frontMatter: [], backMatter: [], metadata: {}, stub: true };
      return ctx;
    },
  },
  {
    id: 'html',
    label: 'Convert markdown to HTML',
    run: async (ctx) => {
      // STUB — Story 3.3 runs markdown-it on each chapter.
      ctx.html = { chapters: [], stub: true };
      return ctx;
    },
  },
  {
    id: 'theme',
    label: 'Apply theme',
    run: async (ctx) => {
      // STUB — Story 3.4 injects Classic Serif CSS + chapter class hooks.
      ctx.theme = { chapters: [], css: '', stub: true };
      return ctx;
    },
  },
  {
    id: 'output',
    label: 'Package EPUB',
    run: async (ctx) => {
      // STUB — Story 3.5 zips HTML+CSS+metadata into EPUB via html-to-epub.
      ctx.output = { path: null, bytes: 0, stub: true };
      return ctx;
    },
  },
];

export async function runPipeline(initialContext, { verbose = true } = {}) {
  let ctx = initialContext;

  for (const phase of PHASES) {
    const startedAt = Date.now();
    if (verbose) {
      process.stdout.write(chalk.dim(`  ${phase.label}… `));
    }

    try {
      ctx = await phase.run(ctx);
    } catch (err) {
      if (verbose) {
        console.log(chalk.red('failed'));
      }
      throw new Error(`${phase.label} failed: ${err.message}`);
    }

    // Preflight is a hard gate — errors abort the pipeline before any
    // files are written. Real logic lands in Story 3.6; for now the
    // stub reports empty errors, so we continue through all phases.
    if (phase.id === 'preflight' && ctx.preflight?.errors?.length > 0) {
      const errs = ctx.preflight.errors;
      if (verbose) {
        console.log(chalk.red(`blocked (${errs.length} error${errs.length === 1 ? '' : 's'})`));
        for (const e of errs) {
          console.log(chalk.red(`    ✗ ${typeof e === 'string' ? e : e.message}`));
        }
      }
      throw new Error(`Pre-flight found ${errs.length} error${errs.length === 1 ? '' : 's'}. Fix and rerun.`);
    }

    if (verbose) {
      const elapsed = Date.now() - startedAt;
      const suffix = ctx[phase.id]?.stub ? chalk.yellow(' [stub]') : '';
      console.log(chalk.green(`ok`) + chalk.dim(` (${elapsed}ms)${suffix}`));

      if (phase.id === 'preflight' && ctx.preflight?.warnings?.length) {
        for (const w of ctx.preflight.warnings) {
          console.log(chalk.yellow(`    ⚠ ${typeof w === 'string' ? w : w.message}`));
        }
      }
    }
  }

  return ctx;
}
