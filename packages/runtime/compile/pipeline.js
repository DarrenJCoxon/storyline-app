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
import { assemble } from './assembler.js';
import { generateFrontMatter } from './front-matter-generator.js';
import { runPreflight } from './preflight.js';
import { markdownToHtml } from './markdown-to-html.js';
import { applyBookStyle } from './book-style.js';
import { packageEpub } from './epub.js';
import { packagePrintPdf } from './print-pdf.js';
import { distributeOutputs } from './distribution.js';

// Phase order matters. Assembly must run before preflight so the
// validator can inspect real manuscript content (word counts, chapter
// count, metadata actually resolved from the project). Preflight
// gates everything after it: if errors are found, HTML/theme/packaging
// never run and no .epub is written.
const PHASES = [
  {
    id: 'assembly',
    label: 'Assemble chapters',
    run: assemble,
    summarise: (ctx) => {
      const a = ctx.assembly;
      if (!a) return '';
      const parts = [];
      parts.push(`${a.chapters.length} chapter${a.chapters.length === 1 ? '' : 's'}`);
      if (a.frontMatter.length) parts.push(`${a.frontMatter.length} front`);
      if (a.backMatter.length) parts.push(`${a.backMatter.length} back`);
      return parts.join(', ');
    },
  },
  {
    id: 'front-matter',
    label: 'Generate front / back matter',
    run: generateFrontMatter,
    summarise: (ctx) => {
      const s = ctx.frontMatterSummary;
      if (!s) return '';
      const parts = [];
      if (s.generatedFront.length) parts.push(`${s.generatedFront.length} front generated`);
      if (s.generatedBack.length)  parts.push(`${s.generatedBack.length} back generated`);
      return parts.join(', ') || 'none generated';
    },
  },
  {
    id: 'preflight',
    label: 'Pre-flight check',
    run: runPreflight,
    summarise: (ctx) => {
      const p = ctx.preflight;
      if (!p) return '';
      const parts = [];
      parts.push(`${p.wordCount.toLocaleString()} words`);
      if (p.estimatedPages) parts.push(`~${p.estimatedPages} pages`);
      if (p.warnings.length) parts.push(`${p.warnings.length} warning${p.warnings.length === 1 ? '' : 's'}`);
      return parts.join(', ');
    },
  },
  {
    id: 'html',
    label: 'Convert markdown to HTML',
    run: markdownToHtml,
    summarise: (ctx) => {
      const h = ctx.html;
      if (!h) return '';
      const totalBytes = [...h.frontMatter, ...h.chapters, ...h.backMatter]
        .reduce((sum, item) => sum + item.html.length, 0);
      return `${formatBytes(totalBytes)} of HTML`;
    },
  },
  {
    id: 'theme',
    label: 'Apply theme',
    run: applyBookStyle,
    summarise: (ctx) => {
      const t = ctx.theme;
      if (!t) return '';
      const openerLabel = t.openerId ? ` + ${t.openerId.charAt(0).toUpperCase() + t.openerId.slice(1)}` : '';
      return `${t.meta?.name || t.id}${openerLabel}, ${t.paragraphStyle} paragraphs (${(t.css.length / 1024).toFixed(1)} KB CSS)`;
    },
  },
  {
    id: 'output',
    label: (ctx) => {
      if (ctx.format === 'bundle') return 'Distribute all targets';
      return ctx.format === 'print-pdf' ? 'Package Print PDF' : 'Package EPUB';
    },
    run: async (ctx) => {
      if (ctx.format === 'bundle') return distributeOutputs(ctx);
      if (ctx.format === 'print-pdf') return packagePrintPdf(ctx);
      return packageEpub(ctx);
    },
    summarise: (ctx) => {
      if (ctx.outputs) {
        const ok  = ctx.outputs.filter(o => !o.error).length;
        const err = ctx.outputs.filter(o =>  o.error).length;
        return err ? `${ok} ok, ${err} failed` : `${ok} target${ok === 1 ? '' : 's'}`;
      }
      const o = ctx.output;
      if (!o?.path) return '';
      return `${formatBytes(o.bytes)} → ${o.path.split('/').slice(-2).join('/')}`;
    },
  },
];

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export async function runPipeline(initialContext, { verbose = true } = {}) {
  let ctx = initialContext;

  for (const phase of PHASES) {
    const startedAt = Date.now();
    const phaseLabel = typeof phase.label === 'function' ? phase.label(ctx) : phase.label;
    if (verbose) {
      process.stdout.write(chalk.dim(`  ${phaseLabel}… `));
    }

    try {
      ctx = await phase.run(ctx);
    } catch (err) {
      if (verbose) {
        console.log(chalk.red('failed'));
      }
      throw new Error(`${phaseLabel} failed: ${err.message}`);
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
      const stubTag = ctx[phase.id]?.stub ? chalk.yellow(' [stub]') : '';
      const summary = typeof phase.summarise === 'function' ? phase.summarise(ctx) : '';
      const summaryTag = summary ? chalk.dim(` — ${summary}`) : '';
      console.log(chalk.green(`ok`) + chalk.dim(` (${elapsed}ms)${stubTag}`) + summaryTag);

      if (phase.id === 'preflight' && ctx.preflight?.warnings?.length) {
        for (const w of ctx.preflight.warnings) {
          console.log(chalk.yellow(`    ⚠ ${typeof w === 'string' ? w : w.message}`));
        }
      }

      // Theme override warnings — keys the writer specified in
      // compile.config.json's themeOverrides that aren't recognised
      // globally or aren't honoured by the active theme.
      if (phase.id === 'theme' && ctx.theme?.overrideWarnings?.length) {
        for (const w of ctx.theme.overrideWarnings) {
          console.log(chalk.yellow(`    ⚠ ${w.message}`));
        }
      }
    }
  }

  return ctx;
}
