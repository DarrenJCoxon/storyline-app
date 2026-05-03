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

  it('returns empty string when mode is missing', () => {
    const dir = makeTmpWikiDir()
    writeArticle(dir, 'protagonist', 'Sarah Chen is a forensic accountant.')
    expect(collectWikiArticles('beatSheet', dir, { stages: {} } as unknown as ProjectState)).toBe('')
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

  // ── NF mode ─────────────────────────────────────────────────────────────────

  function nfState(overrides: Partial<Record<string, unknown>> = {}): ProjectState {
    return { mode: 'nonfiction', stages: {}, ...overrides } as unknown as ProjectState
  }

  it('injects NF foundation articles for pa-thesis stage', () => {
    const dir = makeTmpWikiDir()
    writeArticle(dir, 'nf-reader', 'Mid-career professionals struggling with focus.')
    writeArticle(dir, 'nf-idea', 'Attention residue is the hidden cost of multitasking.')
    writeArticle(dir, 'nf-positioning', 'Cal Newport / Atomic Habits adjacent.')

    const result = collectWikiArticles('pa-thesis', dir, nfState())
    expect(result).toContain('Reader & transformation')
    expect(result).toContain('Mid-career professionals struggling with focus.')
    expect(result).toContain('Core idea & author angle')
    expect(result).toContain('Attention residue')
    expect(result).toContain('Positioning & craft')
  })

  it('injects pipeline-A articles after pa-application is compiled', () => {
    const dir = makeTmpWikiDir()
    writeArticle(dir, 'nf-reader', 'Mid-career professionals.')
    writeArticle(dir, 'nf-idea', 'Big idea.')
    writeArticle(dir, 'pa-framework', 'A 4-principle model: capture, sort, decide, ship.')
    writeArticle(dir, 'pa-application', 'Each principle includes a daily ritual.')

    const result = collectWikiArticles('pa-chapters', dir, nfState())
    expect(result).toContain('Argument & framework')
    expect(result).toContain('4-principle model')
    expect(result).toContain('Evidence & application')
    expect(result).toContain('daily ritual')
  })

  it('injects academic articles for ac-chapters stage', () => {
    const dir = makeTmpWikiDir()
    writeArticle(dir, 'nf-reader', 'A-level Biology students.')
    writeArticle(dir, 'nf-idea', 'AQA Biology spec coverage with exam practice.')
    writeArticle(dir, 'nf-positioning', 'Revision guide for AQA Biology 7402.')
    writeArticle(dir, 'ac-curriculum', '24 outcomes mapped to 12 chapters.')

    const result = collectWikiArticles('ac-chapters', dir, nfState())
    expect(result).toContain('A-level Biology')
    expect(result).toContain('AQA Biology')
    expect(result).toContain('Curriculum & coverage')
    expect(result).toContain('24 outcomes')
  })

  it('returns empty string when no NF articles compiled yet at dna-reader', () => {
    const dir = makeTmpWikiDir()
    // dna-reader injects [nf-idea] but it doesn't exist yet
    const result = collectWikiArticles('dna-reader', dir, nfState())
    expect(result).toBe('')
  })
})

// ─── triggerWikiCompilation ───────────────────────────────────────────────────

describe('triggerWikiCompilation', () => {
  it('is a no-op when mode is missing', () => {
    const getLicenceKey = vi.fn()
    triggerWikiCompilation('genre', { stages: {} } as unknown as ProjectState, '/tmp', 'http://localhost', getLicenceKey)
    expect(getLicenceKey).not.toHaveBeenCalled()
  })

  it('is a no-op for unknown stage IDs', () => {
    const getLicenceKey = vi.fn()
    triggerWikiCompilation('unknown-stage', fictionState(), '/tmp', 'http://localhost', getLicenceKey)
    expect(getLicenceKey).not.toHaveBeenCalled()
  })

  it('is a no-op for fiction stage IDs in NF mode', () => {
    // 'genre' is a fiction stage; in NF mode it has no NF mapping
    const getLicenceKey = vi.fn()
    triggerWikiCompilation('genre', { mode: 'nonfiction', stages: {} } as unknown as ProjectState, '/tmp', 'http://localhost', getLicenceKey)
    expect(getLicenceKey).not.toHaveBeenCalled()
  })

  it('is a no-op for NF stage IDs in fiction mode', () => {
    // 'dna-reader' is an NF stage; in fiction mode it has no fiction mapping
    const getLicenceKey = vi.fn()
    triggerWikiCompilation('dna-reader', fictionState(), '/tmp', 'http://localhost', getLicenceKey)
    expect(getLicenceKey).not.toHaveBeenCalled()
  })

  it('does not throw when licenceKey is unavailable', async () => {
    const getLicenceKey = vi.fn().mockResolvedValue(undefined)
    triggerWikiCompilation('genre', fictionState(), '/tmp', 'http://localhost', getLicenceKey)
    await new Promise(r => setTimeout(r, 10))
  })

  it('attempts compilation for known NF stages in nonfiction mode', async () => {
    const getLicenceKey = vi.fn().mockResolvedValue(undefined) // returns undefined → bails after key fetch
    triggerWikiCompilation(
      'dna-reader',
      { mode: 'nonfiction', stages: {}, nfStages: { 'dna-reader': { avatarName: 'Maya' } } } as unknown as ProjectState,
      '/tmp', 'http://localhost', getLicenceKey,
    )
    await new Promise(r => setTimeout(r, 10))
    expect(getLicenceKey).toHaveBeenCalled()
  })
})
