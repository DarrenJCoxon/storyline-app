// FIC-C.6 — Fiction promise-payoff ledger tests.
//
// Covers:
//  (a) PromisePayoffItem correctly inferred from plot thread shape
//      (unresolved high-risk / planned medium / paid-off low)
//  (b) findFictionPromiseGaps identifies:
//       · unresolved high-risk promises
//       · threads last-touched 3+ chapters ago with no resolution plan
//  (c) generatePromisePayoffLedger produces correct markdown:
//       · correct counts in header
//       · risk summary top-3 block
//       · sections: Unresolved, Planned, Paid off
//  (d) Flat legacy thread shape still parses correctly through getWritingPlan

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { getWritingPlan } from '../packages/core/dist/state/writing-plan.js'
import { findFictionPromiseGaps } from '../packages/core/dist/critique/promise-payoff.js'
import { generatePromisePayoffLedger } from '../packages/core/dist/output/promise-payoff-ledger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, 'fixtures/writing-plan')

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'))
}

// ── (a) PromisePayoffItem inference ─────────────────────────────────────────

describe('detectFictionPromises — PromisePayoffItem inference', () => {
  function makeState(threads, chapters = []) {
    return {
      mode: 'fiction',
      chapterOutline: chapters,
      plotThreads: threads,
    }
  }

  it('unresolved thread (no payoff info) → unresolved status + high risk', () => {
    const state = makeState([{
      id: 't1', threadType: 'mystery', name: 'Who killed the gardener?',
      introducedAt: 'Ch 1', status: 'open',
    }])
    const plan = getWritingPlan(state)
    const p = plan.promises[0]
    expect(p.status).toBe('unresolved')
    expect(p.risk).toBe('high')
    expect(p.type).toBe('clue')
    expect(p.description).toBe('Who killed the gardener?')
    expect(p.setupChapter).toBe(1)
  })

  it('thread with resolutionPlan → planned status + medium risk', () => {
    const state = makeState([{
      id: 't2', threadType: 'romance', name: 'Elena and Marco',
      introducedAt: 'Ch 2', status: 'open',
      resolutionPlan: 'Reconcile at the gala in chapter 12',
      plannedResolutionScene: 'Ch 12',
    }])
    const plan = getWritingPlan(state)
    const p = plan.promises[0]
    expect(p.status).toBe('planned')
    expect(p.risk).toBe('medium')
    expect(p.type).toBe('romance-beat')
    expect(p.plannedPayoffChapter).toBe(12)
  })

  it('resolved thread with payoffScene → paid-off status + low risk', () => {
    const state = makeState([{
      id: 't3', threadType: 'character-arc', name: "Protagonist's fear of water",
      introducedAt: 'Ch 1', status: 'resolved',
      payoffScene: 'Ch 8, Sc 2',
      resolutionPlan: 'She swims across the lake',
    }])
    const plan = getWritingPlan(state)
    const p = plan.promises[0]
    expect(p.status).toBe('paid-off')
    expect(p.risk).toBe('low')
    expect(p.type).toBe('wound')
    expect(p.actualPayoffChapter).toBe(8)
  })

  it('thread with unresolvedRisk: true → high risk regardless of resolutionPlan', () => {
    const state = makeState([{
      id: 't4', threadType: 'subplot', name: 'The missing letter',
      introducedAt: 'Ch 3', status: 'open',
      resolutionPlan: 'Maybe resolve later',
      unresolvedRisk: true,
    }])
    const plan = getWritingPlan(state)
    const p = plan.promises[0]
    expect(p.risk).toBe('high')
  })

  it('thread with payoffScene only (resolved) → low risk', () => {
    const state = makeState([{
      id: 't5', threadType: 'prophecy', name: 'The ancient prophecy',
      introducedAt: 'Ch 1', status: 'resolved',
      payoffScene: 'Ch 15',
    }])
    const plan = getWritingPlan(state)
    const p = plan.promises[0]
    expect(p.risk).toBe('low')
    expect(p.type).toBe('prophecy')
  })

  it('unknown thread type → subplot promise type', () => {
    const state = makeState([{
      id: 't6', threadType: 'political-intrigue', name: 'Court conspiracy',
      introducedAt: 'Ch 2', status: 'open',
    }])
    const plan = getWritingPlan(state)
    expect(plan.promises[0].type).toBe('subplot')
  })

  it('no threads → empty promises array', () => {
    const state = makeState([])
    const plan = getWritingPlan(state)
    expect(plan.promises).toEqual([])
  })
})

// ── (b) findFictionPromiseGaps ───────────────────────────────────────────────

describe('findFictionPromiseGaps', () => {
  it('high-risk unresolved promise → gap with "No planned payoff" message', () => {
    const state = {
      mode: 'fiction',
      chapterOutline: [{ chapterNumber: 1, scenes: [] }, { chapterNumber: 2, scenes: [] }],
      plotThreads: [{
        id: 'clue-1', threadType: 'mystery', name: 'Missing photograph',
        introducedAt: 'Ch 1', status: 'open',
      }],
    }
    const plan = getWritingPlan(state)
    const gaps = findFictionPromiseGaps(plan)
    expect(gaps.length).toBeGreaterThanOrEqual(1)
    const g = gaps.find(g => g.promise.id === 'clue-1')
    expect(g).toBeDefined()
    expect(g.gapDescription).toContain('No planned payoff')
  })

  it('paid-off promise → not in gaps', () => {
    const state = {
      mode: 'fiction',
      chapterOutline: [],
      plotThreads: [{
        id: 'arc-1', threadType: 'character-arc', name: 'Redemption arc',
        introducedAt: 'Ch 1', status: 'resolved',
        payoffScene: 'Ch 10',
      }],
    }
    const plan = getWritingPlan(state)
    const gaps = findFictionPromiseGaps(plan)
    expect(gaps.find(g => g.promise.id === 'arc-1')).toBeUndefined()
  })

  it('thread last-touched 3+ chapters ago with no plan → stale gap', () => {
    // 5 chapters; thread last appears in chapter 1 → 4 chapters ago
    const chapters = [1, 2, 3, 4, 5].map(n => ({
      chapterNumber: n,
      scenes: n === 1
        ? [{ sceneNumber: 1, threadMovement: 'clue-stale' }]
        : [],
    }))
    const state = {
      mode: 'fiction',
      chapterOutline: chapters,
      plotThreads: [{
        id: 'clue-stale', threadType: 'mystery', name: 'Stale clue thread',
        introducedAt: 'Ch 1', status: 'open',
        // no resolutionPlan, no plannedResolutionScene
      }],
    }
    const plan = getWritingPlan(state)
    const gaps = findFictionPromiseGaps(plan)
    const g = gaps.find(g => g.promise.id === 'clue-stale')
    expect(g).toBeDefined()
    expect(g.gapDescription).toContain('chapter')
    expect(g.gapDescription).toContain('no resolution plan')
  })

  it('thread with resolutionPlan → not in stale gaps', () => {
    const chapters = [1, 2, 3, 4, 5].map(n => ({
      chapterNumber: n,
      scenes: n === 1
        ? [{ sceneNumber: 1, threadMovement: 'subplot-1' }]
        : [],
    }))
    const state = {
      mode: 'fiction',
      chapterOutline: chapters,
      plotThreads: [{
        id: 'subplot-1', threadType: 'subplot', name: 'Subplot with plan',
        introducedAt: 'Ch 1', status: 'open',
        resolutionPlan: 'Resolved in epilogue',
      }],
    }
    const plan = getWritingPlan(state)
    const gaps = findFictionPromiseGaps(plan)
    expect(gaps.find(g => g.promise.id === 'subplot-1')).toBeUndefined()
  })

  it('empty promises → empty gaps', () => {
    const state = { mode: 'fiction', chapterOutline: [], plotThreads: [] }
    const plan = getWritingPlan(state)
    expect(findFictionPromiseGaps(plan)).toEqual([])
  })
})

// ── (c) generatePromisePayoffLedger ─────────────────────────────────────────

describe('generatePromisePayoffLedger', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), 'ledger-test-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function makeRichState() {
    return {
      _meta: { projectTitle: 'The Glass Detective' },
      mode: 'fiction',
      chapterOutline: [1, 2, 3, 4, 5].map(n => ({ chapterNumber: n, scenes: [] })),
      plotThreads: [
        // unresolved high-risk
        { id: 't-a', threadType: 'mystery', name: 'Identity of the killer', introducedAt: 'Ch 1', status: 'open' },
        // planned medium-risk
        { id: 't-b', threadType: 'romance', name: 'Elena and Marco', introducedAt: 'Ch 2', status: 'open', resolutionPlan: 'Gala scene', plannedResolutionScene: 'Ch 10' },
        // paid-off low-risk
        { id: 't-c', threadType: 'character-arc', name: "Mira's fear of water", introducedAt: 'Ch 1', status: 'resolved', payoffScene: 'Ch 5' },
        // another unresolved for risk summary
        { id: 't-d', threadType: 'subplot', name: 'Missing letters', introducedAt: 'Ch 3', status: 'open' },
      ],
    }
  }

  it('writes a file and returns LedgerResult with correct counts', () => {
    const plan = getWritingPlan(makeRichState())
    const result = generatePromisePayoffLedger(plan, tmpDir)
    expect(result.totalPromises).toBe(4)
    expect(result.unresolvedCount).toBe(2)   // t-a and t-d
    expect(result.highRiskCount).toBe(2)     // t-a and t-d
    expect(result.outputPath).toMatch(/promise-payoff-ledger\.md$/)
  })

  it('written markdown contains the book title', () => {
    const plan = getWritingPlan(makeRichState())
    generatePromisePayoffLedger(plan, tmpDir)
    const md = readFileSync(resolve(tmpDir, 'planning', 'promise-payoff-ledger.md'), 'utf-8')
    expect(md).toContain('The Glass Detective')
  })

  it('written markdown contains summary stats line', () => {
    const plan = getWritingPlan(makeRichState())
    generatePromisePayoffLedger(plan, tmpDir)
    const md = readFileSync(resolve(tmpDir, 'planning', 'promise-payoff-ledger.md'), 'utf-8')
    expect(md).toContain('4 promises tracked')
    expect(md).toContain('2 high risk')
    expect(md).toContain('2 unresolved')
  })

  it('written markdown contains Risk Summary section when gaps exist', () => {
    const plan = getWritingPlan(makeRichState())
    generatePromisePayoffLedger(plan, tmpDir)
    const md = readFileSync(resolve(tmpDir, 'planning', 'promise-payoff-ledger.md'), 'utf-8')
    expect(md).toContain('## Risk Summary')
  })

  it('written markdown contains Promise Tracker table headers', () => {
    const plan = getWritingPlan(makeRichState())
    generatePromisePayoffLedger(plan, tmpDir)
    const md = readFileSync(resolve(tmpDir, 'planning', 'promise-payoff-ledger.md'), 'utf-8')
    expect(md).toContain('## Promise Tracker')
    expect(md).toContain('| Risk | Type | Promise |')
    expect(md).toContain('### Unresolved')
    expect(md).toContain('### Planned')
    expect(md).toContain('### Paid off')
  })

  it('unresolved row uses red badge', () => {
    const plan = getWritingPlan(makeRichState())
    generatePromisePayoffLedger(plan, tmpDir)
    const md = readFileSync(resolve(tmpDir, 'planning', 'promise-payoff-ledger.md'), 'utf-8')
    expect(md).toContain('🔴')
  })

  it('paid-off row uses green badge', () => {
    const plan = getWritingPlan(makeRichState())
    generatePromisePayoffLedger(plan, tmpDir)
    const md = readFileSync(resolve(tmpDir, 'planning', 'promise-payoff-ledger.md'), 'utf-8')
    expect(md).toContain('🟢')
  })

  it('empty plan produces no-threads notice', () => {
    const plan = getWritingPlan({ mode: 'fiction', chapterOutline: [], plotThreads: [] })
    const result = generatePromisePayoffLedger(plan, tmpDir)
    const md = readFileSync(result.outputPath, 'utf-8')
    expect(md).toContain('No plot threads found')
    expect(result.totalPromises).toBe(0)
  })
})

// ── (d) Flat legacy thread shape still parses ───────────────────────────────

describe('getWritingPlan — legacy flat thread shape (FIC-C compatibility)', () => {
  const state = loadFixture('fiction-legacy-thread-shape.json')
  const plan = getWritingPlan(state)

  it('normalises without errors', () => {
    expect(plan.mode).toBe('fiction')
    expect(plan.plotThreads.length).toBeGreaterThan(0)
  })

  it('produces PromisePayoffItems from legacy threads', () => {
    expect(plan.promises.length).toBe(plan.plotThreads.length)
    for (const p of plan.promises) {
      expect(p.id).toBeDefined()
      expect(p.status).toBeDefined()
      expect(p.risk).toBeDefined()
      expect(p.type).toBeDefined()
    }
  })

  it('legacy t.type field (instead of t.threadType) still maps to a promise type', () => {
    // fiction-legacy-thread-shape.json has thread {id:t1, type:'mystery', threadType: undefined}
    const t1 = plan.promises.find(p => p.id === 't1')
    expect(t1).toBeDefined()
    // legacy shape normalizer should still produce a valid promise type
    expect(['clue', 'subplot', 'wound', 'romance-beat', 'prophecy', 'genre-promise']).toContain(t1.type)
  })

  it('findFictionPromiseGaps runs without errors on legacy fixture', () => {
    expect(() => findFictionPromiseGaps(plan)).not.toThrow()
  })
})
