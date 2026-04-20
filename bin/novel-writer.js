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
import { STAGE_ORDER, STAGE_BY_ID } from '../lib/state/project-state.js';
import { deriveCurrentStage, calculateProgress, getMissingRequirements, checkStageGate, getDownstreamImpacts } from '../lib/state/transitions.js';
import { getStageGuide, getAllStageGuides } from '../lib/ai/stage-guides.js';
import { runStoryTraps, formatTrapResults } from '../lib/ai/story-traps.js';
import { runQualityChecklist, getPersonaForStage } from '../lib/ai/coaching-personas.js';

const program = new Command();

program
  .name('novel-writer')
  .alias('nw')
  .description('Save the Cat novel planning harness — use /novel inside Claude Code for the planning conversation')
  .version('1.0.0');

registerInit(program);
registerCompile(program);

// ── start — show status and next action (NOT interactive) ──────
program
  .command('start')
  .description('Show current project status and next recommended action')
  .action(async () => {
    const state = loadState();
    if (!state) {
      console.log(chalk.yellow('\nNo project found. Run `nw init` to begin, then use /novel to start planning.\n'));
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

      console.log(chalk.bold(`\n  Use /novel in Claude Code to continue planning.\n`));
    } else {
      console.log(chalk.green('\n  All stages complete! Run `nw generate` to create the master document.\n'));
    }
  });

// ── status — show project state ────────────────────────────────
program
  .command('status')
  .description('Show current project state and next recommended action')
  .action(async () => {
    const state = loadState();
    if (!state) {
      console.log(chalk.yellow('No project found. Run `nw init` to begin.'));
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
      console.log(chalk.yellow('No project found. Run `nw init` first.'));
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

    console.log(chalk.dim('Use /novel in Claude Code to revise this stage.\n'));
  });

// ── generate — output master document ──────────────────────────
program
  .command('generate')
  .description('Generate the master planning document')
  .action(async () => {
    const state = loadState();
    if (!state) {
      console.log(chalk.yellow('No project found. Run `nw init` first.'));
      return;
    }
    const { generateMasterDocument } = await import('../lib/output/master-doc.js');
    const result = await generateMasterDocument(state);
    console.log(chalk.green(`\n Master document generated: ${result.path}\n`));
  });

// ── stage-info — output stage guide as JSON (for /novel skill) ──
program
  .command('stage-info')
  .description('Output stage conversation guide as JSON (used by /novel skill)')
  .argument('<stage>', 'Stage ID')
  .action(async (stageId) => {
    const guide = getStageGuide(stageId);
    if (!guide) {
      console.error(JSON.stringify({ error: `No guide for stage: ${stageId}` }));
      process.exit(1);
    }

    // Enrich with runtime state
    const state = loadState();
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

// ── save — save stage data to state (for /novel skill) ──────────
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
      console.error(chalk.red('No project found. Run `nw init` first.'));
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
    // the JSON payload so the /novel skill can raise it with the writer.
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

    // Emit structured JSON so the /novel skill can push memoryEntries to
    // mcp__odd-flow__memory_store. Human-readable status goes to stderr.
    console.error(chalk.green(`Saved ${stageId} data`));
    if (stageDocPath) console.error(chalk.dim(`  ↳ stage doc: ${stageDocPath}`));
    if (memoryLogPath) console.error(chalk.dim(`  ↳ memory log: ${memoryLogPath} (${memoryEntries.length} entries)`));
    warnings.forEach(w => console.error(chalk.yellow(`  ⚠ ${w}`)));

    console.log(JSON.stringify({
      saved: true,
      stageId,
      stageDocPath,
      memoryLogPath,
      memoryEntries,
      seriesPotential,
      warnings,
    }, null, 2));
  });

// ── detect-series — run series detection on current premise ───
program
  .command('detect-series')
  .description('Run series-potential detection on current premise/genre. Also runs automatically after `nw save premise`.')
  .action(async () => {
    const state = loadState();
    if (!state) {
      console.error(chalk.red('No project found. Run `nw init` first.'));
      process.exit(1);
    }
    const { detectSeriesPotential } = await import('../lib/ai/series-detector.js');
    const result = detectSeriesPotential(state.premise, state.genre);
    console.log(JSON.stringify(result, null, 2));
  });

// ── memory — sync status & reconciliation with odd-flow MCP ────
const memory = program.command('memory').description('Memory sync commands (used by /novel skill)');

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

// ── next — show what to do next (for /novel skill) ──────────────
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
        message: 'All stages complete — run nw generate',
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

program.parse();