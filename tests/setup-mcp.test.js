// MCP config writer tests — each harness has its own on-disk shape.
// These tests lock down the shape so refactors can't accidentally
// change it (different root key, different command/args form, etc.).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, join } from 'path';
import setupMcp, { writeCodexUserToml } from '../scripts/setup-mcp.js';

describe('setupMcp — Claude Code config', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-mcp-claude-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('writes .mcp.json with mcpServers.odd-flow and the mcp start subcommand', () => {
    setupMcp({ isClaude: true }, tmp);
    const cfg = JSON.parse(readFileSync(resolve(tmp, '.mcp.json'), 'utf-8'));
    expect(cfg.mcpServers['odd-flow']).toBeDefined();
    expect(cfg.mcpServers['odd-flow'].command).toBe('npx');
    expect(cfg.mcpServers['odd-flow'].args).toEqual(['-y', 'odd-flow@latest', 'mcp', 'start']);
    expect(cfg.mcpServers['odd-flow'].type).toBe('stdio');
  });

  it('preserves existing mcpServers', () => {
    writeFileSync(resolve(tmp, '.mcp.json'), JSON.stringify({
      mcpServers: { 'other-server': { command: 'node', args: ['x'] } },
    }, null, 2));
    setupMcp({ isClaude: true }, tmp);
    const cfg = JSON.parse(readFileSync(resolve(tmp, '.mcp.json'), 'utf-8'));
    expect(cfg.mcpServers['other-server']).toBeDefined();
    expect(cfg.mcpServers['odd-flow']).toBeDefined();
  });

  it('is idempotent — second run does not overwrite odd-flow entry', () => {
    setupMcp({ isClaude: true }, tmp);
    const first = readFileSync(resolve(tmp, '.mcp.json'), 'utf-8');
    setupMcp({ isClaude: true }, tmp);
    const second = readFileSync(resolve(tmp, '.mcp.json'), 'utf-8');
    expect(second).toBe(first);
  });

  it('backs up a corrupt .mcp.json before rewriting', () => {
    writeFileSync(resolve(tmp, '.mcp.json'), 'not valid json {{{');
    setupMcp({ isClaude: true }, tmp);
    const backups = require('fs').readdirSync(tmp).filter(f => f.startsWith('.mcp.json.corrupt-'));
    expect(backups.length).toBe(1);
  });
});

describe('setupMcp — OpenCode config', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-mcp-oc-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('writes opencode.json with mcp.odd-flow in the OpenCode-specific shape', () => {
    setupMcp({ isOpenCode: true }, tmp);
    const cfg = JSON.parse(readFileSync(resolve(tmp, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp['odd-flow']).toBeDefined();
    // OpenCode uses `command` as an array, not split command/args
    expect(Array.isArray(cfg.mcp['odd-flow'].command)).toBe(true);
    expect(cfg.mcp['odd-flow'].command).toEqual(['npx', '-y', 'odd-flow@latest', 'mcp', 'start']);
    expect(cfg.mcp['odd-flow'].type).toBe('local');
    expect(cfg.mcp['odd-flow'].enabled).toBe(true);
  });

  it('uses "mcp" root key, not "mcpServers"', () => {
    setupMcp({ isOpenCode: true }, tmp);
    const cfg = JSON.parse(readFileSync(resolve(tmp, 'opencode.json'), 'utf-8'));
    expect(cfg.mcp).toBeDefined();
    expect(cfg.mcpServers).toBeUndefined();
  });

  it('preserves other OpenCode config keys', () => {
    writeFileSync(resolve(tmp, 'opencode.json'), JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      mcp: { 'existing-server': { type: 'local', command: ['x'], enabled: true } },
    }));
    setupMcp({ isOpenCode: true }, tmp);
    const cfg = JSON.parse(readFileSync(resolve(tmp, 'opencode.json'), 'utf-8'));
    expect(cfg.model).toBe('anthropic/claude-sonnet-4');
    expect(cfg.mcp['existing-server']).toBeDefined();
    expect(cfg.mcp['odd-flow']).toBeDefined();
  });
});

describe('setupMcp — Codex config', () => {
  let tmp;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'nw-mcp-codex-'));
    mkdirSync(resolve(tmp, 'plugins', 'storyline'), { recursive: true });
  });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('writes plugins/storyline/.mcp.json with Claude-compatible shape', () => {
    setupMcp({ isCodex: true }, tmp);
    const cfg = JSON.parse(readFileSync(resolve(tmp, 'plugins', 'storyline', '.mcp.json'), 'utf-8'));
    expect(cfg.mcpServers['odd-flow']).toBeDefined();
    expect(cfg.mcpServers['odd-flow'].args).toEqual(['-y', 'odd-flow@latest', 'mcp', 'start']);
    expect(cfg.mcpServers['odd-flow'].type).toBe('stdio');
  });

  it('creates plugins/storyline directory if missing', () => {
    const bareDir = mkdtempSync(join(tmpdir(), 'nw-mcp-codex-bare-'));
    setupMcp({ isCodex: true }, bareDir);
    expect(existsSync(resolve(bareDir, 'plugins', 'storyline', '.mcp.json'))).toBe(true);
    rmSync(bareDir, { recursive: true, force: true });
  });
});

describe('writeCodexUserToml — ~/.codex/config.toml', () => {
  let fakeHome;

  beforeEach(() => {
    fakeHome = mkdtempSync(join(tmpdir(), 'nw-codex-home-'));
  });
  afterEach(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('skips if ~/.codex/ does not exist (Codex not installed)', () => {
    const r = writeCodexUserToml(() => {}, { home: fakeHome });
    expect(r.reason).toBe('codex-missing');
    expect(r.changed).toBe(false);
  });

  it('creates config.toml if ~/.codex/ exists but config.toml does not', () => {
    mkdirSync(join(fakeHome, '.codex'));
    const r = writeCodexUserToml(() => {}, { home: fakeHome });
    expect(r.reason).toBe('created');
    expect(r.changed).toBe(true);
    const contents = readFileSync(r.path, 'utf-8');
    expect(contents).toContain('[mcp_servers.odd-flow]');
    expect(contents).toContain('command = "npx"');
    expect(contents).toMatch(/args = \[.*"odd-flow@latest".*"mcp".*"start".*\]/);
  });

  it('appends to an existing config.toml, preserving original content', () => {
    mkdirSync(join(fakeHome, '.codex'));
    const original = 'model = "gpt-5.4"\n\n[mcp_servers.other]\ncommand = "foo"\n';
    writeFileSync(join(fakeHome, '.codex', 'config.toml'), original);
    const r = writeCodexUserToml(() => {}, { home: fakeHome });
    expect(r.reason).toBe('written');
    const contents = readFileSync(r.path, 'utf-8');
    expect(contents).toContain('model = "gpt-5.4"');
    expect(contents).toContain('[mcp_servers.other]');
    expect(contents).toContain('[mcp_servers.odd-flow]');
  });

  it('is idempotent — does not re-append when odd-flow already exists', () => {
    mkdirSync(join(fakeHome, '.codex'));
    const existing = '[mcp_servers.odd-flow]\ncommand = "npx"\nargs = ["-y", "odd-flow@latest", "mcp", "start"]\n';
    writeFileSync(join(fakeHome, '.codex', 'config.toml'), existing);
    const r = writeCodexUserToml(() => {}, { home: fakeHome });
    expect(r.reason).toBe('already-set');
    expect(r.changed).toBe(false);
    expect(readFileSync(r.path, 'utf-8')).toBe(existing);
  });
});

describe('setupMcp — multi-harness', () => {
  let tmp;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'nw-mcp-multi-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('writes all three config files when all flags are true', () => {
    setupMcp({ isClaude: true, isOpenCode: true, isCodex: true }, tmp);
    expect(existsSync(resolve(tmp, '.mcp.json'))).toBe(true);
    expect(existsSync(resolve(tmp, 'opencode.json'))).toBe(true);
    expect(existsSync(resolve(tmp, 'plugins', 'storyline', '.mcp.json'))).toBe(true);
  });

  it('writes only the configs requested', () => {
    setupMcp({ isClaude: true, isOpenCode: false, isCodex: false }, tmp);
    expect(existsSync(resolve(tmp, '.mcp.json'))).toBe(true);
    expect(existsSync(resolve(tmp, 'opencode.json'))).toBe(false);
    expect(existsSync(resolve(tmp, 'plugins', 'storyline', '.mcp.json'))).toBe(false);
  });
});
