import * as fs from 'fs'
import * as path from 'path'
import type { ProjectState } from '@storyline/core'
import { getWritingPlan } from '@storyline/core'
import type { FictionChapter, FictionScene, FictionCharacter } from '@storyline/core'

// Canonical beat IDs match packages/core/src/state/project-state.ts. Drift
// here means chapter cards display raw IDs instead of friendly names —
// fixed in FIC-A.4 (Drift D1). The schema-coverage test in
// tests/fiction-drift.test.js fails loudly if a beat is added/renamed in
// the schema without updating this table.
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

function slugify(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function chapterFileName(ch: FictionChapter): string {
  const num = String(ch.chapterNumber ?? 0).padStart(2, '0')
  const slug = slugify(ch.chapterTitle ?? '')
  return slug ? `${num}-${slug}.md` : `${num}.md`
}

function renderSceneContract(sc: FictionScene): string[] {
  const lines: string[] = []
  const hasContract = sc.goal !== undefined || sc.obstacle !== undefined
    || sc.stakes !== undefined || sc.storyTurn !== undefined

  if (!hasContract) {
    lines.push('*(contract not yet planned)*', '')
    return lines
  }

  lines.push(
    `**Goal:** ${sc.goal ?? '(not yet planned)'}`,
    `**Obstacle:** ${sc.obstacle ?? '(not yet planned)'}`,
    `**Stakes:** ${sc.stakes ?? '(not yet planned)'}`,
    `**Turn:** ${sc.storyTurn ?? '(not yet planned)'}`,
  )
  if (sc.valueShiftStart !== undefined || sc.valueShiftEnd !== undefined) {
    lines.push(`**Value shift:** ${sc.valueShiftStart ?? '?'} → ${sc.valueShiftEnd ?? '?'}`)
  }
  if (sc.arcFunction)      lines.push(`**Arc:** ${sc.arcFunction}`)
  if (sc.threadMovement)   lines.push(`**Threads:** ${sc.threadMovement}`)
  if (sc.draftStatus)      lines.push(`**Draft:** ${sc.draftStatus}`)
  lines.push('')
  return lines
}

function renderChapterCard(ch: FictionChapter, protagonist: FictionCharacter | null): string {
  const num = ch.chapterNumber ?? '?'
  const title = ch.chapterTitle ?? `Chapter ${num}`
  const beat = ch.beat ? (BEAT_NAMES[ch.beat] ?? ch.beat) : null

  const lines: string[] = []
  lines.push(`# Chapter ${num} — ${title}`, '')

  const meta: string[] = []
  if (beat) meta.push(`**Beat:** ${beat}`)
  if (ch.scenes.length) {
    const povs = [...new Set(ch.scenes.map(s => s.pov).filter(Boolean))]
    if (povs.length) meta.push(`**POV:** ${povs.join(', ')}`)
    const locs = ch.scenes.map(s => s.location).filter(Boolean)
    if (locs.length) meta.push(`**Location:** ${locs.join(' → ')}`)
  }
  if (ch.estimatedWords) meta.push(`**Target:** ~${Number(ch.estimatedWords).toLocaleString()} words`)
  if (ch.scenes.length) meta.push(`**Scenes:** ${ch.scenes.length}`)
  if (meta.length) { lines.push(meta.join('  ·  '), '') }

  if (protagonist?.name) {
    const want = protagonist.want ? ` · wants **${protagonist.want}**` : ''
    const need = protagonist.need ? ` · needs **${protagonist.need}**` : ''
    const flaw = protagonist.flaw ? ` · flaw: ${protagonist.flaw}` : ''
    lines.push(`> *${protagonist.name}${want}${need}${flaw}*`, '')
  }

  if (!ch.scenes.length) {
    lines.push('_No scenes fleshed out for this chapter yet._', '')
    return lines.join('\n')
  }

  for (const sc of ch.scenes) {
    const sn = sc.sceneNumber ?? '?'
    const stitle = sc.summary ? ` — ${sc.summary}` : ''
    const wc = typeof sc.estimatedWords === 'number' ? ` (~${sc.estimatedWords.toLocaleString()} words)` : ''
    lines.push(`## Scene ${sn}${stitle}${wc}`, '')

    const scMeta: string[] = []
    if (sc.pov)      scMeta.push(`**POV:** ${sc.pov}`)
    if (sc.location) scMeta.push(`**Location:** ${sc.location}`)
    if (sc.timeOfDay) scMeta.push(`**Time:** ${sc.timeOfDay}`)
    if (scMeta.length) { lines.push(scMeta.join('  ·  '), '') }

    if (sc.purpose)     lines.push(`**Purpose:** ${sc.purpose}`)
    if (sc.conflict)    lines.push(`**Conflict:** ${sc.conflict}`)
    if (sc.whatChanges) lines.push(`**What changes:** ${sc.whatChanges}`)
    if (sc.beats)       lines.push(`**Serves beats:** ${sc.beats}`)
    if (sc.notes)       lines.push(`**Notes:** ${sc.notes}`)
    lines.push('')

    lines.push(...renderSceneContract(sc))
  }

  return lines.join('\n').trimEnd() + '\n'
}

export async function writeAllChapterCards(state: Partial<ProjectState>, projectDir: string): Promise<void> {
  const plan = getWritingPlan(state as ProjectState)
  const chapters = plan.fictionChapters
  const chaptersDir = path.join(projectDir, 'docs', 'chapters')
  fs.mkdirSync(chaptersDir, { recursive: true })

  const expectedFiles = new Set<string>()
  for (const ch of chapters) {
    const fileName = chapterFileName(ch)
    expectedFiles.add(fileName)
    const body = renderChapterCard(ch, plan.protagonist)
    fs.writeFileSync(path.join(chaptersDir, fileName), body, 'utf-8')
  }

  // Remove stale cards (pattern: NN-slug.md or NN.md)
  const CARD_RX = /^\d{2}(-[a-z0-9-]+)?\.md$/
  let existing: string[] = []
  try { existing = fs.readdirSync(chaptersDir) } catch { /* empty */ }
  for (const name of existing) {
    if (CARD_RX.test(name) && !expectedFiles.has(name)) {
      fs.unlinkSync(path.join(chaptersDir, name))
    }
  }
}
