// Install the bundled Storyline VS Code extension (.vsix) into the
// editor the writer is actually using.
//
// We must NOT rely on whatever `code` resolves to on PATH — a user
// with both VS Code and Cursor installed will typically have `code`
// pointing at whichever editor ran "Install 'code' command in PATH"
// last, which is usually NOT the one they're drafting in. Instead we
// locate the CLI specific to the editor that owns this integrated
// terminal via the VSCODE_GIT_ASKPASS_NODE env var — that path always
// lives inside the editor's own app bundle.
//
// After a successful install we run two extra safety steps:
//   1. Verify via `--list-extensions` that the extension actually
//      registered. An install that exits 0 but leaves the extension
//      absent is the worst kind of silent failure; we catch it here.
//   2. Reload the window via `--command workbench.action.reloadWindow`
//      if we confirmed we're inside that editor's terminal. The
//      `workspaceContains:` activation only re-evaluates on workspace
//      open, so post-init a reload is required for the custom editor
//      to take over .md files and the context menu to appear.

import { existsSync, readdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { spawnSync } from 'child_process';

const EXTENSION_ID = 'darrenjcoxon.storyline-extension';

// Predecessor extension IDs that we should remove if found. Storyline
// was previously published as 'novel-writer-vscode' under the same
// publisher; writers who migrated by re-running init end up with both
// installed, producing duplicate context-menu entries ("Novel Writer:
// Open in Rich Editor" alongside "Storyline: Open in Rich Editor").
// We uninstall the legacy IDs after successfully installing the
// current one.
const LEGACY_EXTENSION_IDS = [
  'darrenjcoxon.novel-writer-vscode',
];

export default function installVSCodeExtension(packageRoot, { log } = {}) {
  const logFn = log || (() => {});
  const vsixPath = findBundledVsix(packageRoot);
  const editor = resolveEditorCLI();

  if (!vsixPath) {
    logFn({ outcome: 'no-vsix', editor });
    return { outcome: 'no-vsix', editor, vsixPath: null, willReload: false };
  }

  const installOutcome = tryInstallVsix(vsixPath, editor);

  if (installOutcome === 'ok') {
    const registered = isExtensionRegistered(EXTENSION_ID, editor);
    if (registered) {
      // Sweep up any legacy predecessor extensions before reload —
      // best-effort, doesn't affect main install outcome on failure.
      const removed = removeLegacyExtensions(editor);
      const willReload = editor.source === 'env';
      logFn({ outcome: 'ok', editor, vsixPath, willReload, legacyRemoved: removed });
      return { outcome: 'ok', editor, vsixPath, willReload, legacyRemoved: removed };
    }
    logFn({ outcome: 'not-registered', editor, vsixPath });
    return { outcome: 'not-registered', editor, vsixPath, willReload: false };
  }

  logFn({ outcome: installOutcome, editor, vsixPath });
  return { outcome: installOutcome, editor, vsixPath, willReload: false };
}

// Uninstall any legacy Storyline-predecessor extensions that are still
// registered with the editor. Returns the list of IDs that were
// actually removed (i.e. were present before, absent after) — empty
// array if nothing legacy was found.
export function removeLegacyExtensions(editor) {
  const removed = [];
  for (const id of LEGACY_EXTENSION_IDS) {
    if (!isExtensionRegistered(id, editor)) continue;
    const result = spawnSync(editor.path, ['--uninstall-extension', id], { stdio: 'ignore' });
    // VS Code's uninstall returns 0 even when the ID isn't registered,
    // so we re-check after to confirm.
    if (result.status === 0 && !isExtensionRegistered(id, editor)) {
      removed.push(id);
    }
  }
  return removed;
}

// ── helpers ──────────────────────────────────────────────────────

export function findBundledVsix(packageRoot) {
  const vsixDir = resolve(packageRoot, 'vscode-extension');
  if (!existsSync(vsixDir)) return null;
  const files = readdirSync(vsixDir).filter(f => f.startsWith('storyline-extension-') && f.endsWith('.vsix'));
  if (files.length === 0) return null;
  files.sort().reverse(); // Prefer highest version if multiple exist
  return resolve(vsixDir, files[0]);
}

export function resolveEditorCLI() {
  const askpassNode = process.env.VSCODE_GIT_ASKPASS_NODE;
  if (askpassNode) {
    const editorInfo = extractEditorFromPath(askpassNode);
    if (editorInfo) return { ...editorInfo, source: 'env' };
  }
  return { path: 'code', name: 'editor', source: 'path' };
}

function extractEditorFromPath(p) {
  // macOS
  const macMatch = p.match(/^(.+?\/([^/]+)\.app)\//);
  if (macMatch) {
    const appPath = macMatch[1];
    const appName = macMatch[2];
    const binDir = join(appPath, 'Contents', 'Resources', 'app', 'bin');
    return findCliInBinDir(binDir, appName);
  }
  // Windows/Linux — walk up from askpass-node looking for a sibling bin/
  let dir = dirname(p);
  for (let i = 0; i < 6; i++) {
    const binDir = join(dir, 'bin');
    if (existsSync(binDir)) {
      const hit = findCliInBinDir(binDir, null);
      if (hit) return hit;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function findCliInBinDir(binDir, editorHint) {
  if (!existsSync(binDir)) return null;
  const candidates = [
    { bin: 'code', name: 'VS Code', appHint: /Visual Studio Code/ },
    { bin: 'code-insiders', name: 'VS Code Insiders', appHint: /Code.*Insiders/ },
    { bin: 'cursor', name: 'Cursor', appHint: /Cursor/ },
    { bin: 'codium', name: 'VSCodium', appHint: /VSCodium|Codium/ },
    { bin: 'windsurf', name: 'Windsurf', appHint: /Windsurf/ },
  ];
  // Prefer the CLI matching the app bundle — avoids Cursor's shadow `code`
  if (editorHint) {
    const preferred = candidates.find(c => c.appHint.test(editorHint));
    if (preferred) {
      const direct = join(binDir, preferred.bin);
      if (existsSync(direct)) return { path: direct, name: preferred.name };
      const directCmd = join(binDir, `${preferred.bin}.cmd`);
      if (existsSync(directCmd)) return { path: directCmd, name: preferred.name };
    }
  }
  for (const c of candidates) {
    const direct = join(binDir, c.bin);
    if (existsSync(direct)) return { path: direct, name: c.name };
    const directCmd = join(binDir, `${c.bin}.cmd`);
    if (existsSync(directCmd)) return { path: directCmd, name: c.name };
  }
  return null;
}

export function tryInstallVsix(vsixPath, editor) {
  const probe = spawnSync(editor.path, ['--version'], { stdio: 'ignore' });
  if (probe.error && probe.error.code === 'ENOENT') return 'no-cli';
  if (probe.status !== 0) return 'error';

  const install = spawnSync(editor.path, ['--install-extension', vsixPath, '--force'], {
    stdio: 'ignore',
  });
  return install.status === 0 ? 'ok' : 'error';
}

export function isExtensionRegistered(extensionId, editor) {
  const result = spawnSync(editor.path, ['--list-extensions'], { encoding: 'utf-8' });
  if (result.error || result.status !== 0) return false;
  const installed = (result.stdout || '').split(/\r?\n/).map(s => s.trim().toLowerCase());
  return installed.includes(extensionId.toLowerCase());
}

export function requestEditorReload(editor) {
  if (editor.source !== 'env') return;
  try {
    spawnSync(editor.path, ['--command', 'workbench.action.reloadWindow'], {
      stdio: 'ignore',
      timeout: 3000,
    });
  } catch {
    // Best-effort.
  }
}

export function tryOpenFolder(dirPath) {
  // Skip the reveal when we're not driving an interactive terminal —
  // tests, CI pipelines, background scripts, and smoke-test loops
  // otherwise pop Finder/Explorer on every run, which is maddening.
  // The reveal exists to help a real human who couldn't auto-install;
  // if there's no human watching, there's no point firing it.
  if (!process.stdout.isTTY) return;
  if (process.env.CI) return;
  if (process.env.STORYLINE_NO_REVEAL) return;

  try {
    if (process.platform === 'darwin') {
      spawnSync('open', [dirPath], { stdio: 'ignore' });
    } else if (process.platform === 'win32') {
      spawnSync('explorer', [dirPath], { stdio: 'ignore' });
    } else {
      spawnSync('xdg-open', [dirPath], { stdio: 'ignore' });
    }
  } catch {
    // Best-effort.
  }
}

export { EXTENSION_ID };
