import * as vscode from 'vscode'
import {
  getLatestEmbedBudget,
  onEmbedBudgetChange,
  type EmbedBudgetSnapshot,
} from './semantic-memory-service.js'
import { readSemanticMemoryConfig } from './semantic-memory.js'

/**
 * NT-15 — semantic-memory cost indicator. Status bar item that shows
 * today's daily token usage as a fraction of the budget. Hidden when
 * semantic memory is disabled. Click → detail view (markdown doc) with
 * the latest reading.
 *
 * The reading is captured opportunistically from /embed responses
 * (NT-02 returns budgetUsed + budgetLimit on every call). No extra
 * round-trips. When the writer hasn't done any embedding work yet the
 * status bar reads "Memory: idle".
 */

const COST_PER_MILLION_TOKENS_USD = 0.02

export function registerSemanticMemoryStatusBar(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 88)
  item.command = 'storyline.showSemanticMemoryBudget'

  const refresh = (): void => {
    const cfg = readSemanticMemoryConfig()
    if (!cfg.enabled) {
      item.hide()
      return
    }
    const snap = getLatestEmbedBudget()
    if (!snap) {
      item.text = '$(database) Memory: idle'
      item.tooltip = 'Semantic memory enabled — no embedding activity yet today.'
      item.show()
      return
    }
    item.text = `$(database) ${formatBudget(snap)}`
    item.tooltip = budgetTooltip(snap)
    item.show()
  }

  refresh()

  const unsubscribe = onEmbedBudgetChange(() => refresh())
  context.subscriptions.push(
    item,
    { dispose: () => unsubscribe() },
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('storyline.semanticMemory.enabled')) refresh()
    }),
    vscode.commands.registerCommand('storyline.showSemanticMemoryBudget', () => showBudgetDetailCommand()),
  )
}

async function showBudgetDetailCommand(): Promise<void> {
  const snap = getLatestEmbedBudget()
  if (!snap) {
    void vscode.window.showInformationMessage(
      'No embedding activity recorded yet today. Type or save in your project to populate the index.',
    )
    return
  }
  const md = renderBudgetDetail(snap)
  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: md })
  await vscode.window.showTextDocument(doc, { preview: false })
}

function formatBudget(snap: EmbedBudgetSnapshot): string {
  const cost = (snap.used / 1_000_000) * COST_PER_MILLION_TOKENS_USD
  return `${formatCost(cost)} / ${pct(snap.used, snap.limit)}%`
}

function budgetTooltip(snap: EmbedBudgetSnapshot): string {
  const cost = (snap.used / 1_000_000) * COST_PER_MILLION_TOKENS_USD
  return [
    `Storyline semantic memory — today's usage`,
    ``,
    `Tokens used: ${snap.used.toLocaleString()} / ${snap.limit.toLocaleString()} (${pct(snap.used, snap.limit)}%)`,
    `Cost so far: ${formatCost(cost)}`,
    `Captured: ${snap.capturedAt}`,
    ``,
    `Click for detail.`,
  ].join('\n')
}

function renderBudgetDetail(snap: EmbedBudgetSnapshot): string {
  const cost = (snap.used / 1_000_000) * COST_PER_MILLION_TOKENS_USD
  const remaining = Math.max(0, snap.limit - snap.used)
  const remainingCost = (remaining / 1_000_000) * COST_PER_MILLION_TOKENS_USD
  const lines: string[] = []
  lines.push('# Storyline — semantic-memory cost')
  lines.push('')
  lines.push(`_Snapshot: ${snap.capturedAt}_`)
  lines.push('')
  lines.push('## Today')
  lines.push('')
  lines.push(`- **Tokens used:** ${snap.used.toLocaleString()} / ${snap.limit.toLocaleString()} (${pct(snap.used, snap.limit)}%)`)
  lines.push(`- **Cost so far:** ${formatCost(cost)}`)
  lines.push(`- **Remaining today:** ${remaining.toLocaleString()} tokens (~${formatCost(remainingCost)})`)
  lines.push('')
  lines.push('## How to read this')
  lines.push('')
  lines.push('Storyline embeds your prose using OpenAI `text-embedding-3-small` at $0.02 per million tokens. The daily limit is a sanity cap — at the rate above, indexing a full novel costs less than a quarter of a US cent.')
  lines.push('')
  lines.push('To stop sending text to OpenAI, toggle `storyline.semanticMemory.enabled` to `false`.')
  return lines.join('\n')
}

function pct(used: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.round((used / limit) * 100)
}

function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}
