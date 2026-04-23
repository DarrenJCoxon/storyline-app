// Configure the odd-flow MCP server across all three harnesses.
//
// Writers' memory entries (plan progress, manuscript snapshots, research
// resolutions) can only persist long-term through this server — the
// skills are required to push every memory entry to odd-flow as part of
// their durability contract. We wire it up at init time so `/storyline`
// and `/follow-up` can use it on first invocation.
//
// Config-format differences per harness:
//
//   Claude Code   → <project>/.mcp.json
//     { mcpServers: { "odd-flow": { type:"stdio", command:"npx",
//                                    args:["-y","odd-flow@latest","mcp","start"] } } }
//
//   OpenCode      → <project>/opencode.json
//     { mcp: { "odd-flow": { type:"local",
//                            command:["npx","-y","odd-flow@latest","mcp","start"],
//                            enabled:true } } }
//
//   Codex         → ~/.codex/config.toml (USER SCOPE — required)
//                 + <project>/plugins/storyline/.mcp.json (plugin-scope, belt-and-braces)
//
//     Codex loads MCP servers from [mcp_servers.<name>] sections in
//     ~/.codex/config.toml. Plugin-scoped .mcp.json is only picked up
//     when the plugin is marketplace-registered (which our beta skips).
//     We therefore write BOTH: the user-scope TOML guarantees odd-flow
//     loads; the plugin .mcp.json is kept for future marketplace use.
//
// All writers are merge-safe: existing config is preserved, we only
// add odd-flow if absent. Malformed files get backed up before we
// rewrite — we never silently destroy a writer's manual config.

import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { homedir } from 'os';

// Canonical odd-flow invocation. Note the `mcp start` subcommand —
// earlier Storyline releases shipped `npx -y odd-flow@latest` with no
// subcommand, which relied on odd-flow guessing an MCP start from argv.
// The explicit form matches odd-studio's setup and is the canonical
// invocation per odd-flow's CLI.
const ODD_FLOW_PACKAGE = 'odd-flow@latest';
const ODD_FLOW_ARGS = ['-y', ODD_FLOW_PACKAGE, 'mcp', 'start'];

const CLAUDE_ENTRY = {
  type: 'stdio',
  command: 'npx',
  args: ODD_FLOW_ARGS,
  env: {},
};

const OPENCODE_ENTRY = {
  type: 'local',
  command: ['npx', ...ODD_FLOW_ARGS],
  enabled: true,
};

// Codex plugins use the same shape as Claude Code's .mcp.json
const CODEX_ENTRY = CLAUDE_ENTRY;

function readJsonSafe(path) {
  if (!existsSync(path)) return { data: null, existed: false, corrupt: false };
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return { data, existed: true, corrupt: false };
  } catch {
    return { data: null, existed: true, corrupt: true };
  }
}

function backupCorrupt(path) {
  const backup = `${path}.corrupt-${Date.now()}`;
  try { copyFileSync(path, backup); } catch { /* best-effort */ }
  return backup;
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

export default function setupMcp({ isClaude, isOpenCode, isCodex }, targetDir, { log } = {}) {
  const logFn = log || (() => {});
  const results = {
    claude: null,
    opencode: null,
    codex: null,
  };

  if (isClaude) {
    results.claude = writeClaudeMcp(targetDir, logFn);
  }
  if (isOpenCode) {
    results.opencode = writeOpenCodeMcp(targetDir, logFn);
  }
  if (isCodex) {
    results.codex = writeCodexMcp(targetDir, logFn);
    // User-scope TOML is the ACTUAL load mechanism for Codex MCP servers.
    // Without it Codex won't see odd-flow regardless of the plugin.
    results.codexUserToml = writeCodexUserToml(logFn);
  }

  return results;
}

function writeClaudeMcp(targetDir, log) {
  const path = resolve(targetDir, '.mcp.json');
  const { data, existed, corrupt } = readJsonSafe(path);

  let config = { mcpServers: {} };
  let backedUp = null;

  if (corrupt) {
    backedUp = backupCorrupt(path);
  } else if (existed) {
    config = data;
    if (!config.mcpServers) config.mcpServers = {};
  }

  if (config.mcpServers['odd-flow']) {
    log('odd-flow already registered in .mcp.json');
    return { path, changed: false, backedUp };
  }

  config.mcpServers['odd-flow'] = CLAUDE_ENTRY;
  writeJson(path, config);
  log(`Registered odd-flow in .mcp.json${existed ? ' (merged into existing config)' : ''}`);
  return { path, changed: true, backedUp };
}

function writeOpenCodeMcp(targetDir, log) {
  const path = resolve(targetDir, 'opencode.json');
  const { data, existed, corrupt } = readJsonSafe(path);

  let config = {};
  let backedUp = null;

  if (corrupt) {
    backedUp = backupCorrupt(path);
  } else if (existed) {
    config = data;
  }
  if (!config.mcp) config.mcp = {};

  if (config.mcp['odd-flow']) {
    log('odd-flow already registered in opencode.json');
    return { path, changed: false, backedUp };
  }

  config.mcp['odd-flow'] = OPENCODE_ENTRY;
  writeJson(path, config);
  log(`Registered odd-flow in opencode.json${existed ? ' (merged into existing config)' : ''}`);
  return { path, changed: true, backedUp };
}

function writeCodexMcp(targetDir, log) {
  const path = resolve(targetDir, 'plugins', 'storyline', '.mcp.json');
  const { data, existed, corrupt } = readJsonSafe(path);

  let config = { mcpServers: {} };
  let backedUp = null;

  if (corrupt) {
    backedUp = backupCorrupt(path);
  } else if (existed) {
    config = data;
    if (!config.mcpServers) config.mcpServers = {};
  }

  if (config.mcpServers['odd-flow']) {
    log('odd-flow already registered in plugins/storyline/.mcp.json');
    return { path, changed: false, backedUp };
  }

  config.mcpServers['odd-flow'] = CODEX_ENTRY;
  writeJson(path, config);
  log(`Registered odd-flow in plugins/storyline/.mcp.json`);
  return { path, changed: true, backedUp };
}

// Append odd-flow to ~/.codex/config.toml if not already present.
//
// We don't parse full TOML (would need a dep for one feature); instead
// we look for the exact section heading `[mcp_servers.odd-flow]` and
// append the section if missing. If the writer has manually configured
// a differently-keyed odd-flow entry we'll leave theirs alone.
//
// Returns { path, changed, reason } so callers can report back.
// Reasons:
//   'written'        — section added to existing file
//   'created'        — config.toml didn't exist, we created it
//   'already-set'    — [mcp_servers.odd-flow] already present, no change
//   'codex-missing'  — ~/.codex/ doesn't exist; Codex isn't installed
//   'error'          — file read/write failed
export function writeCodexUserToml(log = () => {}, { home = homedir() } = {}) {
  const codexDir = join(home, '.codex');
  const configPath = join(codexDir, 'config.toml');

  if (!existsSync(codexDir)) {
    log(`~/.codex/ doesn't exist — skipping user-scope odd-flow registration`);
    return { path: configPath, changed: false, reason: 'codex-missing' };
  }

  let existing = '';
  let existed = false;
  if (existsSync(configPath)) {
    existed = true;
    try {
      existing = readFileSync(configPath, 'utf-8');
    } catch {
      return { path: configPath, changed: false, reason: 'error' };
    }
  }

  // Idempotency: skip if the section already exists. The regex is
  // line-anchored so we don't falsely match the substring inside a
  // comment or string.
  if (/^\[mcp_servers\.odd-flow\]\s*$/m.test(existing)) {
    log(`odd-flow already in ~/.codex/config.toml`);
    return { path: configPath, changed: false, reason: 'already-set' };
  }

  // Append the section, leaving whatever the writer had before intact.
  // Leading newline guards against appending without separation from a
  // prior section that didn't end with one.
  const addition = [
    '',
    '# Added by storyline-vsc init — odd-flow MCP server for durable',
    '# memory. Remove this section if you no longer use Storyline.',
    '[mcp_servers.odd-flow]',
    'command = "npx"',
    'args = ["-y", "odd-flow@latest", "mcp", "start"]',
    '',
  ].join('\n');

  try {
    writeFileSync(configPath, existing + addition);
    log(`Registered odd-flow in ~/.codex/config.toml${existed ? ' (appended)' : ' (created)'}`);
    return { path: configPath, changed: true, reason: existed ? 'written' : 'created' };
  } catch {
    return { path: configPath, changed: false, reason: 'error' };
  }
}

export { CLAUDE_ENTRY, OPENCODE_ENTRY, CODEX_ENTRY, ODD_FLOW_ARGS };
