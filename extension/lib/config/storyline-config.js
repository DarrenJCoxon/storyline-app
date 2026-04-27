// Storyline runtime config — `.storyline/config.json`.
// Currently holds only ai.quality (M8). Lightweight JSON wrapper.

import { existsSync, readFileSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';

const CONFIG_SUBPATH = ['.storyline', 'config.json'];

const DEFAULTS = Object.freeze({
  ai: {
    quality: 'balanced', // 'economy' | 'balanced' | 'premium'
  },
});

function configPath(projectRoot = process.cwd()) {
  return resolve(projectRoot, ...CONFIG_SUBPATH);
}

export function loadStorylineConfig(projectRoot = process.cwd()) {
  const p = configPath(projectRoot);
  if (!existsSync(p)) return structuredClone(DEFAULTS);
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8'));
    return mergeWithDefaults(raw);
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export async function saveStorylineConfig(config, projectRoot = process.cwd()) {
  const dir = resolve(projectRoot, '.storyline');
  await mkdir(dir, { recursive: true });
  await writeFile(configPath(projectRoot), JSON.stringify(config, null, 2));
}

export function mergeWithDefaults(partial) {
  return {
    ...DEFAULTS,
    ...partial,
    ai: { ...DEFAULTS.ai, ...(partial?.ai || {}) },
  };
}

// Dotted-path get/set so the CLI can do `storyline config set ai.quality premium`
export function getConfigValue(config, dottedKey) {
  const parts = dottedKey.split('.');
  let cur = config;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

export function setConfigValue(config, dottedKey, value) {
  const parts = dottedKey.split('.');
  const last = parts.pop();
  let cur = config;
  for (const part of parts) {
    if (cur[part] == null || typeof cur[part] !== 'object') cur[part] = {};
    cur = cur[part];
  }
  cur[last] = value;
  return config;
}

export const VALID_QUALITY_MODES = ['economy', 'balanced', 'premium'];
