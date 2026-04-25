// NF telemetry — opt-in stage completion timing and critique severity tracking.
// Off by default. Enable by setting telemetry.enabled = true in .storyline/config.json.
// Data stays local: written to .storyline/telemetry.json, never transmitted.

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const TELEMETRY_FILE = '.storyline/telemetry.json';
const DEFAULT_STATE = { schemaVersion: 1, enabled: false, events: [] };

async function readTelemetry(projectDir) {
  const filePath = path.join(projectDir, TELEMETRY_FILE);
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeTelemetry(projectDir, data) {
  const dir = path.join(projectDir, '.storyline');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(projectDir, TELEMETRY_FILE), JSON.stringify(data, null, 2), 'utf-8');
}

async function isTelemetryEnabled(projectDir) {
  try {
    const configPath = path.join(projectDir, '.storyline', 'config.json');
    const raw = await readFile(configPath, 'utf-8');
    const config = JSON.parse(raw);
    return config?.telemetry?.enabled === true;
  } catch {
    return false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function recordStageCompletion(projectDir, { stageId, pipeline, durationMs = null }) {
  if (!(await isTelemetryEnabled(projectDir))) return;

  const data = await readTelemetry(projectDir);
  data.events.push({
    type: 'stage-complete',
    stageId,
    pipeline: pipeline || null,
    durationMs: durationMs || null,
    timestamp: new Date().toISOString(),
  });

  await writeTelemetry(projectDir, data);
}

export async function recordCritiqueSeverities(projectDir, { pipeline, summary }) {
  if (!(await isTelemetryEnabled(projectDir))) return;

  const data = await readTelemetry(projectDir);
  data.events.push({
    type: 'critique-run',
    pipeline: pipeline || null,
    errors: summary?.errors ?? 0,
    warnings: summary?.warnings ?? 0,
    tips: summary?.tips ?? 0,
    timestamp: new Date().toISOString(),
  });

  await writeTelemetry(projectDir, data);
}

export async function getTelemetrySummary(projectDir) {
  const data = await readTelemetry(projectDir);
  const events = data.events || [];

  const stageCompletions = events.filter(e => e.type === 'stage-complete');
  const critiqueRuns = events.filter(e => e.type === 'critique-run');

  const avgDuration = stageCompletions
    .filter(e => e.durationMs !== null)
    .reduce((acc, e, _, arr) => acc + e.durationMs / arr.length, 0);

  return {
    enabled: data.enabled || (await isTelemetryEnabled(projectDir)),
    totalEvents: events.length,
    stageCompletions: stageCompletions.length,
    critiqueRuns: critiqueRuns.length,
    avgStageDurationMs: stageCompletions.length > 0 ? Math.round(avgDuration) : null,
    lastEvent: events[events.length - 1]?.timestamp || null,
  };
}

export async function enableTelemetry(projectDir) {
  const configPath = path.join(projectDir, '.storyline', 'config.json');
  let config = {};
  try {
    const raw = await readFile(configPath, 'utf-8');
    config = JSON.parse(raw);
  } catch { /* start fresh */ }

  config.telemetry = { ...config.telemetry, enabled: true };
  await mkdir(path.join(projectDir, '.storyline'), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export async function disableTelemetry(projectDir) {
  const configPath = path.join(projectDir, '.storyline', 'config.json');
  let config = {};
  try {
    const raw = await readFile(configPath, 'utf-8');
    config = JSON.parse(raw);
  } catch { /* start fresh */ }

  config.telemetry = { ...config.telemetry, enabled: false };
  await mkdir(path.join(projectDir, '.storyline'), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
