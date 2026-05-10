import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

vi.mock('vscode', () => ({}))

vi.mock('../state/semantic-memory-service.js', () => ({
  getSemanticMemoryService: () => null, // skip the NuVector mirror in tests
}))

vi.mock('../state/semantic-memory.js', () => ({
  bookScopePrefix: () => 'book:default',
  getBookScopeId: () => 'default',
}))

vi.mock('../diagnostic-log.js', () => ({
  logVerbose: vi.fn(),
  logError: vi.fn(),
}))

import {
  appendDecision,
  readDecisions,
  inferKind,
  DECISIONS_REL_PATH,
} from '../state/decisions.js'

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'storyline-decisions-'))
}

function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true })
}

describe('decisions module (NT-11)', () => {
  let projectRoot: string | null = null

  afterEach(() => {
    if (projectRoot) {
      rmrf(projectRoot)
      projectRoot = null
    }
  })

  it('readDecisions returns [] when the file does not exist', () => {
    projectRoot = tmpProject()
    expect(readDecisions(projectRoot)).toEqual([])
  })

  it('appendDecision creates the file and round-trips', async () => {
    projectRoot = tmpProject()
    const record = await appendDecision(projectRoot, {
      stage: 'protagonist',
      kind: 'created',
      before: null,
      after: { name: 'Marlowe', want: 'redemption' },
      why: 'Initial protagonist deep-dive complete',
    })
    expect(record).not.toBeNull()
    expect(record!.id).toMatch(/^dec-\d{4}-\d{2}-\d{2}-[a-f0-9]{6}$/)

    const file = path.join(projectRoot, DECISIONS_REL_PATH)
    expect(fs.existsSync(file)).toBe(true)

    const records = readDecisions(projectRoot)
    expect(records).toHaveLength(1)
    expect(records[0].kind).toBe('created')
    expect(records[0].why).toBe('Initial protagonist deep-dive complete')
  })

  it('returns most-recent-first ordering', async () => {
    projectRoot = tmpProject()
    const a = await appendDecision(projectRoot, { stage: 'genre', kind: 'created', before: null, after: { x: 1 } })
    // Force a measurable timestamp gap
    await new Promise(r => setTimeout(r, 5))
    const b = await appendDecision(projectRoot, { stage: 'premise', kind: 'created', before: null, after: { y: 2 } })
    const records = readDecisions(projectRoot)
    expect(records[0].id).toBe(b!.id)
    expect(records[1].id).toBe(a!.id)
  })

  it('tolerates malformed lines in the JSONL', () => {
    projectRoot = tmpProject()
    fs.mkdirSync(path.join(projectRoot, '.storyline'), { recursive: true })
    fs.writeFileSync(
      path.join(projectRoot, DECISIONS_REL_PATH),
      [
        JSON.stringify({ id: 'dec-1', timestamp: '2026-05-10T01:00:00Z', stage: 'genre', kind: 'created', before: null, after: { x: 1 }, why: '' }),
        'this is not json',
        JSON.stringify({ id: 'dec-2', timestamp: '2026-05-10T02:00:00Z', stage: 'premise', kind: 'created', before: null, after: { y: 2 }, why: '' }),
      ].join('\n') + '\n',
      'utf-8',
    )
    const records = readDecisions(projectRoot)
    expect(records).toHaveLength(2) // bad line skipped, good lines kept
  })

  describe('inferKind', () => {
    it('null → value = created', () => {
      expect(inferKind(null, { x: 1 })).toBe('created')
    })
    it('value → null = cut', () => {
      expect(inferKind({ x: 1 }, null)).toBe('cut')
    })
    it('reordered array', () => {
      expect(inferKind(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe('reordered')
    })
    it('non-trivial change = revised', () => {
      expect(inferKind({ x: 1 }, { x: 2 })).toBe('revised')
    })
  })
})
