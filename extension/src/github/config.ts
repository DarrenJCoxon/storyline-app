import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

// Per-project GitHub sync config, persisted at .storyline/git.json.
// Holds the bare minimum needed to push to the right remote on the right
// branch — the auth token lives in SecretStorage, not here.

export interface GitConfig {
  remote: string;            // https URL: https://github.com/owner/repo.git
  owner: string;
  repo: string;
  branch: string;            // active branch — defaults to main but user can change
  visibility: 'private' | 'public';
  autoSync: boolean;         // master switch — set false to pause without disconnecting
  lastPush?: string;         // ISO timestamp of last successful push
  lastError?: string;        // last sync error, surfaced in status bar
}

const CONFIG_REL = path.join('.storyline', 'git.json');

export async function readGitConfig(workspaceRoot: vscode.Uri): Promise<GitConfig | null> {
  const file = path.join(workspaceRoot.fsPath, CONFIG_REL);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as GitConfig;
  } catch {
    return null;
  }
}

export async function writeGitConfig(workspaceRoot: vscode.Uri, config: GitConfig): Promise<void> {
  const file = path.join(workspaceRoot.fsPath, CONFIG_REL);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export async function deleteGitConfig(workspaceRoot: vscode.Uri): Promise<void> {
  const file = path.join(workspaceRoot.fsPath, CONFIG_REL);
  try { await fs.unlink(file); } catch { /* not present */ }
}

// Used during connect — derives a sensible default repo name from the
// project folder. Lowercased, hyphenated, alphanumerics only.
export function suggestRepoName(workspaceRoot: vscode.Uri): string {
  const base = path.basename(workspaceRoot.fsPath);
  return base.toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'storyline-project';
}
