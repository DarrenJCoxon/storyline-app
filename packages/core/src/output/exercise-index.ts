// NF-14.8 — Exercise/worked-example index.
//
// Produces output/exercise-index.md listing all worked examples and exercises
// (textbook) or exam-style questions (revision guide) by chapter.
// Flags chapters missing exercises (textbook) or exam-practice questions (revision guide).

import type { AcademicPlan } from '../state/writing-plan.js'

export interface ExerciseIndexResult {
  markdown: string
  chaptersWithoutExercises: number[]
  difficultyDistribution: Record<string, number>
}

export function generateExerciseIndex(plan: AcademicPlan): ExerciseIndexResult {
  const unitLabel = plan.bookType === 'revision-guide' ? 'Topic' : 'Chapter'
  const chaptersWithoutExercises: number[] = []
  const difficultyDistribution: Record<string, number> = {}

  const lines: string[] = [
    '# Exercise & Worked-Example Index',
    '',
    `**Book type:** ${plan.bookType === 'textbook' ? 'Textbook' : 'Revision Guide'}`,
    '',
  ]

  if (plan.bookType === 'textbook') {
    let totalWE = 0
    let totalEx = 0

    for (const ch of plan.chapters) {
      lines.push(`## ${unitLabel} ${ch.number} — ${ch.title ?? `${unitLabel} ${ch.number}`}`, '')

      if (ch.workedExamples.length) {
        lines.push('**Worked examples:**', '')
        for (const we of ch.workedExamples) {
          const diff = we.difficulty ?? 'unspecified'
          difficultyDistribution[diff] = (difficultyDistribution[diff] ?? 0) + 1
          lines.push(`- \`${we.id}\` — ${we.title ?? we.id} *(${diff})*`)
          totalWE++
        }
        lines.push('')
      }

      if (ch.exercises.length) {
        lines.push('**Exercises:**', '')
        for (const ex of ch.exercises) {
          const diff = ex.difficulty ?? 'unspecified'
          difficultyDistribution[diff] = (difficultyDistribution[diff] ?? 0) + 1
          lines.push(`- \`${ex.id}\` — ${ex.title ?? ex.id} *(${diff})*`)
          totalEx++
        }
        lines.push('')
      }

      if (ch.exercises.length === 0) {
        lines.push('⚠ *No exercises declared.*', '')
        chaptersWithoutExercises.push(ch.number)
      }
    }

    lines.push('---', '')
    lines.push(`**Total worked examples:** ${totalWE}`)
    lines.push(`**Total exercises:** ${totalEx}`, '')

    if (Object.keys(difficultyDistribution).length) {
      lines.push('**Difficulty distribution:**', '')
      for (const [diff, count] of Object.entries(difficultyDistribution).sort()) {
        lines.push(`- ${diff}: ${count}`)
      }
      lines.push('')
    }

    if (chaptersWithoutExercises.length) {
      lines.push('## ⚠ Chapters missing exercises', '', 'These chapters have no exercises declared:')
      lines.push('These chapters have no worked examples or exercises declared:')
      lines.push('')
      for (const n of chaptersWithoutExercises) {
        const ch = plan.chapters.find(c => c.number === n)
        lines.push(`- **${unitLabel} ${n}**: ${ch?.title ?? ''}`)
      }
      lines.push('')
    }
  } else {
    // Revision guide: exam-practice summary per topic
    let totalQuestions = 0

    for (const ch of plan.chapters) {
      lines.push(`## ${unitLabel} ${ch.number} — ${ch.title ?? `${unitLabel} ${ch.number}`}`, '')

      const hasExamPractice = ch.examPractice && ch.examPractice.length > 0
      const hasRecall = (ch.recallQuestions ?? 0) > 0

      if (hasRecall) {
        lines.push(`**Recall questions:** ${ch.recallQuestions}`)
        totalQuestions += ch.recallQuestions ?? 0
      }

      if (hasExamPractice) {
        lines.push('**Exam practice:**', '')
        for (const ep of ch.examPractice) {
          lines.push(`- ${ep.type}: ${ep.count}`)
          totalQuestions += ep.count
        }
        lines.push('')
      }

      if (!hasExamPractice) {
        lines.push('⚠ *No exam-style questions declared.*', '')
        chaptersWithoutExercises.push(ch.number)
      }
    }

    lines.push('---', '')
    lines.push(`**Total questions:** ${totalQuestions}`, '')

    if (chaptersWithoutExercises.length) {
      lines.push('## ⚠ Topics missing exam-style questions', '')
      for (const n of chaptersWithoutExercises) {
        const ch = plan.chapters.find(c => c.number === n)
        lines.push(`- **${unitLabel} ${n}**: ${ch?.title ?? ''}`)
      }
      lines.push('')
    }
  }

  return {
    markdown: lines.join('\n').trimEnd() + '\n',
    chaptersWithoutExercises,
    difficultyDistribution,
  }
}
