import * as fs from 'fs'
import * as path from 'path'
import type { WritingPlan, FictionChapter, FictionScene, NfChapter, ClaimEvidenceItem, FigurePlanItem } from '../state/writing-plan.js'

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

// ── NF seeding (NF-11.6) ─────────────────────────────────────────────────────

export function nfChapterManuscriptPath(ch: NfChapter): string {
  return ch.manuscriptFile
}

export function seedNfChapterContent(ch: NfChapter, claims: ClaimEvidenceItem[] = [], figures: FigurePlanItem[] = []): string {
  const num = ch.number ?? 1
  const title = ch.title ?? `Chapter ${num}`

  const lines: string[] = [MANUSCRIPT_SEED_MARKER, '', `# Chapter ${num} — ${title}`, '']

  if (ch.mission) lines.push(`> *${ch.mission}*`, '')
  if (ch.linkedPrinciple)   lines.push(`> *Principle: ${ch.linkedPrinciple}*`, '')
  if (ch.chapterQuestion)   lines.push(`> *Question: ${ch.chapterQuestion}*`, '')
  if (ch.learningObjective) lines.push(`> *Objective: ${ch.learningObjective}*`, '')
  if (ch.wordCountEstimate) lines.push(`> *Target: ~${Number(ch.wordCountEstimate).toLocaleString()} words*`, '')

  if (ch.sections.length === 0) {
    lines.push('*No sections planned yet. Return after the chapter-plan stage.*', '')
    return lines.join('\n').trimEnd() + '\n'
  }

  const chapterClaims = claims.filter(c => c.chapterNumber === ch.number)
  const chapterFigures = figures.filter(f => f.chapterNumber === ch.number)

  for (let i = 0; i < ch.sections.length; i++) {
    const sec = ch.sections[i]
    lines.push(`## ${sec.title}`, '')
    if (sec.notes) lines.push(`*Section purpose: ${sec.notes}*`, '')
    if (sec.keyResearch) lines.push(`{{research: ${sec.keyResearch}}}`, '')
    // NF-12.3: emit {{claim: <id>}} markers in evidence sections
    if (sec.type === 'evidence') {
      for (const c of chapterClaims) lines.push(`{{claim: ${c.id}}}`, '')
    }
    // NF-13.3: emit {{figure: <id>}} markers where section title matches, or in first section
    const sectionFigures = chapterFigures.filter(f =>
      f.sectionTitle ? f.sectionTitle === sec.title : i === 0,
    )
    for (const f of sectionFigures) lines.push(`{{figure: ${f.id}}}`, '')
    lines.push('<!-- Write your prose below -->', '', '')
    if (i < ch.sections.length - 1) lines.push('---', '')
  }

  return lines.join('\n').trimEnd() + '\n'
}

/**
 * Seeds per-chapter manuscript files from a normalized WritingPlan.
 *
 * Write-if-missing semantics: a file is written only if it does not exist,
 * OR if it exists but still contains the seed marker (meaning the writer
 * has not yet touched it). Modified prose is never overwritten.
 *
 * Mode-aware: branches on plan.mode to seed fiction scenes or NF sections.
 */
export function seedManuscriptFromPlan(plan: WritingPlan, projectDir: string): void {
  const manuscriptDir = path.join(projectDir, 'manuscript')
  fs.mkdirSync(manuscriptDir, { recursive: true })

  if (plan.mode === 'nonfiction') {
    if (plan.nfChapters.length === 0) return
    for (const ch of plan.nfChapters) {
      const filePath = path.join(projectDir, nfChapterManuscriptPath(ch))
      const content = seedNfChapterContent(ch, plan.claims, plan.figures)
      writeIfMissing(filePath, content)
    }
    return
  }

  if (plan.fictionChapters.length === 0) return
  for (const ch of plan.fictionChapters) {
    const relPath = chapterManuscriptPath(ch)
    const filePath = path.join(projectDir, relPath)
    const content = seedChapterContent(ch)
    writeIfMissing(filePath, content)
  }
}

function writeIfMissing(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    return
  }
  const existing = fs.readFileSync(filePath, 'utf-8')
  if (isSeedFile(existing)) {
    fs.writeFileSync(filePath, content, 'utf-8')
  }
}
