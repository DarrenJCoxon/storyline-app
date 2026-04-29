// NF-14.7 — Learning-outcome coverage report.
//
// Generates output/learning-outcome-coverage.md from an AcademicPlan.
// Compares the authoritative outcome list (ac-syllabus) against per-chapter
// declared outcomes (ac-chapters) and reports:
//   - Zero-coverage outcomes (outcomes not claimed by any chapter)
//   - Double-coverage outcomes (outcomes claimed by 2+ chapters)
//   - Full coverage matrix

import type { AcademicPlan, AcademicLearningOutcome } from '../state/writing-plan.js'

export interface OutcomeCoverageResult {
  markdown: string
  gaps: string[]
  doubleCovered: string[]
  coverageMap: Record<string, number[]>
}

export function generateLearningOutcomeCoverage(plan: AcademicPlan): OutcomeCoverageResult {
  const { learningOutcomes, chapters } = plan

  // Build coverage map: outcomeCode → list of chapter numbers claiming it
  const coverageMap: Record<string, number[]> = {}
  for (const outcome of learningOutcomes) {
    coverageMap[outcome.code] = []
  }
  for (const ch of chapters) {
    for (const code of ch.outcomes) {
      if (!coverageMap[code]) coverageMap[code] = []
      if (!coverageMap[code].includes(ch.number)) {
        coverageMap[code].push(ch.number)
      }
    }
  }

  const gaps: string[] = []
  const doubleCovered: string[] = []
  for (const outcome of learningOutcomes) {
    const covered = coverageMap[outcome.code] ?? []
    if (covered.length === 0) gaps.push(outcome.code)
    else if (covered.length > 1) doubleCovered.push(outcome.code)
  }

  const totalOutcomes = learningOutcomes.length
  const coveredCount = totalOutcomes - gaps.length
  const pct = totalOutcomes > 0 ? Math.round((coveredCount / totalOutcomes) * 100) : 0
  const unitLabel = plan.bookType === 'revision-guide' ? 'Topic' : 'Chapter'

  const lines: string[] = [
    '# Learning Outcome Coverage Report',
    '',
    `**Book type:** ${plan.bookType === 'textbook' ? 'Textbook' : 'Revision Guide'}`,
    `**Total outcomes:** ${totalOutcomes}`,
    `**Covered:** ${coveredCount} / ${totalOutcomes} (${pct}%)`,
    `**Gaps:** ${gaps.length}`,
    `**Double-covered:** ${doubleCovered.length}`,
    '',
  ]

  // Coverage matrix
  lines.push('## Coverage matrix', '')
  lines.push(`| Code | Outcome | ${unitLabel}s |`)
  lines.push(`|------|---------|${'---------|'}`)

  const outcomeMap = new Map<string, AcademicLearningOutcome>()
  for (const o of learningOutcomes) outcomeMap.set(o.code, o)

  for (const outcome of learningOutcomes) {
    const covered = coverageMap[outcome.code] ?? []
    const chStr = covered.length === 0
      ? '⚠ **UNCOVERED**'
      : covered.map(n => `${unitLabel} ${n}`).join(', ')
    const text = outcome.text.length > 60 ? outcome.text.slice(0, 57) + '...' : outcome.text
    lines.push(`| ${outcome.code} | ${text} | ${chStr} |`)
  }
  lines.push('')

  // Gaps section
  if (gaps.length > 0) {
    lines.push('## ⚠ Gaps — outcomes with no coverage', '')
    lines.push('These outcomes are not claimed by any chapter. Add them to a chapter or mark as intentionally excluded.')
    lines.push('')
    for (const code of gaps) {
      const o = outcomeMap.get(code)
      lines.push(`- **${code}**: ${o?.text ?? ''}`)
    }
    lines.push('')
  } else {
    lines.push('## ✓ No gaps', '', 'All outcomes are covered by at least one chapter.', '')
  }

  // Double-coverage section
  if (doubleCovered.length > 0) {
    lines.push('## Double-covered outcomes', '')
    lines.push('These outcomes are claimed by multiple chapters. This may be intentional (scaffolded revisiting) or a planning error.')
    lines.push('')
    for (const code of doubleCovered) {
      const covered = coverageMap[code]
      const o = outcomeMap.get(code)
      lines.push(`- **${code}** (${covered.map(n => `${unitLabel} ${n}`).join(', ')}): ${o?.text ?? ''}`)
    }
    lines.push('')
  }

  return { markdown: lines.join('\n').trimEnd() + '\n', gaps, doubleCovered, coverageMap }
}
