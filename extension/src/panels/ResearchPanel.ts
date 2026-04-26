import * as vscode from 'vscode'
import * as fs from 'fs/promises'
import * as path from 'path'
import {
  addItem, addLink, listItems, removeItem,
  rebuildIndex, syncResearchToMemory,
  ITEM_SUBTYPES, RELIABILITY_TIERS, VERIFICATION_STATES,
} from '@storyline/core'
import type { EditorPanel } from './EditorPanel.js'

interface ResearchItem {
  id: string
  title: string
  subtype: string
  reliability: string
  verification: string
  tags: string[]
  links: string[]
  sources: string[]
  contentPreview: string
}

interface ResearchIndex {
  lastRebuilt: string
  items: ResearchItem[]
  stats: {
    total: number
    byVerification: Record<string, number>
    byReliability: Record<string, number>
  }
}

/**
 * Storyline Research panel — surfaces linked items for the chapter the writer
 * is currently editing, and lets them capture new items inline (no CLI needed).
 * Reads .storyline/research/index.json; writes go through the ported research
 * subsystem in @storyline/core.
 */
export class ResearchPanel {
  public static readonly viewType = 'storyline.research'
  private static instance: ResearchPanel | undefined

  private readonly panel: vscode.WebviewPanel
  private readonly workspaceRoot: vscode.Uri | undefined

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
    private readonly editorPanel?: EditorPanel,
  ) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
    this.panel = vscode.window.createWebviewPanel(
      ResearchPanel.viewType,
      'Storyline — Research',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.workspaceRoot ? [extensionUri, this.workspaceRoot] : [extensionUri],
      },
    )

    this.panel.webview.onDidReceiveMessage((msg: Record<string, unknown>) => this.handleMessage(msg))
    this.panel.onDidDispose(() => { ResearchPanel.instance = undefined })

    // Refresh when the writer switches chapters
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => void this.refresh()),
    )
    if (editorPanel) {
      context.subscriptions.push(editorPanel.onDidChangeActiveRichEditor(() => void this.refresh()))
    }

    void this.refresh()
  }

  public static show(
    context: vscode.ExtensionContext,
    extensionUri: vscode.Uri,
    editorPanel?: EditorPanel,
  ): void {
    if (ResearchPanel.instance) {
      ResearchPanel.instance.panel.reveal(vscode.ViewColumn.Beside)
      void ResearchPanel.instance.refresh()
      return
    }
    ResearchPanel.instance = new ResearchPanel(context, extensionUri, editorPanel)
  }

  private async refresh(): Promise<void> {
    if (!this.workspaceRoot) return
    const index = await this.loadIndex()
    const activeFile = await this.getActiveFile()
    const chapterNumber = this.inferChapterNumber(activeFile)
    const items = this.filterItems(index?.items ?? [], chapterNumber, activeFile)
    this.panel.title = chapterNumber ? `Research — Ch ${chapterNumber}` : 'Storyline — Research'
    this.panel.webview.html = this.buildHtml(items, index, chapterNumber, activeFile)
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    if (!this.workspaceRoot) return
    const projectDir = this.workspaceRoot.fsPath
    switch (msg.type) {
      case 'add': {
        try {
          const item = await (addItem as unknown as (dir: string, opts: Record<string, unknown>) => Promise<{ id: string; title: string }>)(projectDir, {
            title: msg.title,
            content: msg.content ?? '',
            subtype: msg.subtype ?? 'note',
            reliability: msg.reliability ?? 'secondary',
            verification: msg.verification ?? 'pending',
            tags: msg.tags ?? [],
            sources: msg.sources ?? [],
          })
          if (msg.linkTarget && typeof msg.linkTarget === 'string' && msg.linkTarget.trim()) {
            await (addLink as unknown as (dir: string, id: string, target: string) => Promise<unknown>)(projectDir, item.id, msg.linkTarget.trim())
          }
          await (rebuildIndex as unknown as (dir: string) => Promise<unknown>)(projectDir)
          await (syncResearchToMemory as unknown as (dir: string) => Promise<unknown>)(projectDir)
          await this.refresh()
          vscode.window.showInformationMessage(`Research item added: ${item.title}`)
        } catch (err) {
          vscode.window.showErrorMessage(`Add failed — ${err instanceof Error ? err.message : String(err)}`)
        }
        break
      }
      case 'rebuild': {
        try {
          await (rebuildIndex as unknown as (dir: string) => Promise<unknown>)(projectDir)
          await (syncResearchToMemory as unknown as (dir: string) => Promise<unknown>)(projectDir)
          await this.refresh()
          vscode.window.showInformationMessage('Research index rebuilt.')
        } catch (err) {
          vscode.window.showErrorMessage(`Rebuild failed — ${err instanceof Error ? err.message : String(err)}`)
        }
        break
      }
      case 'remove': {
        const id = msg.id as string
        if (!id) return
        const ok = await vscode.window.showWarningMessage(
          `Remove research item ${id}?`,
          { modal: true }, 'Remove',
        )
        if (ok === 'Remove') {
          try {
            await (removeItem as unknown as (dir: string, id: string) => Promise<unknown>)(projectDir, id)
            await (rebuildIndex as unknown as (dir: string) => Promise<unknown>)(projectDir)
            await this.refresh()
          } catch (err) {
            vscode.window.showErrorMessage(`Remove failed — ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        break
      }
      case 'link': {
        const id = msg.id as string
        const target = msg.target as string
        if (!id || !target) return
        try {
          await (addLink as unknown as (dir: string, id: string, target: string) => Promise<unknown>)(projectDir, id, target)
          await (rebuildIndex as unknown as (dir: string) => Promise<unknown>)(projectDir)
          await this.refresh()
        } catch (err) {
          vscode.window.showErrorMessage(`Link failed — ${err instanceof Error ? err.message : String(err)}`)
        }
        break
      }
    }
  }

  private async loadIndex(): Promise<ResearchIndex | null> {
    if (!this.workspaceRoot) return null
    const indexPath = path.join(this.workspaceRoot.fsPath, '.storyline', 'research', 'index.json')
    try {
      const raw = await fs.readFile(indexPath, 'utf8')
      return JSON.parse(raw) as ResearchIndex
    } catch {
      // No index yet — fall back to listing items directly so first-time users
      // see what they have without needing to manually rebuild first.
      try {
        const raw = await (listItems as unknown as (dir: string) => Promise<Array<Record<string, unknown>>>)(this.workspaceRoot.fsPath)
        const items = (raw ?? []).filter(Boolean)
        return {
          lastRebuilt: '',
          items: items.map(it => ({
            id: String(it.id ?? ''),
            title: String(it.title ?? ''),
            subtype: String(it.subtype ?? 'note'),
            reliability: String(it.reliability ?? 'secondary'),
            verification: String(it.verification ?? 'pending'),
            tags: Array.isArray(it.tags) ? it.tags as string[] : [],
            links: Array.isArray(it.links) ? it.links as string[] : [],
            sources: Array.isArray(it.sources) ? it.sources as string[] : [],
            contentPreview: typeof it.content === 'string' ? (it.content as string).slice(0, 200) : '',
          })),
          stats: { total: items.length, byVerification: {}, byReliability: {} },
        }
      } catch {
        return null
      }
    }
  }

  private async getActiveFile(): Promise<string | null> {
    if (!this.workspaceRoot) return null
    // Prefer the rich editor's tracked file (webview tabs aren't reflected in
    // window.activeTextEditor).
    const richUri = this.editorPanel?.getActiveRichEditorUri()
    if (richUri && /\.md$/i.test(richUri.fsPath)) {
      return path.relative(this.workspaceRoot.fsPath, richUri.fsPath)
    }
    const editor = vscode.window.activeTextEditor
    if (editor && editor.document.fileName.endsWith('.md')) {
      return path.relative(this.workspaceRoot.fsPath, editor.document.fileName)
    }
    return null
  }

  private inferChapterNumber(activeFile: string | null): number | null {
    if (!activeFile) return null
    const match = activeFile.match(/(?:chapter[-_]?|ch[-_]?)0*(\d+)|^0*(\d+)[-_]/i)
    if (match) return parseInt((match[1] || match[2]) ?? '0', 10)
    return null
  }

  private filterItems(items: ResearchItem[], chapterNumber: number | null, _activeFile: string | null): ResearchItem[] {
    if (!items.length) return []
    if (chapterNumber != null) {
      const target = `chapter:${chapterNumber}`
      const linked = items.filter(item => (item.links || []).includes(target))
      if (linked.length) return linked
    }
    const rank: Record<string, number> = { verified: 0, pending: 1, 'needs-follow-up': 2, disputed: 3 }
    return [...items].sort((a, b) => (rank[a.verification] ?? 9) - (rank[b.verification] ?? 9))
  }

  private buildHtml(
    items: ResearchItem[],
    index: ResearchIndex | null,
    chapterNumber: number | null,
    activeFile: string | null,
  ): string {
    const verificationBadge = (v: string): string => {
      const colours: Record<string, string> = {
        verified: '#4ade80', pending: '#fbbf24', disputed: '#f87171', 'needs-follow-up': '#a78bfa',
      }
      return `<span class="badge" style="background:${colours[v] ?? '#888'}">${v}</span>`
    }
    const reliabilityLabel = (r: string): string => ({
      primary: '★★★★', 'peer-reviewed': '★★★', secondary: '★★', anecdotal: '★',
    } as Record<string, string>)[r] ?? r

    const itemsHtml = items.length
      ? items.map(item => `
        <div class="item">
          <div class="item-header">
            <span class="item-title">${esc(item.title)}</span>
            ${verificationBadge(item.verification)}
          </div>
          <div class="item-meta">
            <span class="subtype">${esc(item.subtype)}</span>
            <span class="reliability" title="Reliability">${reliabilityLabel(item.reliability)}</span>
            ${item.tags.length ? `<span class="tags">${item.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : ''}
          </div>
          ${item.contentPreview ? `<div class="preview">${esc(item.contentPreview.slice(0, 200))}${item.contentPreview.length > 200 ? '…' : ''}</div>` : ''}
          ${item.sources.length ? `<div class="sources">Sources: ${item.sources.map(s => esc(s)).join(', ')}</div>` : ''}
          <div class="item-actions">
            <span class="item-id">${esc(item.id)}</span>
            <span class="links">${item.links.map(l => `<span class="link">${esc(l)}</span>`).join('')}</span>
            <button class="micro" data-act="remove" data-id="${esc(item.id)}">Remove</button>
            <button class="micro" data-act="link" data-id="${esc(item.id)}">Link…</button>
          </div>
        </div>
      `).join('')
      : `<div class="empty">No research items ${chapterNumber ? `linked to Chapter ${chapterNumber}` : 'yet'}.</div>`

    const headerText = chapterNumber
      ? `Chapter ${chapterNumber} — ${items.length} item(s)`
      : `All research — ${items.length} item(s)`
    const staleness = index?.lastRebuilt
      ? `Index rebuilt: ${index.lastRebuilt.slice(0, 10)}`
      : 'No index — Add an item or click Rebuild'

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); padding: 12px; margin: 0; }
  h2 { font-size: 14px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
  .toolbar { display: flex; gap: 6px; margin-bottom: 14px; }
  button { font-family: inherit; font-size: 12px; padding: 4px 10px; border-radius: 4px; cursor: pointer; border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3)); background: transparent; color: var(--vscode-foreground); }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.12)); }
  button.micro { font-size: 11px; padding: 2px 8px; }
  .item { border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2)); border-radius: 5px; padding: 10px; margin-bottom: 8px; }
  .item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .item-title { font-weight: 600; }
  .item-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; margin-bottom: 4px; flex-wrap: wrap; }
  .subtype { color: var(--vscode-descriptionForeground); }
  .reliability { letter-spacing: -1px; }
  .tag { background: var(--vscode-badge-background, rgba(128,128,128,0.2)); color: var(--vscode-badge-foreground, var(--vscode-foreground)); padding: 1px 5px; border-radius: 3px; font-size: 10px; margin-right: 3px; }
  .preview { color: var(--vscode-foreground); margin: 6px 0 4px; font-size: 12px; opacity: 0.85; }
  .sources { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
  .item-actions { display: flex; align-items: center; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  .item-id { font-size: 10px; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family, monospace); }
  .link { font-size: 10px; background: var(--vscode-textCodeBlock-background); padding: 1px 5px; border-radius: 3px; color: var(--vscode-descriptionForeground); margin-right: 3px; }
  .empty { padding: 32px 16px; text-align: center; color: var(--vscode-descriptionForeground); }
  .badge { color:#000; padding:1px 6px; border-radius:3px; font-size:11px; font-weight:600 }
  fieldset.add-form { border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2)); border-radius: 6px; padding: 10px 14px 12px; margin: 0 0 14px; }
  fieldset.add-form legend { font-size: 11px; color: var(--vscode-descriptionForeground); padding: 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
  .row { display: grid; grid-template-columns: 88px 1fr; gap: 6px 10px; align-items: center; margin-bottom: 6px; }
  input, textarea, select { font-family: inherit; font-size: 12px; padding: 4px 6px; border-radius: 3px; border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3)); background: var(--vscode-input-background); color: var(--vscode-input-foreground); width: 100%; box-sizing: border-box; outline: none; }
  textarea { resize: vertical; }
  .actions-row { display: flex; gap: 6px; margin-top: 8px; }
  details { margin-bottom: 14px; }
  summary { cursor: pointer; font-size: 12px; color: var(--vscode-foreground); user-select: none; padding: 4px 0; }
</style></head><body>
<h2>${esc(headerText)}</h2>
<div class="meta">${activeFile ? esc(activeFile) : 'No active chapter'} — ${esc(staleness)}</div>

<details>
  <summary>+ Add research item</summary>
  <fieldset class="add-form">
    <legend>Capture</legend>
    <div class="row"><label for="r-title">Title</label><input id="r-title" placeholder="Quote, statistic, source name…" /></div>
    <div class="row"><label for="r-subtype">Type</label>
      <select id="r-subtype">${ITEM_SUBTYPES.map((s: string) => `<option value="${s}">${s}</option>`).join('')}</select>
    </div>
    <div class="row"><label for="r-content">Content</label><textarea id="r-content" rows="3" placeholder="The quote, the data, the note…"></textarea></div>
    <div class="row"><label for="r-reliability">Reliability</label>
      <select id="r-reliability">${RELIABILITY_TIERS.map((r: string) => `<option value="${r}"${r === 'secondary' ? ' selected' : ''}>${r}</option>`).join('')}</select>
    </div>
    <div class="row"><label for="r-verification">Verification</label>
      <select id="r-verification">${VERIFICATION_STATES.map((v: string) => `<option value="${v}"${v === 'pending' ? ' selected' : ''}>${v}</option>`).join('')}</select>
    </div>
    <div class="row"><label for="r-tags">Tags</label><input id="r-tags" placeholder="comma, separated, tags" /></div>
    <div class="row"><label for="r-sources">Sources</label><input id="r-sources" placeholder="Author, Title, Year — comma-separated" /></div>
    <div class="row"><label for="r-link">Link to</label><input id="r-link" placeholder="${chapterNumber ? `chapter:${chapterNumber}` : 'chapter:3 or stage:pa-evidence'}" value="${chapterNumber ? `chapter:${chapterNumber}` : ''}" /></div>
    <div class="actions-row">
      <button class="primary" id="add-btn">Add</button>
      <button id="rebuild-btn">Rebuild Index</button>
    </div>
  </fieldset>
</details>

${itemsHtml}

<script>
  const vscode = acquireVsCodeApi();
  const splitCsv = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

  document.getElementById('add-btn')?.addEventListener('click', () => {
    const title = document.getElementById('r-title').value.trim();
    if (!title) { return; }
    vscode.postMessage({
      type: 'add',
      title,
      content:      document.getElementById('r-content').value,
      subtype:      document.getElementById('r-subtype').value,
      reliability:  document.getElementById('r-reliability').value,
      verification: document.getElementById('r-verification').value,
      tags:         splitCsv(document.getElementById('r-tags').value),
      sources:      splitCsv(document.getElementById('r-sources').value),
      linkTarget:   document.getElementById('r-link').value.trim(),
    });
  });
  document.getElementById('rebuild-btn')?.addEventListener('click', () => vscode.postMessage({ type: 'rebuild' }));

  document.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-act');
      const id = btn.getAttribute('data-id');
      if (act === 'remove') vscode.postMessage({ type: 'remove', id });
      if (act === 'link') {
        const target = prompt('Link target (e.g. chapter:3, scene:ch2-s1, stage:pa-evidence)');
        if (target && target.trim()) vscode.postMessage({ type: 'link', id, target: target.trim() });
      }
    });
  });
</script>
</body></html>`
  }
}

function esc(str: string): string {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
