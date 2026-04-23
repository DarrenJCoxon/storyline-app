import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import {
  loadStorylineConfig,
  saveStorylineConfig,
  getConfigValue,
  setConfigValue,
  mergeWithDefaults,
  VALID_QUALITY_MODES,
} from '../lib/config/storyline-config.js';

let tmpRoot;
beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'storyline-config-test-'));
});
afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('loadStorylineConfig', () => {
  it('returns defaults when no config file exists', () => {
    const cfg = loadStorylineConfig(tmpRoot);
    expect(cfg.ai.quality).toBe('balanced');
  });

  it('merges partial config with defaults so missing fields stay defined', () => {
    const storylineDir = resolve(tmpRoot, '.storyline');
    require('fs').mkdirSync(storylineDir, { recursive: true });
    writeFileSync(resolve(storylineDir, 'config.json'), JSON.stringify({ ai: {} }));
    const cfg = loadStorylineConfig(tmpRoot);
    expect(cfg.ai.quality).toBe('balanced');
  });

  it('returns defaults when config is malformed JSON rather than throwing', () => {
    const storylineDir = resolve(tmpRoot, '.storyline');
    require('fs').mkdirSync(storylineDir, { recursive: true });
    writeFileSync(resolve(storylineDir, 'config.json'), 'this is not json');
    const cfg = loadStorylineConfig(tmpRoot);
    expect(cfg.ai.quality).toBe('balanced');
  });
});

describe('saveStorylineConfig', () => {
  it('writes .storyline/config.json with the given config', async () => {
    const cfg = { ai: { quality: 'premium' } };
    await saveStorylineConfig(cfg, tmpRoot);
    const written = JSON.parse(readFileSync(resolve(tmpRoot, '.storyline', 'config.json'), 'utf-8'));
    expect(written.ai.quality).toBe('premium');
  });
});

describe('getConfigValue / setConfigValue (dotted keys)', () => {
  it('reads nested values by dotted key', () => {
    const cfg = mergeWithDefaults({ ai: { quality: 'economy' } });
    expect(getConfigValue(cfg, 'ai.quality')).toBe('economy');
  });

  it('returns undefined for missing keys', () => {
    const cfg = mergeWithDefaults({});
    expect(getConfigValue(cfg, 'nonexistent.key')).toBeUndefined();
  });

  it('sets nested values, creating intermediate objects as needed', () => {
    const cfg = mergeWithDefaults({});
    setConfigValue(cfg, 'ai.quality', 'premium');
    expect(cfg.ai.quality).toBe('premium');
    setConfigValue(cfg, 'deeply.nested.new.key', 42);
    expect(cfg.deeply.nested.new.key).toBe(42);
  });
});

describe('VALID_QUALITY_MODES', () => {
  it('exposes the three supported modes', () => {
    expect(VALID_QUALITY_MODES).toEqual(['economy', 'balanced', 'premium']);
  });
});
