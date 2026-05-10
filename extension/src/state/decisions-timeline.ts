import * as vscode from 'vscode'
import { readDecisions, type DecisionRecord } from './decisions.js'

/**
 * NT-14 — decision timeline. Pragmatic v1: render the decisions log
 * as a markdown document opened in a regular editor tab, grouped by
 * date. A full webview with vertical timeline + filter chips lives in
 * a follow-up — the markdown render gives the writer the same audit
 * trail without any webview HTML/CSS work.
 */

export async function showDecisionTimelineCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    void vscode.window.showWarningMessage('Open a Storyline project first.')
    return
  }
  const records = readDecisions(folder.uri.fsPath)
  if (records.length === 0) {
    void vscode.window.showInformationMessage('No decisions logged yet — keep planning, they\'ll accumulate.')
    return
  }
  const md = renderTimeline(records)
  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: md })
  await vscode.window.showTextDocument(doc, { preview: false })
}

function renderTimeline(records: DecisionRecord[]): string {
  // Sorted most-recent first by readDecisions.
  const grouped = new Map<string, DecisionRecord[]>()
  for (const r of records) {
    const day = r.timestamp.slice(0, 10)
    const bucket = grouped.get(day) ?? []
    bucket.push(r)
    grouped.set(day, bucket)
  }

  const lines: string[] = []
  lines.push('# Storyline — decision timeline')
  lines.push('')
  lines.push(`_${records.length} decisions across ${grouped.size} day(s). Most recent first._`)
  lines.push('')

  for (const [day, bucket] of grouped) {
    lines.push(`## ${day}`)
    lines.push('')
    for (const d of bucket) {
      const time = d.timestamp.slice(11, 16)
      const why = d.why ? ` — ${oneLine(d.why, 140)}` : ''
      lines.push(`- **${time}** · ${d.stage} · ${d.kind}${why}`)
      lines.push(`  - id: \`${d.id}\``)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('Run `Storyline: Why — Search Decisions` to find a specific decision by meaning.')
  return lines.join('\n')
}

function oneLine(s: string, max: number): string {
  const collapsed = s.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed
}
