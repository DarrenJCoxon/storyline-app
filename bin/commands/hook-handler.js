// `storyline hook-handler` — invoked by Claude Code's hook system after
// (or before) tool calls that touch Storyline state. Reads the hook
// payload as JSON on stdin (Claude Code's documented hook contract);
// inspects the tool name, command, and file paths; runs the appropriate
// gate; emits a structured response to stdout that tells Claude Code
// whether to allow / deny / warn on the tool call.
//
// Hook contract (per Claude Code docs):
//   stdin: JSON { tool_name, tool_input, ... }
//   stdout: JSON { decision: "approve" | "block", reason: string } OR
//           empty for default-allow with optional stderr surface.
//
// Two modes wired by install-claude-hooks.js:
//
//   --mode post-bash-save
//     Fires after every `Bash` tool call. If the command was
//     `npx storyline-vsc save <stage>` (or `storyline save <stage>`),
//     run `verify-stage <stage>`. If verify fails, emit a "block"
//     decision so the writer / harness sees the failure loud.
//
//   --mode pre-write-doc
//     Fires before every `Write` or `Edit` tool call. If the file_path
//     matches `docs/<NN>-*.md` for a known stage pattern, run
//     `verify-stage <matchingStage>`. If state is empty, emit "block"
//     to refuse the write — backstops Layer 2's "save before compose"
//     ordering rule.

import { execSync } from 'child_process';
import { resolve } from 'path';

// Mirrors lib/doctor.js DOC_PATTERNS and bin/commands/reseed.js
// STAGE_DOC_PATTERNS — kept in sync deliberately. Maps a docs/-relative
// path to the stage it likely persists.
const DOC_TO_STAGE = [
  { match: /chapter[-_]flesh[-_]out/i, stageId: 'chapterOutline' },
  { match: /consistency[-_]critique|^\d*[-_]?critique/i, stageId: 'critique' },
  { match: /master[-_]doc(ument)?/i, stageId: 'masterDoc' },
  { match: /beat[-_]sheet/i, stageId: 'beatSheet' },
  { match: /protagonist/i, stageId: 'protagonist' },
  { match: /supporting[-_]cast|^\d*[-_]?characters/i, stageId: 'characters' },
  { match: /relationship/i, stageId: 'relationships' },
  { match: /logline/i, stageId: 'logline' },
  { match: /b[-_]story/i, stageId: 'bStory' },
  { match: /subplot/i, stageId: 'subplots' },
  { match: /scene[-_]outline/i, stageId: 'sceneOutline' },
  { match: /plot[-_]thread/i, stageId: 'plotThreads' },
];

function readStdinJson() {
  return new Promise((resolveP) => {
    let buf = '';
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => {
      try { resolveP(JSON.parse(buf)); }
      catch { resolveP(null); }
    });
    // If stdin closes immediately (no input), bail with empty.
    setTimeout(() => resolveP(null), 1000);
  });
}

function emitDecision(decision, reason, extra = {}) {
  // Claude Code's hook decision format. "block" prevents the tool call
  // from proceeding; "approve" lets it through with a notice. Empty
  // output means default behaviour (allow).
  const out = { decision, reason, ...extra };
  console.log(JSON.stringify(out));
  // Also surface the reason to stderr so it shows up in Claude Code's
  // tool-output panel even when stdout is parsed silently.
  if (decision === 'block') {
    console.error(`[storyline-hook] BLOCKED: ${reason}`);
  }
}

function findStorylineSaveStage(bashCommand) {
  if (!bashCommand) return null;
  // Match `storyline-vsc save <stage>` or `storyline save <stage>`,
  // optionally prefixed with `npx ` (with or without `-y`).
  const m = bashCommand.match(/storyline(?:-cli)?\s+save\s+([a-zA-Z]+)/);
  return m ? m[1] : null;
}

function findDocStageFromPath(filePath) {
  if (!filePath) return null;
  // Only fire on docs/<something>.md, not arbitrary paths.
  if (!/(?:^|\/)docs\/[^/]+\.md$/i.test(filePath)) return null;
  const basename = filePath.split('/').pop();
  for (const { match, stageId } of DOC_TO_STAGE) {
    if (match.test(basename)) return stageId;
  }
  return null;
}

function runVerifyStage(stageId, projectPath) {
  // Shell out to `node <self> verify-stage <stage> --json` so the
  // handler is a thin wrapper that always uses the same logic as the
  // CLI verb. Works regardless of whether storyline-vsc is on PATH.
  const cli = resolve(projectPath, 'node_modules', 'storyline-vsc', 'bin', 'storyline.js');
  // Fall back to the npx invocation if the local install isn't present.
  const cmd = `node ${JSON.stringify(cli)} verify-stage ${stageId} --json`;
  try {
    const out = execSync(cmd, { cwd: projectPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, exit: 0, stdout: out };
  } catch (e) {
    return { ok: false, exit: e.status || 2, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '' };
  }
}

function fallbackVerify(stageId, projectPath) {
  // If the local install isn't present, try `npx storyline-vsc verify-stage`.
  const cmd = `npx storyline-vsc verify-stage ${stageId} --json`;
  try {
    const out = execSync(cmd, { cwd: projectPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, exit: 0, stdout: out };
  } catch (e) {
    return { ok: false, exit: e.status || 2, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '' };
  }
}

function verify(stageId, projectPath) {
  let r = runVerifyStage(stageId, projectPath);
  if (r.exit === 1 && /Cannot find module|cannot open|ENOENT/i.test(r.stderr || '')) {
    r = fallbackVerify(stageId, projectPath);
  }
  return r;
}

async function handlePostBashSave(payload) {
  const cmd = payload?.tool_input?.command || '';
  const stageId = findStorylineSaveStage(cmd);
  if (!stageId) {
    // Not a storyline save. Allow.
    return;
  }
  const projectPath = process.cwd();
  const r = verify(stageId, projectPath);
  if (r.ok) {
    // Verification passed; let the harness know in stderr without blocking.
    console.error(`[storyline-hook] verified: ${stageId} committed cleanly`);
    return;
  }
  // Verify failed: surface the failure loud. Don't block (the save
  // already happened); just make sure the harness sees the gap.
  emitDecision('block', `storyline save ${stageId} did not produce a verifiable commit. Run \`npx storyline-vsc verify-stage ${stageId}\` to inspect. Either re-save with full data or run \`npx storyline-vsc reseed ${stageId}\`.`);
  process.exit(2);
}

async function handlePreWriteDoc(payload) {
  const filePath = payload?.tool_input?.file_path || payload?.tool_input?.path || '';
  const stageId = findDocStageFromPath(filePath);
  if (!stageId) return; // not a stage doc; allow.

  const projectPath = process.cwd();
  const r = verify(stageId, projectPath);
  if (r.ok) {
    // State is committed for this stage; doc write is allowed (it's the
    // "narrate from saved state" pattern this fix is designed to enable).
    return;
  }
  // State NOT committed. Refuse the write — this is the structural
  // backstop for Layer 2's "save before compose" rule.
  emitDecision('block',
    `Refusing write to ${filePath}: stage "${stageId}" has not been saved to .storyline/state.json yet. ` +
    `Per the /storyline skill's per-stage flow, save MUST happen before any docs/<NN>-*.md is written. ` +
    `Run \`npx storyline-vsc save ${stageId} '<json>'\` first, then retry the write.`,
  );
  process.exit(2);
}

async function main() {
  const mode = process.argv[2];
  const payload = await readStdinJson();
  if (!payload) {
    // No payload — nothing to gate. Allow.
    return;
  }
  if (mode === '--mode=post-bash-save' || mode === 'post-bash-save') {
    await handlePostBashSave(payload);
  } else if (mode === '--mode=pre-write-doc' || mode === 'pre-write-doc') {
    await handlePreWriteDoc(payload);
  } else {
    // Unknown mode — be safe and allow.
    return;
  }
}

main().catch((e) => {
  console.error(`[storyline-hook] handler error: ${e.message}`);
  // Don't block on handler crashes — that would brick the harness.
  process.exit(0);
});

// This file is loaded directly by Claude Code's hook runner via
// `node node_modules/storyline-vsc/bin/commands/hook-handler.js --mode=...`
// — it doesn't go through Commander.

// Provide a no-op register so it doesn't accidentally pollute the CLI
// surface if imported.
export function registerHookHandler() { /* intentionally empty */ }
