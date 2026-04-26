import * as vscode from 'vscode';
import * as path from 'path';
import { GitHubAuth } from './auth.js';
import { GitHubApi, RepoVisibility } from './api.js';
import { GitHubSyncService } from './sync.js';
import { GitHubSyncStatusBar } from './status-bar.js';
import { runConnectFlow, maybeOfferConnect as _maybeOfferConnect } from './connect-flow.js';
import { readGitConfig, writeGitConfig, deleteGitConfig } from './config.js';
import { clone } from './git.js';

// Adapted signature: (context, auth, sync, statusBar)
// workspaceRoot is derived from the workspace folders at call time so
// commands always reflect the current workspace, consistent with the
// extension activation pattern.
export function registerGitHubCommands(
  context: vscode.ExtensionContext,
  auth: GitHubAuth,
  sync: GitHubSyncService | undefined,
  _statusBar?: GitHubSyncStatusBar,
): void {
  const getWorkspaceRoot = (): vscode.Uri | undefined =>
    vscode.workspace.workspaceFolders?.[0]?.uri;

  context.subscriptions.push(
    vscode.commands.registerCommand('storyline.github.connect', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) {
        vscode.window.showWarningMessage('Storyline: open a Storyline project folder first.');
        return;
      }
      await runConnectFlow(context, workspaceRoot, auth);
      await sync?.refreshConfiguredState();
    }),

    vscode.commands.registerCommand('storyline.github.disconnect', async () => {
      const CONFIRM = 'Disconnect';
      const choice = await vscode.window.showWarningMessage(
        'Disconnect Storyline from GitHub? This removes the stored token and stops auto-sync. Your local files and the GitHub repo are untouched.',
        { modal: true }, CONFIRM,
      );
      if (choice !== CONFIRM) return;
      await auth.disconnect();
      const workspaceRoot = getWorkspaceRoot();
      if (workspaceRoot) await deleteGitConfig(workspaceRoot);
      await sync?.refreshConfiguredState();
      vscode.window.showInformationMessage('Storyline: disconnected from GitHub.');
    }),

    vscode.commands.registerCommand('storyline.github.syncNow', async () => {
      await sync?.syncNow();
    }),

    vscode.commands.registerCommand('storyline.github.pause', async () => {
      await sync?.pause();
      vscode.window.showInformationMessage('Storyline: auto-sync paused.');
    }),

    vscode.commands.registerCommand('storyline.github.resume', async () => {
      await sync?.resume();
      vscode.window.showInformationMessage('Storyline: auto-sync resumed.');
    }),

    vscode.commands.registerCommand('storyline.github.showLog', () => {
      sync?.showLog();
    }),

    vscode.commands.registerCommand('storyline.github.changeVisibility', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) return;
      const config = await readGitConfig(workspaceRoot);
      const token = await auth.getToken();
      if (!config || !token) {
        vscode.window.showWarningMessage('Storyline: connect to GitHub first.');
        return;
      }
      const visibility = await pickVisibility(config.visibility);
      if (!visibility || visibility === config.visibility) return;
      const api = new GitHubApi(token);
      try {
        await api.setVisibility(config.owner, config.repo, visibility);
        config.visibility = visibility;
        await writeGitConfig(workspaceRoot, config);
        vscode.window.showInformationMessage(`Storyline: repository visibility changed to ${visibility}.`);
      } catch (err) {
        vscode.window.showErrorMessage(`Storyline: couldn't change visibility — ${err instanceof Error ? err.message : String(err)}`);
      }
    }),

    vscode.commands.registerCommand('storyline.github.manageCollaborators', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) return;
      const config = await readGitConfig(workspaceRoot);
      const token = await auth.getToken();
      if (!config || !token) {
        vscode.window.showWarningMessage('Storyline: connect to GitHub first.');
        return;
      }
      await manageCollaborators(token, config.owner, config.repo);
    }),

    vscode.commands.registerCommand('storyline.github.openInBrowser', async () => {
      const workspaceRoot = getWorkspaceRoot();
      if (!workspaceRoot) return;
      const config = await readGitConfig(workspaceRoot);
      if (!config) {
        vscode.window.showWarningMessage('Storyline: not connected to GitHub yet.');
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(`https://github.com/${config.owner}/${config.repo}`));
    }),

    vscode.commands.registerCommand('storyline.github.openFromGitHub', async () => {
      await openProjectFromGitHub(auth);
    }),

    // Also register the old command id for back-compat with any saved keybindings.
    vscode.commands.registerCommand('storyline.github.openProjectFromGithub', async () => {
      await openProjectFromGitHub(auth);
    }),

    // Quick-pick menu fired by clicking the status bar item.
    vscode.commands.registerCommand('storyline.github.menu', async () => {
      const workspaceRoot = getWorkspaceRoot();
      await showSyncMenu(workspaceRoot, auth, sync);
    }),
  );
}

// Re-exported wrapper that matches the call signature used in extension.ts:
//   maybeOfferConnect(context, githubAuth, githubSync)
// We derive the workspaceRoot internally and forward to connect-flow.
export async function maybeOfferConnect(
  context: vscode.ExtensionContext,
  auth: GitHubAuth,
  _sync?: GitHubSyncService,
): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!workspaceRoot) return;
  await _maybeOfferConnect(context, workspaceRoot, auth);
}

async function pickVisibility(current: RepoVisibility): Promise<RepoVisibility | null> {
  interface Item extends vscode.QuickPickItem {
    value: RepoVisibility;
  }
  const items: Item[] = [
    {
      label: '$(lock) Private',
      description: current === 'private' ? '(current)' : 'Only you and invited collaborators can see this.',
      value: 'private',
    },
    {
      label: '$(globe) Public',
      description: current === 'public' ? '(current)' : 'Anyone on the internet can read this repo.',
      value: 'public',
    },
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Repository visibility',
    placeHolder: `Currently ${current}. Pick a new visibility.`,
  });
  return picked?.value ?? null;
}

async function manageCollaborators(token: string, owner: string, repo: string): Promise<void> {
  const api = new GitHubApi(token);
  let collaborators: { login: string }[] = [];
  try {
    collaborators = await api.listCollaborators(owner, repo);
  } catch (err) {
    vscode.window.showErrorMessage(`Storyline: couldn't list collaborators — ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const ADD = '$(add) Invite a collaborator…';
  const items: vscode.QuickPickItem[] = [
    { label: ADD, alwaysShow: true },
    ...collaborators
      .filter(c => c.login !== owner)
      .map(c => ({
        label: `$(person) ${c.login}`,
        description: 'Click to remove',
      })),
  ];
  const picked = await vscode.window.showQuickPick(items, {
    title: `${owner}/${repo} — collaborators`,
    placeHolder: 'Click "Invite" to add, or click a name to remove.',
  });
  if (!picked) return;

  if (picked.label === ADD) {
    const username = await vscode.window.showInputBox({
      title: `Invite a collaborator to ${owner}/${repo}`,
      prompt: 'GitHub username to invite (push access)',
      validateInput: (val) => /^[a-zA-Z0-9-]+$/.test(val) ? null : 'Letters, numbers, hyphens only.',
    });
    if (!username) return;
    try {
      await api.addCollaborator(owner, repo, username, 'push');
      vscode.window.showInformationMessage(`Storyline: invited ${username} to ${owner}/${repo}.`);
    } catch (err) {
      vscode.window.showErrorMessage(`Storyline: invite failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    const username = picked.label.replace(/^\$\(person\)\s*/, '');
    const CONFIRM = `Remove ${username}`;
    const choice = await vscode.window.showWarningMessage(
      `Remove ${username} from ${owner}/${repo}?`,
      { modal: true }, CONFIRM,
    );
    if (choice !== CONFIRM) return;
    try {
      await api.removeCollaborator(owner, repo, username);
      vscode.window.showInformationMessage(`Storyline: removed ${username}.`);
    } catch (err) {
      vscode.window.showErrorMessage(`Storyline: remove failed — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function showSyncMenu(
  workspaceRoot: vscode.Uri | undefined,
  auth: GitHubAuth,
  sync: GitHubSyncService | undefined,
): Promise<void> {
  const config = workspaceRoot ? await readGitConfig(workspaceRoot) : null;
  const connected = await auth.isConnected();

  interface Item extends vscode.QuickPickItem {
    cmd: string;
  }
  const items: Item[] = [];

  if (!connected || !config) {
    items.push({ label: '$(cloud-upload) Connect this project to GitHub', cmd: 'storyline.github.connect' });
  } else {
    items.push(
      { label: '$(sync) Sync Now', description: 'Push pending changes immediately', cmd: 'storyline.github.syncNow' },
      sync?.getState().kind === 'paused'
        ? { label: '$(debug-start) Resume Auto-Sync', cmd: 'storyline.github.resume' }
        : { label: '$(debug-pause) Pause Auto-Sync', cmd: 'storyline.github.pause' },
      { label: '$(globe) Open Repo in Browser', description: `${config.owner}/${config.repo}`, cmd: 'storyline.github.openInBrowser' },
      { label: '$(person-add) Manage Collaborators…', cmd: 'storyline.github.manageCollaborators' },
      { label: '$(eye) Change Visibility…', description: `Currently ${config.visibility}`, cmd: 'storyline.github.changeVisibility' },
      { label: '$(output) Show Sync Log', cmd: 'storyline.github.showLog' },
      { label: '$(sign-out) Disconnect from GitHub', cmd: 'storyline.github.disconnect' },
    );
  }
  items.push({ label: '$(cloud-download) Open Project from GitHub…', cmd: 'storyline.github.openFromGitHub' });

  const picked = await vscode.window.showQuickPick(items, {
    title: config ? `Storyline GitHub sync — ${config.owner}/${config.repo}` : 'Storyline GitHub sync',
    placeHolder: 'Pick an action',
  });
  if (picked) {
    await vscode.commands.executeCommand(picked.cmd);
  }
}

async function openProjectFromGitHub(auth: GitHubAuth): Promise<void> {
  let token = await auth.getToken();
  if (!token) {
    const user = await auth.connect();
    if (!user) return;
    token = await auth.getToken();
    if (!token) return;
  }

  const api = new GitHubApi(token);
  let repos: Awaited<ReturnType<typeof api.listOwnedRepos>>;
  try {
    repos = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Storyline: loading your GitHub repositories…' },
      () => api.listOwnedRepos(),
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Storyline: couldn't list repositories — ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  interface Item extends vscode.QuickPickItem {
    repo: typeof repos[number];
  }
  const items: Item[] = repos.map((r: typeof repos[number]) => ({
    label: `${r.private ? '$(lock)' : '$(globe)'} ${r.name}`,
    description: r.full_name,
    detail: `Updated ${new Date(r.updated_at).toLocaleString()} · default branch ${r.default_branch}`,
    repo: r,
  }));
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Open project from GitHub',
    placeHolder: 'Pick a Storyline project to clone',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) return;

  const folder = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Clone here',
    title: `Choose a parent folder for ${picked.repo.name}`,
  });
  if (!folder || folder.length === 0) return;

  const targetDir = path.join(folder[0].fsPath, picked.repo.name);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Storyline: cloning ${picked.repo.full_name}…` },
    async () => {
      try {
        await clone(picked.repo.clone_url, targetDir, token!, picked.repo.default_branch);
        // Open the cloned folder in a new VS Code window. Storyline auto-
        // detects the .storyline/state.json on activate.
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetDir), { forceNewWindow: true });
      } catch (err) {
        vscode.window.showErrorMessage(`Storyline: clone failed — ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
