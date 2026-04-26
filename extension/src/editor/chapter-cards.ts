import * as fs from 'fs'
import * as path from 'path'
import type { ProjectState } from '@storyline/core'

const BEAT_NAMES: Record<string, string> = {
  beat01OpeningImage:        'Opening Image',
  beat02Setup:               'Setup',
  beat03Catalyst:            'Catalyst',
  beat04Debate:              'Debate',
  beat05BreakIntoTwo:        'Break Into Two',
  beat06BStory:              'B Story',
  beat07FunAndGames:         'Fun and Games',
  beat08Midpoint:            'Midpoint',
  beat09BadGuysCloseIn:      'Bad Guys Close In',
  beat10AllIsLost:           'All Is Lost',
  beat11DarkNightOfTheSoul:  'Dark Night of the Soul',
  beat12BreakIntoThree:      'Break Into Three',
  beat13Finale:              'Finale',
  beat14FinalImage:          'Final Image',
  beat15EndCredits:          'End Credits',
}

function slugify(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chapterFileName(ch: any): string {
  const num = String(ch.chapterNumber ?? 0).padStart(2, '0')
  const slug = slugify(ch.chapterTitle ?? '')
  return slug ? `${num}-${slug}.md` : `${num}.md`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderChapterCard(ch: any, state: Partial<ProjectState>): string {
  const num = ch.chapterNumber ?? '?'
  const title = ch.chapterTitle ?? `Chapter ${num}`
  const beat = ch.beat ? (BEAT_NAMES[ch.beat] ?? ch.beat) : null
  const scenes: any[] = ch.scenes ?? []

  const lines: string[] = []
  lines.push(`# Chapter ${num} — ${title}`, '')

  const meta: string[] = []
  if (beat) meta.push(`**Beat:** ${beat}`)
  if (scenes.length) {
    const povs = [...new Set(scenes.map((s: any) => s.pov).filter(Boolean))]
    if (povs.length) meta.push(`**POV:** ${povs.join(', ')}`)
    const locs = scenes.map((s: any) => s.location).filter(Boolean)
    if (locs.length) meta.push(`**Location:** ${locs.join(' → ')}`)
  }
  if (ch.estimatedWords) meta.push(`**Target:** ~${Number(ch.estimatedWords).toLocaleString()} words`)
  if (scenes.length) meta.push(`**Scenes:** ${scenes.length}`)
  if (meta.length) { lines.push(meta.join('  ·  '), '') }

  const proto = (state as any)?.protagonist
  if (proto?.name) {
    const want = proto.want ? ` · wants **${proto.want}**` : ''
    const need = proto.need ? ` · needs **${proto.need}**` : ''
    const flaw = proto.flaw ? ` · flaw: ${proto.flaw}` : ''
    lines.push(`> *${proto.name}${want}${need}${flaw}*`, '')
  }

  if (!scenes.length) {
    lines.push('_No scenes fleshed out for this chapter yet._', '')
    return lines.join('\n')
  }

  for (const sc of scenes) {
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
  }

  return lines.join('\n').trimEnd() + '\n'
}

export async function writeAllChapterCards(state: Partial<ProjectState>, projectDir: string): Promise<void> {
  const chapters: any[] = (state as any)?.chapterOutline ?? []
  const chaptersDir = path.join(projectDir, 'docs', 'chapters')
  fs.mkdirSync(chaptersDir, { recursive: true })

  const expectedFiles = new Set<string>()
  for (const ch of chapters) {
    const fileName = chapterFileName(ch)
    expectedFiles.add(fileName)
    const body = renderChapterCard(ch, state)
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
