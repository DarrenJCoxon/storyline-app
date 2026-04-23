#!/usr/bin/env node

// Load .env before anything else
try {
  const { config } = await import('dotenv');
  config();
} catch {}

import { Command } from 'commander';
import chalk from 'chalk';
import { loadState, printStatus, listStages, saveState, markStageComplete, markStageIncomplete } from '../lib/state/store.js';
import { registerInit } from './commands/init.js';
import { registerCompile } from './commands/compile.js';
import { registerUpgrade } from './commands/upgrade.js';
import { registerCritique } from './commands/critique.js';
import { registerReseed } from './commands/reseed.js';
import { registerVerifyStage } from './commands/verify-stage.js';
import { STAGE_ORDER, STAGE_BY_ID } from '../lib/state/project-state.js';
import { deriveCurrentStage, calculateProgress, getMissingRequirements, checkStageGate, getDownstreamImpacts } from '../lib/state/transitions.js';
import { getStageGuide, getAllStageGuides } from '../lib/ai/stage-guides.js';
import { runStoryTraps, formatTrapResults } from '../lib/ai/story-traps.js';
import { runQualityChecklist, getPersonaForStage } from '../lib/ai/coaching-personas.js';

const program = new Command();

program
  .name('storyline')
  .description('Storyline — plan and write your novel using Save the Cat. Use /storyline inside Claude Code for the planning conversation.')
  .version('1.0.1');

registerInit(program);
registerCompile(program);
registerUpgrade(program);
registerCritique(program);
registerReseed(program);
registerVerifyStage(program);

// ── start — show status and next action (NOT interactive) ──────
program
  .command('start')
  .description('Show current project status and next recommended action')
  .action(async () => {
    const state = loadState();
    if (!state) {
      console.log(chalk.yellow('\nNo project found. Run `storyline init` to begin, then use /storyline to start planning.\n'));
      return;
    }

    printStatus(state);

    const currentStage = deriveCurrentStage(state);
    if (currentStage) {
      const missing = getMissingRequirements(currentStage.id, state);
      const gate = checkStageGate(currentStage.id, state);

      if (gate) {
        console.log(chalk.red(`  Gate blocked: ${gate.message}`));
        console.log(chalk.dim(`  Fix the requirements above before proceeding.\n`));
      }

      console.log(chalk.bold(`\n  Use /storyline in Claude Code to continue planning.\n`));
    } else {
      console.log(chalk.green('\n  All stages complete! Run `storyline generate` to create the master document.\n'));
    }
  });

// ── status — show project state ────────────────────────────────
program
  .command('status')
  .description('Show current project state and next recommended action')
  .action(async () => {
    const state = loadState();
    if (!state) {
      console.log(chalk.yellow('No project found. Run `storyline init` to begin.'));
      return;
    }
    printStatus(state);
  });

// ── stages — list all planning stages ──────────────────────────
program
  .command('stages')
  .description('Show all planning stages and completion status')
  .action(() => {
    listStages();
  });

// ── revise — show downstream impacts (NOT interactive) ────────
program
  .command('revise')
  .description('Show downstream impacts for revisiting a stage')
  .argument('<stage>', 'Stage ID to revise (e.g. "genre", "protagonist", "beatSheet")')
  .action(async (stageId) => {
    const state = loadState();
    if (!state) {
      console.log(chalk.yellow('No project found. Run `storyline init` first.'));
      return;
    }

    const stage = STAGE_BY_ID[stageId];
    if (!stage) {
      console.log(chalk.yellow(`Unknown stage: ${stageId}`));
      console.log(chalk.dim('Available: ' + STAGE_ORDER.map(s => s.id).join(', ')));
      return;
    }

    // Show downstream impacts
    const impacts = getDownstreamImpacts(stageId);
    console.log(chalk.bold(`\n Revisiting: ${stage.name}\n`));

    if (impacts.length > 0) {
      console.log(chalk.bold('Downstream Impacts\n'));
      console.log(chalk.dim(`Changing ${stage.name} may affect:`));
      for (const impactId of impacts) {
        const impactStage = STAGE_BY_ID[impactId];
        const completed = state.stages[impactId]?.completed;
        if (impactStage) {
          const mark = completed ? chalk.yellow(' (completed - may need review)') : chalk.dim(' (not yet started)');
          console.log(`  - ${impactStage.name}${mark}`);
        }
      }
      console.log();
    }

    console.log(chalk.dim('Use /storyline in Claude Code to revise this stage.\n'));
  });

// ── generate — output master document ──────────────────────────
program
  .command('generate')
  .description('Generate the master planning document')
  .action(async () => {
    const state = loadState();
    if (!state) {
      console.log(chalk.yellow('No project found. Run `storyline init` first.'));
      return;
    }
    const { generateMasterDocument } = await import('../lib/output/master-doc.js');
    const result = await generateMasterDocument(state);
    console.log(chalk.green(`\n Master document generated: ${result.path}\n`));
  });

// ── stage-info — output stage guide as JSON (for /storyline skill) ──
//
// Programmatic gate: before returning the guide for stage N, walk every
// upstream stage (index < N) and run the doctor's stageCommitted check.
// If any upstream stage shows orphan-artefact drift (doc on disk but
// state empty), refuse with UPSTREAM_DRIFT — the skill MUST recover
// before advancing. This is the primary defence against the recurring
// "wrote the doc, skipped the save" failure mode. No --force escape.
program
  .command('stage-info')
  .description('Output stage conversation guide as JSON (used by /storyline skill). Refuses with UPSTREAM_DRIFT if any earlier stage has docs but no state.')
  .argument('<stage>', 'Stage ID')
  .action(async (stageId) => {
    const guide = getStageGuide(stageId);
    if (!guide) {
      console.log(JSON.stringify({ error: `No guide for stage: ${stageId}` }));
      process.exit(1);
    }

    const state = loadState();

    // ── Upstream drift gate ──────────────────────────────────────
    // If state exists, run the doctor and find orphan-artefact findings
    // for any stage strictly upstream of the requested one. If found,
    // refuse to return the guide.
    if (state) {
      const requestedStage = STAGE_ORDER.find(s => s.id === stageId);
      if (requestedStage) {
        const { runDoctor } = await import('../lib/doctor.js');
        const report = await runDoctor(state, process.cwd());
        const upstreamOrphans = report.findings.filter(f => {
          if (f.type !== 'orphan-artefact') return false;
          const fStage = STAGE_ORDER.find(s => s.id === f.stageId);
          return fStage && fStage.index < requestedStage.index;
        });

        if (upstreamOrphans.length > 0) {
          const driftPayload = upstreamOrphans.map(f => ({
            stageId: f.stageId,
            stageName: f.stageName,
            orphanDocs: f.artefacts || [],
          }));
          const firstName = driftPayload[0].stageName;
          const errorPayload = {
            error: {
              code: 'UPSTREAM_DRIFT',
              requestedStage: stageId,
              message:
                `Cannot fetch brief for "${requestedStage.name}" — upstream stage "${firstName}" ` +
                `has a doc on disk but state.json is empty. The /storyline skill wrote the long-form ` +
                `doc without invoking \`storyline-vsc save\`. You must recover before advancing.`,
              recover: 'npx storyline-vsc doctor --recover',
              drift: driftPayload,
            },
          };
          console.log(JSON.stringify(errorPayload, null, 2));
          process.exit(2);
        }
      }
    }

    // Enrich with runtime state
    const persona = getPersonaForStage(stageId);
    const output = {
      ...guide,
      persona: persona ? { name: persona.name, tagline: persona.tagline, activation: persona.activation } : null,
      currentState: state ? {
        progress: calculateProgress(state),
        missingRequirements: getMissingRequirements(stageId, state),
        gateBlocked: checkStageGate(stageId, state),
      } : null,
    };

    console.log(JSON.stringify(output, null, 2));
  });

// ── save — save stage data to state (for /storyline skill) ──────────
program
  .command('save')
  .description('Save stage data to project state')
  .argument('<stage>', 'Stage ID')
  .argument('[json]', 'JSON data to save (reads from stdin if omitted)')
  .action(async (stageId, jsonData) => {
    let data;
    if (jsonData) {
      try {
        data = JSON.parse(jsonData);
      } catch {
        console.error(chalk.red('Invalid JSON provided'));
        process.exit(1);
      }
    } else {
      // Read from stdin
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      try {
        data = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        console.error(chalk.red('Invalid JSON from stdin'));
        process.exit(1);
      }
    }

    const state = loadState();
    if (!state) {
      console.error(chalk.red('No project found. Run `storyline init` first.'));
      process.exit(1);
    }

    // Stages whose top-level shape is an array. The skill can pass either
    // the array directly OR an object { <stageId>: [...] } — both are
    // normalised to an array assignment here.
    const ARRAY_STAGES = new Set(['characters', 'relationships', 'subplots', 'plotThreads', 'chapterOutline']);

    if (ARRAY_STAGES.has(stageId)) {
      if (Array.isArray(data)) {
        state[stageId] = data;
      } else if (data && Array.isArray(data[stageId])) {
        state[stageId] = data[stageId];
      } else {
        console.error(chalk.red(`Stage "${stageId}" expects an array or { ${stageId}: [...] }. Got: ${JSON.stringify(data).slice(0, 100)}`));
        process.exit(1);
      }
    } else {
      // Object-shaped stage: merge new fields into existing state
      state[stageId] = { ...state[stageId], ...data };
    }

    // Mark stage complete
    if (!state.stages) state.stages = {};
    state.stages[stageId] = {
      completed: true,
      completedAt: new Date().toISOString(),
    };

    await saveState(state);

    // ── auto-generate per-stage markdown + memory entries ──
    const { writeStageDoc } = await import('../lib/output/stage-doc.js');
    const { buildMemoryEntries, appendMemoryLog } = await import('../lib/memory/stage-memory.js');

    let stageDocPath = null;
    let memoryEntries = [];
    let memoryLogPath = null;
    let seriesPotential = null;
    const warnings = [];

    try {
      stageDocPath = await writeStageDoc(stageId, state);
    } catch (err) {
      warnings.push(`stage-doc: ${err.message}`);
    }

    // Auto-run series detection after premise save. Result flows into
    // the JSON payload so the /storyline skill can raise it with the writer.
    if (stageId === 'premise') {
      try {
        const { detectSeriesPotential } = await import('../lib/ai/series-detector.js');
        seriesPotential = detectSeriesPotential(state.premise, state.genre);
        state.premise.seriesPotential = seriesPotential;
        await saveState(state);
      } catch (err) {
        warnings.push(`series-detector: ${err.message}`);
      }
    }

    try {
      const built = buildMemoryEntries(stageId, state);
      const result = await appendMemoryLog(built);
      memoryEntries = result.entriesWithIds;
      memoryLogPath = result.logPath;
    } catch (err) {
      warnings.push(`memory: ${err.message}`);
    }

    // Emit structured JSON so the /storyline skill can push memoryEntries to
    // mcp__odd-flow__memory_store. Human-readable status goes to stderr.
    console.error(chalk.green(`Saved ${stageId} data`));
    if (stageDocPath) console.error(chalk.dim(`  ↳ stage doc: ${stageDocPath}`));
    if (memoryLogPath) console.error(chalk.dim(`  ↳ memory log: ${memoryLogPath} (${memoryEntries.length} entries)`));
    warnings.forEach(w => console.error(chalk.yellow(`  ⚠ ${w}`)));

    // The verifyCommand is the skill's contract: after save returns,
    // the skill MUST run this and confirm exit code 0 before composing
    // any docs/<NN>-*.md or advancing to the next stage. The Claude
    // Code PostToolUse hook also runs it, but the skill should not
    // depend on the hook firing.
    const verifyCommand = `npx storyline-vsc verify-stage ${stageId}`;
    const fieldsPopulated = state[stageId] && typeof state[stageId] === 'object'
      ? (Array.isArray(state[stageId])
          ? [`${stageId}[${state[stageId].length}]`]
          : Object.keys(state[stageId]).filter(k => state[stageId][k] !== null && state[stageId][k] !== undefined))
      : [];

    console.log(JSON.stringify({
      saved: true,
      stageId,
      stageDocPath,
      memoryLogPath,
      memoryEntries,
      seriesPotential,
      warnings,
      verifyCommand,
      stateAfterSave: {
        committedAt: state.stages[stageId].completedAt,
        fieldsPopulated,
      },
      nextAction: `Run \`${verifyCommand}\` and confirm exit 0 before composing any docs/ artefact for this stage or advancing.`,
    }, null, 2));
  });

// ── detect-series — run series detection on current premise ───
program
  .command('detect-series')
  .description('Run series-potential detection on current premise/genre. Also runs automatically after `storyline save premise`.')
  .action(async () => {
    const state = loadState();
    if (!state) {
      console.error(chalk.red('No project found. Run `storyline init` first.'));
      process.exit(1);
    }
    const { detectSeriesPotential } = await import('../lib/ai/series-detector.js');
    const result = detectSeriesPotential(state.premise, state.genre);
    console.log(JSON.stringify(result, null, 2));
  });

// ── memory — sync status & reconciliation with odd-flow MCP ────
const memory = program.command('memory').description('Memory sync commands (used by /storyline skill)');

memory
  .command('sync')
  .description('Output pending memory entries (not yet pushed to odd-flow MCP) as JSON')
  .action(async () => {
    const { getPendingEntries } = await import('../lib/memory/sync.js');
    const pending = await getPendingEntries();
    console.log(JSON.stringify({ pending, count: pending.length }, null, 2));
  });

memory
  .command('mark-synced')
  .description('Mark entry IDs as successfully pushed to odd-flow MCP memory')
  .argument('<ids...>', 'Entry IDs to mark as synced')
  .action(async (ids) => {
    const { markSynced } = await import('../lib/memory/sync.js');
    const result = await markSynced(ids);
    console.log(JSON.stringify(result, null, 2));
  });

memory
  .command('status')
  .description('Show memory sync status (total / synced / pending)')
  .action(async () => {
    const { getSyncStatus } = await import('../lib/memory/sync.js');
    const status = await getSyncStatus();
    console.log(JSON.stringify(status, null, 2));
  });

// ── traps — run story trap detection ───────────────────────────
program
  .command('traps')
  .description('Run story trap detection on current state')
  .action(async () => {
    const state = loadState();
    if (!state) {
      console.error(chalk.red('No project found.'));
      process.exit(1);
    }

    const results = runStoryTraps(state);
    if (results.length === 0) {
      console.log(JSON.stringify({ traps: [], message: 'No story traps detected' }, null, 2));
    } else {
      console.log(JSON.stringify({ traps: results }, null, 2));
    }
  });

// ── checklist — run quality checklist for a stage ──────────────
program
  .command('checklist')
  .description('Run quality checklist for a stage')
  .argument('<stage>', 'Stage ID')
  .action(async (stageId) => {
    const state = loadState();
    if (!state) {
      console.error(chalk.red('No project found.'));
      process.exit(1);
    }

    const results = runQualityChecklist(stageId, state);
    console.log(JSON.stringify({ stage: stageId, checks: results }, null, 2));
  });

// ── manuscript — snapshot prose into odd-flow memory + compare to plan ──
const manuscript = program.command('manuscript').description('Manuscript snapshot + plan-comparison commands');

manuscript
  .command('sync')
  .description('Snapshot manuscript/ prose into memory.jsonl so odd-flow MCP holds a current draft state')
  .option('--json', 'Output machine-readable JSON')
  .action(async (opts) => {
    const state = loadState();
    if (!state) {
      console.error(chalk.red('No project found. Run `storyline init` first.'));
      process.exit(1);
    }
    const { snapshotManuscript, buildManuscriptMemoryEntries } = await import('../lib/manuscript/snapshot.js');
    const { appendMemoryLog } = await import('../lib/memory/stage-memory.js');

    const snapshot = await snapshotManuscript(process.cwd(), {
      manuscriptPath: state?.writing?.manuscriptPath || 'manuscript',
    });
    const entries = buildManuscriptMemoryEntries(snapshot, state);
    const { logPath, entriesWithIds } = await appendMemoryLog(entries);

    const summary = {
      synced: true,
      chapterCount: snapshot.chapterCount,
      totalWords: snapshot.totalWords,
      memoryEntries: entriesWithIds,
      memoryLogPath: logPath,
    };

    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(chalk.green(`Snapshot: ${snapshot.chapterCount} chapter${snapshot.chapterCount === 1 ? '' : 's'}, ${snapshot.totalWords.toLocaleString()} words.`));
      console.log(chalk.dim(`  ↳ ${entriesWithIds.length} memory entries appended to ${logPath}`));
      console.log(chalk.dim(`    Push via mcp__odd-flow__memory_store then storyline memory mark-synced <ids>.`));
      // Skill-consumable JSON last so piped tooling works:
      console.log(JSON.stringify(summary));
    }
  });

manuscript
  .command('notes')
  .description('List <inline notes> in the manuscript (writer\'s bracketed TBDs / research stubs)')
  .option('--json', 'Output machine-readable JSON')
  .option('--sync', 'Also write each note as a pending memory entry in memory.jsonl')
  .option('--file <path>', 'Scan a single file (e.g. manuscript/scene-1.md) instead of the whole manuscript directory')
  .action(async (opts) => {
    const state = loadState();
    if (!state) {
      console.error(chalk.red('No project found.'));
      process.exit(1);
    }
    const { scanManuscriptNotes, scanFileNotes, buildNotesMemoryEntries, formatNotesReport } = await import('../lib/manuscript/notes.js');
    const manuscriptPath = state?.writing?.manuscriptPath || 'manuscript';
    let notes;
    if (opts.file) {
      try {
        notes = await scanFileNotes(process.cwd(), opts.file, { manuscriptPath });
      } catch (err) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    } else {
      notes = await scanManuscriptNotes(process.cwd(), { manuscriptPath });
    }
    let memoryResult = null;
    if (opts.sync) {
      const { appendMemoryLog } = await import('../lib/memory/stage-memory.js');
      const entries = buildNotesMemoryEntries(notes, state);
      memoryResult = await appendMemoryLog(entries);
    }
    if (opts.json) {
      console.log(JSON.stringify({
        notes,
        memoryEntries: memoryResult?.entriesWithIds || [],
        memoryLogPath: memoryResult?.logPath || null,
      }, null, 2));
    } else {
      console.log(notes.length === 0 ? chalk.green(formatNotesReport(notes)) : formatNotesReport(notes));
      if (memoryResult) {
        console.log(chalk.dim(`  ↳ ${memoryResult.entriesWithIds.length} memory entries appended to ${memoryResult.logPath}`));
      }
    }
  });

manuscript
  .command('migrate-markers')
  .description('Rewrite legacy <angle> and &lt;encoded&gt; note markers to the current {{curly}} format. Preview-first unless --yes is passed.')
  .option('--yes', 'Apply the rewrite without an approval preview')
  .option('--json', 'Machine-readable JSON output')
  .action(async (opts) => {
    const state = loadState();
    if (!state) {
      console.error(chalk.red('No project found. Run `storyline init` first.'));
      process.exit(1);
    }
    const { migrateManuscriptMarkers } = await import('../lib/manuscript/notes.js');
    const manuscriptPath = state?.writing?.manuscriptPath || 'manuscript';

    // Always preview first; only persist if --yes was passed.
    const result = await migrateManuscriptMarkers(process.cwd(), {
      manuscriptPath,
      preview: !opts.yes,
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.totalMigrations === 0) {
      console.log(chalk.green(`No legacy markers found in ${manuscriptPath}/. Nothing to migrate.`));
      return;
    }

    console.log(chalk.bold(`\n${opts.yes ? 'Migrating' : 'Would migrate'} ${result.totalMigrations} legacy marker${result.totalMigrations === 1 ? '' : 's'} across ${result.filesAffected} file${result.filesAffected === 1 ? '' : 's'}:\n`));
    for (const file of result.files) {
      console.log(chalk.cyan(file.path));
      for (const m of file.migrations) {
        const tag = m.style === 'angle-encoded' ? chalk.dim('(encoded)') : chalk.dim('(angle)');
        console.log(`  L${m.line}  ${chalk.yellow(m.from)}  →  ${chalk.green(m.to)}  ${tag}`);
      }
      console.log();
    }

    if (opts.yes) {
      console.log(chalk.green(`✓ Applied ${result.totalMigrations} migration${result.totalMigrations === 1 ? '' : 's'}.`));
    } else {
      console.log(chalk.dim(`Re-run with ${chalk.white('--yes')} to apply the rewrite.`));
    }
  });

manuscript
  .command('compare')
  .description('Compare draft manuscript against the canonical plan, reporting drift per chapter')
  .option('--json', 'Output machine-readable JSON')
  .action(async (opts) => {
    const state = loadState();
    if (!state) {
      console.error(chalk.red('No project found.'));
      process.exit(1);
    }
    const { compareManuscriptToPlan, formatCompareReport } = await import('../lib/manuscript/compare.js');
    const report = await compareManuscriptToPlan(state, process.cwd());
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const text = formatCompareReport(report);
      console.log(report.drift ? chalk.yellow(text) : chalk.green(text));
    }
  });

// ── doctor — cross-surface drift detection ─────────────────────
program
  .command('doctor')
  .description('Check state.json / output/ / docs/ / memory for drift. Run at every stage closure.')
  .option('--json', 'Output machine-readable JSON instead of the human summary')
  .option('--recover', 'Print a precise recovery brief for each orphan stage (reseed command, source doc path, required fields)')
  .action(async (opts) => {
    const state = loadState();
    if (!state) {
      const err = { error: 'No project found', action: 'init' };
      if (opts.json) console.log(JSON.stringify(err, null, 2));
      else console.error(chalk.yellow('No project found. Run `storyline init` first.'));
      process.exit(1);
    }
    const { runDoctor, formatDoctorReport } = await import('../lib/doctor.js');
    const report = await runDoctor(state);

    if (opts.recover) {
      // Recovery mode — for every orphan-artefact finding, print a
      // precise reseed brief so the writer knows exactly what to do.
      // Does not write state itself — it's guidance only.
      const orphans = report.findings.filter(f => f.type === 'orphan-artefact');
      if (orphans.length === 0) {
        console.log(chalk.green('✓ No orphan-artefact drift detected. Nothing to recover.'));
        process.exit(report.ok ? 0 : 1);
      }
      const bar = '━'.repeat(60);
      console.log(chalk.cyan(bar));
      console.log(chalk.cyan(`  Doctor recovery brief — ${orphans.length} stage${orphans.length === 1 ? '' : 's'} to reseed`));
      console.log(chalk.cyan(bar));
      console.log('');
      console.log(chalk.dim('  For each stage below, the long-form doc exists on disk but the'));
      console.log(chalk.dim('  structured data never reached state.json. Run the reseed command'));
      console.log(chalk.dim('  for each one, following the guidance it prints.'));
      console.log('');
      orphans.forEach((f, i) => {
        console.log(chalk.yellow(`  ${i + 1}. ${f.stageName} (${f.stageId})`));
        if (f.artefacts?.length) {
          console.log(chalk.dim('     Orphan doc(s):'));
          f.artefacts.forEach(a => console.log(chalk.dim(`       • ${a}`)));
        }
        console.log(chalk.bold(`     Recovery: npx storyline-vsc reseed ${f.stageId}`));
        console.log('');
      });
      console.log(chalk.cyan(bar));
      console.log(chalk.dim('  After reseeding each stage, re-run `npx storyline-vsc doctor` to confirm.'));
      console.log('');
      process.exit(report.ok ? 0 : 1);
    }

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const text = formatDoctorReport(report);
      if (report.ok && !report.drift) {
        console.log(chalk.green(`✓ ${text}`));
      } else if (report.ok) {
        console.log(chalk.yellow(text));
      } else {
        console.log(chalk.red(text));
      }
    }
    // Non-zero exit on hard drift so scripts / skill can gate on it.
    process.exit(report.ok ? 0 : 1);
  });

// ── next — show what to do next (for /storyline skill) ──────────────
program
  .command('next')
  .description('Show next stage and current status as JSON')
  .action(async () => {
    const state = loadState();
    if (!state) {
      console.log(JSON.stringify({ error: 'No project found', action: 'init' }, null, 2));
      return;
    }

    const progress = calculateProgress(state);
    const currentStage = deriveCurrentStage(state);

    if (!currentStage) {
      console.log(JSON.stringify({
        complete: true,
        progress,
        action: 'generate',
        message: 'All stages complete — run storyline generate',
      }, null, 2));
      return;
    }

    const missing = getMissingRequirements(currentStage.id, state);
    const gate = checkStageGate(currentStage.id, state);

    console.log(JSON.stringify({
      complete: false,
      progress,
      currentStage: {
        id: currentStage.id,
        name: currentStage.name,
        index: currentStage.index,
      },
      missingRequirements: missing,
      gateBlocked: gate,
    }, null, 2));
  });

// ── config — read / write .storyline/config.json (AI quality etc.) ────
const config = program.command('config').description('Read or write .storyline/config.json');

config
  .command('get')
  .description('Get a config value by dotted key (e.g. ai.quality)')
  .argument('<key>', 'Dotted config key')
  .action(async (key) => {
    const { loadStorylineConfig, getConfigValue } = await import('../lib/config/storyline-config.js');
    const cfg = loadStorylineConfig();
    const value = getConfigValue(cfg, key);
    if (value === undefined) {
      console.error(chalk.yellow(`Config key not set: ${key}`));
      process.exit(1);
    }
    console.log(typeof value === 'string' ? value : JSON.stringify(value));
  });

config
  .command('set')
  .description('Set a config value (ai.quality must be economy|balanced|premium)')
  .argument('<key>', 'Dotted config key')
  .argument('<value>', 'Value to set')
  .action(async (key, value) => {
    const { loadStorylineConfig, saveStorylineConfig, setConfigValue, VALID_QUALITY_MODES } = await import('../lib/config/storyline-config.js');
    if (key === 'ai.quality' && !VALID_QUALITY_MODES.includes(value)) {
      console.error(chalk.red(`Invalid ai.quality: ${value}. Use one of: ${VALID_QUALITY_MODES.join(', ')}`));
      process.exit(1);
    }
    const cfg = loadStorylineConfig();
    setConfigValue(cfg, key, value);
    await saveStorylineConfig(cfg);
    console.log(chalk.green(`Set ${key} = ${value}`));
  });

config
  .command('list')
  .description('Show the full active config (defaults + overrides)')
  .action(async () => {
    const { loadStorylineConfig } = await import('../lib/config/storyline-config.js');
    console.log(JSON.stringify(loadStorylineConfig(), null, 2));
  });

// ── route — return routed model for a stage (used by /storyline skill) ─
program
  .command('route')
  .description('Return { model, escalateOn, qualityMode } for a stage — used by /storyline skill at stage boundaries')
  .argument('<stageId>', 'Stage ID (e.g. beatSheet, critique, sceneOutline:critique)')
  .action(async (stageId) => {
    const { routeStage } = await import('../lib/ai/model-router.js');
    const { loadStorylineConfig } = await import('../lib/config/storyline-config.js');
    const cfg = loadStorylineConfig();
    const routed = routeStage(stageId, cfg.ai?.quality || 'balanced');

    // Loud imperative block on stderr — impossible to miss in skill-driven
    // Bash output. The skill MUST act on these instructions or M8 silently
    // fails (provenance gets recorded but the parent session did the work).
    const bar = '━'.repeat(60);
    const lines = [
      bar,
      '  MANDATORY NEXT ACTION — M8 stage-boundary delegation',
      bar,
      `  Stage:              ${stageId}`,
      `  Quality mode:       ${routed.qualityMode}`,
      `  Named subagent:     ${routed.subagentType}    (model: ${routed.model})`,
      `  Escalate on weak:   ${routed.escalateSubagentType || '(no escalation for this stage)'}`,
      '',
      '  You MUST now invoke the named subagent via the Task tool:',
      `     subagent_type:   "${routed.subagentType}"`,
      `     description:     "${stageId} critique"`,
      '     prompt:          <stage critique brief — state snapshot + stage guide>',
      '',
      `  The subagent is pre-configured in .claude/agents/${routed.subagentType}.md`,
      '  with model pinned. Its first line will be "MODEL: <tier>" for verification.',
      '',
      '  DO NOT critique this stage in the parent session.',
      '  DO NOT call record-model without a preceding Task-tool invocation.',
      '',
      '  After the subagent returns, call:',
      `     npx storyline-vsc record-model ${stageId} <modelUsed>`,
      '  (use --escalated if escalation fired)',
      bar,
    ];
    console.error(lines.join('\n'));

    // JSON on stdout — unchanged, machine-parseable.
    console.log(JSON.stringify(routed, null, 2));
  });

// ── record-model — write per-stage model provenance into state.json ────
program
  .command('record-model')
  .description('Record which model handled a stage critique (writes state.modelProvenance)')
  .argument('<stageId>', 'Stage ID')
  .argument('<model>', 'Model used: haiku | sonnet | opus | parent')
  .option('--escalated', 'Mark this call as having escalated from the routed model to a higher tier')
  .option('--fallback', 'Mark this call as having fallen back to the parent-session model (harness lacks per-invocation pinning)')
  .action(async (stageId, model, opts) => {
    const state = loadState();
    if (!state) {
      console.error(chalk.red('No project found. Run `storyline init` first.'));
      process.exit(1);
    }
    if (!state.modelProvenance) state.modelProvenance = {};
    state.modelProvenance[stageId] = {
      model,
      escalated: !!opts.escalated,
      fallback: !!opts.fallback,
      recordedAt: new Date().toISOString(),
    };
    await saveState(state);
    console.log(JSON.stringify({ stageId, ...state.modelProvenance[stageId] }, null, 2));
  });

program.parse();