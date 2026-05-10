import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ fsPath: p, scheme: 'file' }) },
  workspace: { workspaceFolders: undefined },
  window: { showInputBox: vi.fn(), showQuickPick: vi.fn() },
  ProgressLocation: { Notification: 15 },
}))

vi.mock('../diagnostic-log.js', () => ({
  logVerbose: vi.fn(),
  logError: vi.fn(),
}))

import { resolveChunkIdToTarget } from '../state/semantic-memory-search.js'

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'storyline-search-'))
}

function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true })
}

describe('resolveChunkIdToTarget (NT-07)', () => {
  let projectRoot: string | null = null

  afterEach(() => {
    if (projectRoot) {
      rmrf(projectRoot)
      projectRoot = null
    }
  })

  it('returns null for an unknown chunk shape', () => {
    projectRoot = tmpProject()
    expect(resolveChunkIdToTarget('weird:thing', projectRoot)).toBeNull()
  })

  it('resolves a scene chunk to its chapter file', () => {
    projectRoot = tmpProject()
    fs.mkdirSync(path.join(projectRoot, 'manuscript'), { recursive: true })
    const chapter = path.join(projectRoot, 'manuscript', '05-midpoint.md')
    fs.writeFileSync(chapter, '# Chapter 5\n\nBody.')

    const target = resolveChunkIdToTarget('book:default/scene:ch5-s2', projectRoot)
    expect(target).not.toBeNull()
    expect(target!.uri.fsPath).toBe(chapter)
  })

  it('resolves a chapter chunk to the manuscript file', () => {
    projectRoot = tmpProject()
    fs.mkdirSync(path.join(projectRoot, 'manuscript'), { recursive: true })
    const chapter = path.join(projectRoot, 'manuscript', '03.md')
    fs.writeFileSync(chapter, '# 3\n')

    const target = resolveChunkIdToTarget('book:default/chapter:3', projectRoot)
    expect(target!.uri.fsPath).toBe(chapter)
  })

  it('handles chapter filenames with chapter- prefix', () => {
    projectRoot = tmpProject()
    fs.mkdirSync(path.join(projectRoot, 'manuscript'), { recursive: true })
    const chapter = path.join(projectRoot, 'manuscript', 'chapter-7.md')
    fs.writeFileSync(chapter, 'body')
    const target = resolveChunkIdToTarget('book:default/chapter:7', projectRoot)
    expect(target!.uri.fsPath).toBe(chapter)
  })

  it('returns null when the chapter file is missing', () => {
    projectRoot = tmpProject()
    fs.mkdirSync(path.join(projectRoot, 'manuscript'), { recursive: true })
    expect(resolveChunkIdToTarget('book:default/chapter:99', projectRoot)).toBeNull()
  })

  it('resolves a research chunk to its markdown file', () => {
    projectRoot = tmpProject()
    fs.mkdirSync(path.join(projectRoot, '.storyline', 'research'), { recursive: true })
    const item = path.join(projectRoot, '.storyline', 'research', 'itm-7f3a.md')
    fs.writeFileSync(item, '---\ntitle: Quote\n---\n')

    const target = resolveChunkIdToTarget('book:default/research:itm-7f3a', projectRoot)
    expect(target!.uri.fsPath).toBe(item)
  })

  it('resolves a stage chunk to its rendered stage doc when present', () => {
    projectRoot = tmpProject()
    fs.mkdirSync(path.join(projectRoot, 'planning', 'stages'), { recursive: true })
    const stageDoc = path.join(projectRoot, 'planning', 'stages', 'protagonist.md')
    fs.writeFileSync(stageDoc, '# Protagonist')
    const target = resolveChunkIdToTarget('book:default/stage:protagonist', projectRoot)
    expect(target!.uri.fsPath).toBe(stageDoc)
  })

  it('falls back to state.json when no rendered stage doc exists', () => {
    projectRoot = tmpProject()
    fs.mkdirSync(path.join(projectRoot, '.storyline'), { recursive: true })
    const state = path.join(projectRoot, '.storyline', 'state.json')
    fs.writeFileSync(state, '{}')
    const target = resolveChunkIdToTarget('book:default/stage:premise', projectRoot)
    expect(target!.uri.fsPath).toBe(state)
  })

  it('handles chunk ids without the book: prefix (back-compat)', () => {
    projectRoot = tmpProject()
    fs.mkdirSync(path.join(projectRoot, 'manuscript'), { recursive: true })
    const chapter = path.join(projectRoot, 'manuscript', '01.md')
    fs.writeFileSync(chapter, 'body')
    const target = resolveChunkIdToTarget('chapter:1', projectRoot)
    expect(target!.uri.fsPath).toBe(chapter)
  })
})
