// storyline nf — Non-fiction harness command group
// Subcommands: init, status, stages, generate, migrate
// The /storyline-nf skill drives the conversational planning;
// these CLI commands manage state and provide machine-readable output.

import chalk from 'chalk';
import { loadState, saveState } from '../../lib/state/store.js';
import { BOOK_DNA_STAGES, runStage as runDnaStage, derivePipelineFromCategoryData } from '../../lib/stages-nf/book-dna/index.js';
import { PIPELINE_A_STAGES, getActiveStages as getActiveA } from '../../lib/stages-nf/pipeline-a/index.js';
import { PIPELINE_B_STAGES } from '../../lib/stages-nf/pipeline-b/index.js';
import { PIPELINE_C_STAGES } from '../../lib/stages-nf/pipeline-c/index.js';

const PIPELINE_LABELS = {
  A: 'Pipeline A — Prescriptive (Self-Help, Business, Health, Money, Relationships)',
  B: 'Pipeline B — Narrative Non-Fiction (Popular Science, History, True Crime)',
  C: 'Pipeline C — How-To / Skill Ladder (Practical Skills)',
};

function getPipelineStages(pipeline, subMode) {
  if (pipeline === 'A') return getActiveA(subMode);
  if (pipeline === 'B') return PIPELINE_B_STAGES;
  if (pipeline === 'C') return PIPELINE_C_STAGES;
  return [];
}

export function registerNf(program) {
  const nf = program.command('nf').description('Non-fiction planning harness commands');

  // ── nf init ────────────────────────────────────────────────────
  nf
    .command('init')
    .description('Initialise project as non-fiction and select a pipeline')
    .option('--pipeline <id>', 'Pipeline to use: A, B, or C')
    .option('--sub-mode <mode>', 'Sub-mode override (A: argument|braid; B: idea-led|event-led)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const state = loadState();
      if (!state) {
        const msg = 'No project found. Run `storyline init` first.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.red(msg));
        process.exit(1);
      }

      const pipeline = (opts.pipeline || '').toUpperCase();
      if (!['A', 'B', 'C'].includes(pipeline)) {
        const msg = 'Pipeline must be A, B, or C. Use --pipeline A|B|C';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.red(msg));
        process.exit(1);
      }

      state.mode = 'nonfiction';
      state.pipeline = pipeline;
      state.subMode = opts.subMode || null;

      await saveState(state);

      const result = {
        ok: true,
        mode: 'nonfiction',
        pipeline,
        subMode: state.subMode,
        pipelineLabel: PIPELINE_LABELS[pipeline],
        message: `Project set to nonfiction / Pipeline ${pipeline}. Use /storyline-nf to begin planning.`,
      };

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green(`\n✓ Non-fiction project initialised\n`));
        console.log(chalk.dim(`  Pipeline: ${PIPELINE_LABELS[pipeline]}`));
        if (state.subMode) console.log(chalk.dim(`  Sub-mode: ${state.subMode}`));
        console.log(chalk.dim(`\n  Use /storyline-nf in Claude Code to begin planning.\n`));
      }
    });

  // ── nf status ──────────────────────────────────────────────────
  nf
    .command('status')
    .description('Show NF project state — Book DNA and pipeline stage completion')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const state = loadState();
      if (!state) {
        const msg = 'No project found. Run `storyline init` first.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.yellow(msg));
        return;
      }

      if (state.mode !== 'nonfiction') {
        const msg = 'Project is not in nonfiction mode. Run `storyline nf init --pipeline A|B|C` first.';
        if (opts.json) console.log(JSON.stringify({ mode: state.mode, error: msg }));
        else console.error(chalk.yellow(msg));
        return;
      }

      const pipelineStages = getPipelineStages(state.pipeline, state.subMode);
      const allStages = [...BOOK_DNA_STAGES, ...pipelineStages];

      const completed = allStages.filter(s => state.nfStages?.[s.id]?.completed);
      const total = allStages.length;
      const progress = total > 0 ? Math.round((completed.length / total) * 100) : 0;

      if (opts.json) {
        console.log(JSON.stringify({
          mode: state.mode,
          pipeline: state.pipeline,
          subMode: state.subMode,
          progress,
          completedCount: completed.length,
          totalCount: total,
          stages: allStages.map(s => ({
            id: s.id,
            name: s.name,
            phase: BOOK_DNA_STAGES.includes(s) ? 'book-dna' : 'pipeline',
            completed: !!state.nfStages?.[s.id]?.completed,
            completedAt: state.nfStages?.[s.id]?.completedAt || null,
          })),
        }, null, 2));
        return;
      }

      console.log(chalk.bold(`\n📖 Storyline NF — Project Status\n`));
      console.log(chalk.dim(`  Pipeline: ${PIPELINE_LABELS[state.pipeline] || state.pipeline}`));
      if (state.subMode) console.log(chalk.dim(`  Sub-mode: ${state.subMode}`));
      console.log(chalk.dim(`  Progress: ${progress}% (${completed.length}/${total} stages)\n`));

      console.log(chalk.bold('Phase 0 — Book DNA'));
      for (const stage of BOOK_DNA_STAGES) {
        const done = state.nfStages?.[stage.id]?.completed;
        const mark = done ? chalk.green(`  ✓ ${stage.name}`) : chalk.dim(`  ○ ${stage.name}`);
        console.log(mark);
      }

      console.log(chalk.bold(`\nPipeline ${state.pipeline}`));
      for (const stage of pipelineStages) {
        const done = state.nfStages?.[stage.id]?.completed;
        const mark = done ? chalk.green(`  ✓ ${stage.name}`) : chalk.dim(`  ○ ${stage.name}`);
        console.log(mark);
      }
      console.log();
    });

  // ── nf stages ─────────────────────────────────────────────────
  nf
    .command('stages')
    .description('List all NF stages (Book DNA + pipeline stages)')
    .option('--pipeline <id>', 'Pipeline to list (A, B, or C) — defaults to project pipeline')
    .option('--json', 'Output machine-readable JSON')
    .action((opts) => {
      const state = loadState();
      const pipeline = (opts.pipeline || state?.pipeline || 'A').toUpperCase();
      const subMode = state?.subMode || null;
      const pipelineStages = getPipelineStages(pipeline, subMode);

      if (opts.json) {
        console.log(JSON.stringify({
          bookDna: BOOK_DNA_STAGES,
          pipeline,
          pipelineStages,
        }, null, 2));
        return;
      }

      console.log(chalk.bold(`\n📋 NF Planning Stages — ${PIPELINE_LABELS[pipeline] || pipeline}\n`));
      console.log(chalk.dim('Phase 0 — Book DNA (all pipelines)'));
      BOOK_DNA_STAGES.forEach((s, i) => {
        console.log(`  ${String(i + 1).padStart(2)}  ${s.name}`);
      });
      console.log(chalk.dim(`\nPipeline ${pipeline}`));
      pipelineStages.forEach((s, i) => {
        console.log(`  ${String(i + 1).padStart(2)}  ${s.name}`);
      });
      console.log();
    });

  // ── nf generate ───────────────────────────────────────────────
  nf
    .command('generate')
    .description('Generate the NF master planning document')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const state = loadState();
      if (!state) {
        const msg = 'No project found. Run `storyline init` first.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.red(msg));
        process.exit(1);
      }
      if (state.mode !== 'nonfiction') {
        const msg = 'Not a nonfiction project. Run `storyline nf init --pipeline A|B|C` first.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.yellow(msg));
        process.exit(1);
      }

      const { generateCritiqueReport } = await import('../../lib/ai/critique-api.js');
      const { appendFile } = await import('fs/promises');

      let masterResult = null;

      if (state.pipeline === 'A') {
        const { generatePipelineAMaster } = await import('../../lib/output/pipeline-a-master.js');
        masterResult = await generatePipelineAMaster(state, process.cwd());
      } else if (state.pipeline === 'B') {
        const { generatePipelineBMaster } = await import('../../lib/output/pipeline-b-master.js');
        masterResult = await generatePipelineBMaster(state, process.cwd());
      } else if (state.pipeline === 'C') {
        const { generatePipelineCMaster } = await import('../../lib/output/pipeline-c-master.js');
        masterResult = await generatePipelineCMaster(state, process.cwd());
      } else {
        const result = { status: 'NOT_IMPLEMENTED', message: `Unknown pipeline: ${state.pipeline}`, pipeline: state.pipeline };
        if (opts.json) console.log(JSON.stringify(result, null, 2));
        else console.log(chalk.yellow(`\nUnknown pipeline: ${state.pipeline}\n`));
        return;
      }

      // Auto-run critique and append summary to master doc
      const critiqueResult = await generateCritiqueReport(state, process.cwd());
      await appendFile(masterResult.mdPath, critiqueResult.summaryMarkdown, 'utf-8');

      if (opts.json) {
        console.log(JSON.stringify({
          ok: true,
          ...masterResult,
          critique: {
            reportPath: critiqueResult.reportPath,
            blocking: critiqueResult.blocking,
            summary: critiqueResult.summary,
          },
        }, null, 2));
      } else {
        console.log(chalk.green(`\n✓ Pipeline ${state.pipeline} master document generated\n`));
        console.log(chalk.dim(`  ↳ ${masterResult.mdPath}`));
        if (critiqueResult.blocking) {
          console.log(chalk.yellow(`\n  ⚠ Critique: ${critiqueResult.summary.errors} error(s), ${critiqueResult.summary.warnings} warning(s)`));
        } else {
          console.log(chalk.dim(`  ✓ Critique: ${critiqueResult.summary.warnings} warning(s), ${critiqueResult.summary.tips} tip(s)`));
        }
        console.log(chalk.dim(`  ↳ ${critiqueResult.reportPath}\n`));
      }
    });

  // ── nf critique — on-demand full-book audit ───────────────────
  nf
    .command('critique')
    .description('Run the full cross-stage critique and write output/critique-report.md')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const state = loadState();
      if (!state) {
        const msg = 'No project found. Run `storyline init` first.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.red(msg));
        process.exit(1);
      }
      if (state.mode !== 'nonfiction') {
        const msg = 'Not a nonfiction project.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.yellow(msg));
        process.exit(1);
      }

      const { generateCritiqueReport } = await import('../../lib/ai/critique-api.js');
      const result = await generateCritiqueReport(state, process.cwd());

      if (opts.json) {
        console.log(JSON.stringify({
          ok: true,
          reportPath: result.reportPath,
          blocking: result.blocking,
          summary: result.summary,
          findings: result.findings,
        }, null, 2));
        return;
      }

      console.log(chalk.bold(`\n📋 Full-Book Critique Report\n`));
      if (result.blocking) {
        console.log(chalk.red(`  ✗ ${result.summary.errors} blocking issue(s) found\n`));
      } else {
        console.log(chalk.green(`  ✓ No blocking issues\n`));
      }
      console.log(chalk.dim(`  Errors:   ${result.summary.errors}`));
      console.log(chalk.dim(`  Warnings: ${result.summary.warnings}`));
      console.log(chalk.dim(`  Tips:     ${result.summary.tips}`));
      console.log(chalk.dim(`\n  ↳ ${result.reportPath}\n`));

      if (result.findings.filter(f => f.severity === 'error').length > 0) {
        console.log(chalk.red('Blocking issues:'));
        result.findings.filter(f => f.severity === 'error').forEach(f => {
          console.log(chalk.red(`  ✗ [${f.location}] ${f.message}`));
        });
        console.log();
      }
    });

  // ── nf migrate ────────────────────────────────────────────────
  nf
    .command('migrate')
    .description('Migrate state.json from v1 (fiction-only) to v2 (multi-mode)')
    .option('--dry-run', 'Preview changes without writing files')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const { migrateState } = await import('../../scripts/migrate-state-to-v2.js');
      const result = migrateState(process.cwd(), { dryRun: opts.dryRun });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        if (!result.ok) process.exit(1);
        return;
      }

      if (!result.ok) {
        console.error(chalk.red(`Migration failed: ${result.message}`));
        process.exit(1);
      }

      if (result.dryRun) {
        console.log(chalk.yellow('Dry-run — no files modified:'));
        result.changes.forEach(c => console.log(chalk.dim(`  + ${c}`)));
        console.log(chalk.dim('\n  Re-run without --dry-run to apply.'));
      } else if (!result.migrated) {
        console.log(chalk.green(result.message));
      } else {
        console.log(chalk.green(`✓ ${result.message}`));
        result.changes.forEach(c => console.log(chalk.dim(`  + ${c}`)));
      }
    });

  // ── nf next — JSON status for /storyline-nf skill ─────────────
  //
  // Contract (the skill's activation routing depends on this shape):
  //   ready: false  → the skill must not proceed to stage work yet.
  //                    `action` tells the skill what question to ask:
  //     action: 'create-nf-project'        — empty directory (no state)
  //     action: 'migrate-or-relocate'      — state exists as fiction; writer
  //                                          must choose migrate-alongside vs.
  //                                          cd elsewhere. Never destructive.
  //     action: 'nf-init-pipeline'         — state is NF but no pipeline set
  //                                          (e.g. post-migrate). Skill asks
  //                                          which pipeline and runs nf init.
  //   ready: true   → pipeline set; skill proceeds with the named stage.
  //                    complete=true means all stages done, action='generate'.
  nf
    .command('next')
    .description('Show next NF stage as JSON (used by /storyline-nf skill)')
    .action(async () => {
      const state = loadState();

      if (!state) {
        console.log(JSON.stringify({
          ready: false,
          action: 'create-nf-project',
          reason: 'no-project',
          hint: 'Run `npx storyline-vsc init` then `npx storyline-vsc nf init --pipeline A|B|C`.',
        }, null, 2));
        return;
      }

      if (state.mode !== 'nonfiction') {
        // Distinguish "scaffolded by `storyline init` but writer never
        // answered anything" from "writer has real fiction work here".
        // A pristine `storyline init` produces a fiction state.json with
        // all empty slots — that should behave like an empty directory,
        // not like an existing project worth protecting.
        // Every field here defaults to null/[] in DEFAULT_STATE, so a truthy
        // value reliably means the writer entered something. Do NOT add
        // baked-default fields (e.g. beatSheet.genreVariant='standard' or
        // targetWordCount=80000) — they'd flip this to true on every scaffold.
        const hasRealFictionWork =
          !!state.genre?.primaryGenre ||
          !!state.genre?.subGenre ||
          !!state.genre?.tone ||
          !!state.genre?.audience ||
          !!state.premise?.rawLogline ||
          !!state.premise?.conceptHook ||
          !!state.protagonist?.name ||
          (Array.isArray(state.characters) && state.characters.length > 0) ||
          (Array.isArray(state.chapterOutline) && state.chapterOutline.length > 0);

        if (!hasRealFictionWork) {
          // Scaffold-only state — `storyline init` has run but no writer
          // content yet. Safe to proceed straight to NF setup.
          console.log(JSON.stringify({
            ready: false,
            action: 'create-nf-project',
            reason: 'scaffold-only-state',
            hint: 'Project is scaffolded but has no writer content. Ask which pipeline (A/B/C) and run `npx storyline-vsc nf init --pipeline <A|B|C>`. No need to run `storyline init` again.',
          }, null, 2));
          return;
        }

        // Real fiction work exists — offer the safe paths only, never
        // anything destructive.
        let fictionProgress = 0;
        let fictionStageName = null;
        try {
          const { calculateProgress, deriveCurrentStage } = await import('../../lib/state/transitions.js');
          fictionProgress = calculateProgress(state) ?? 0;
          fictionStageName = deriveCurrentStage(state)?.name ?? null;
        } catch { /* progress is best-effort, not critical */ }

        console.log(JSON.stringify({
          ready: false,
          action: 'migrate-or-relocate',
          reason: 'existing-fiction-project',
          currentMode: state.mode,
          fictionProgress,
          fictionStageName,
          hint: 'Either migrate (`npx storyline-vsc nf migrate`) to add NF planning alongside the fiction state, or if this is the wrong directory, cd to the right one and re-run /storyline-nf. Never re-run `init` in a directory with existing fiction work — it will not overwrite, but it also will not produce the NF harness writer expects.',
        }, null, 2));
        return;
      }

      // NF mode but no NF pipeline chosen yet (e.g. post-migrate with no nf
      // init). `loadState()` fills in DEFAULT_STATE.pipeline = 'novel' when
      // the field is missing, so we explicitly check for an NF pipeline value.
      if (!['A', 'B', 'C'].includes(state.pipeline)) {
        console.log(JSON.stringify({
          ready: false,
          action: 'nf-init-pipeline',
          reason: 'migrated-no-pipeline',
          hint: 'Ask the writer which pipeline (A prescriptive, B narrative NF, C how-to) and run `npx storyline-vsc nf init --pipeline <A|B|C>`.',
        }, null, 2));
        return;
      }

      const pipelineStages = getPipelineStages(state.pipeline, state.subMode);
      const allStages = [...BOOK_DNA_STAGES, ...pipelineStages];
      const nextStage = allStages.find(s => !state.nfStages?.[s.id]?.completed);

      if (!nextStage) {
        console.log(JSON.stringify({
          ready: true,
          complete: true,
          pipeline: state.pipeline,
          action: 'generate',
          message: 'All NF stages complete — run `storyline nf generate`',
        }, null, 2));
        return;
      }

      const phase = BOOK_DNA_STAGES.some(s => s.id === nextStage.id) ? 'book-dna' : 'pipeline';
      const completedCount = allStages.filter(s => state.nfStages?.[s.id]?.completed).length;

      console.log(JSON.stringify({
        ready: true,
        complete: false,
        pipeline: state.pipeline,
        subMode: state.subMode,
        progress: Math.round((completedCount / allStages.length) * 100),
        currentStage: {
          id: nextStage.id,
          name: nextStage.name,
          index: nextStage.index,
          phase,
        },
      }, null, 2));
    });

  // ── nf save — save NF stage data (for /storyline-nf skill) ────
  nf
    .command('save')
    .description('Save NF stage data to nfStages in project state')
    .argument('<stageId>', 'NF stage ID (e.g. dna-category, pa-thesis)')
    .argument('[json]', 'JSON data to save (reads from stdin if omitted)')
    .action(async (stageId, jsonData) => {
      let data;
      if (jsonData) {
        try { data = JSON.parse(jsonData); } catch {
          console.error(chalk.red('Invalid JSON provided'));
          process.exit(1);
        }
      } else {
        const chunks = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        try { data = JSON.parse(Buffer.concat(chunks).toString()); } catch {
          console.error(chalk.red('Invalid JSON from stdin'));
          process.exit(1);
        }
      }

      const state = loadState();
      if (!state) {
        console.error(chalk.red('No project found.'));
        process.exit(1);
      }

      if (!state.nfStages) state.nfStages = {};
      state.nfStages[stageId] = {
        ...state.nfStages[stageId],
        ...data,
        completed: true,
        completedAt: new Date().toISOString(),
      };

      // Category routing: after dna-category is saved, infer pipeline if not set
      if (stageId === 'dna-category') {
        const inferred = derivePipelineFromCategoryData(data);
        if (inferred && !state.pipeline) {
          state.pipeline = inferred;
        }
      }

      // Pipeline confirmation: after dna-consolidate, apply confirmed pipeline
      if (stageId === 'dna-consolidate' && data.confirmedPipeline) {
        state.pipeline = data.confirmedPipeline;
      }

      // Sub-mode fork: after pa-framework is saved, set subMode from the chosen structure
      if (stageId === 'pa-framework' && data.subMode) {
        state.subMode = data.subMode;
      }

      // Sub-mode fork: after pb-fork is saved, set subMode from chosen structure
      if (stageId === 'pb-fork' && data.subMode) {
        state.subMode = data.subMode;
      }

      await saveState(state);

      // ── auto-generate per-stage markdown + memory entries (mirrors fiction) ──
      const { writeNfStageDoc } = await import('../../lib/output/nf-stage-doc.js');
      const { buildNfMemoryEntries, appendNfMemoryLog } = await import('../../lib/memory/nf-stage-memory.js');

      let stageDocPath = null;
      let memoryEntries = [];
      let memoryLogPath = null;
      const warnings = [];

      try {
        stageDocPath = await writeNfStageDoc(stageId, state, process.cwd());
      } catch (err) {
        warnings.push(`stage-doc: ${err.message}`);
      }

      try {
        const built = buildNfMemoryEntries(stageId, state);
        const result = await appendNfMemoryLog(built, process.cwd());
        memoryEntries = result.entriesWithIds;
        memoryLogPath = result.logPath;
      } catch (err) {
        warnings.push(`memory: ${err.message}`);
      }

      // Push to odd-flow directly — same CLI-to-CLI handoff as fiction save.
      let oddFlow = null;
      if (memoryEntries.length) {
        try {
          const { pushEntriesToOddFlow } = await import('../../lib/memory/odd-flow-push.js');
          oddFlow = await pushEntriesToOddFlow(memoryEntries);
          if (oddFlow.failed > 0) {
            warnings.push(`odd-flow: ${oddFlow.failed}/${memoryEntries.length} entries failed to push — will retry next save`);
          }
        } catch (err) {
          warnings.push(`odd-flow: ${err.message}`);
        }
      }

      const verifyCommand = `npx storyline-vsc nf verify-stage ${stageId}`;

      console.error(chalk.green(`Saved NF stage: ${stageId}`));
      if (stageDocPath) console.error(chalk.dim(`  ↳ stage doc: ${stageDocPath}`));
      if (memoryLogPath) console.error(chalk.dim(`  ↳ memory log: ${memoryLogPath} (${memoryEntries.length} entries)`));
      if (oddFlow && !oddFlow.skipped) console.error(chalk.dim(`  ↳ odd-flow: pushed ${oddFlow.pushed}, failed ${oddFlow.failed} (${oddFlow.cli})`));
      warnings.forEach(w => console.error(chalk.yellow(`  ⚠ ${w}`)));

      console.log(JSON.stringify({
        saved: true,
        stageId,
        stageDocPath,
        memoryLogPath,
        memoryEntries,
        oddFlow,
        warnings,
        verifyCommand,
        stateAfterSave: {
          committedAt: state.nfStages[stageId].completedAt,
          pipeline: state.pipeline,
        },
        nextAction: `Run \`${verifyCommand}\` and confirm exit 0 before composing any docs/ artefact for this stage or advancing.`,
      }, null, 2));
    });

  // ── nf verify-stage — programmatic gate for the /storyline-nf skill ─
  nf
    .command('verify-stage')
    .description('Exit 0 if NF stage is committed (state populated + doc on disk), 2 if drifted')
    .argument('<stageId>', 'NF stage ID (e.g. dna-category, pa-thesis)')
    .option('--json', 'Output machine-readable JSON on both success and failure')
    .action(async (stageId, opts) => {
      const { existsSync } = await import('fs');
      const { resolve } = await import('path');

      const projectPath = process.cwd();
      const stateFile = resolve(projectPath, '.storyline', 'state.json');
      if (!existsSync(stateFile)) {
        const err = { ok: false, error: 'NO_PROJECT', action: 'run `npx storyline-vsc init`' };
        console.log(JSON.stringify(err, null, 2));
        process.exit(1);
      }

      const state = loadState();
      if (!state) {
        const err = { ok: false, error: 'NO_PROJECT', action: 'run `npx storyline-vsc init`' };
        console.log(JSON.stringify(err, null, 2));
        process.exit(1);
      }

      const stageEntry = state.nfStages?.[stageId];
      if (!stageEntry?.completed) {
        const result = {
          ok: false,
          stageId,
          code: 'NOT_COMMITTED',
          message: `NF stage "${stageId}" is not marked completed in state.json.`,
          recover: `Run /storyline-nf to complete this stage.`,
        };
        if (opts.json) console.log(JSON.stringify(result, null, 2));
        else {
          console.error(chalk.red(`✗ ${result.message}`));
          console.error(chalk.yellow(`    Recover: ${result.recover}`));
        }
        process.exit(2);
      }

      const docPath = resolve(projectPath, 'output', 'stages', `${stageId}.md`);
      if (!existsSync(docPath)) {
        const result = {
          ok: false,
          stageId,
          code: 'DOC_MISSING',
          message: `NF stage "${stageId}" is committed in state but stage doc is missing on disk.`,
          missingDoc: docPath,
          recover: `npx storyline-vsc nf save ${stageId} '{}' to regenerate (or re-save the stage from /storyline-nf).`,
        };
        if (opts.json) console.log(JSON.stringify(result, null, 2));
        else {
          console.error(chalk.red(`✗ ${result.message}`));
          console.error(chalk.dim(`    missing: ${docPath}`));
          console.error(chalk.yellow(`    Recover: ${result.recover}`));
        }
        process.exit(2);
      }

      const result = { ok: true, stageId, code: 'COMMITTED', docPath };
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else console.log(chalk.green(`✓ NF stage ${stageId} is committed and doc is on disk.`));
      process.exit(0);
    });

  // ── nf stage-info — return guide as JSON (for /storyline-nf skill) ──
  nf
    .command('stage-info')
    .description('Return NF stage guide as JSON (used by /storyline-nf skill)')
    .argument('<stageId>', 'Stage ID (e.g. dna-category, pa-thesis)')
    .action(async (stageId) => {
      const state = loadState();

      // Try Book DNA first
      const dnaResult = await runDnaStage(stageId, state);
      if (!dnaResult.error) {
        console.log(JSON.stringify(dnaResult, null, 2));
        return;
      }

      // Try Pipeline A
      const { runStage: runPaStage } = await import('../../lib/stages-nf/pipeline-a/index.js');
      const paResult = await runPaStage(stageId, state);
      if (!paResult.error) {
        console.log(JSON.stringify(paResult, null, 2));
        return;
      }

      // Try Pipeline B
      const { runStage: runPbStage } = await import('../../lib/stages-nf/pipeline-b/index.js');
      const pbResult = await runPbStage(stageId, state);
      if (!pbResult.error) {
        console.log(JSON.stringify(pbResult, null, 2));
        return;
      }

      // Try Pipeline C
      const { runStage: runPcStage } = await import('../../lib/stages-nf/pipeline-c/index.js');
      const pcResult = await runPcStage(stageId, state);
      if (!pcResult.error) {
        console.log(JSON.stringify(pcResult, null, 2));
        return;
      }

      console.log(JSON.stringify({ error: `Unknown NF stage: ${stageId}` }));
      process.exit(1);
    });

  // ── nf help — writer-facing guidance ──────────────────────────
  nf
    .command('help')
    .description('Show the NF harness overview or stage-specific guidance')
    .argument('[stageId]', 'Stage ID to show guidance for (e.g. dna-category, pa-thesis)')
    .action(async (stageId) => {
      if (!stageId) {
        console.log(chalk.bold('\n📖 Storyline NF — Non-Fiction Planning Harness\n'));
        console.log('Plan a non-fiction book end-to-end: prescriptive (Pipeline A),');
        console.log('narrative (Pipeline B), or how-to / skill (Pipeline C).\n');
        console.log(chalk.bold('Quick start'));
        console.log(chalk.dim('  storyline nf init --pipeline A|B|C   — set NF mode and choose pipeline'));
        console.log(chalk.dim('  /storyline-nf                         — activate planning harness in Claude Code'));
        console.log(chalk.dim('  storyline nf status                   — show current progress\n'));
        console.log(chalk.bold('Stage flow'));
        console.log(chalk.dim('  Phase 0 — Book DNA (12 stages, all pipelines)'));
        console.log(chalk.dim('    dna-category → dna-reader → dna-transform → dna-idea'));
        console.log(chalk.dim('    dna-author → dna-promise → dna-comps → dna-voice'));
        console.log(chalk.dim('    dna-evidence → dna-commercial → dna-title → dna-consolidate\n'));
        console.log(chalk.dim('  Pipeline A: pa-thesis → pa-objections → pa-framework → pa-principles'));
        console.log(chalk.dim('              pa-evidence → pa-application → [pa-braid] → pa-chapters'));
        console.log(chalk.dim('              pa-opener → pa-critique → pa-master\n'));
        console.log(chalk.dim('  Pipeline B: pb-thesis → pb-cast → pb-timeline → pb-fork'));
        console.log(chalk.dim('              pb-scenes → pb-sourcing → pb-theme → pb-chapters'));
        console.log(chalk.dim('              pb-critique → pb-master\n'));
        console.log(chalk.dim('  Pipeline C: pc-skill → pc-start-level → pc-end-state → pc-decompose'));
        console.log(chalk.dim('              pc-prereqs → pc-lessons → pc-drills → pc-milestones'));
        console.log(chalk.dim('              pc-examples → pc-critique → pc-master\n'));
        console.log(chalk.bold('Key commands'));
        console.log(chalk.dim('  storyline nf generate          — generate master planning document'));
        console.log(chalk.dim('  storyline nf critique          — run full-book cross-stage audit'));
        console.log(chalk.dim('  storyline nf compile           — compile to EPUB/PDF with NF extras'));
        console.log(chalk.dim('  storyline nf consolidate       — write .storyline/book-dna.md'));
        console.log(chalk.dim('  storyline nf skill-tree        — validate Pipeline C skill DAG'));
        console.log(chalk.dim('  storyline nf timeline          — generate Pipeline B timeline artifacts'));
        console.log(chalk.dim('  storyline nf sourcing-register — build Pipeline B sourcing register'));
        console.log(chalk.dim('  storyline nf framework-card    — render Pipeline A framework card PDF\n'));
        console.log(chalk.bold('Docs'));
        console.log(chalk.dim('  docs/storyline-nf/quickstart.md      — full quickstart'));
        console.log(chalk.dim('  docs/storyline-nf/book-dna-guide.md  — guide to the 12 DNA stages'));
        console.log(chalk.dim('  docs/storyline-nf/pipeline-a.md      — Pipeline A detail'));
        console.log(chalk.dim('  docs/storyline-nf/pipeline-b.md      — Pipeline B detail'));
        console.log(chalk.dim('  docs/storyline-nf/pipeline-c.md      — Pipeline C detail'));
        console.log(chalk.dim('  docs/storyline-nf/research-workflow.md — research capture and linking\n'));
        console.log(chalk.dim('  Run `storyline nf help <stageId>` for stage-specific guidance.\n'));
        return;
      }

      // Stage-specific guidance: delegate to stage-info
      const state = loadState();

      const tryStage = async (runFn) => {
        try {
          const result = await runFn(stageId, state);
          if (!result.error) return result;
        } catch { /* ignore */ }
        return null;
      };

      const dnaResult = await tryStage(runDnaStage);
      if (dnaResult) {
        const g = dnaResult.guide || {};
        console.log(chalk.bold(`\n📋 ${dnaResult.stage?.name || stageId}\n`));
        if (g.purpose) console.log(g.purpose + '\n');
        if (g.keyQuestions?.length) {
          console.log(chalk.bold('Key questions'));
          g.keyQuestions.forEach(q => console.log(chalk.dim(`  • ${q}`)));
          console.log();
        }
        if (g.critiqueChecks?.length) {
          console.log(chalk.bold('The AI will check'));
          g.critiqueChecks.forEach(c => console.log(chalk.dim(`  ✓ ${c}`)));
          console.log();
        }
        return;
      }

      // Try pipeline stages (A, B, C)
      for (const pipelineKey of ['pipeline-a', 'pipeline-b', 'pipeline-c']) {
        const { runStage } = await import(`../../lib/stages-nf/${pipelineKey}/index.js`);
        const result = await tryStage(runStage);
        if (result) {
          const g = result.guide || {};
          console.log(chalk.bold(`\n📋 ${result.stage?.name || stageId}\n`));
          if (g.purpose) console.log(g.purpose + '\n');
          if (g.keyQuestions?.length) {
            console.log(chalk.bold('Key questions'));
            g.keyQuestions.forEach(q => console.log(chalk.dim(`  • ${q}`)));
            console.log();
          }
          if (g.critiqueChecks?.length) {
            console.log(chalk.bold('The AI will check'));
            g.critiqueChecks.forEach(c => console.log(chalk.dim(`  ✓ ${c}`)));
            console.log();
          }
          return;
        }
      }

      console.log(chalk.yellow(`\nUnknown stage: ${stageId}\n`));
      console.log(chalk.dim('Run `storyline nf stages` to list all valid stage IDs.\n'));
    });

  // ── nf route — return model routing for a stage ────────────────
  nf
    .command('route')
    .description('Return model routing for an NF stage (used by /storyline-nf skill)')
    .argument('<stageId>', 'Stage ID')
    .action(async (stageId) => {
      const { routeStage } = await import('../../lib/ai/model-router.js');
      const { loadStorylineConfig } = await import('../../lib/config/storyline-config.js');
      const cfg = loadStorylineConfig();
      const routed = routeStage(stageId, cfg.ai?.quality || 'balanced');
      console.log(JSON.stringify(routed, null, 2));
    });

  // ── nf consolidate — generate book-dna.md and book-dna.json ───
  nf
    .command('consolidate')
    .description('Generate .storyline/book-dna.md and .storyline/book-dna.json from completed Book DNA stages')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const state = loadState();
      if (!state) {
        const msg = 'No project found.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.red(msg));
        process.exit(1);
      }

      const { generateBookDnaDoc } = await import('../../lib/output/book-dna-doc.js');
      const result = await generateBookDnaDoc(state, process.cwd());

      if (opts.json) {
        console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      } else {
        console.log(chalk.green(`\n✓ Book DNA documents generated\n`));
        console.log(chalk.dim(`  ↳ ${result.mdPath}`));
        console.log(chalk.dim(`  ↳ ${result.jsonPath}\n`));
      }
    });

  // ── nf sourcing-register — build sourcing register from research subsystem ──
  nf
    .command('sourcing-register')
    .description('Build the Pipeline B sourcing register from research items with subtype sourced-claim')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const state = loadState();
      if (!state) {
        const msg = 'No project found. Run `storyline init` first.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.red(msg));
        process.exit(1);
      }

      const { buildSourcingRegister } = await import('../../lib/stages-nf/pipeline-b/sourcing-register.js');
      const result = await buildSourcingRegister(process.cwd());

      if (opts.json) {
        console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      } else {
        console.log(chalk.green(`\n✓ Sourcing register built\n`));
        console.log(chalk.dim(`  ${result.itemCount} sourced claim(s)`));
        console.log(chalk.dim(`  ↳ ${result.jsonPath}`));
        console.log(chalk.dim(`  ↳ ${result.mdPath}\n`));
      }
    });

  // ── nf skill-tree — generate skill tree from pipeline c stage data ───
  nf
    .command('skill-tree')
    .description('Generate .storyline/skill-tree.json and skill-tree.md from Pipeline C stage data (validates DAG)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const state = loadState();
      if (!state) {
        const msg = 'No project found. Run `storyline init` first.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.red(msg));
        process.exit(1);
      }

      const decomposeData = state.nfStages?.['pc-decompose'] || {};
      const prereqData    = state.nfStages?.['pc-prereqs']   || {};
      const targetSkill   = state.nfStages?.['pc-skill']?.targetSkill || null;

      if (!decomposeData.subSkills || decomposeData.subSkills.length === 0) {
        const msg = 'No sub-skills found. Complete the pc-decompose stage first.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.yellow(msg));
        return;
      }

      const { saveSkillTree } = await import('../../lib/stages-nf/pipeline-c/skill-tree.js');
      const result = await saveSkillTree(process.cwd(), decomposeData, prereqData, targetSkill);

      if (opts.json) {
        console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      } else {
        if (result.errors.length > 0) {
          console.log(chalk.red(`\n✗ Skill tree has validation errors:\n`));
          result.errors.forEach(e => console.log(chalk.red(`  ✗ ${e}`)));
        } else {
          console.log(chalk.green(`\n✓ Skill tree validated and generated\n`));
        }
        if (result.warnings.length > 0) {
          result.warnings.forEach(w => console.log(chalk.yellow(`  ⚠ ${w}`)));
        }
        console.log(chalk.dim(`  ${result.nodeCount} sub-skill(s), ${result.edgeCount} prerequisite edge(s)`));
        console.log(chalk.dim(`  ↳ ${result.jsonPath}`));
        console.log(chalk.dim(`  ↳ ${result.mdPath}\n`));
      }
    });

  // ── nf timeline — generate timeline artifact from pb-timeline stage ───
  nf
    .command('timeline')
    .description('Generate .storyline/timeline.json and timeline.md from the pb-timeline stage data')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const state = loadState();
      if (!state) {
        const msg = 'No project found. Run `storyline init` first.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.red(msg));
        process.exit(1);
      }

      const timelineData = state.nfStages?.['pb-timeline'] || {};
      if (!timelineData.timelineEvents || timelineData.timelineEvents.length === 0) {
        const msg = 'No timeline data found. Complete the pb-timeline stage first.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.yellow(msg));
        return;
      }

      const { saveTimeline } = await import('../../lib/stages-nf/pipeline-b/timeline.js');
      const result = await saveTimeline(process.cwd(), timelineData);

      if (opts.json) {
        console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      } else {
        console.log(chalk.green(`\n✓ Timeline generated\n`));
        console.log(chalk.dim(`  ${result.eventCount} event(s)`));
        console.log(chalk.dim(`  ↳ ${result.jsonPath}`));
        console.log(chalk.dim(`  ↳ ${result.mdPath}\n`));
      }
    });

  // ── nf compile — compile NF book with extras ──────────────────
  nf
    .command('compile')
    .description('Compile the NF book to EPUB/PDF and generate NF-specific extras (bibliography, endnotes, visuals)')
    .option('--format <fmt>', 'Output format: epub or print-pdf (default: epub)', 'epub')
    .option('--citation-style <style>', 'Citation style: chicago, apa, or mla (default: chicago)', 'chicago')
    .option('--no-fact-check', 'Skip the fact-check report')
    .option('--no-objection-index', 'Skip the objection index (Pipeline A)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const state = loadState();
      if (!state) {
        const msg = 'No project found. Run `storyline init` first.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.red(msg));
        process.exit(1);
      }
      if (state.mode !== 'nonfiction') {
        const msg = 'Not a nonfiction project. Use `storyline compile` for fiction projects.';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.error(chalk.yellow(msg));
        process.exit(1);
      }

      const { compile } = await import('../../lib/compile/index.js');
      const { runNfExtras } = await import('../../lib/compile/nf-extras.js');

      // Main compile pipeline
      if (!opts.json) console.log(chalk.bold(`\n📚 Storyline NF — Compile → ${opts.format.toUpperCase()}\n`));
      let compileResult = null;
      try {
        compileResult = await compile({ format: opts.format, projectPath: process.cwd(), verbose: !opts.json });
      } catch (err) {
        if (opts.json) console.log(JSON.stringify({ error: err.message }));
        else console.error(chalk.red(`\n✗ Compile failed: ${err.message}\n`));
        process.exit(1);
      }

      // NF extras
      if (!opts.json) console.log(chalk.dim('\n  Generating NF extras…'));
      const extras = await runNfExtras(state, process.cwd(), {
        citationStyle: opts.citationStyle,
        includeFactCheck: opts.factCheck !== false,
        includeObjectionIndex: opts.objectionIndex !== false,
      });

      if (opts.json) {
        console.log(JSON.stringify({
          ok: true,
          output: compileResult?.output,
          extras: {
            pipeline: extras.pipeline,
            artifacts: extras.artifacts || [],
            bibliography: extras.bibliography,
            factCheck: extras.factCheck,
            timelineSvg: extras.timelineSvg,
            skillTreeSvg: extras.skillTreeSvg,
          },
        }, null, 2));
        return;
      }

      if (!extras.skipped && extras.artifacts?.length > 0) {
        console.log(chalk.green(`\n  ✓ NF extras generated (${extras.artifacts.length} artifact${extras.artifacts.length === 1 ? '' : 's'})\n`));
        extras.artifacts.forEach(p => console.log(chalk.dim(`    ↳ ${p}`)));
      }
      if (extras.bibliography && !extras.bibliography.skipped) {
        console.log(chalk.dim(`\n  Bibliography: ${extras.bibliography.entryCount} entries (${extras.bibliography.citationStyle})`));
      }
      if (extras.factCheck && !extras.factCheck.skipped) {
        const fc = extras.factCheck.summary;
        if (fc.unverifiedCount > 0) {
          console.log(chalk.yellow(`  ⚠ Fact-check: ${fc.unverifiedCount} unverified claim(s) of ${fc.total} total`));
        } else {
          console.log(chalk.dim(`  ✓ Fact-check: all ${fc.total} items verified`));
        }
      }
      console.log();
    });

  // ── nf framework-card — render framework card PDF + PNG ───────
  nf
    .command('framework-card')
    .description('Render the framework card as PDF + PNG (Pipeline A projects only)')
    .option('--demo', 'Render with placeholder data (no project state required)')
    .option('--json', 'Output machine-readable JSON')
    .action(async (opts) => {
      const { renderFrameworkCard, hasFramework } = await import('../../lib/compile/framework-card/index.js');

      let state = null;
      if (!opts.demo) {
        state = loadState();
        if (!state) {
          const msg = 'No project found. Run `storyline init` first, or use --demo to render with placeholder data.';
          if (opts.json) console.log(JSON.stringify({ error: msg }));
          else console.error(chalk.red(msg));
          process.exit(1);
        }

        if (!hasFramework(state)) {
          const reason = state.mode !== 'nonfiction'
            ? 'This is a fiction project — framework cards are for Pipeline A NF projects.'
            : state.pipeline !== 'A'
              ? `Pipeline ${state.pipeline} has no framework stage. Framework cards are Pipeline A only.`
              : 'No framework data found yet. Complete the pa-framework stage first.';

          const result = { skipped: true, reason: 'no-framework', message: reason };
          if (opts.json) console.log(JSON.stringify(result, null, 2));
          else console.log(chalk.dim(`\nFramework card skipped — ${reason}\n`));
          return;
        }
      }

      if (!opts.json) console.log(chalk.dim('\nRendering framework card via Puppeteer…'));

      const result = await renderFrameworkCard({ state, demo: opts.demo, projectDir: process.cwd() });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.skipped) {
        console.log(chalk.dim(`\nFramework card skipped — ${result.message}\n`));
        return;
      }

      console.log(chalk.green(`\n✓ Framework Card rendered\n`));
      console.log(chalk.dim(`  Model:   ${result.framework.modelName}`));
      console.log(chalk.dim(`  Principles: ${result.framework.principleCount}`));
      console.log(chalk.dim(`  PDF:     ${result.pdfPath}  (${formatBytes(result.pdfBytes)})`));
      console.log(chalk.dim(`  PNG:     ${result.pngPath}  (${formatBytes(result.pngBytes)})`));
      console.log(chalk.dim(`  HTML:    ${result.htmlPath}\n`));
    });
}

function formatBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
