// FIC-C.6 — NF promise-payoff detector tests.
//
// Pins existing NF behaviour: the shim in critique-api.js now delegates to
// checkNfPromisePayoff(), which must produce correct results for the same
// inputs.  All test cases run through getWritingPlan → checkNfPromisePayoff
// to mirror the full call path.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getWritingPlan } from '../packages/core/dist/state/writing-plan.js'
import { checkNfPromisePayoff } from '../packages/core/dist/critique/promise-payoff.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, 'fixtures/writing-plan')

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'))
}

// ── NF Pipeline A — well-formed canonical fixture (no findings expected) ────

describe('checkNfPromisePayoff — Pipeline A (canonical fixture)', () => {
  const state = loadFixture('nf-pipeline-a-canonical.json')
  const plan = getWritingPlan(state)

  it('reads corePromise from fixture', () => {
    expect(plan.nfPromise?.corePromise).toContain('disappoint your team')
  })

  it('reads paThesisText + paFrameworkName from fixture', () => {
    expect(plan.nfPromise?.paThesisText).toContain('disappoint people')
    expect(plan.nfPromise?.paFrameworkName).toBe('The Disappointment Ladder')
  })

  it('returns no findings — promise keywords appear in chapter jobs', () => {
    const findings = checkNfPromisePayoff(plan)
    expect(findings).toEqual([])
  })

  it('returns no subtitle finding — subtitle keywords appear in thesis/framework', () => {
    // subtitle: "How clear disappointment builds stronger teams"
    // planText: thesis + modelName → "clearly" includes "clear"; "Disappointment" includes "disappointment"
    const findings = checkNfPromisePayoff(plan)
    expect(findings.find(f => f.id === 'pa-subtitle-not-reflected')).toBeUndefined()
  })

  it('produces array output (not null / undefined)', () => {
    const findings = checkNfPromisePayoff(plan)
    expect(Array.isArray(findings)).toBe(true)
  })
})

// ── NF Pipeline A — promise not in any chapter ──────────────────────────────

describe('checkNfPromisePayoff — Pipeline A (promise undelivered)', () => {
  // All stage data lives in nfStages so readNfPromise + readNfChapters pick it up
  const state = {
    mode: 'nonfiction',
    pipeline: 'A',
    nfStages: {
      'dna-promise': { corePromise: 'Learn quantum entanglement principles thoroughly' },
      'pa-chapters': {
        chapters: [
          { number: 1, title: 'Marketing basics', job: 'Intro to brand strategy' },
          { number: 2, title: 'Sales funnels', job: 'Building conversion pipelines' },
        ],
      },
    },
  }

  it('fires pa-promise-undelivered when keywords absent from chapters', () => {
    const plan = getWritingPlan(state)
    const findings = checkNfPromisePayoff(plan)
    expect(findings.some(f => f.id === 'pa-promise-undelivered')).toBe(true)
  })

  it('finding has warning severity and promise-payoff category', () => {
    const plan = getWritingPlan(state)
    const f = checkNfPromisePayoff(plan).find(f => f.id === 'pa-promise-undelivered')
    expect(f).toBeDefined()
    expect(f.severity).toBe('warning')
    expect(f.category).toBe('promise-payoff')
    expect(f.source).toBe('promise-payoff-audit')
  })

  it('no finding when chapters have zero length (guard condition)', () => {
    const emptyChaptersState = {
      ...state,
      nfStages: {
        ...state.nfStages,
        'pa-chapters': { chapters: [] },
      },
    }
    const plan = getWritingPlan(emptyChaptersState)
    const findings = checkNfPromisePayoff(plan)
    expect(findings.some(f => f.id === 'pa-promise-undelivered')).toBe(false)
  })
})

// ── NF Pipeline A — subtitle not reflected in thesis/framework ───────────────

describe('checkNfPromisePayoff — Pipeline A (subtitle drift)', () => {
  const state = {
    mode: 'nonfiction',
    pipeline: 'A',
    nfStages: {
      'dna-promise': {
        corePromise: 'Master the art of public speaking confidently',
        subtitleDraft: 'Quantum physics secrets revealed',
      },
      'pa-thesis': { thesis: 'Speaking confidence comes from preparation and practice daily.' },
      'pa-framework': { modelName: 'The Confidence Ladder' },
      'pa-chapters': {
        chapters: [
          { number: 1, title: 'Speaking confidently', job: 'Master your voice and confidence today' },
        ],
      },
    },
  }

  it('fires pa-subtitle-not-reflected when subtitle words absent from thesis/framework', () => {
    const plan = getWritingPlan(state)
    const findings = checkNfPromisePayoff(plan)
    expect(findings.some(f => f.id === 'pa-subtitle-not-reflected')).toBe(true)
  })

  it('tip severity for subtitle drift', () => {
    const plan = getWritingPlan(state)
    const f = checkNfPromisePayoff(plan).find(f => f.id === 'pa-subtitle-not-reflected')
    expect(f?.severity).toBe('tip')
  })
})

// ── NF Pipeline B — closing chapter doesn't deliver promise ─────────────────

describe('checkNfPromisePayoff — Pipeline B', () => {
  const state = {
    mode: 'nonfiction',
    pipeline: 'B',
    nfStages: {
      'dna-promise': { corePromise: 'Achieve financial independence through systematic saving' },
    },
    'pb-chapters': {
      chapters: [
        { number: 1, title: 'Chapter One', chapterQuestion: 'What is marketing?' },
        { number: 2, title: 'Chapter Two', chapterQuestion: 'How do brands build loyalty?' },
      ],
    },
  }

  it('fires pb-closing-doesnt-deliver-promise when keywords absent from last chapter', () => {
    const plan = getWritingPlan(state)
    const findings = checkNfPromisePayoff(plan)
    expect(findings.some(f => f.id === 'pb-closing-doesnt-deliver-promise')).toBe(true)
  })

  it('no finding when closing chapter delivers promise', () => {
    const goodState = {
      ...state,
      'pb-chapters': {
        chapters: [
          { number: 1, title: 'Chapter One', chapterQuestion: 'Why does financial freedom matter?' },
          { number: 2, title: 'Achieving financial independence', chapterQuestion: 'How to achieve financial independence through systematic saving?' },
        ],
      },
    }
    const plan = getWritingPlan(goodState)
    const findings = checkNfPromisePayoff(plan)
    expect(findings.some(f => f.id === 'pb-closing-doesnt-deliver-promise')).toBe(false)
  })
})

// ── NF Pipeline C — promise/outcome drift ───────────────────────────────────

describe('checkNfPromisePayoff — Pipeline C', () => {
  // corePromise and outcome share NO common words of length > 5
  const state = {
    mode: 'nonfiction',
    pipeline: 'C',
    nfStages: {
      'dna-promise': { corePromise: 'Master mathematics systematically completely' },
      'pc-end-state': { measurableOutcome: 'Generate passive income digital product sales online' },
    },
  }

  it('fires pc-promise-outcome-drift when promise and outcome share no language', () => {
    const plan = getWritingPlan(state)
    const findings = checkNfPromisePayoff(plan)
    expect(findings.some(f => f.id === 'pc-promise-outcome-drift')).toBe(true)
  })

  it('no finding when outcome language overlaps with promise', () => {
    const goodState = {
      ...state,
      nfStages: {
        'dna-promise': { corePromise: 'Become a confident public speaker through deliberate practice' },
        'pc-end-state': { measurableOutcome: 'Deliver a confident public speech without notes in front of 50 people' },
      },
    }
    const plan = getWritingPlan(goodState)
    const findings = checkNfPromisePayoff(plan)
    expect(findings.some(f => f.id === 'pc-promise-outcome-drift')).toBe(false)
  })

  it('warning severity for outcome drift', () => {
    const plan = getWritingPlan(state)
    const f = checkNfPromisePayoff(plan).find(f => f.id === 'pc-promise-outcome-drift')
    expect(f?.severity).toBe('warning')
    expect(f?.suggestion).toContain('Promise:')
    expect(f?.suggestion).toContain('Outcome:')
  })
})

// ── No corePromise → always empty ───────────────────────────────────────────

describe('checkNfPromisePayoff — no corePromise', () => {
  it('returns [] for state with no dna-promise', () => {
    const state = { mode: 'nonfiction', pipeline: 'A', nfStages: {} }
    const plan = getWritingPlan(state)
    expect(checkNfPromisePayoff(plan)).toEqual([])
  })

  it('returns [] for fiction state', () => {
    const state = { mode: 'fiction' }
    const plan = getWritingPlan(state)
    expect(checkNfPromisePayoff(plan)).toEqual([])
  })
})

// ── NF Pipeline B — canonical fixture (no findings expected) ────────────────

describe('checkNfPromisePayoff — Pipeline B canonical fixture', () => {
  const state = loadFixture('nf-pipeline-b.json')
  const plan = getWritingPlan(state)

  it('parses without errors', () => {
    expect(() => checkNfPromisePayoff(plan)).not.toThrow()
  })

  it('returns an array', () => {
    expect(Array.isArray(checkNfPromisePayoff(plan))).toBe(true)
  })
})

// ── NF Pipeline C — canonical fixture ────────────────────────────────────────

describe('checkNfPromisePayoff — Pipeline C canonical fixture', () => {
  const state = loadFixture('nf-pipeline-c.json')
  const plan = getWritingPlan(state)

  it('parses without errors', () => {
    expect(() => checkNfPromisePayoff(plan)).not.toThrow()
  })

  it('returns an array', () => {
    expect(Array.isArray(checkNfPromisePayoff(plan))).toBe(true)
  })
})
