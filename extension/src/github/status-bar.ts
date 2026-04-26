import * as vscode from 'vscode';
import { GitHubSyncService, SyncState } from './sync.js';
import { GitHubAuth } from './auth.js';

// Always-visible right-side status bar item showing sync state.
// Click handler opens a quick-pick of the available sync commands.

export class GitHubSyncStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    context: vscode.ExtensionContext,
    private readonly sync: GitHubSyncService,
    _auth?: GitHubAuth,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
    this.item.command = 'storyline.github.menu';
    this.disposables.push(this.item);
    context.subscriptions.push(this.item);

    this.disposables.push(sync.onDidChangeState(state => this.render(state)));
    this.render(sync.getState());
    this.item.show();
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }

  private render(state: SyncState): void {
    switch (state.kind) {
      case 'unconfigured':
        this.item.text = '$(cloud-upload) Storyline: connect GitHub';
        this.item.tooltip = 'Click to set up GitHub backup, version history, and sharing for this project.';
        this.item.backgroundColor = undefined;
        break;
      case 'idle':
        this.item.text = '$(cloud) Storyline: synced';
        this.item.tooltip = 'GitHub sync is on. Changes push automatically 30 seconds after each save.';
        this.item.backgroundColor = undefined;
        break;
      case 'syncing':
        this.item.text = '$(sync~spin) Storyline: syncing…';
        this.item.tooltip = 'Pushing changes to GitHub.';
        this.item.backgroundColor = undefined;
        break;
      case 'synced':
        this.item.text = `$(cloud) Storyline: synced ${formatTime(state.at)}`;
        this.item.tooltip = state.filesChanged
          ? `Last push: ${state.filesChanged} files at ${state.at.toLocaleTimeString()}.`
          : `Last sync: ${state.at.toLocaleTimeString()} (no changes).`;
        this.item.backgroundColor = undefined;
        break;
      case 'paused':
        this.item.text = '$(debug-pause) Storyline: sync paused';
        this.item.tooltip = 'Auto-sync is paused. Click to resume or trigger a manual sync.';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;
      case 'error':
        this.item.text = '$(warning) Storyline: sync failed';
        this.item.tooltip = `Last sync failed at ${state.at.toLocaleTimeString()}: ${state.message}\n\nClick for options. Will retry automatically.`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }
  }
}

function formatTime(d: Date): string {
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString();
}
