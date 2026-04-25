// Direct odd-flow push from the CLI. Replaces the prior "skill must call
// mcp__odd-flow__memory_store for each entry" contract with a mechanical
// CLI-to-CLI handoff that runs inside `storyline save` and `storyline nf
// save`. Both surfaces (our CLI and odd-flow's MCP server) read/write the
// same .claude/memory.db, so there is no drift between the two access
// paths — whatever the CLI pushes is immediately visible via MCP semantic
// search in the same session.
//
// Design notes:
//   * odd-flow exposes no programmatic API (dist/index.js is empty), so
//     we shell out to its CLI. Entries are pushed in parallel — SQLite in
//     WAL mode handles concurrent writers fine and total wall time becomes
//     max(per-entry) instead of sum.
//   * If the DB hasn't been initialised yet, the first `memory store`
//     call fails with "Database not initialized". We detect that, run
//     `memory init` once, then retry. Subsequent saves skip the init step.
//   * If the DB file exists but is a corrupt text stub (written by the old
//     sql.js-missing fallback), we get "file is not a database". We detect
//     that, run `memory init --force` to replace it with a real SQLite DB,
//     then retry. This self-heals projects initialised before 1.3.4.
//   * If odd-flow is genuinely unavailable (package missing, CLI errors
//     we don't recognise), we return { pushed: 0, failed: N } and let
//     the caller decide whether to warn. We never throw — memory.jsonl is
//     the durable log; odd-flow is the optional cache.
//   * We advance .storyline/memory.synced only for entries that pushed
//     cleanly. Failed entries remain "pending" and retry on next save.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { markSynced } from './sync.js';

const execFileP = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// Locate odd-flow's CLI. Preferred: local node_modules (fast, version-pinned).
// Fallback: `npx -y odd-flow@latest` — slower first call, but always works.
function locateOddFlowCli() {
  // 1. Dependency of storyline-vsc itself (when installed from npm)
  const dep = resolve(PROJECT_ROOT, 'node_modules', 'odd-flow', 'bin', 'cli.js');
  if (existsSync(dep)) return { kind: 'local', path: dep };

  // 2. Dependency of the writer's project (when invoked via npx in their project)
  const projectLocal = resolve(process.cwd(), 'node_modules', 'odd-flow', 'bin', 'cli.js');
  if (existsSync(projectLocal)) return { kind: 'local', path: projectLocal };

  // 3. Fallback: npx will fetch odd-flow on demand.
  return { kind: 'npx' };
}

function buildArgs(cli, subArgs) {
  if (cli.kind === 'local') return { cmd: process.execPath, args: [cli.path, ...subArgs] };
  return { cmd: 'npx', args: ['-y', 'odd-flow@latest', ...subArgs] };
}

async function runOddFlow(cli, subArgs, { cwd } = {}) {
  const { cmd, args } = buildArgs(cli, subArgs);
  try {
    const { stdout, stderr } = await execFileP(cmd, args, { cwd: cwd || process.cwd(), timeout: 30_000 });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.toString() || '',
      stderr: err.stderr?.toString() || err.message || '',
      code: err.code,
    };
  }
}

// "Database not initialized" — auto-recover by running memory init then retrying.
const DB_NOT_INIT_RX = /database not initialized|run:\s*odd-flow memory init/i;

// "File is not a database" — the DB file exists but is a corrupt/text stub
// (written by the old sql.js-missing fallback). Auto-recover with --force reinit.
const FILE_NOT_DB_RX = /file is not a database|not a database|SQLITE_NOTADB/i;

// sql.js missing — packaging issue, sql.js is a direct dep since 1.3.4.
const SQL_JS_MISSING_RX = /cannot find.*sql\.js|sql\.js.*not (found|available)|failed.*sql\.js/i;

async function ensureDbInitialised(cli, cwd, { force = false } = {}) {
  const subArgs = force ? ['memory', 'init', '--force'] : ['memory', 'init'];
  const { ok } = await runOddFlow(cli, subArgs, { cwd });
  return ok;
}

async function pushOne(entry, cli, cwd) {
  const args = [
    'memory', 'store',
    '-k', String(entry.key),
    '-v', typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value),
    '--namespace', String(entry.namespace || 'default'),
  ];
  if (Array.isArray(entry.tags) && entry.tags.length) {
    args.push('--tags', entry.tags.join(','));
  }
  let r = await runOddFlow(cli, args, { cwd });
  if (!r.ok && DB_NOT_INIT_RX.test(r.stderr + r.stdout)) {
    // DB never initialised — run init and retry.
    const initOk = await ensureDbInitialised(cli, cwd);
    if (initOk) r = await runOddFlow(cli, args, { cwd });
  }
  if (!r.ok && FILE_NOT_DB_RX.test(r.stderr + r.stdout)) {
    // Corrupt stub file from the old sql.js-missing fallback — force reinit and retry.
    const initOk = await ensureDbInitialised(cli, cwd, { force: true });
    if (initOk) r = await runOddFlow(cli, args, { cwd });
  }
  if (!r.ok && SQL_JS_MISSING_RX.test(r.stderr + r.stdout)) {
    r = { ...r, sqlJsMissing: true };
  }
  return r;
}

// Entry point: given an array of entries (as produced by buildMemoryEntries
// and buildNfMemoryEntries), push each to odd-flow and advance the sync cursor
// for everything that landed. Returns { pushed, failed, errors } — the caller
// includes this in the save receipt so the writer sees the result.
//
// `entries` must have `id` populated (they will be, because buildMemoryLog
// assigns ids on append).
export async function pushEntriesToOddFlow(entries, { cwd = process.cwd() } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { pushed: 0, failed: 0, errors: [], cli: null, skipped: true };
  }

  const cli = locateOddFlowCli();

  // Parallel push. SQLite WAL handles concurrent writes. If the DB needs
  // init-on-first-call, the first concurrent call that gets DB_NOT_INIT
  // runs init; other calls that hit the same error during that window just
  // retry on next save — harmless and self-healing.
  const results = await Promise.all(entries.map(e => pushOne(e, cli, cwd)));

  const pushedIds = [];
  const errors = [];
  let hasSqlJsMissing = false;
  results.forEach((r, i) => {
    if (r.ok) {
      pushedIds.push(entries[i].id);
    } else {
      if (r.sqlJsMissing) hasSqlJsMissing = true;
      errors.push({
        key: entries[i].key,
        namespace: entries[i].namespace,
        stderr: r.sqlJsMissing
          ? 'sql.js not available — run: npm install sql.js in your project'
          : (r.stderr || '').split('\n').slice(0, 3).join(' ').slice(0, 300),
      });
    }
  });

  // Advance the cursor for what actually made it. Pending entries stay in
  // the jsonl and will be retried on the next save (or via an explicit
  // `storyline memory sync`).
  if (pushedIds.length) {
    try { await markSynced(pushedIds, cwd); }
    catch { /* cursor write failed — not fatal, next save retries */ }
  }

  return {
    pushed: pushedIds.length,
    failed: errors.length,
    errors: errors.slice(0, 5), // cap to avoid flooding the receipt
    cli: cli.kind,
    skipped: false,
    ...(hasSqlJsMissing ? { sqlJsMissing: true } : {}),
  };
}
