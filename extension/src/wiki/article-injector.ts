import * as fs from 'fs'
import * as path from 'path'
import type { ProjectState } from '@storyline/core'

// ─── Injection map ────────────────────────────────────────────────────────────

// Which wiki articles to inject per active stage. Articles listed earlier
// appear higher in the compiled context block (more prominent for the AI).
const STAGE_INJECT_ARTICLES: Readonly<Record<string, string[]>> = {
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
}

const ARTICLE_LABELS: Readonly<Record<string, string>> = {
  world:       'World & premise',
  protagonist: 'Protagonist',
  cast:        'Supporting cast',
  logline:     'Logline',
  structure:   'Story structure',
  scenes:      'Scene & chapter outline',
  themes:      'Themes & threads',
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
  if (raw['mode'] !== 'fiction') return ''  // NF wiki: future iteration

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
