import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { readBackupSettings } from './backup-settings';

// Writer-safety backup: snapshots the ENTIRE project into an external
// folder on every chapter close and on project close. The whole point
// is redundancy independent of the project itself — if the project
// folder gets corrupted, iCloud eats a file, the writer force-pushes
// the wrong branch, or a save race destroys a chapter, the snapshots
// in the external backup root are still intact.
//
// Trigger model:
//   - Chapter close (custom editor dispose) → queue a backup
//   - Project close (extension deactivate) → run a final backup synchronously
//
// The queued path is debounced — closing five tabs in rapid succession
// produces ONE snapshot, not five. Snapshots are content-hashed and
// skipped if identical to the latest existing snapshot, so idle chapter
// flips don't fill the backup root with duplicates.
//
// Non-blocking by design: a failed backup (ejected drive, offline cloud,
// permission error) logs to the output channel and surfaces a transient
// status-bar warning, but never blocks saves or closes.

interface BackupOutcome {
  kind: 'written' | 'skipped-unchanged' | 'skipped-unconfigured' | 'failed';
  snapshotPath?: string;
  error?: string;
}

// Files/dirs we never snapshot. Manuscript and supporting docs are
// markdown — small and high-value. Build artefacts and dependencies are
// huge and pointless to back up.
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.vscode', 'dist', 'build', 'out',
  'tmp', '.cache', 'output', '.DS_Store',
]);

export class BackupService {
  private pendingTimer: NodeJS.Timeout | undefined;
  private inFlight = false;
  private readonly output: vscode.OutputChannel;
  // Transient status-bar warning on failure. Separate from the
  // configure-prompt status item — this one lights up red for 8s
  // after a failure, then hides.
  private failureStatus: vscode.StatusBarItem;

  constructor(
    private readonly workspaceRoot: vscode.Uri,
    context: vscode.ExtensionContext,
  ) {
    this.output = vscode.window.createOutputChannel('Storyline Backup');
    this.failureStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.failureStatus.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    context.subscriptions.push(this.output, this.failureStatus);
  }

  // Debounced backup — call on every chapter close. Coalesces a burst
  // of close events into a single snapshot 3 seconds after the last one.
  scheduleBackup(reason: string): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = undefined;
      void this.runBackup(reason);
    }, 3000);
  }

  // Synchronous-ish backup — await this one during deactivate so the
  // write has a fair chance to complete before VS Code tears the
  // extension host down.
  async flushBackup(reason: string): Promise<void> {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = undefined;
    }
    await this.runBackup(reason);
  }

  private async runBackup(reason: string): Promise<void> {
    if (this.inFlight) return;  // another backup already running
    this.inFlight = true;
    try {
      const outcome = await this.performBackup(reason);
      this.reportOutcome(outcome);
    } finally {
      this.inFlight = false;
    }
  }

  private async performBackup(reason: string): Promise<BackupOutcome> {
    const settings = await readBackupSettings(this.workspaceRoot);
    if (!settings) {
      return { kind: 'skipped-unconfigured' };
    }

    const projectSlug = slugify(path.basename(this.workspaceRoot.fsPath));
    const projectBackupRoot = path.join(settings.path, projectSlug);

    // Gather files to snapshot.
    const files = await collectFiles(this.workspaceRoot.fsPath);
    if (files.length === 0) {
      return { kind: 'skipped-unchanged' };
    }

    // Hash the manifest — skip writing if identical to the latest snapshot.
    const manifest = await buildManifest(this.workspaceRoot.fsPath, files);
    const latestHashPath = path.join(projectBackupRoot, '.latest-hash');
    const previousHash = await readFileOrNull(latestHashPath);
    if (previousHash && previousHash.trim() === manifest.hash) {
      return { kind: 'skipped-unchanged' };
    }

    // Write the snapshot.
    const timestamp = filesystemSafeTimestamp(new Date());
    const snapshotPath = path.join(projectBackupRoot, timestamp);
    await fs.mkdir(snapshotPath, { recursive: true });

    for (const rel of files) {
      const src = path.join(this.workspaceRoot.fsPath, rel);
      const dest = path.join(snapshotPath, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    }

    // Stash a tiny manifest so a writer browsing the backup folder can
    // see why/when this snapshot was made without opening every file.
    const meta = {
      createdAt: new Date().toISOString(),
      reason,
      fileCount: files.length,
      contentHash: manifest.hash,
    };
    await fs.writeFile(
      path.join(snapshotPath, '.storyline-snapshot.json'),
      JSON.stringify(meta, null, 2) + '\n',
      'utf-8',
    );
    await fs.writeFile(latestHashPath, manifest.hash, 'utf-8');

    // Rotate — prune oldest beyond maxSnapshots.
    await pruneOldSnapshots(projectBackupRoot, settings.maxSnapshots);

    return { kind: 'written', snapshotPath };
  }

  private reportOutcome(outcome: BackupOutcome): void {
    const now = new Date().toISOString();
    switch (outcome.kind) {
      case 'written':
        this.output.appendLine(`[${now}] Snapshot written: ${outcome.snapshotPath}`);
        this.failureStatus.hide();
        break;
      case 'skipped-unchanged':
        this.output.appendLine(`[${now}] Skipped — project unchanged since last snapshot.`);
        this.failureStatus.hide();
        break;
      case 'skipped-unconfigured':
        // Silent — the configure-prompt status item already flags this.
        break;
      case 'failed':
        this.output.appendLine(`[${now}] FAILED: ${outcome.error}`);
        this.failureStatus.text = '$(warning) Storyline backup failed';
        this.failureStatus.tooltip = `Storyline backup failed: ${outcome.error}\n\nSee 'Storyline Backup' output channel.`;
        this.failureStatus.command = 'storyline.showBackupLog';
        this.failureStatus.show();
        setTimeout(() => this.failureStatus.hide(), 8000);
        break;
    }
  }

  showLog(): void {
    this.output.show(true);
  }
}

// --- helpers ---

function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'untitled';
}

function filesystemSafeTimestamp(d: Date): string {
  // ISO with colons → dashes so it's valid on Windows too.
  return d.toISOString().replace(/:/g, '-').replace(/\./g, '-');
}

async function collectFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  await walk(root, '', out);
  out.sort();
  return out;
}

async function walk(root: string, rel: string, out: string[]): Promise<void> {
  const abs = rel ? path.join(root, rel) : root;
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.storyline') {
      // Hidden dotfiles/dotdirs skipped, except .storyline state we do
      // want to preserve.
      continue;
    }
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      await walk(root, rel ? path.join(rel, e.name) : e.name, out);
    } else if (e.isFile()) {
      // Skip the bundled .vsix files and other multi-MB binaries the
      // writer doesn't need duplicated every backup.
      if (e.name.endsWith('.vsix')) continue;
      if (e.name.endsWith('.pdf')) continue;
      if (e.name.endsWith('.epub')) continue;
      out.push(rel ? path.join(rel, e.name) : e.name);
    }
  }
}

async function buildManifest(root: string, files: string[]): Promise<{ hash: string }> {
  const h = crypto.createHash('sha256');
  for (const rel of files) {
    h.update(rel);
    h.update('\0');
    try {
      const content = await fs.readFile(path.join(root, rel));
      h.update(content);
    } catch { /* unreadable → treat as empty */ }
    h.update('\0');
  }
  return { hash: h.digest('hex') };
}

async function readFileOrNull(p: string): Promise<string | null> {
  try { return await fs.readFile(p, 'utf-8'); } catch { return null; }
}

async function pruneOldSnapshots(projectBackupRoot: string, maxSnapshots: number): Promise<void> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(projectBackupRoot, { withFileTypes: true });
  } catch { return; }
  // Only prune directories that look like our timestamped snapshots —
  // never touch user-created folders or the .latest-hash marker.
  const snapshots = entries
    .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/.test(e.name))
    .map(e => e.name)
    .sort()   // ISO timestamps sort chronologically
    .reverse(); // newest first
  const excess = snapshots.slice(maxSnapshots);
  for (const name of excess) {
    await fs.rm(path.join(projectBackupRoot, name), { recursive: true, force: true }).catch(() => {});
  }
}
