import * as vscode from 'vscode';

// Per-project backup configuration lives at .storyline/settings.json.
// Separate file from state.json (which holds planning state) so the
// harness side never has to touch VS-Code-specific config.

export interface BackupSettings {
  path: string;               // absolute path to the backup root folder
  maxSnapshots: number;       // rotation cap — oldest pruned first
}

export interface StorylineSettings {
  backup?: BackupSettings;
}

const DEFAULT_MAX_SNAPSHOTS = 30;

function settingsUri(workspaceRoot: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(workspaceRoot, '.storyline', 'settings.json');
}

export async function readSettings(workspaceRoot: vscode.Uri): Promise<StorylineSettings> {
  try {
    const bytes = await vscode.workspace.fs.readFile(settingsUri(workspaceRoot));
    const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeSettings(
  workspaceRoot: vscode.Uri,
  settings: StorylineSettings,
): Promise<void> {
  const folder = vscode.Uri.joinPath(workspaceRoot, '.storyline');
  try { await vscode.workspace.fs.createDirectory(folder); } catch { /* exists */ }
  const content = JSON.stringify(settings, null, 2) + '\n';
  await vscode.workspace.fs.writeFile(settingsUri(workspaceRoot), new TextEncoder().encode(content));
}

export async function readBackupSettings(workspaceRoot: vscode.Uri): Promise<BackupSettings | null> {
  const settings = await readSettings(workspaceRoot);
  const b = settings.backup;
  if (!b || typeof b.path !== 'string' || !b.path.trim()) return null;
  return {
    path: b.path,
    maxSnapshots: typeof b.maxSnapshots === 'number' && b.maxSnapshots > 0
      ? Math.floor(b.maxSnapshots)
      : DEFAULT_MAX_SNAPSHOTS,
  };
}

export async function writeBackupPath(workspaceRoot: vscode.Uri, backupPath: string): Promise<void> {
  const current = await readSettings(workspaceRoot);
  const next: StorylineSettings = {
    ...current,
    backup: {
      path: backupPath,
      maxSnapshots: current.backup?.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS,
    },
  };
  await writeSettings(workspaceRoot, next);
}
