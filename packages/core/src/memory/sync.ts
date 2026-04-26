// @ts-nocheck
// Memory sync — reconciles the durable jsonl log with odd-flow MCP memory.
// The /storyline skill calls `storyline memory sync` to get entries not yet pushed
// to mcp__odd-flow__memory_store, and `storyline memory mark-synced <ids...>`
// after each successful push. This guarantees no memory is ever lost even
// if the skill forgets to push mid-session or the MCP tool is unavailable.
import pkg from 'fs-extra';
const { readFile, writeFile, pathExists, ensureDir } = pkg;
import { resolve } from 'path';

const LOG_FILE = '.storyline/memory.jsonl';
const SYNCED_FILE = '.storyline/memory.synced';

async function readSyncedIds(cwd = process.cwd()) {
  const path = resolve(cwd, SYNCED_FILE);
  if (!(await pathExists(path))) return new Set();
  const raw = await readFile(path, 'utf8');
  return new Set(raw.split('\n').filter(Boolean));
}

async function readAllEntries(cwd = process.cwd()) {
  const path = resolve(cwd, LOG_FILE);
  if (!(await pathExists(path))) return [];
  const raw = await readFile(path, 'utf8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); }
      catch { return null; }
    })
    .filter(Boolean);
}

// Return entries that exist in the log but aren't in the synced set.
// Deduplicates by id; also handles legacy entries without ids by using
// ts+key+namespace as a synthetic id.
export async function getPendingEntries(cwd = process.cwd()) {
  const [all, synced] = await Promise.all([readAllEntries(cwd), readSyncedIds(cwd)]);
  const pending = [];
  const seen = new Set();
  for (const e of all) {
    const id = e.id || `${e.ts || 'legacy'}-${e.namespace}-${e.key}`;
    if (synced.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push({ ...e, id });
  }
  return pending;
}

export async function markSynced(ids, cwd = process.cwd()) {
  if (!ids || !ids.length) return { marked: 0 };
  await ensureDir(resolve(cwd, '.storyline'));
  const current = await readSyncedIds(cwd);
  ids.forEach(id => current.add(id));
  const path = resolve(cwd, SYNCED_FILE);
  await writeFile(path, [...current].join('\n') + '\n');
  return { marked: ids.length, totalSynced: current.size };
}

export async function getSyncStatus(cwd = process.cwd()) {
  const [all, synced] = await Promise.all([readAllEntries(cwd), readSyncedIds(cwd)]);
  return {
    totalEntries: all.length,
    syncedEntries: synced.size,
    pendingEntries: all.length - synced.size,
    logPath: resolve(cwd, LOG_FILE),
    syncedPath: resolve(cwd, SYNCED_FILE),
  };
}
