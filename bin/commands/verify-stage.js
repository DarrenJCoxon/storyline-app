// `storyline verify-stage <stageId>` — programmatic gate exposing the
// doctor's `stageCommitted()` check as a CLI verb. Used by:
//
//   1. The /storyline skill after every `save` to confirm the commit
//      landed before proceeding.
//   2. The Claude Code PostToolUse hook after Bash `storyline save ...`.
//   3. The PreToolUse hook before any Write/Edit into docs/<NN>-*.md.
//   4. `storyline stage-info` as part of its upstream-drift gate (which
//      walks every stage up to the requested one and verifies it).
//
// Exit codes:
//   0 — stage committed cleanly (state populated, no orphan artefact)
//   2 — drift detected (state empty but doc exists, OR requirements
//       unmet). Prints structured JSON error on stdout.
//   1 — argument / project error (unknown stage, no state, etc).
//
// Reuse: stageCommitted() and runDoctor() from lib/doctor.js.

import chalk from 'chalk';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { loadState } from '../../lib/state/store.js';
import { STAGE_ORDER } from '../../lib/state/project-state.js';
import { getMissingRequirements } from '../../lib/state/transitions.js';

export function registerVerifyStage(program) {
  program
    .command('verify-stage')
    .description('Exit 0 if the stage is committed (state populated and consistent), 2 if drifted')
    .argument('<stage>', 'Stage ID (e.g. chapterOutline, protagonist, beatSheet)')
    .option('--json', 'Output machine-readable JSON on both success and failure')
    .action(async (stageId, opts) => {
      const stage = STAGE_ORDER.find(s => s.id === stageId);
      if (!stage) {
        const err = { ok: false, error: 'UNKNOWN_STAGE', stageId, validStages: STAGE_ORDER.map(s => s.id) };
        console.log(JSON.stringify(err, null, 2));
        process.exit(1);
      }

      const projectPath = process.cwd();
      const stateFile = resolve(projectPath, '.storyline', 'state.json');
      if (!existsSync(stateFile)) {
        const err = { ok: false, error: 'NO_PROJECT', action: 'run `storyline init`' };
        console.log(JSON.stringify(err, null, 2));
        process.exit(1);
      }

      const state = loadState(projectPath);

      // Run the doctor's stricter stageCommitted check, with orphan-doc
      // detection for this specific stage only (so we can surface the
      // exact doc path in the error).
      const { runDoctor } = await import('../../lib/doctor.js');
      const report = await runDoctor(state, projectPath);
      const stageFindings = report.findings.filter(f => f.stageId === stageId);
      const orphanFinding = stageFindings.find(f => f.type === 'orphan-artefact');
      const missing = getMissingRequirements(stageId, state);

      if (orphanFinding) {
        // Doc-on-disk but state empty — the exact bug this fix targets.
        const result = {
          ok: false,
          stageId,
          stageName: stage.name,
          code: 'STATE_DOC_DRIFT',
          message: `Stage "${stage.name}" has artefact(s) on disk but state.json is not populated.`,
          orphanDocs: orphanFinding.artefacts || [],
          recover: `npx storyline-vsc reseed ${stageId}`,
        };
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.error(chalk.red(`✗ ${result.message}`));
          result.orphanDocs.forEach(d => console.error(chalk.dim(`    orphan: ${d}`)));
          console.error(chalk.yellow(`    Recover: ${result.recover}`));
        }
        process.exit(2);
      }

      if (missing.length > 0) {
        // State has missing required fields. This is not quite the same
        // as the drift bug, but it's still "not committed" — the skill
        // should block advancement.
        const result = {
          ok: false,
          stageId,
          stageName: stage.name,
          code: 'MISSING_FIELDS',
          message: `Stage "${stage.name}" has required fields missing from state.json.`,
          missingFields: missing,
          recover: `Run /storyline to complete this stage, or \`npx storyline-vsc reseed ${stageId}\` if you've already planned it.`,
        };
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.error(chalk.red(`✗ ${result.message}`));
          missing.forEach(m => console.error(chalk.dim(`    missing: ${m}`)));
          console.error(chalk.yellow(`    ${result.recover}`));
        }
        process.exit(2);
      }

      // Clean. Stage is committed.
      const result = { ok: true, stageId, stageName: stage.name, code: 'COMMITTED' };
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green(`✓ ${stage.name} (${stageId}) is committed.`));
      }
      process.exit(0);
    });
}
