import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ResearchItem {
  id: string;
  title: string;
  subtype: string;
  reliability: string;
  verification: string;
  tags: string[];
  links: string[];
  sources: string[];
  contentPreview: string;
}

interface ResearchIndex {
  lastRebuilt: string;
  items: ResearchItem[];
  stats: {
    total: number;
    byVerification: Record<string, number>;
    byReliability: Record<string, number>;
  };
}

// Research panel — surfaces linked and tag-matched research items for the
// chapter the writer is currently editing. Reads .storyline/research/index.json;
// call `storyline research rebuild` from the terminal to refresh the index.

export class ResearchPanel {
  private static instance: ResearchPanel | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private workspaceRoot: vscode.Uri | undefined;
  private disposables: vscode.Disposable[] = [];

  private constructor(context: vscode.ExtensionContext) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  }

  static create(context: vscode.ExtensionContext): ResearchPanel {
    if (!ResearchPanel.instance) {
      ResearchPanel.instance = new ResearchPanel(context);
    }
    return ResearchPanel.instance;
  }

  async show(context: vscode.ExtensionContext): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      await this.refresh();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'storyline.research',
      'Storyline Research',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      ResearchPanel.instance = undefined;
    }, null, this.disposables);

    // Listen for active editor changes so the panel updates when the
    // writer moves to a different chapter.
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(async () => {
        if (this.panel) await this.refresh();
      }),
    );

    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.panel || !this.workspaceRoot) return;

    const index = await this.loadIndex();
    const activeFile = await this.getActiveFile();
    const chapterNumber = this.inferChapterNumber(activeFile);
    const items = this.filterItems(index?.items ?? [], chapterNumber, activeFile);

    this.panel.title = chapterNumber
      ? `Research — Ch ${chapterNumber}`
      : 'Storyline Research';
    this.panel.webview.html = this.buildHtml(items, index, chapterNumber, activeFile);
  }

  private async loadIndex(): Promise<ResearchIndex | null> {
    if (!this.workspaceRoot) return null;
    const indexPath = path.join(this.workspaceRoot.fsPath, '.storyline', 'research', 'index.json');
    try {
      const raw = await fs.readFile(indexPath, 'utf8');
      return JSON.parse(raw) as ResearchIndex;
    } catch {
      return null;
    }
  }

  private async getActiveFile(): Promise<string | null> {
    if (!this.workspaceRoot) return null;
    // Try active text editor first
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.fileName.endsWith('.md')) {
      return path.relative(this.workspaceRoot.fsPath, editor.document.fileName);
    }
    // Fall back to active-file.txt breadcrumb (written by ActiveFileTracker)
    try {
      const breadcrumb = path.join(this.workspaceRoot.fsPath, '.storyline', 'active-file.txt');
      const raw = await fs.readFile(breadcrumb, 'utf8');
      return raw.trim() || null;
    } catch {
      return null;
    }
  }

  private inferChapterNumber(activeFile: string | null): number | null {
    if (!activeFile) return null;
    // Common patterns: chapter-05.md, ch05.md, chapter_5.md, 05-title.md
    const match = activeFile.match(/(?:chapter[-_]?|ch[-_]?)0*(\d+)|^0*(\d+)[-_]/i);
    if (match) return parseInt((match[1] || match[2]) ?? '0', 10);
    return null;
  }

  private filterItems(
    items: ResearchItem[],
    chapterNumber: number | null,
    activeFile: string | null,
  ): ResearchItem[] {
    if (!items.length) return [];

    if (chapterNumber != null) {
      const chapterTarget = `chapter:${chapterNumber}`;
      const linked = items.filter(item => (item.links || []).includes(chapterTarget));
      if (linked.length) return linked;
    }

    // No chapter inferred or no linked items: show all, sorted by verification
    const rank: Record<string, number> = { verified: 0, pending: 1, 'needs-follow-up': 2, disputed: 3 };
    return [...items].sort((a, b) => (rank[a.verification] ?? 9) - (rank[b.verification] ?? 9));
  }

  private buildHtml(
    items: ResearchItem[],
    index: ResearchIndex | null,
    chapterNumber: number | null,
    activeFile: string | null,
  ): string {
    const verificationBadge = (v: string) => {
      const colors: Record<string, string> = {
        verified: '#4ade80',
        pending: '#fbbf24',
        disputed: '#f87171',
        'needs-follow-up': '#a78bfa',
      };
      return `<span style="background:${colors[v] ?? '#888'};color:#000;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600">${v}</span>`;
    };

    const reliabilityLabel = (r: string) => {
      const labels: Record<string, string> = {
        primary: '★★★★',
        'peer-reviewed': '★★★',
        secondary: '★★',
        anecdotal: '★',
      };
      return labels[r] ?? r;
    };

    const itemsHtml = items.length
      ? items.map(item => `
        <div class="item">
          <div class="item-header">
            <span class="item-title">${escapeHtml(item.title)}</span>
            ${verificationBadge(item.verification)}
          </div>
          <div class="item-meta">
            <span class="subtype">${escapeHtml(item.subtype)}</span>
            <span class="reliability" title="Reliability">${reliabilityLabel(item.reliability)}</span>
            ${item.tags.length ? `<span class="tags">${item.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</span>` : ''}
          </div>
          ${item.contentPreview ? `<div class="preview">${escapeHtml(item.contentPreview.slice(0, 200))}${item.contentPreview.length > 200 ? '…' : ''}</div>` : ''}
          ${item.sources.length ? `<div class="sources">Sources: ${item.sources.map(s => escapeHtml(s)).join(', ')}</div>` : ''}
          <div class="item-id">${escapeHtml(item.id)}</div>
        </div>
      `).join('')
      : `<div class="empty">No research items linked to ${chapterNumber ? `Chapter ${chapterNumber}` : 'the active file'}.<br>
         <small>Use <code>storyline research add</code> to capture items and <code>storyline research link</code> to connect them.</small></div>`;

    const headerText = chapterNumber
      ? `Chapter ${chapterNumber} — ${items.length} item(s)`
      : `All research — ${items.length} item(s)`;

    const staleness = index
      ? `Index last rebuilt: ${index.lastRebuilt.slice(0, 10)}`
      : 'No index found — run `storyline research rebuild` to build it';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); padding: 12px; margin: 0; }
  h2 { font-size: 14px; margin: 0 0 8px; color: var(--vscode-foreground); }
  .meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
  .item { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; margin-bottom: 8px; }
  .item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .item-title { font-weight: 600; }
  .item-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; margin-bottom: 4px; }
  .subtype { color: var(--vscode-descriptionForeground); }
  .reliability { letter-spacing: -1px; }
  .tags { display: flex; gap: 4px; flex-wrap: wrap; }
  .tag { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 1px 5px; border-radius: 3px; font-size: 10px; }
  .preview { color: var(--vscode-foreground); margin: 6px 0 4px; font-size: 12px; opacity: 0.85; }
  .sources { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
  .item-id { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
  .empty { padding: 20px; text-align: center; color: var(--vscode-descriptionForeground); }
  code { font-family: var(--vscode-editor-font-family); background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 2px; }
</style>
</head>
<body>
<h2>${escapeHtml(headerText)}</h2>
<div class="meta">${activeFile ? escapeHtml(activeFile) : 'No active chapter'} — ${escapeHtml(staleness)}</div>
${itemsHtml}
</body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
