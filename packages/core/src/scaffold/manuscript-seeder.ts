import * as fs from 'fs'
import * as path from 'path'
import type { WritingPlan, FictionChapter, FictionScene } from '../state/writing-plan.js'

// Marker written at the top of every seeded manuscript file. Its presence
// indicates the file has not been modified by the writer — safe to overwrite
// (e.g. when new contract fields are captured after initial seeding).
export const MANUSCRIPT_SEED_MARKER = '<!-- storyline:seed:v1 -->'

const BEAT_NAMES: Record<string, string> = {
  beat01OpeningImage:   'Opening Image',
  beat02Setup:          'Setup',
  beat03Catalyst:       'Catalyst',
  beat04Debate:         'Debate',
  beat05BreakIntoTwo:   'Break Into Two',
  beat06BStory:         'B Story',
  beat07FunAndGames:    'Fun and Games',
  beat08Midpoint:       'Midpoint',
  beat09BadGuysCloseIn: 'Bad Guys Close In',
  beat10AllIsLost:      'All Is Lost',
  beat11BlackMoment:    'Black Moment',
  beat12Beat13:         'Break Into Three',
  beat13Finale:         'Finale',
  beat14FinalImage:     'Final Image',
  beat15EndCredits:     'End Credits',
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function contractLine(label: string, value: string | undefined): string {
  return `*${label}: ${value ?? '(not yet planned)'}*`
}

function seedSceneBlock(sc: FictionScene, isLast: boolean): string[] {
  const sTitle = sc.summary ? ` — ${sc.summary}` : ''
  const lines: string[] = [`## Scene ${sc.sceneNumber}${sTitle}`, '']

  const meta: string[] = []
  if (sc.pov) meta.push(`POV: ${sc.pov}`)
  if (sc.location) meta.push(`Location: ${sc.location}`)
  if (sc.timeOfDay) meta.push(`Time: ${sc.timeOfDay}`)
  if (meta.length) lines.push(`> *${meta.join(' · ')}*`, '')

  lines.push(
    contractLine('Goal', sc.goal),
    contractLine('Obstacle', sc.obstacle),
    contractLine('Stakes', sc.stakes),
    contractLine('Turn', sc.storyTurn),
  )

  if (sc.valueShiftStart !== undefined || sc.valueShiftEnd !== undefined) {
    lines.push(`*Value shift: ${sc.valueShiftStart ?? '?'} → ${sc.valueShiftEnd ?? '?'}*`)
  }

  if (sc.estimatedWords) {
    lines.push('', `*Target: ~${sc.estimatedWords.toLocaleString()} words*`)
  }

  lines.push('', '<!-- Write your prose below -->', '', '')

  if (!isLast) lines.push('---', '')

  return lines
}

export function seedChapterContent(ch: FictionChapter): string {
  const title = ch.chapterTitle ?? `Chapter ${ch.chapterNumber}`
  const beatName = ch.beat ? (BEAT_NAMES[ch.beat] ?? ch.beat) : null

  const lines: string[] = [MANUSCRIPT_SEED_MARKER, '', `# Chapter ${ch.chapterNumber} — ${title}`, '']

  if (beatName) lines.push(`> *Beat: ${beatName}*`, '')

  if (ch.scenes.length === 0) {
    lines.push('*No scenes planned yet. Return after the chapter flesh-out stage.*', '')
    return lines.join('\n').trimEnd() + '\n'
  }

  for (let i = 0; i < ch.scenes.length; i++) {
    lines.push(...seedSceneBlock(ch.scenes[i], i === ch.scenes.length - 1))
  }

  return lines.join('\n').trimEnd() + '\n'
}

export function chapterManuscriptPath(ch: FictionChapter): string {
  const slug = slugify(ch.chapterTitle ?? `chapter-${ch.chapterNumber}`)
  const filename = slug ? `${pad(ch.chapterNumber)}-${slug}.md` : `${pad(ch.chapterNumber)}.md`
  return path.join('manuscript', filename)
}

function isSeedFile(content: string): boolean {
  return content.trimStart().startsWith(MANUSCRIPT_SEED_MARKER)
}

/**
 * Seeds per-chapter manuscript files from a normalized WritingPlan.
 *
 * Write-if-missing semantics: a file is written only if it does not exist,
 * OR if it exists but still contains the seed marker (meaning the writer
 * has not yet touched it). Modified prose is never overwritten.
 *
 * Mode-aware: only runs for fiction projects (plan.mode === 'fiction').
 * NF seeding (NF-11.6) will use the same function with nfChapters.
 */
export function seedManuscriptFromPlan(plan: WritingPlan, projectDir: string): void {
  if (plan.mode !== 'fiction') return
  if (plan.fictionChapters.length === 0) return

  const manuscriptDir = path.join(projectDir, 'manuscript')
  fs.mkdirSync(manuscriptDir, { recursive: true })

  for (const ch of plan.fictionChapters) {
    const relPath = chapterManuscriptPath(ch)
    const filePath = path.join(projectDir, relPath)
    const content = seedChapterContent(ch)

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8')
      continue
    }

    const existing = fs.readFileSync(filePath, 'utf-8')
    if (isSeedFile(existing)) {
      // Seed marker present — writer hasn't started drafting; safe to refresh
      // (e.g. contract fields have been added since initial seeding).
      fs.writeFileSync(filePath, content, 'utf-8')
    }
  }
}
