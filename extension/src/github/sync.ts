import * as vscode from 'vscode';
import * as path from 'path';
import { GitHubAuth, GitHubUser } from './auth.js';
import { readGitConfig, writeGitConfig, GitConfig } from './config.js';
import { commitAll, fastForwardPull, push, ensureRepo, setRemote, getCurrentBranch, checkoutBranch } from './git.js';
import { ensureGitignore } from './gitignore.js';

// Sync engine — debounced commit + push on file save.
//
// Lifecycle per save burst:
//   1. File save fires → scheduleSync()
//   2. 30s debounce window collects more saves into the same batch
//   3. Window closes → run():
//      a. Fast-forward pull (silent if local is ahead, also silent on
//         empty remote — first push case)
//      b. Stage + commit any changes
//      c. Push to remote
//      d. Update lastPush; clear lastError; emit status event
//   4. On failure → exponential backoff retry (5s, 30s, 2m, 10m), surfaced
//      in status bar; resets on next successful sync.
//
// The whole thing is a no-op if .storyline/git.json doesn't exist (writer
// hasn't connected yet) or autoSync is false (writer paused it).

export type SyncState =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: Date; filesChanged: number }
  | { kind: 'paused' }
  | { kind: 'error'; message: string; at: Date }
  | { kind: 'unconfigured' };

const DEBOUNCE_MS = 30_000;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];

// Files inside .git, .storyline volatile state, output/, and other
// noisy paths shouldn't trigger a sync on save — they're either
// gitignored or internal.
const IGNORED_SAVE_PREFIXES = ['.git/', '.storyline/git.json', 'output/', 'node_modules/'];

export class GitHubSyncService implements vscode.Disposable {
  private debounceTimer: NodeJS.Timeout | undefined;
  private retryTimer: NodeJS.Timeout | undefined;
  private retryAttempt = 0;
  private inFlight = false;
  private state: SyncState = { kind: 'idle' };
  private readonly emitter = new vscode.EventEmitter<SyncState>();
  readonly onDidChangeState = this.emitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly output: vscode.OutputChannel;

  constructor(
    private readonly workspaceRoot: vscode.Uri,
    private readonly auth: GitHubAuth,
  ) {
    this.output = vscode.window.createOutputChannel('Storyline GitHub Sync');
    this.disposables.push(this.output);

    // Listen for saves — markdown, json, anything in the workspace.
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(doc => this.onMaybeChange(doc.uri)),
    );
    // Custom-editor saves (the rich editor) write through TextDocument
    // already, so the above covers them. But the writer can also drop
    // files into the workspace (images, research notes) — watch those.
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    watcher.onDidCreate(uri => this.onMaybeChange(uri));
    watcher.onDidDelete(uri => this.onMaybeChange(uri));
    this.disposables.push(watcher);

    // Initial state poll.
    void this.refreshConfiguredState();
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.emitter.dispose();
    this.disposables.forEach(d => d.dispose());
  }

  getState(): SyncState { return this.state; }

  showLog(): void { this.output.show(true); }

  // --- public command surface ---

  async syncNow(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    await this.run('manual');
  }

  async pause(): Promise<void> {
    const config = await readGitConfig(this.workspaceRoot);
    if (!config) return;
    config.autoSync = false;
    await writeGitConfig(this.workspaceRoot, config);
    this.setState({ kind: 'paused' });
  }

  async resume(): Promise<void> {
    const config = await readGitConfig(this.workspaceRoot);
    if (!config) return;
    config.autoSync = true;
    await writeGitConfig(this.workspaceRoot, config);
    this.setState({ kind: 'idle' });
    void this.run('resume');
  }

  // Called after the connect flow finishes successfully — rewires the
  // engine so a file save will now sync.
  async refreshConfiguredState(): Promise<void> {
    const config = await readGitConfig(this.workspaceRoot);
    if (!config) {
      this.setState({ kind: 'unconfigured' });
      return;
    }
    this.setState(config.autoSync ? { kind: 'idle' } : { kind: 'paused' });
  }

  // --- internals ---

  private onMaybeChange(uri: vscode.Uri): void {
    const rel = path.relative(this.workspaceRoot.fsPath, uri.fsPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return;
    if (IGNORED_SAVE_PREFIXES.some(prefix => rel.startsWith(prefix))) return;
    this.scheduleSync();
  }

  private scheduleSync(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.run('debounced');
    }, DEBOUNCE_MS);
  }

  private async run(reason: string): Promise<void> {
    if (this.inFlight) return;
    const config = await readGitConfig(this.workspaceRoot);
    if (!config) { this.setState({ kind: 'unconfigured' }); return; }
    if (!config.autoSync && reason !== 'manual') {
      this.setState({ kind: 'paused' });
      return;
    }
    const token = await this.auth.getToken();
    const user = await this.auth.getStoredUser();
    if (!token || !user) {
      this.fail('Not signed in to GitHub. Run "Storyline: Connect GitHub".');
      return;
    }

    this.inFlight = true;
    this.setState({ kind: 'syncing' });
    try {
      // Heal local state — make sure git is initialised, on the right
      // branch, with the correct remote. Cheap if already correct.
      await ensureRepo(this.workspaceRoot.fsPath, config.branch);
      const current = await getCurrentBranch(this.workspaceRoot.fsPath);
      if (current !== config.branch) {
        await checkoutBranch(this.workspaceRoot.fsPath, config.branch);
      }
      await setRemote(this.workspaceRoot.fsPath, config.remote);
      await ensureGitignore(this.workspaceRoot.fsPath);

      const ctx = {
        dir: this.workspaceRoot.fsPath,
        token,
        authorName: (user as GitHubUser).name || (user as GitHubUser).login,
        authorEmail: (user as GitHubUser).email || `${(user as GitHubUser).login}@users.noreply.github.com`,
      };

      // Silent fast-forward pull. v1 only; v2 will surface conflicts.
      try {
        await fastForwardPull(ctx, config.branch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.output.appendLine(`[${new Date().toISOString()}] Fast-forward pull failed: ${msg}`);
        // Don't abort the sync — local commits will still go up. The
        // push will fail if there's a real divergence and we'll surface
        // that error. If it succeeds (e.g. pull failed for a transient
        // network blip), great.
      }

      const commit = await commitAll(ctx, autoCommitMessage(reason));
      if (!commit) {
        // Nothing to push — pull may have brought down remote work, so
        // still record success.
        config.lastPush = new Date().toISOString();
        config.lastError = undefined;
        await writeGitConfig(this.workspaceRoot, config);
        this.setState({ kind: 'synced', at: new Date(), filesChanged: 0 });
        this.output.appendLine(`[${new Date().toISOString()}] Nothing to commit (pull-only).`);
        this.retryAttempt = 0;
        return;
      }

      await push(ctx, config.branch);

      config.lastPush = new Date().toISOString();
      config.lastError = undefined;
      await writeGitConfig(this.workspaceRoot, config);

      this.output.appendLine(
        `[${new Date().toISOString()}] Pushed ${commit.filesChanged.length} files (${commit.oid.slice(0, 7)}): ${commit.filesChanged.slice(0, 5).join(', ')}${commit.filesChanged.length > 5 ? '…' : ''}`,
      );
      this.setState({ kind: 'synced', at: new Date(), filesChanged: commit.filesChanged.length });
      this.retryAttempt = 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[${new Date().toISOString()}] Sync failed: ${msg}`);
      const config2 = await readGitConfig(this.workspaceRoot);
      if (config2) {
        config2.lastError = msg;
        await writeGitConfig(this.workspaceRoot, config2);
      }
      this.fail(msg);
      this.scheduleRetry();
    } finally {
      this.inFlight = false;
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = RETRY_DELAYS_MS[Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1)];
    this.retryAttempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.run('retry');
    }, delay);
  }

  private fail(message: string): void {
    this.setState({ kind: 'error', message, at: new Date() });
  }

  private setState(state: SyncState): void {
    this.state = state;
    this.emitter.fire(state);
  }
}

function autoCommitMessage(reason: string): string {
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  if (reason === 'manual') return `Storyline manual sync — ${ts}`;
  if (reason === 'resume') return `Storyline resume sync — ${ts}`;
  if (reason === 'retry') return `Storyline retry sync — ${ts}`;
  return `Storyline auto-save — ${ts}`;
}
