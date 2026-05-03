import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { collectWikiArticles } from '../article-injector.js'
import { triggerWikiCompilation } from '../article-compiler.js'
import type { ProjectState } from '@storyline/core'

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _seq = 0
function makeTmpWikiDir(): string {
  const dir = path.join(os.tmpdir(), `storyline-wiki-test-${Date.now()}-${++_seq}`)
  fs.mkdirSync(path.join(dir, '.storyline', 'wiki'), { recursive: true })
  return dir
}

function writeArticle(projectDir: string, articleType: string, body: string, hash = 'abc123'): void {
  const compiled = new Date().toISOString()
  fs.writeFileSync(
    path.join(projectDir, '.storyline', 'wiki', `${articleType}.md`),
    `<!-- compiled: ${compiled} sourceHash: ${hash} -->\n${body}\n`,
  )
}

function fictionState(overrides: Partial<Record<string, unknown>> = {}): ProjectState {
  return { mode: 'fiction', stages: {}, ...overrides } as unknown as ProjectState
}

// ─── collectWikiArticles ──────────────────────────────────────────────────────

describe('collectWikiArticles', () => {
  it('returns empty string when projectDir is null', () => {
    expect(collectWikiArticles('beatSheet', null, fictionState())).toBe('')
  })

  it('returns empty string for nonfiction mode', () => {
    const dir = makeTmpWikiDir()
    writeArticle(dir, 'protagonist', 'Sarah Chen is a forensic accountant.')
    expect(collectWikiArticles('beatSheet', dir, { mode: 'nonfiction', stages: {} } as unknown as ProjectState)).toBe('')
  })

  it('returns empty string when stage has no injection mapping', () => {
    const dir = makeTmpWikiDir()
    expect(collectWikiArticles('mode', dir, fictionState())).toBe('')
  })

  it('returns empty string when wiki directory has no relevant articles', () => {
    const dir = makeTmpWikiDir()
    // beatSheet stage wants protagonist, cast, world, logline — none exist
    expect(collectWikiArticles('beatSheet', dir, fictionState())).toBe('')
  })

  it('injects existing articles for the active stage', () => {
    const dir = makeTmpWikiDir()
    writeArticle(dir, 'protagonist', 'Sarah Chen is a forensic accountant.')
    writeArticle(dir, 'world', 'A contemporary London thriller.')

    const result = collectWikiArticles('beatSheet', dir, fictionState())
    expect(result).toContain('Compiled planning context')
    expect(result).toContain('Protagonist')
    expect(result).toContain('Sarah Chen is a forensic accountant.')
    expect(result).toContain('World & premise')
    expect(result).toContain('A contemporary London thriller.')
  })

  it('skips articles not in the injection map for the stage', () => {
    const dir = makeTmpWikiDir()
    // beatSheet stage does NOT inject 'themes'
    writeArticle(dir, 'themes', 'The theme is redemption.')

    const result = collectWikiArticles('beatSheet', dir, fictionState())
    expect(result).toBe('')
  })

  it('includes only articles that exist on disk', () => {
    const dir = makeTmpWikiDir()
    // Only write protagonist; cast/world/logline missing
    writeArticle(dir, 'protagonist', 'Sarah Chen is a forensic accountant.')

    const result = collectWikiArticles('beatSheet', dir, fictionState())
    expect(result).toContain('Protagonist')
    expect(result).not.toContain('World & premise')
    expect(result).not.toContain('Supporting cast')
  })

  it('strips the comment header from article body', () => {
    const dir = makeTmpWikiDir()
    writeArticle(dir, 'protagonist', 'Sarah Chen is a forensic accountant.')

    const result = collectWikiArticles('protagonist', dir, fictionState({ stages: { genre: { completed: true } } }))
    // The injector is called for 'characters' stage (which includes protagonist)
    const result2 = collectWikiArticles('characters', dir, fictionState())
    expect(result2).not.toContain('<!-- compiled:')
    expect(result2).toContain('Sarah Chen is a forensic accountant.')
  })

  it('injects all articles for critique stage', () => {
    const dir = makeTmpWikiDir()
    const articles = ['protagonist', 'cast', 'world', 'logline', 'structure', 'scenes', 'themes']
    articles.forEach(a => writeArticle(dir, a, `Content for ${a}.`))

    const result = collectWikiArticles('critique', dir, fictionState())
    for (const a of articles) {
      expect(result).toContain(`Content for ${a}.`)
    }
  })
})

// ─── triggerWikiCompilation ───────────────────────────────────────────────────

describe('triggerWikiCompilation', () => {
  it('is a no-op for nonfiction mode', () => {
    // Should not throw, should return without doing anything
    const getLicenceKey = vi.fn()
    triggerWikiCompilation('genre', { mode: 'nonfiction', stages: {} } as unknown as ProjectState, '/tmp', 'http://localhost', getLicenceKey)
    expect(getLicenceKey).not.toHaveBeenCalled()
  })

  it('is a no-op for unknown stage IDs', () => {
    const getLicenceKey = vi.fn()
    triggerWikiCompilation('unknown-stage', fictionState(), '/tmp', 'http://localhost', getLicenceKey)
    expect(getLicenceKey).not.toHaveBeenCalled()
  })

  it('does not throw when licenceKey is unavailable', async () => {
    const getLicenceKey = vi.fn().mockResolvedValue(undefined)
    // Should not throw even if key unavailable
    triggerWikiCompilation('genre', fictionState(), '/tmp', 'http://localhost', getLicenceKey)
    // Give the async IIFE a tick to run
    await new Promise(r => setTimeout(r, 10))
  })
})
