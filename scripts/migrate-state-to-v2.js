// Migrate a Storyline state.json from v1 (fiction-only) to v2 (multi-mode).
// Safe to run repeatedly — idempotent.
// Adds: mode, pipeline, subMode, bookDna, nfStages
// Backs up the original to state.json.bak before writing.
// Can be called as a function (from bin/commands/nf.js) or run directly.

import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { resolve } from 'path';
import chalk from 'chalk';

export function migrateState(projectDir, { dryRun = false } = {}) {
  const statePath = resolve(projectDir, '.storyline', 'state.json');
  const backupPath = resolve(projectDir, '.storyline', 'state.json.bak');

  if (!existsSync(statePath)) {
    return { ok: false, reason: 'no-state', message: 'No state.json found. Run `storyline init` first.' };
  }

  let state;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf-8'));
  } catch {
    return { ok: false, reason: 'parse-error', message: 'Could not parse state.json.' };
  }

  const changes = [];

  if (state.mode === undefined) {
    state.mode = 'fiction';
    changes.push('added mode: "fiction"');
  }
  if (state.pipeline === undefined) {
    state.pipeline = 'novel';
    changes.push('added pipeline: "novel"');
  }
  if (state.subMode === undefined) {
    state.subMode = null;
    changes.push('added subMode: null');
  }
  if (state.bookDna === undefined) {
    state.bookDna = {};
    changes.push('added bookDna: {}');
  }
  if (state.nfStages === undefined) {
    state.nfStages = {};
    changes.push('added nfStages: {}');
  }

  if (changes.length === 0) {
    return { ok: true, migrated: false, changes: [], message: 'Already up to date — no migration needed.' };
  }

  if (dryRun) {
    return { ok: true, migrated: false, dryRun: true, changes, message: 'Dry-run — no files written.' };
  }

  copyFileSync(statePath, backupPath);
  writeFileSync(statePath, JSON.stringify(state, null, 2));

  return { ok: true, migrated: true, changes, backupPath, message: `Migrated ${changes.length} field(s). Backup at ${backupPath}` };
}

// ── direct execution ──────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('migrate-state-to-v2.js')) {
  const dryRun = process.argv.includes('--dry-run');
  const result = migrateState(process.cwd(), { dryRun });

  if (!result.ok) {
    console.error(chalk.red(`Migration failed: ${result.message}`));
    process.exit(1);
  }

  if (result.dryRun) {
    console.log(chalk.yellow('Dry-run mode — no files modified'));
    result.changes.forEach(c => console.log(chalk.dim(`  + ${c}`)));
    console.log(chalk.dim(`\n  Re-run without --dry-run to apply.`));
  } else if (!result.migrated) {
    console.log(chalk.green(result.message));
  } else {
    console.log(chalk.green(`Migration complete (${result.changes.length} field${result.changes.length === 1 ? '' : 's'})`));
    result.changes.forEach(c => console.log(chalk.dim(`  + ${c}`)));
    console.log(chalk.dim(`  Backup: ${result.backupPath}`));
  }
}
