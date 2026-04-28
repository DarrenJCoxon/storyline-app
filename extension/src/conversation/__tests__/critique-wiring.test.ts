// FIC-PRE.3 — Tests for the critique-wiring contract.
// Covers the pure decision logic extracted from ChatPanel.runCritique:
// stage deny-list, provider gating, licence gating, and HTTP/network
// error interpretation. Fetch is not invoked here — these are unit
// tests of the contract that drives the wiring, not integration tests
// of the full panel flow.

import { describe, it, expect } from 'vitest'
import {
  NO_CRITIQUE_STAGES,
  shouldSkipCritique,
  interpretCritiqueOk,
  interpretCritiqueHttpError,
  interpretCritiqueNetworkError,
  detectProviderKind,
} from '../critique-wiring.js'

// ── shouldSkipCritique ───────────────────────────────────────────────────────

describe('shouldSkipCritique', () => {
  const valid = {
    stageId: 'protagonist',
    providerKind: 'managed' as const,
    hasLicenceKey: true,
  }

  it('does not skip a structure-bearing stage with managed provider and licence', () => {
    const r = shouldSkipCritique(valid)
    expect(r.skip).toBe(false)
  })

  it('skips every stage in the deny list', () => {
    const denied = ['mode', 'masterDoc', 'pa-master', 'pb-master', 'pc-master', 'genre', 'premise', 'characters', 'plotThreads']
    for (const stageId of denied) {
      const r = shouldSkipCritique({ ...valid, stageId })
      expect(r.skip, `${stageId} should skip`).toBe(true)
      if (r.skip) {
        expect(r.reason).toBe('deny-listed')
        expect(r.detail).toContain(stageId)
      }
    }
  })

  it('skips when provider is BYOK', () => {
    const r = shouldSkipCritique({ ...valid, providerKind: 'byok' })
    expect(r.skip).toBe(true)
    if (r.skip) {
      expect(r.reason).toBe('unmanaged-provider')
      expect(r.detail).toContain('byok')
    }
  })

  it('skips when provider is Ollama', () => {
    const r = shouldSkipCritique({ ...valid, providerKind: 'ollama' })
    expect(r.skip).toBe(true)
    if (r.skip) expect(r.reason).toBe('unmanaged-provider')
  })

  it('skips when provider is unknown', () => {
    const r = shouldSkipCritique({ ...valid, providerKind: 'unknown' })
    expect(r.skip).toBe(true)
    if (r.skip) expect(r.reason).toBe('unmanaged-provider')
  })

  it('skips when licence key is missing', () => {
    const r = shouldSkipCritique({ ...valid, hasLicenceKey: false })
    expect(r.skip).toBe(true)
    if (r.skip) {
      expect(r.reason).toBe('no-licence-key')
    }
  })

  it('precedence: deny-list beats provider beats licence', () => {
    // A deny-listed stage with no licence still reports deny-listed,
    // because it's the first check — we don't bother checking licence
    // for stages we'd never call critique on anyway.
    const r = shouldSkipCritique({
      stageId: 'mode',
      providerKind: 'byok',
      hasLicenceKey: false,
    })
    expect(r.skip).toBe(true)
    if (r.skip) expect(r.reason).toBe('deny-listed')
  })

  it('proceeds for every fiction structure-bearing stage', () => {
    // These are the fiction stages that should fire critique. They MUST
    // NOT be in NO_CRITIQUE_STAGES — that would silently kill critique
    // on the most important fiction surfaces.
    const fictionStructural = [
      'protagonist',
      'relationships',
      'logline',
      'beatSheet',
      'bStory',
      'subplots',
      'sceneOutline',
      'chapterOutline',
      'critique',
    ]
    for (const stageId of fictionStructural) {
      expect(NO_CRITIQUE_STAGES.has(stageId), `${stageId} must not be deny-listed`).toBe(false)
      const r = shouldSkipCritique({ ...valid, stageId })
      expect(r.skip, `${stageId} should proceed`).toBe(false)
    }
  })

  it('proceeds for every NF structure-bearing stage', () => {
    const nfStructural = [
      'dna-category', 'dna-reader', 'dna-transform', 'dna-idea', 'dna-author',
      'dna-promise', 'dna-comps', 'dna-voice', 'dna-evidence', 'dna-commercial',
      'dna-title', 'dna-consolidate',
      'pa-thesis', 'pa-objections', 'pa-framework', 'pa-principles', 'pa-evidence',
      'pa-application', 'pa-braid', 'pa-chapters', 'pa-opener', 'pa-critique',
      'pb-thesis', 'pb-cast', 'pb-timeline', 'pb-fork', 'pb-scenes',
      'pb-sourcing', 'pb-theme', 'pb-chapters', 'pb-critique',
      'pc-skill', 'pc-start-level', 'pc-end-state', 'pc-decompose', 'pc-prereqs',
      'pc-lessons', 'pc-drills', 'pc-milestones', 'pc-examples', 'pc-critique',
    ]
    for (const stageId of nfStructural) {
      expect(NO_CRITIQUE_STAGES.has(stageId), `${stageId} must not be deny-listed`).toBe(false)
      const r = shouldSkipCritique({ ...valid, stageId })
      expect(r.skip, `${stageId} should proceed`).toBe(false)
    }
  })
})

// ── interpretCritiqueOk ──────────────────────────────────────────────────────

describe('interpretCritiqueOk', () => {
  it('emits a card when findings are present', () => {
    const r = interpretCritiqueOk({ findings: '🟡 something to consider', tier: 'structural' })
    expect(r.action).toBe('card')
    if (r.action === 'card') {
      expect(r.findings).toBe('🟡 something to consider')
      expect(r.tier).toBe('structural')
    }
  })

  it('defaults the tier to "structural" when the backend omits it', () => {
    const r = interpretCritiqueOk({ findings: 'something' })
    expect(r.action).toBe('card')
    if (r.action === 'card') expect(r.tier).toBe('structural')
  })

  it('emits no-findings when findings are missing', () => {
    expect(interpretCritiqueOk({}).action).toBe('no-findings')
    expect(interpretCritiqueOk({ tier: 'validate' }).action).toBe('no-findings')
  })

  it('emits no-findings when findings are an empty string', () => {
    expect(interpretCritiqueOk({ findings: '' }).action).toBe('no-findings')
  })
})

// ── interpretCritiqueHttpError ───────────────────────────────────────────────

describe('interpretCritiqueHttpError', () => {
  it('treats 402 (credits exhausted) as a silent skip — handled elsewhere', () => {
    const r = interpretCritiqueHttpError({ status: 402 })
    expect(r.action).toBe('silent-credits-exhausted')
  })

  it('surfaces 4xx errors as honest streamError messages', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      const r = interpretCritiqueHttpError({ status })
      expect(r.action).toBe('stream-error')
      if (r.action === 'stream-error') {
        expect(r.message).toContain(`(${status})`)
        expect(r.message).toContain('Critique unavailable')
      }
    }
  })

  it('surfaces 5xx errors as honest streamError messages', () => {
    for (const status of [500, 502, 503, 504]) {
      const r = interpretCritiqueHttpError({ status })
      expect(r.action).toBe('stream-error')
      if (r.action === 'stream-error') {
        expect(r.message).toContain(`(${status})`)
      }
    }
  })

  it('does NOT surface 402 as streamError (regression: would otherwise duplicate the credits-exhausted prompt)', () => {
    const r = interpretCritiqueHttpError({ status: 402, bodyText: 'credits exhausted' })
    expect(r.action).not.toBe('stream-error')
  })

  it('mentions the stage saved in the error message (so the writer knows the save itself succeeded)', () => {
    const r = interpretCritiqueHttpError({ status: 500 })
    if (r.action === 'stream-error') {
      expect(r.message).toMatch(/your stage saved/i)
    }
  })
})

// ── interpretCritiqueNetworkError ────────────────────────────────────────────

describe('interpretCritiqueNetworkError', () => {
  it('surfaces an Error with its message', () => {
    const r = interpretCritiqueNetworkError(new Error('connect ECONNREFUSED'))
    expect(r.action).toBe('stream-error')
    if (r.action === 'stream-error') {
      expect(r.message).toContain('Critique unavailable (network)')
      expect(r.message).toContain('connect ECONNREFUSED')
    }
  })

  it('surfaces a non-Error throwable as a string', () => {
    const r = interpretCritiqueNetworkError('something weird')
    expect(r.action).toBe('stream-error')
    if (r.action === 'stream-error') {
      expect(r.message).toContain('something weird')
    }
  })
})

// ── detectProviderKind ───────────────────────────────────────────────────────

describe('detectProviderKind', () => {
  it('detects ManagedProvider', () => {
    expect(detectProviderKind('ManagedProvider')).toBe('managed')
  })

  it('detects BYOKProvider', () => {
    expect(detectProviderKind('BYOKProvider')).toBe('byok')
  })

  it('detects OllamaProvider', () => {
    expect(detectProviderKind('OllamaProvider')).toBe('ollama')
  })

  it('returns unknown for null/undefined/empty', () => {
    expect(detectProviderKind(null)).toBe('unknown')
    expect(detectProviderKind(undefined)).toBe('unknown')
    expect(detectProviderKind('')).toBe('unknown')
  })

  it('is case-insensitive (esbuild may rename to lowercase variants in production bundles)', () => {
    expect(detectProviderKind('managedprovider')).toBe('managed')
    expect(detectProviderKind('byokProvider')).toBe('byok')
  })

  it('returns unknown for unfamiliar provider names', () => {
    expect(detectProviderKind('SomeOtherProvider')).toBe('unknown')
  })
})

// ── End-to-end contract: the wiring guard ────────────────────────────────────

describe('the wiring contract end-to-end', () => {
  it('a managed provider with licence on a structural stage proceeds; HTTP 200 with findings emits a card', () => {
    const skip = shouldSkipCritique({
      stageId: 'beatSheet',
      providerKind: 'managed',
      hasLicenceKey: true,
    })
    expect(skip.skip).toBe(false)

    const action = interpretCritiqueOk({ findings: '🔴 missing midpoint flip', tier: 'structural' })
    expect(action.action).toBe('card')
  })

  it('a BYOK provider on the same stage skips silently — no card, no error', () => {
    const skip = shouldSkipCritique({
      stageId: 'beatSheet',
      providerKind: 'byok',
      hasLicenceKey: true,
    })
    expect(skip.skip).toBe(true)
  })

  it('a managed provider hitting a 500 surfaces the failure honestly', () => {
    const skip = shouldSkipCritique({
      stageId: 'sceneOutline',
      providerKind: 'managed',
      hasLicenceKey: true,
    })
    expect(skip.skip).toBe(false)

    const action = interpretCritiqueHttpError({ status: 500 })
    expect(action.action).toBe('stream-error')
  })

  it('a managed provider hitting 402 stays silent — credits-exhausted is the streamResponse path\'s responsibility', () => {
    const action = interpretCritiqueHttpError({ status: 402 })
    expect(action.action).toBe('silent-credits-exhausted')
  })
})
