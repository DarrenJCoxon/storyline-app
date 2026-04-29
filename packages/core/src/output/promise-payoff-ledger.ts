import * as fs from 'fs'
import * as path from 'path'
import type { WritingPlan, PromisePayoffItem, PromiseRisk } from '../state/writing-plan.js'
import { findFictionPromiseGaps } from '../critique/promise-payoff.js'

const RISK_ORDER: Record<PromiseRisk, number> = { high: 0, medium: 1, low: 2 }
const STATUS_ORDER = { unresolved: 0, 'set-up': 1, planned: 2, 'paid-off': 3 }

function riskBadge(risk: PromiseRisk): string {
  if (risk === 'high') return '🔴'
  if (risk === 'medium') return '🟡'
  return '🟢'
}

function chapterRef(ch: number | null, sc: number | null): string {
  if (ch === null) return '—'
  return sc !== null ? `Ch ${ch}, Sc ${sc}` : `Ch ${ch}`
}

function renderPromiseRow(p: PromisePayoffItem): string {
  const setup = chapterRef(p.setupChapter, p.setupScene)
  const payoff = chapterRef(p.plannedPayoffChapter, p.plannedPayoffScene)
  const actual = p.actualPayoffChapter !== null ? chapterRef(p.actualPayoffChapter, p.actualPayoffScene) : '—'
  const badge = riskBadge(p.risk)
  return `| ${badge} | ${p.type} | ${p.description} | ${setup} | ${payoff} | ${actual} | ${p.status} |`
}

function renderSection(title: string, items: PromisePayoffItem[]): string[] {
  if (items.length === 0) return []
  const lines = [`### ${title}`, '', '| Risk | Type | Promise | Set up | Planned payoff | Actual payoff | Status |', '|------|------|---------|--------|----------------|---------------|--------|']
  for (const p of items) lines.push(renderPromiseRow(p))
  lines.push('')
  return lines
}

export interface LedgerResult {
  outputPath: string
  totalPromises: number
  unresolvedCount: number
  highRiskCount: number
}

export function generatePromisePayoffLedger(plan: WritingPlan, projectDir: string): LedgerResult {
  const outputDir = path.join(projectDir, 'planning')
  fs.mkdirSync(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, 'promise-payoff-ledger.md')
  const title = plan.title ?? 'Untitled'

  const all = [...plan.promises].sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (statusDiff !== 0) return statusDiff
    return RISK_ORDER[a.risk] - RISK_ORDER[b.risk]
  })

  const unresolved = all.filter(p => p.status === 'unresolved')
  const setUp = all.filter(p => p.status === 'set-up')
  const planned = all.filter(p => p.status === 'planned')
  const paidOff = all.filter(p => p.status === 'paid-off')
  const highRisk = all.filter(p => p.risk === 'high')

  const gaps = findFictionPromiseGaps(plan)
  const top3 = gaps.slice(0, 3)

  const lines: string[] = [
    `# Promise / Payoff Ledger — ${title}`,
    '',
    `*Generated: ${new Date().toISOString().split('T')[0]}*`,
    `*${all.length} promise${all.length !== 1 ? 's' : ''} tracked · ${highRisk.length} high risk · ${unresolved.length} unresolved*`,
    '',
  ]

  if (all.length === 0) {
    lines.push('*No plot threads found. Complete the Plot Thread Registry stage to populate this ledger.*', '')
  } else {
    if (top3.length > 0) {
      lines.push('## Risk Summary', '')
      for (const g of top3) {
        lines.push(`- **${g.promise.description}** (${g.promise.type}): ${g.gapDescription}`)
      }
      lines.push('')
    }

    lines.push('## Promise Tracker', '')
    lines.push(...renderSection('Unresolved', unresolved))
    lines.push(...renderSection('Set up (no resolution plan)', setUp))
    lines.push(...renderSection('Planned', planned))
    lines.push(...renderSection('Paid off', paidOff))
  }

  lines.push('---', '*Storyline Promise/Payoff Ledger — updated on every plot-thread or chapter save.*')

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8')

  return {
    outputPath,
    totalPromises: all.length,
    unresolvedCount: unresolved.length,
    highRiskCount: highRisk.length,
  }
}
