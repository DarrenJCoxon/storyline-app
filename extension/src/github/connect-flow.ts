import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { GitHubAuth } from './auth.js';
import { GitHubApi, RepoVisibility, HttpError } from './api.js';
import { writeGitConfig, suggestRepoName, GitConfig } from './config.js';
import { ensureRepo, setRemote, checkoutBranch, getCurrentBranch } from './git.js';
import { ensureGitignore } from './gitignore.js';

// First-run flow: connect → name repo → pick visibility → optionally
// invite collaborators → init local git → create remote → wire it up.
// Idempotent enough that the writer can re-run if any step fails.

export async function runConnectFlow(
  context: vscode.ExtensionContext,
  workspaceRoot: vscode.Uri,
  auth: GitHubAuth,
): Promise<GitConfig | null> {
  // Step 1: auth (Device Flow)
  let token = await auth.getToken();
  if (!token) {
    const user = await auth.connect();
    if (!user) return null;
    token = await auth.getToken();
    if (!token) return null;
  }
  const user = await auth.getStoredUser();
  if (!user) {
    vscode.window.showErrorMessage('Storyline: GitHub user lookup failed. Try disconnecting and reconnecting.');
    return null;
  }

  // Step 2: repo name (suggested, editable)
  const suggested = suggestRepoName(workspaceRoot);
  const repoName = await vscode.window.showInputBox({
    title: 'Storyline → GitHub: repository name',
    prompt: 'Name for the GitHub repository. Letters, numbers, hyphens, underscores only.',
    value: suggested,
    validateInput: (val) => {
      if (!/^[a-zA-Z0-9._-]+$/.test(val)) return 'Letters, numbers, dots, hyphens, underscores only.';
      if (val.length > 100) return 'Too long.';
      return null;
    },
  });
  if (!repoName) return null;

  // Step 3: visibility
  const visibility = await pickVisibility();
  if (!visibility) return null;

  // Step 4: collaborators (optional, only meaningful for non-public)
  let collaborators: string[] = [];
  if (visibility !== 'public') {
    collaborators = await collectCollaborators();
  }

  // Step 5: branch (default main, editable)
  const branch = await vscode.window.showInputBox({
    title: 'Storyline → GitHub: default branch',
    prompt: 'Branch to push to. Most writers stick with "main"; pick a draft branch if you want.',
    value: 'main',
    validateInput: (val) => /^[a-zA-Z0-9._/-]+$/.test(val) ? null : 'Invalid branch name.',
  });
  if (!branch) return null;

  // Step 6: provision remote + local
  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Storyline: setting up GitHub sync…',
    },
    async (progress) => {
      const api = new GitHubApi(token!);

      progress.report({ message: 'Checking repo name availability…' });
      let actualName = repoName;
      const existing = await api.getRepo(user.login, repoName).catch(() => null);
      if (existing) {
        // Disambiguate by suffix.
        for (let i = 2; i < 100; i++) {
          const candidate = `${repoName}-${i}`;
          const found = await api.getRepo(user.login, candidate).catch(() => null);
          if (!found) { actualName = candidate; break; }
        }
        vscode.window.showInformationMessage(
          `Storyline: "${repoName}" already exists on your GitHub. Using "${actualName}" instead.`,
        );
      }

      progress.report({ message: `Creating ${visibility} repository ${actualName}…` });
      const repo = await api.createRepo(actualName, visibility);

      if (collaborators.length > 0) {
        progress.report({ message: 'Sending collaborator invites…' });
        for (const username of collaborators) {
          try {
            await api.addCollaborator(user.login, actualName, username, 'push');
          } catch (err) {
            const msg = err instanceof HttpError ? err.message : String(err);
            vscode.window.showWarningMessage(`Storyline: couldn't invite ${username} — ${msg}`);
          }
        }
      }

      progress.report({ message: 'Initialising local git…' });
      await ensureGitignore(workspaceRoot.fsPath);
      await ensureRepo(workspaceRoot.fsPath, branch);
      const current = await getCurrentBranch(workspaceRoot.fsPath);
      if (current !== branch) {
        await checkoutBranch(workspaceRoot.fsPath, branch);
      }
      await setRemote(workspaceRoot.fsPath, repo.clone_url);

      const config: GitConfig = {
        remote: repo.clone_url,
        owner: user.login,
        repo: actualName,
        branch,
        visibility,
        autoSync: true,
      };
      await writeGitConfig(workspaceRoot, config);

      vscode.window.showInformationMessage(
        `Storyline: connected to ${repo.full_name}. Auto-sync is on.`,
      );
      return config;
    },
  );
}

async function pickVisibility(): Promise<RepoVisibility | null> {
  interface Item extends vscode.QuickPickItem {
    value: RepoVisibility;
  }
  const items: Item[] = [
    {
      label: '$(lock) Private',
      description: 'Only you can access. Recommended.',
      detail: 'Best for active drafts. You can invite specific collaborators later.',
      value: 'private',
    },
    {
      label: '$(globe) Public',
      description: 'Anyone on the internet can read.',
      detail: 'Useful for finished, openly shared work. Switch back any time.',
      value: 'public',
    },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Storyline → GitHub: who can see this project?',
    placeHolder: 'Pick a visibility level for the new repository',
    ignoreFocusOut: true,
  });
  return picked?.value ?? null;
}

// Collects zero-or-more GitHub usernames to invite as collaborators.
// Comma-separated input; trims whitespace and dedupes.
async function collectCollaborators(): Promise<string[]> {
  const raw = await vscode.window.showInputBox({
    title: 'Storyline → GitHub: collaborators (optional)',
    prompt: 'Comma-separated GitHub usernames to invite (e.g. publisher, editor). Leave blank to skip.',
    placeHolder: 'e.g. agent-jane, publisher-bob',
    value: '',
  });
  if (!raw) return [];
  const set = new Set(
    raw.split(',')
      .map(s => s.trim())
      .filter(s => /^[a-zA-Z0-9-]+$/.test(s)),
  );
  return [...set];
}

// Used by extension activation to prompt the writer to set up sync if
// they haven't yet. Non-blocking; one-shot per session.
export async function maybeOfferConnect(
  context: vscode.ExtensionContext,
  workspaceRoot: vscode.Uri,
  auth: GitHubAuth,
): Promise<void> {
  // Skip if already configured.
  const configFile = path.join(workspaceRoot.fsPath, '.storyline', 'git.json');
  try {
    await fs.access(configFile);
    return;
  } catch { /* not configured, fine */ }

  const CONNECT = 'Connect GitHub';
  const LATER = 'Later';
  const NEVER = 'Don\'t Ask Again';
  const choice = await vscode.window.showInformationMessage(
    'Storyline can sync this project to a private GitHub repository for backup, version history, and sharing. Want to set it up now?',
    CONNECT, LATER, NEVER,
  );
  if (choice === CONNECT) {
    await runConnectFlow(context, workspaceRoot, auth);
  } else if (choice === NEVER) {
    await context.workspaceState.update('storyline.github.declinedConnect', true);
  }
}

export function hasDeclinedConnect(context: vscode.ExtensionContext): boolean {
  return !!context.workspaceState.get<boolean>('storyline.github.declinedConnect');
}
