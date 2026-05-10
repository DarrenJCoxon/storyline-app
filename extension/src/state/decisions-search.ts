import * as vscode from 'vscode'
import { getSemanticMemoryService } from './semantic-memory-service.js'
import { ensureOptIn, readSemanticMemoryConfig } from './semantic-memory.js'
import { readDecisions, type DecisionRecord } from './decisions.js'

/**
 * NT-13 — `/why` search. Reuses NT-07a's plumbing with a documentType
 * filter so only decision chunks come back. Falls through to local
 * decisions.jsonl if NuVector is empty (e.g. user opted in late and
 * hasn't reindexed).
 */

export async function whyDecisionSearchCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    void vscode.window.showWarningMessage('Open a Storyline project first.')
    return
  }
  const projectRoot = folder.uri.fsPath

  const outcome = await ensureOptIn()
  if (outcome === 'declined' || outcome === 'already-declined') {
    void vscode.window.showInformationMessage(
      'Semantic memory is off — enable storyline.semanticMemory.enabled to search decisions.',
    )
    return
  }
  if (!readSemanticMemoryConfig().enabled) return

  const query = await vscode.window.showInputBox({
    prompt: 'Why did I … ? (search the decision log by meaning)',
    placeHolder: 'e.g. why did I cut the bar fight?',
    ignoreFocusOut: true,
  })
  if (!query || query.trim().length === 0) return

  const service = getSemanticMemoryService()
  if (!service) {
    void vscode.window.showWarningMessage('Semantic memory service not ready.')
    return
  }

  const pack = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Searching decisions: "${truncate(query, 60)}"…` },
    async () => {
      // Use the public search() then filter to decision documentType. The
      // service's search wraps retrieveContext; for now we do a topK=20
      // and filter client-side to keep API surface simple.
      return service.search(query, { topK: 20 })
    },
  )

  const allDecisions = readDecisions(projectRoot)

  type Pick = vscode.QuickPickItem & { decisionId: string }
  let items: Pick[] = []

  if (pack && pack.items.length > 0) {
    items = pack.items
      .filter(it => it.metadata?.documentType === 'storyline_decision')
      .map(it => {
        const id = (it.metadata?.decisionId as string) ?? it.ref
        const stage = (it.metadata?.stage as string) ?? '—'
        const kind = (it.metadata?.decisionKind as string) ?? '—'
        const ts = (it.metadata?.timestamp as string) ?? ''
        return {
          label: `${stage} · ${kind}`,
          description: ts.slice(0, 10),
          detail: oneLine((it.metadata?.why as string) ?? it.text ?? '', 200),
          decisionId: id,
        }
      })
  }

  // Fallback: if NuVector returned nothing but the JSONL has entries,
  // do a substring match on the local file so the writer isn't stuck.
  if (items.length === 0 && allDecisions.length > 0) {
    const q = query.toLowerCase()
    items = allDecisions
      .filter(d => (d.why ?? '').toLowerCase().includes(q) || d.stage.toLowerCase().includes(q))
      .slice(0, 20)
      .map(d => ({
        label: `${d.stage} · ${d.kind}`,
        description: d.timestamp.slice(0, 10),
        detail: oneLine(d.why, 200),
        decisionId: d.id,
      }))
  }

  if (items.length === 0) {
    void vscode.window.showInformationMessage('No matching decisions found.')
    return
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: `Decision matches for "${truncate(query, 50)}"`,
    placeHolder: 'Pick a decision to see the diff',
    matchOnDetail: true,
  })
  if (!picked) return

  const record = allDecisions.find(d => d.id === picked.decisionId)
  if (!record) {
    void vscode.window.showWarningMessage(`Decision ${picked.decisionId} not in local log.`)
    return
  }

  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: renderDecisionForViewer(record),
  })
  await vscode.window.showTextDocument(doc, { preview: false })
}

function renderDecisionForViewer(d: DecisionRecord): string {
  const lines: string[] = []
  lines.push(`# Decision ${d.id}`)
  lines.push('')
  lines.push(`- **Stage:** ${d.stage}`)
  lines.push(`- **Kind:** ${d.kind}`)
  lines.push(`- **When:** ${d.timestamp}`)
  if (d.why) {
    lines.push('')
    lines.push('## Why')
    lines.push('')
    lines.push(d.why)
  }
  if (d.before && Object.keys(d.before).length > 0) {
    lines.push('')
    lines.push('## Before')
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(d.before, null, 2))
    lines.push('```')
  }
  if (d.after && Object.keys(d.after).length > 0) {
    lines.push('')
    lines.push('## After')
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(d.after, null, 2))
    lines.push('```')
  }
  return lines.join('\n')
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function oneLine(s: string, max: number): string {
  const collapsed = s.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed
}
