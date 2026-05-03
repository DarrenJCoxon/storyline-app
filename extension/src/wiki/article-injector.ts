import * as fs from 'fs'
import * as path from 'path'
import type { ProjectState } from '@storyline/core'

// ─── Injection map ────────────────────────────────────────────────────────────

// Which wiki articles to inject per active stage. Articles listed earlier
// appear higher in the compiled context block (more prominent for the AI).
const STAGE_INJECT_ARTICLES: Readonly<Record<string, string[]>> = {
  // ── Fiction ───────────────────────────────────────────────────────────────
  genre:          [],
  premise:        ['world'],
  protagonist:    ['world'],
  characters:     ['protagonist', 'world'],
  relationships:  ['protagonist', 'cast'],
  logline:        ['protagonist', 'world'],
  beatSheet:      ['protagonist', 'cast', 'world', 'logline'],
  bStory:         ['protagonist', 'cast', 'structure'],
  subplots:       ['protagonist', 'cast', 'structure'],
  sceneOutline:   ['protagonist', 'cast', 'structure', 'logline'],
  plotThreads:    ['cast', 'structure', 'scenes'],
  chapterOutline: ['structure', 'scenes', 'themes'],
  critique:       ['protagonist', 'cast', 'world', 'logline', 'structure', 'scenes', 'themes'],
  masterDoc:      ['world', 'protagonist', 'cast', 'logline', 'structure', 'scenes', 'themes'],

  // ── NF DNA stages — accumulate as the foundation builds ───────────────────
  'dna-category':      [],
  'dna-reader':        ['nf-idea'],
  'dna-transform':     ['nf-reader', 'nf-idea'],
  'dna-idea':          ['nf-reader'],
  'dna-author':        ['nf-reader', 'nf-idea'],
  'dna-promise':       ['nf-reader', 'nf-idea'],
  'dna-comps':         ['nf-reader', 'nf-idea'],
  'dna-voice':         ['nf-reader', 'nf-idea', 'nf-positioning'],
  'dna-evidence':      ['nf-reader', 'nf-idea', 'nf-positioning'],
  'dna-commercial':    ['nf-reader', 'nf-idea', 'nf-positioning'],
  'dna-title':         ['nf-reader', 'nf-idea', 'nf-positioning'],
  'dna-consolidate':   ['nf-reader', 'nf-idea', 'nf-positioning'],
  'dna-ac-level':      ['nf-reader', 'nf-idea'],
  'dna-ac-spec':       ['nf-reader', 'nf-idea'],
  'dna-ac-assessment': ['nf-reader', 'nf-idea'],

  // ── Pipeline A — Prescriptive ─────────────────────────────────────────────
  'pa-thesis':      ['nf-reader', 'nf-idea', 'nf-positioning'],
  'pa-objections':  ['nf-reader', 'nf-idea', 'pa-framework'],
  'pa-framework':   ['nf-reader', 'nf-idea', 'nf-positioning'],
  'pa-principles':  ['nf-reader', 'nf-idea', 'pa-framework'],
  'pa-evidence':    ['nf-reader', 'nf-idea', 'pa-framework'],
  'pa-application': ['nf-reader', 'nf-idea', 'pa-framework'],
  'pa-braid':       ['nf-reader', 'nf-idea', 'pa-framework', 'pa-application'],
  'pa-chapters':    ['nf-reader', 'nf-idea', 'pa-framework', 'pa-application'],
  'pa-opener':      ['nf-reader', 'nf-idea', 'pa-framework', 'pa-chapters'],
  'pa-critique':    ['nf-reader', 'nf-idea', 'nf-positioning', 'pa-framework', 'pa-application', 'pa-chapters'],
  'pa-master':      ['nf-reader', 'nf-idea', 'nf-positioning', 'pa-framework', 'pa-application', 'pa-chapters'],

  // ── Pipeline B — Narrative NF ─────────────────────────────────────────────
  'pb-thesis':    ['nf-reader', 'nf-idea', 'nf-positioning'],
  'pb-cast':      ['nf-reader', 'nf-idea', 'pb-narrative'],
  'pb-timeline':  ['nf-reader', 'nf-idea', 'pb-narrative'],
  'pb-fork':      ['nf-reader', 'nf-idea', 'pb-narrative'],
  'pb-scenes':    ['nf-reader', 'nf-idea', 'pb-narrative'],
  'pb-sourcing':  ['nf-reader', 'nf-idea', 'pb-narrative', 'pb-scenes'],
  'pb-theme':     ['nf-reader', 'nf-idea', 'pb-narrative'],
  'pb-chapters':  ['nf-reader', 'nf-idea', 'pb-narrative', 'pb-scenes'],
  'pb-critique':  ['nf-reader', 'nf-idea', 'nf-positioning', 'pb-narrative', 'pb-scenes', 'pb-chapters'],
  'pb-master':    ['nf-reader', 'nf-idea', 'nf-positioning', 'pb-narrative', 'pb-scenes', 'pb-chapters'],

  // ── Pipeline C — How-To / Skill Ladder ────────────────────────────────────
  'pc-skill':       ['nf-reader', 'nf-idea', 'nf-positioning'],
  'pc-start-level': ['nf-reader', 'nf-idea', 'pc-skill'],
  'pc-end-state':   ['nf-reader', 'nf-idea', 'pc-skill'],
  'pc-decompose':   ['nf-reader', 'nf-idea', 'pc-skill'],
  'pc-prereqs':     ['nf-reader', 'nf-idea', 'pc-skill'],
  'pc-lessons':     ['nf-reader', 'nf-idea', 'pc-skill'],
  'pc-drills':      ['nf-reader', 'nf-idea', 'pc-skill', 'pc-pedagogy'],
  'pc-milestones':  ['nf-reader', 'nf-idea', 'pc-skill', 'pc-pedagogy'],
  'pc-examples':    ['nf-reader', 'nf-idea', 'pc-skill', 'pc-pedagogy'],
  'pc-critique':    ['nf-reader', 'nf-idea', 'nf-positioning', 'pc-skill', 'pc-pedagogy'],
  'pc-master':      ['nf-reader', 'nf-idea', 'nf-positioning', 'pc-skill', 'pc-pedagogy'],

  // ── Academic ──────────────────────────────────────────────────────────────
  'ac-syllabus':  ['nf-reader', 'nf-idea', 'nf-positioning'],
  'ac-chapters':  ['nf-reader', 'nf-idea', 'nf-positioning', 'ac-curriculum'],
  'ac-critique':  ['nf-reader', 'nf-idea', 'nf-positioning', 'ac-curriculum'],
  'ac-master':    ['nf-reader', 'nf-idea', 'nf-positioning', 'ac-curriculum'],
}

const ARTICLE_LABELS: Readonly<Record<string, string>> = {
  // Fiction
  world:       'World & premise',
  protagonist: 'Protagonist',
  cast:        'Supporting cast',
  logline:     'Logline',
  structure:   'Story structure',
  scenes:      'Scene & chapter outline',
  themes:      'Themes & threads',
  // NF
  'nf-reader':      'Reader & transformation',
  'nf-idea':        'Core idea & author angle',
  'nf-positioning': 'Positioning & craft',
  'pa-framework':   'Argument & framework',
  'pa-application': 'Evidence & application',
  'pa-chapters':    'Chapter plan',
  'pb-narrative':   'Narrative arc',
  'pb-scenes':      'Scenes & sourcing',
  'pb-chapters':    'Chapter plan',
  'pc-skill':       'Skill arc',
  'pc-pedagogy':    'Lessons, drills, milestones',
  'ac-curriculum':  'Curriculum & coverage',
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read wiki articles relevant to the active stage and format them for
 * injection into the system prompt. Returns empty string if none exist.
 *
 * Synchronous — keeps buildSystemPrompt synchronous. Articles are short
 * (~200 tokens each) so sync reads add negligible latency.
 */
export function collectWikiArticles(
  stageId: string,
  projectDir: string | null,
  state: ProjectState,
): string {
  if (!projectDir) return ''
  const raw = state as unknown as Record<string, unknown>
  const mode = raw['mode']
  if (mode !== 'fiction' && mode !== 'nonfiction') return ''

  const articleTypes = STAGE_INJECT_ARTICLES[stageId]
  if (!articleTypes?.length) return ''

  const wikiDir = path.join(projectDir, '.storyline', 'wiki')
  const parts: string[] = []

  for (const articleType of articleTypes) {
    const filePath = path.join(wikiDir, `${articleType}.md`)
    try {
      if (!fs.existsSync(filePath)) continue
      const content = fs.readFileSync(filePath, 'utf-8').trim()
      if (!content) continue

      const compiledDate = parseCompiledDate(content)
      const body = content.replace(/^<!-- compiled:.*? -->\n?/, '').trim()
      if (!body) continue

      const label = ARTICLE_LABELS[articleType] ?? articleType
      const dateSuffix = compiledDate ? ` *(${compiledDate})*` : ''
      parts.push(`**${label}**${dateSuffix}\n${body}`)
    } catch { /* non-fatal — missing article is fine */ }
  }

  if (parts.length === 0) return ''

  return [
    '## Compiled planning context',
    '',
    '*Pre-synthesised from saved planning stages — authoritative reference for established facts.*',
    '',
    parts.join('\n\n'),
  ].join('\n')
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function parseCompiledDate(content: string): string | null {
  // Extract just the date part (YYYY-MM-DD) from the ISO timestamp
  return content.match(/<!-- compiled: (\d{4}-\d{2}-\d{2})/)?.[1] ?? null
}
