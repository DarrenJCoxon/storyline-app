// Install Storyline's drift-check hooks into a project's
// .claude/settings.json. Auto-invoked by `storyline-cli init` for
// Claude-Code-detected projects. Idempotent: leaves existing user
// customisations alone, only adds our two hook entries if missing.
//
// Two hooks installed:
//
//   PostToolUse on Bash — fires after every Bash tool call. The
//   handler script (bin/commands/hook-handler.js) inspects the command
//   and if it was `storyline-cli save <stage>`, runs verify-stage. If
//   verify fails, the hook surfaces the failure loud (stderr + block
//   decision).
//
//   PreToolUse on Write/Edit — fires before every Write or Edit. The
//   handler inspects the file_path; if it matches docs/<NN>-*.md for a
//   known stage pattern AND that stage's state slot is empty, the hook
//   REFUSES the write. This is the structural backstop for the
//   "save before compose" rule: the harness literally cannot write a
//   stage doc before saving.
//
// Together, the two hooks make Layer 2's ordering rule mechanically
// enforced on Claude Code, not just SKILL.md-instructed.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

// The handler is shipped inside the storyline-cli package and called
// via node — works whether the writer installs storyline-cli locally
// or invokes via npx. The hook command resolves the local install path
// at fire time so it survives package updates.
const POST_BASH_SAVE_HOOK = {
  matcher: 'Bash',
  hooks: [
    {
      type: 'command',
      command: 'node node_modules/storyline-cli/bin/commands/hook-handler.js --mode=post-bash-save',
    },
  ],
};

const PRE_WRITE_DOC_HOOK = {
  matcher: 'Write|Edit',
  hooks: [
    {
      type: 'command',
      command: 'node node_modules/storyline-cli/bin/commands/hook-handler.js --mode=pre-write-doc',
    },
  ],
};

// Marker we look for to detect "already installed" — keyed off the
// handler script path so writers can rename or move our hook config
// without us re-installing on every init.
const STORYLINE_HOOK_MARKER = 'storyline-cli/bin/commands/hook-handler.js';

function readSettings(settingsPath) {
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function alreadyInstalled(settings, eventName) {
  const eventArr = settings?.hooks?.[eventName];
  if (!Array.isArray(eventArr)) return false;
  for (const matcherEntry of eventArr) {
    for (const hook of (matcherEntry.hooks || [])) {
      if (typeof hook.command === 'string' && hook.command.includes(STORYLINE_HOOK_MARKER)) {
        return true;
      }
    }
  }
  return false;
}

function appendHook(settings, eventName, hookEntry) {
  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks[eventName])) settings.hooks[eventName] = [];
  settings.hooks[eventName].push(hookEntry);
  return settings;
}

export default function installClaudeHooks(targetDir, { log } = {}) {
  const logFn = log || (() => {});
  const settingsPath = resolve(targetDir, '.claude', 'settings.json');
  mkdirSync(dirname(settingsPath), { recursive: true });

  const settings = readSettings(settingsPath);
  let installedPost = false;
  let installedPre = false;

  if (!alreadyInstalled(settings, 'PostToolUse')) {
    appendHook(settings, 'PostToolUse', POST_BASH_SAVE_HOOK);
    installedPost = true;
  }
  if (!alreadyInstalled(settings, 'PreToolUse')) {
    appendHook(settings, 'PreToolUse', PRE_WRITE_DOC_HOOK);
    installedPre = true;
  }

  if (installedPost || installedPre) {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    if (installedPost) logFn('Installed Storyline drift-check hook (PostToolUse on Bash)');
    if (installedPre)  logFn('Installed Storyline drift-check hook (PreToolUse on Write/Edit)');
    logFn('  ↳ disable any time by editing .claude/settings.json');
  } else {
    logFn('Storyline drift-check hooks already present in .claude/settings.json');
  }

  return { installedPost, installedPre, settingsPath };
}
