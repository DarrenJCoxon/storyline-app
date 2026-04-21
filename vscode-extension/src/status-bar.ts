import * as vscode from 'vscode';
import { countWords, formatWordCount } from './word-count';

const DEFAULT_MANUSCRIPT_PATH = 'manuscript';

interface FileStats {
  count: number;
  label: string; // relative path for display
}

// Shows word counts in the VS Code status bar:
//   "📖 File: 2,340 · Book: 18.2k / 80k (23%)"
// Click opens a quick pick with a per-file breakdown.
export class WordCountStatusBar {
  private item: vscode.StatusBarItem;
  private perFile: Map<string, FileStats> = new Map(); // key: uri.toString()
  private total: number = 0;
  private target: number = 0;
  private manuscriptPath: string = DEFAULT_MANUSCRIPT_PATH;
  // Active URI for the "File: X" portion of the display. Maintained
  // separately from vscode.window.activeTextEditor because custom editors
  // (our rich TipTap editor) are NOT text editors — activeTextEditor is
  // undefined when focus is inside a custom editor webview. The custom
  // editor provider calls setActiveCustomEditor() on focus changes.
  private activeCustomEditorUri: vscode.Uri | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'storyline.showWordCountBreakdown';
    context.subscriptions.push(this.item);
  }

  setActiveCustomEditor(uri: vscode.Uri | undefined): void {
    this.activeCustomEditorUri = uri;
    this.updateDisplay();
  }

  // Clear only if the current active URI matches — so a panel losing
  // focus doesn't clobber another panel that just took focus.
  clearActiveCustomEditorIfMatches(uri: vscode.Uri): void {
    if (this.activeCustomEditorUri?.toString() === uri.toString()) {
      this.activeCustomEditorUri = undefined;
      this.updateDisplay();
    }
  }

  async start(): Promise<void> {
    await this.loadProjectConfig();
    await this.rescanProject();
    this.updateDisplay();
    this.item.show();

    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.updateDisplay()),
      vscode.workspace.onDidChangeTextDocument(e => this.handleDocChange(e)),
      vscode.workspace.onDidSaveTextDocument(doc => this.handleDocSaved(doc)),
      vscode.workspace.onDidDeleteFiles(e => this.handleFilesDeleted(e)),
      vscode.workspace.onDidCreateFiles(e => this.handleFilesCreated(e)),
    );
  }

  getTotal(): number { return this.total; }
  getTarget(): number { return this.target; }

  getBreakdown(): Array<{ uri: vscode.Uri; label: string; count: number }> {
    const entries: Array<{ uri: vscode.Uri; label: string; count: number }> = [];
    for (const [uriStr, stats] of this.perFile) {
      entries.push({ uri: vscode.Uri.parse(uriStr), label: stats.label, count: stats.count });
    }
    entries.sort((a, b) => a.label.localeCompare(b.label));
    return entries;
  }

  // Read both the target word count and the manuscript path from state.json.
  // Manuscript path defaults to 'manuscript' — set up by `storyline init`. Writers
  // can override by editing state.json's writing.manuscriptPath field.
  private async loadProjectConfig(): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      this.target = 0;
      this.manuscriptPath = DEFAULT_MANUSCRIPT_PATH;
      return;
    }
    try {
      const stateFile = vscode.Uri.joinPath(folder.uri, '.storyline', 'state.json');
      const buf = await vscode.workspace.fs.readFile(stateFile);
      const state = JSON.parse(new TextDecoder().decode(buf));
      this.target = Number(state?.genre?.targetWordCount) || 0;
      const rawPath = typeof state?.writing?.manuscriptPath === 'string'
        ? state.writing.manuscriptPath.trim()
        : '';
      this.manuscriptPath = rawPath || DEFAULT_MANUSCRIPT_PATH;
    } catch {
      this.target = 0;
      this.manuscriptPath = DEFAULT_MANUSCRIPT_PATH;
    }
  }

  private manuscriptGlob(): string {
    // Normalise: strip trailing slashes, ensure no leading slash.
    const clean = this.manuscriptPath.replace(/^\/+|\/+$/g, '');
    return `${clean}/**/*.{md,markdown}`;
  }

  private async rescanProject(): Promise<void> {
    const files = await vscode.workspace.findFiles(this.manuscriptGlob());
    this.perFile.clear();
    let total = 0;
    for (const uri of files) {
      try {
        const buf = await vscode.workspace.fs.readFile(uri);
        const count = countWords(new TextDecoder().decode(buf));
        this.perFile.set(uri.toString(), {
          count,
          label: vscode.workspace.asRelativePath(uri),
        });
        total += count;
      } catch {
        // unreadable, skip
      }
    }
    this.total = total;
  }

  // Is the given URI inside our configured manuscript path? Used to
  // decide whether live edits to a file should update the counter.
  private isManuscriptUri(uri: vscode.Uri): boolean {
    const rel = vscode.workspace.asRelativePath(uri, false);
    const clean = this.manuscriptPath.replace(/^\/+|\/+$/g, '');
    return rel === clean || rel.startsWith(`${clean}/`);
  }

  private handleDocChange(e: vscode.TextDocumentChangeEvent): void {
    if (!isMarkdownDoc(e.document)) return;
    if (!this.isManuscriptUri(e.document.uri)) return;
    const key = e.document.uri.toString();
    const prev = this.perFile.get(key)?.count ?? 0;
    const next = countWords(e.document.getText());
    this.perFile.set(key, {
      count: next,
      label: vscode.workspace.asRelativePath(e.document.uri),
    });
    this.total = this.total - prev + next;
    this.updateDisplay();
  }

  private async handleDocSaved(doc: vscode.TextDocument): Promise<void> {
    // When state.json is edited, target OR manuscriptPath might have changed.
    // Reload config; if the manuscript path changed, rescan everything.
    if (doc.uri.fsPath.endsWith('state.json') && doc.uri.fsPath.includes('.storyline')) {
      const prevPath = this.manuscriptPath;
      await this.loadProjectConfig();
      if (this.manuscriptPath !== prevPath) {
        await this.rescanProject();
      }
      this.updateDisplay();
    }
  }

  private handleFilesDeleted(e: vscode.FileDeleteEvent): void {
    for (const uri of e.files) {
      if (!isMarkdownUri(uri)) continue;
      if (!this.isManuscriptUri(uri)) continue;
      const prev = this.perFile.get(uri.toString())?.count ?? 0;
      this.total -= prev;
      this.perFile.delete(uri.toString());
    }
    this.updateDisplay();
  }

  private async handleFilesCreated(e: vscode.FileCreateEvent): Promise<void> {
    for (const uri of e.files) {
      if (!isMarkdownUri(uri)) continue;
      if (!this.isManuscriptUri(uri)) continue;
      try {
        const buf = await vscode.workspace.fs.readFile(uri);
        const count = countWords(new TextDecoder().decode(buf));
        this.perFile.set(uri.toString(), {
          count,
          label: vscode.workspace.asRelativePath(uri),
        });
        this.total += count;
      } catch {
        // ignore
      }
    }
    this.updateDisplay();
  }

  private updateDisplay(): void {
    const parts: string[] = [];

    // Prefer the custom editor's active file (set by the provider) —
    // that's the case when the rich editor has focus. Fall back to
    // VS Code's activeTextEditor for the raw-markdown case.
    const activeUri = this.activeCustomEditorUri ?? vscode.window.activeTextEditor?.document.uri;
    if (activeUri && isMarkdownUri(activeUri) && this.isManuscriptUri(activeUri)) {
      const cached = this.perFile.get(activeUri.toString())?.count;
      const current = cached !== undefined
        ? cached
        : countWords(vscode.window.activeTextEditor?.document.getText() ?? '');
      parts.push(`File: ${formatWordCount(current)}`);
    }

    // Empty-manuscript case: help the writer understand why count is 0.
    if (this.perFile.size === 0) {
      this.item.text = `$(book) Manuscript empty`;
      this.item.tooltip = buildEmptyTooltip(this.manuscriptPath);
      return;
    }

    if (this.target > 0) {
      const pct = Math.round((this.total / this.target) * 100);
      parts.push(`Book: ${formatWordCount(this.total)} / ${formatWordCount(this.target)} (${pct}%)`);
    } else {
      parts.push(`Book: ${formatWordCount(this.total)}`);
    }

    this.item.text = `$(book) ${parts.join(' · ')}`;
    this.item.tooltip = buildTooltip(this.total, this.target, this.manuscriptPath, this.perFile.size);
  }
}

function buildTooltip(total: number, target: number, manuscriptPath: string, fileCount: number): string {
  const lines: string[] = ['Storyline — word count'];
  lines.push(`Book total: ${total.toLocaleString()} words across ${fileCount} file${fileCount === 1 ? '' : 's'}`);
  if (target > 0) {
    const pct = Math.round((total / target) * 100);
    const remaining = Math.max(0, target - total);
    lines.push(`Target: ${target.toLocaleString()} (${pct}%)`);
    lines.push(`Remaining: ${remaining.toLocaleString()}`);
  }
  lines.push('');
  lines.push(`Scanning: ${manuscriptPath}/**/*.md`);
  lines.push('Click for per-file breakdown');
  return lines.join('\n');
}

function buildEmptyTooltip(manuscriptPath: string): string {
  return [
    'Storyline — word count',
    '',
    `No markdown files found in ${manuscriptPath}/`,
    '',
    'Create chapter files there (e.g. manuscript/ch01.md) to start',
    'tracking word count, or edit .storyline/state.json to point',
    'writing.manuscriptPath at a different folder.',
  ].join('\n');
}

function isMarkdownDoc(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'markdown' || /\.(md|markdown)$/i.test(doc.uri.fsPath);
}

function isMarkdownUri(uri: vscode.Uri): boolean {
  return /\.(md|markdown)$/i.test(uri.fsPath);
}
