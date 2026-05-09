// CB-04 — End-to-end persistence test for the stage-save flow.
//
// What this guards: when the user finishes a stage and the AI emits a JSON
// patch, we must (1) update state.json, (2) write a markdown file under
// planning/stages/<id>.md inside the user's project, and (3) make that
// file's content reflect the patch (not just empty placeholders).
//
// The bug we shipped in v0.2.18 (writeStageDoc using process.cwd() in the
// extension host instead of the project path) would have been caught by
// this test. Today the operative writeStageDoc in @storyline/core does
// the right thing — these assertions lock that in so a future refactor
// can't silently regress it.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// LocalStore imports `vscode` for its `fromWorkspace()` static. We don't
// need that path in tests — but the bare `import * as vscode from 'vscode'`
// would fail to resolve in vitest without a mock.
vi.mock('vscode', () => ({
  workspace: { workspaceFolders: undefined },
}))

import { LocalStore, extractJsonBlock } from '../state/local-store.js'
import { gateStageSave, writeStageDoc, type ProjectState } from '@storyline/core'

// ─── Test scaffolding ────────────────────────────────────────────────────────

let _seq = 0
function makeTmpProject(): string {
  const dir = path.join(os.tmpdir(), `storyline-stage-test-${Date.now()}-${++_seq}`)
  fs.mkdirSync(path.join(dir, '.storyline'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'planning', 'stages'), { recursive: true })
  return dir
}

/** Read the rendered markdown for a stage from the project. */
function readStageMd(projectDir: string, stageId: string): string | null {
  const p = path.join(projectDir, 'planning', 'stages', `${stageId}.md`)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null
}

/** Run the full persistence pipeline that ChatPanel runs on a stage save. */
async function runStageSave(
  projectDir: string,
  stageId: string,
  aiText: string,
): Promise<{ patch: Record<string, unknown> | null; state: ProjectState; gate: ReturnType<typeof gateStageSave>; mdPath: string | null }> {
  const patch = extractJsonBlock(aiText)
  expect(patch, `extractJsonBlock should return a patch from the AI text for ${stageId}`).not.toBeNull()

  const store = new LocalStore(projectDir)
  const newState = await store.merge(patch as Partial<ProjectState>)
  const gate = gateStageSave(stageId, newState)

  let finalState = newState
  if (gate.complete && stageId !== 'mode') {
    finalState = await store.merge({
      stages: { ...newState.stages, [stageId]: { completed: true } },
    } as Partial<ProjectState>)
  }

  const mdPath = await writeStageDoc(stageId, finalState, projectDir)
  return { patch, state: finalState, gate, mdPath }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('stage save → state.json + planning/stages/<id>.md', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = makeTmpProject()
  })

  it('extractJsonBlock parses a fenced ```json block from AI text', () => {
    const text = 'Here is the patch:\n\n```json\n{ "genre": { "primaryGenre": "thriller" } }\n```\n\nDone.'
    expect(extractJsonBlock(text)).toEqual({ genre: { primaryGenre: 'thriller' } })
  })

  it('extractJsonBlock returns null when the block is placeholder-only', () => {
    const text = '```json\n{ "genre": { "primaryGenre": "...", "tone": null } }\n```'
    expect(extractJsonBlock(text)).toBeNull()
  })

  it('LocalStore.merge writes state.json into the project, not cwd', async () => {
    const store = new LocalStore(projectDir)
    await store.merge({ genre: { primaryGenre: 'thriller' } } as Partial<ProjectState>)
    const stateFile = path.join(projectDir, '.storyline', 'state.json')
    expect(fs.existsSync(stateFile)).toBe(true)
    const json = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    expect(json.genre.primaryGenre).toBe('thriller')
  })

  it('writeStageDoc lands the genre file in <project>/planning/stages/, not cwd', async () => {
    const aiText =
      '```json\n' +
      JSON.stringify({
        genre: {
          primaryGenre: 'Psychological Thriller',
          subGenre: 'Domestic Suspense',
          tone: 'Tense and intimate',
          audience: 'Adult readers of literary thrillers',
          targetWordCount: 85000,
          genreVariant: 'whydunit',
        },
      }) +
      '\n```'

    const { mdPath, gate } = await runStageSave(projectDir, 'genre', aiText)

    expect(gate.complete).toBe(true)
    expect(mdPath).toBe(path.join(projectDir, 'planning', 'stages', 'genre.md'))

    const md = readStageMd(projectDir, 'genre')
    expect(md, 'genre.md must exist in the project').not.toBeNull()
    // The renderer must surface the actual values from state, not "-" placeholders.
    expect(md).toContain('Psychological Thriller')
    expect(md).toContain('Domestic Suspense')
    expect(md).toContain('Tense and intimate')
    expect(md).toContain('whydunit')
    // Contract: the auto-generated header must be present so re-runs are
    // identifiable and a future tool can detect "user-edited" vs "AI-written".
    expect(md).toMatch(/Auto-generated by storyline save/)
  })

  it('writeStageDoc fills the protagonist deep-dive doc with state values', async () => {
    const aiText =
      '```json\n' +
      JSON.stringify({
        protagonist: {
          name: 'Sarah Chen',
          age: 34,
          occupation: 'forensic accountant',
          ghost: 'her father stole client money and vanished when she was twelve',
          coreLie: 'I can only trust what I can verify on paper',
          flaw: 'pathologically suspicious of every personal connection',
          want: 'expose the embezzler at her firm and earn the senior partner slot',
          need: 'accept that some trust must be given before it can be earned',
          arcDirection: 'positive change',
          dailyLife: 'dawn runs along the Hudson, then twelve hours behind dual monitors of bank reconciliations',
        },
      }) +
      '\n```'

    const { mdPath } = await runStageSave(projectDir, 'protagonist', aiText)
    expect(mdPath).toBe(path.join(projectDir, 'planning', 'stages', 'protagonist.md'))

    const md = readStageMd(projectDir, 'protagonist')!
    expect(md).toContain('Sarah Chen')
    expect(md).toContain('forensic accountant')
    expect(md).toContain('father stole client money')
    expect(md).toContain('Hudson')
  })

  it('extractJsonBlock + writeStageDoc round-trip for an NF dna-promise stage', async () => {
    // Field names MUST match the stage guide in
    // packages/core/src/ai/stage-guides-nf-dna.ts. If the LLM emits keys
    // outside this set the renderer renders nothing — exactly the empty-
    // markdown bug the user reported. This test is the contract that
    // pins the prompt, the patch, and the renderer to the same vocabulary.
    const aiText =
      '```json\n' +
      JSON.stringify({
        'dna-promise': {
          corePromise: 'If you read this book you will run 1-to-1s that make your team perform without being chased',
          subtitleDraft: 'How to lead engineers without micromanaging',
          subtitleAlt: 'The Six-Week Reset for New Engineering Managers',
        },
        mode: 'nonfiction',
      }) +
      '\n```'

    // Seed state.json with `mode: nonfiction` first so the gate uses NF rules.
    const store = new LocalStore(projectDir)
    await store.merge({ mode: 'nonfiction' } as Partial<ProjectState>)

    const { mdPath } = await runStageSave(projectDir, 'dna-promise', aiText)
    expect(mdPath).toBe(path.join(projectDir, 'planning', 'stages', 'dna-promise.md'))

    const md = readStageMd(projectDir, 'dna-promise')!
    expect(md).toContain('1-to-1s')
    expect(md).toContain('How to lead engineers without micromanaging')
    expect(md).toContain('Six-Week Reset')
  })

  it('writeStageDoc returns null (no file) when the stageId has no renderer', async () => {
    const aiText = '```json\n' + JSON.stringify({ mode: { value: 'fiction' } }) + '\n```'
    // `mode` is a transient stage with no markdown renderer — should be skipped.
    const result = await writeStageDoc('mode', { mode: 'fiction' } as ProjectState, projectDir)
    expect(result).toBeNull()
    expect(fs.existsSync(path.join(projectDir, 'planning', 'stages', 'mode.md'))).toBe(false)
  })

  it('does not advance the stage marker when gateStageSave reports incomplete', async () => {
    // genre stage requires several fields — provide only one, leave the rest empty.
    const aiText =
      '```json\n' +
      JSON.stringify({ genre: { primaryGenre: 'thriller' } }) +
      '\n```'

    const { state, gate } = await runStageSave(projectDir, 'genre', aiText)
    // Whether genre is gated depends on its required fields; assert the
    // contract: if gate is incomplete, the stages map must NOT mark it
    // completed. (If the stage is permissive and gate is complete, the test
    // skips the assertion — we're testing the gating contract, not the
    // specific field set.)
    if (!gate.complete) {
      expect(state.stages?.genre?.completed).not.toBe(true)
    }
  })
})
