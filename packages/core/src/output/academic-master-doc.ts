// NF-14.9 — Academic master document.
//
// Generates output/academic-master-document.md from an academic WritingPlan.
// Sections: Book DNA (level, spec, assessment), Outcome inventory, Coverage
// summary, Prerequisite chain, Glossary preview (first 10 terms), Chapter
// plan with outcomes/terms/exercises, Exercise index summary, Figure registry
// summary, Claim risk overview.

import * as fs from 'fs'
import * as path from 'path'
import type { WritingPlan } from '../state/writing-plan.js'
import type { ProjectState } from '../state/project-state.js'
import { generateLearningOutcomeCoverage } from './learning-outcome-coverage.js'
import { generatePrerequisiteChain } from './prerequisite-chain.js'
import { generateGlossary } from './glossary.js'
import { generateExerciseIndex } from './exercise-index.js'

export interface AcademicMasterDocResult {
  outputPath: string
  chapterCount: number
  outcomeCount: number
  gaps: number
  cycles: number
}

export function generateAcademicMasterDocument(
  plan: WritingPlan,
  state: ProjectState,
  projectDir: string,
): AcademicMasterDocResult {
  const outputDir = path.join(projectDir, 'output')
  fs.mkdirSync(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, 'academic-master-document.md')
  const academic = plan.academic!
  const title = plan.title ?? 'Untitled'
  const unitLabel = academic.bookType === 'revision-guide' ? 'Topic' : 'Chapter'
  const bookTypeLabel = academic.bookType === 'textbook' ? 'Textbook' : 'Revision Guide'

  const coverage = generateLearningOutcomeCoverage(academic)
  const prereq = generatePrerequisiteChain(academic)
  const glossary = generateGlossary(academic)
  const exIndex = generateExerciseIndex(academic)

  const nf = (state.nfStages ?? {}) as Record<string, Record<string, unknown>>
  const top = state as unknown as Record<string, Record<string, unknown>>
  function stg(key: string): Record<string, unknown> {
    return (nf[key] ?? top[key] ?? {}) as Record<string, unknown>
  }
  function str(v: unknown): string { return typeof v === 'string' && v ? v : '—' }

  const lines: string[] = [
    `# ${title}`,
    '',
    `*Academic Planning Document — ${bookTypeLabel}*`,
    `*Generated: ${new Date().toISOString().split('T')[0]}*`,
    '',
    '---',
    '',
  ]

  // ── Book DNA ────────────────────────────────────────────────────────────────
  lines.push('## Book DNA', '')
  lines.push(`**Book type:** ${bookTypeLabel}`)
  lines.push(`**Academic level:** ${str(academic.level)}`)
  lines.push(`**Specification / syllabus:** ${str(academic.specReference)}`)
  lines.push(`**Assessment shape:** ${str(academic.assessmentShape)}`)

  const dnaPromise = stg('dna-promise')
  const corePromise = str(dnaPromise.corePromise)
  if (corePromise !== '—') lines.push(`**Core promise:** ${corePromise}`)

  const dnaReader = stg('dna-reader')
  const targetReader = str(dnaReader.targetReader ?? dnaReader.reader)
  if (targetReader !== '—') lines.push(`**Target reader:** ${targetReader}`)

  lines.push('')

  // ── Outcome inventory ───────────────────────────────────────────────────────
  lines.push('## Outcome inventory', '')
  lines.push(`**Total outcomes:** ${academic.learningOutcomes.length}`)
  lines.push(`**Coverage:** ${academic.learningOutcomes.length - coverage.gaps.length} / ${academic.learningOutcomes.length} (${
    academic.learningOutcomes.length > 0
      ? Math.round(((academic.learningOutcomes.length - coverage.gaps.length) / academic.learningOutcomes.length) * 100)
      : 0
  }%)`)
  if (coverage.gaps.length) lines.push(`**Gaps:** ${coverage.gaps.join(', ')} ⚠`)
  if (coverage.doubleCovered.length) lines.push(`**Double-covered:** ${coverage.doubleCovered.join(', ')}`)
  lines.push('')

  if (academic.learningOutcomes.length) {
    lines.push('| Code | Outcome |')
    lines.push('|------|---------|')
    for (const o of academic.learningOutcomes) {
      const text = o.text.length > 70 ? o.text.slice(0, 67) + '...' : o.text
      lines.push(`| ${o.code} | ${text} |`)
    }
    lines.push('')
  }

  // ── Prerequisite chain ──────────────────────────────────────────────────────
  lines.push('## Prerequisite chain', '')
  if (prereq.cycles.length) {
    lines.push(`⛔ **${prereq.cycles.length} cycle(s) detected** — resolve before drafting.`)
    for (const cycle of prereq.cycles) {
      lines.push(`- ${cycle.map(n => `${unitLabel} ${n}`).join(' → ')}`)
    }
    lines.push('')
  }
  if (prereq.forwardRefs.length) {
    lines.push(`⚠ **${prereq.forwardRefs.length} forward reference(s)** detected.`)
    for (const fr of prereq.forwardRefs) {
      lines.push(`- ${unitLabel} ${fr.chapter} lists ${unitLabel} ${fr.prereq} as a prerequisite`)
    }
    lines.push('')
  }
  if (prereq.topologicalOrder.length === academic.chapters.length) {
    lines.push(`**Recommended order:** ${prereq.topologicalOrder.map(n => `${unitLabel} ${n}`).join(' → ')}`, '')
  }

  // ── Chapter plan ────────────────────────────────────────────────────────────
  lines.push('## Chapter plan', '')
  for (const ch of academic.chapters) {
    const covered = coverage.coverageMap
    lines.push(`### ${unitLabel} ${ch.number} — ${ch.title ?? `${unitLabel} ${ch.number}`}`)
    if (ch.wordTarget) lines.push(`*~${ch.wordTarget.toLocaleString()} words*`)
    if (ch.prerequisites.length) lines.push(`*Prerequisites: ${ch.prerequisites.map(n => `${unitLabel} ${n}`).join(', ')}*`)
    if (ch.outcomes.length) lines.push(`*Outcomes: ${ch.outcomes.join(', ')}*`)
    if (ch.keyTerms.length) lines.push(`*Key terms: ${ch.keyTerms.join(', ')}*`)
    if (academic.bookType === 'textbook') {
      if (ch.workedExamples.length) lines.push(`*Worked examples: ${ch.workedExamples.map(w => w.id).join(', ')}*`)
      if (ch.exercises.length) lines.push(`*Exercises: ${ch.exercises.map(e => e.id).join(', ')}*`)
    } else {
      if (ch.recallQuestions) lines.push(`*Recall questions: ${ch.recallQuestions}*`)
      if (ch.examPractice?.length) lines.push(`*Exam practice: ${ch.examPractice.map(ep => `${ep.count} ${ep.type}`).join(', ')}*`)
    }
    lines.push('')
  }

  // ── Glossary preview (first 10 terms) ───────────────────────────────────────
  lines.push('## Glossary preview', '')
  const previewTerms = glossary.terms.slice(0, 10)
  if (previewTerms.length) {
    for (const { term, firstChapter } of previewTerms) {
      lines.push(`- **${term}** *(${unitLabel} ${firstChapter})*`)
    }
    if (glossary.terms.length > 10) {
      lines.push(`- *… and ${glossary.terms.length - 10} more — see output/glossary.md*`)
    }
    lines.push('')
  } else {
    lines.push('*No key terms declared yet.*', '')
  }

  // ── Exercise index summary ──────────────────────────────────────────────────
  if (academic.bookType === 'textbook') {
    lines.push('## Exercise summary', '')
    lines.push(`**Worked examples:** ${academic.workedExamples.length}`)
    lines.push(`**Exercises:** ${academic.exercises.length}`)
    if (exIndex.chaptersWithoutExercises.length) {
      lines.push(`**Chapters missing exercises:** ${exIndex.chaptersWithoutExercises.map(n => `${unitLabel} ${n}`).join(', ')} ⚠`)
    }
    if (Object.keys(exIndex.difficultyDistribution).length) {
      const dist = Object.entries(exIndex.difficultyDistribution)
        .sort()
        .map(([d, n]) => `${d}: ${n}`)
        .join(', ')
      lines.push(`**Difficulty distribution:** ${dist}`)
    }
    lines.push('')
  }

  // ── Figure registry summary ─────────────────────────────────────────────────
  if (plan.figures.length) {
    lines.push('## Figure registry summary', '')
    lines.push(`**Total figures planned:** ${plan.figures.length}`)
    const byStatus: Record<string, number> = {}
    for (const f of plan.figures) {
      byStatus[f.status] = (byStatus[f.status] ?? 0) + 1
    }
    for (const [status, count] of Object.entries(byStatus)) {
      lines.push(`- ${status}: ${count}`)
    }
    lines.push('', `*Full registry: output/figure-registry.md*`, '')
  }

  // ── Claim risk overview ─────────────────────────────────────────────────────
  if (plan.claims.length) {
    lines.push('## Claim risk overview', '')
    lines.push(`**Total claims tracked:** ${plan.claims.length}`)
    const highRisk = plan.claims.filter(c => c.risk === 'high')
    if (highRisk.length) {
      lines.push(`**High-risk claims:** ${highRisk.length} ⚠`)
      for (const c of highRisk.slice(0, 5)) {
        lines.push(`- ${c.id}: ${c.claimText.slice(0, 80)}`)
      }
    }
    lines.push('', `*Full ledger: output/claim-evidence-ledger.md*`, '')
  }

  const markdown = lines.join('\n').trimEnd() + '\n'
  fs.writeFileSync(outputPath, markdown, 'utf-8')

  return {
    outputPath,
    chapterCount: academic.chapters.length,
    outcomeCount: academic.learningOutcomes.length,
    gaps: coverage.gaps.length,
    cycles: prereq.cycles.length,
  }
}
