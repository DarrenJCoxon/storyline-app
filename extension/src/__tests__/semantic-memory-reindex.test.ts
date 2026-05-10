import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: undefined },
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    withProgress: vi.fn(),
  },
  ProgressLocation: { Notification: 15 },
  Uri: { file: (p: string) => ({ fsPath: p }) },
}))

vi.mock('../diagnostic-log.js', () => ({
  logVerbose: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}))

import { estimateReindex } from '../state/semantic-memory-reindex.js'

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'storyline-reindex-'))
}

function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true })
}

function seed(projectRoot: string, opts: {
  state?: Record<string, unknown>
  chapters?: Record<string, string>
  research?: Record<string, string>
}): void {
  fs.mkdirSync(path.join(projectRoot, '.storyline'), { recursive: true })
  if (opts.state) {
    fs.writeFileSync(
      path.join(projectRoot, '.storyline', 'state.json'),
      JSON.stringify(opts.state, null, 2),
    )
  }
  if (opts.chapters) {
    fs.mkdirSync(path.join(projectRoot, 'manuscript'), { recursive: true })
    for (const [name, body] of Object.entries(opts.chapters)) {
      fs.writeFileSync(path.join(projectRoot, 'manuscript', name), body)
    }
  }
  if (opts.research) {
    fs.mkdirSync(path.join(projectRoot, '.storyline', 'research'), { recursive: true })
    for (const [name, body] of Object.entries(opts.research)) {
      fs.writeFileSync(path.join(projectRoot, '.storyline', 'research', name), body)
    }
  }
}

describe('estimateReindex (NT-06)', () => {
  let projectRoot: string | null = null

  afterEach(() => {
    if (projectRoot) {
      rmrf(projectRoot)
      projectRoot = null
    }
  })

  it('returns zero counts for an empty project', async () => {
    projectRoot = tmpProject()
    const e = await estimateReindex(projectRoot)
    expect(e.stages).toBe(0)
    expect(e.chapters).toBe(0)
    expect(e.research).toBe(0)
    expect(e.estimatedTokens).toBe(0)
  })

  it('counts non-empty top-level stage entries from state.json', async () => {
    projectRoot = tmpProject()
    seed(projectRoot, {
      state: {
        _meta: { projectPath: '/tmp/x', createdAt: 'now', updatedAt: 'now' },
        genre: { primaryGenre: 'Thriller', subGenre: null },
        premise: { rawLogline: 'A spy walks into a bar.' },
        protagonist: {},               // empty object — skipped
        characters: [],                // empty array — skipped
        relationships: [],             // empty array — skipped
        notes: 'free-form',
      },
    })
    const e = await estimateReindex(projectRoot)
    expect(e.stages).toBe(3) // genre + premise + notes
    expect(e.estimatedTokens).toBeGreaterThan(0)
  })

  it('counts chapters in manuscript/', async () => {
    projectRoot = tmpProject()
    seed(projectRoot, {
      chapters: {
        '01-opening.md': '# Chapter 1\n\nBody text.',
        '02-second.md': '# Chapter 2\n\nMore body.',
        'README.txt': 'not markdown — should be ignored',
      },
    })
    const e = await estimateReindex(projectRoot)
    expect(e.chapters).toBe(2)
  })

  it('counts research items in .storyline/research/', async () => {
    projectRoot = tmpProject()
    seed(projectRoot, {
      research: {
        'itm-aaa.md': '---\ntitle: Quote 1\n---\nBody.',
        'itm-bbb.md': '---\ntitle: Quote 2\n---\nMore.',
      },
    })
    const e = await estimateReindex(projectRoot)
    expect(e.research).toBe(2)
  })

  it('produces a sane cost estimate at the published OpenAI rate', async () => {
    projectRoot = tmpProject()
    const longChapter = 'Body. '.repeat(2000) // ~12k chars → ~3000 tokens
    seed(projectRoot, {
      chapters: { '01.md': longChapter },
    })
    const e = await estimateReindex(projectRoot)
    expect(e.chapters).toBe(1)
    // 3000 tokens at $0.02/M ≈ $0.00006 — should be under a cent.
    expect(e.estimatedCostUsd).toBeLessThan(0.01)
    expect(e.estimatedTokens).toBeGreaterThan(2000)
    expect(e.estimatedTokens).toBeLessThan(5000)
  })

  it('handles missing manuscript/ and research/ gracefully', async () => {
    projectRoot = tmpProject()
    seed(projectRoot, {
      state: { genre: { primaryGenre: 'Mystery' } },
    })
    const e = await estimateReindex(projectRoot)
    expect(e.stages).toBe(1)
    expect(e.chapters).toBe(0)
    expect(e.research).toBe(0)
  })
})
