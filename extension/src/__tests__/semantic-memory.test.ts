import { describe, it, expect, vi, beforeEach } from 'vitest'

// Vitest hoists vi.mock above imports, so any shared mock state must be
// declared via vi.hoisted() so it's initialised before the factory runs.
const { cfgStore, showInfoMock, updateMock } = vi.hoisted(() => {
  const cfgStore: Record<string, unknown> = {}
  return {
    cfgStore,
    showInfoMock: vi.fn(),
    updateMock: vi.fn(async (key: string, value: unknown) => {
      cfgStore[key] = value
    }),
  }
})

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => cfgStore[key],
      update: updateMock,
    }),
  },
  window: {
    showInformationMessage: showInfoMock,
  },
  ConfigurationTarget: { Workspace: 2 },
}))

import {
  deriveTenant,
  slugifySeriesId,
  readSemanticMemoryConfig,
  ensureOptIn,
  resetOptInDialog,
} from '../state/semantic-memory.js'

describe('semantic-memory helpers (NT-04)', () => {
  beforeEach(() => {
    for (const k of Object.keys(cfgStore)) delete cfgStore[k]
    showInfoMock.mockReset()
    updateMock.mockClear()
  })

  describe('slugifySeriesId', () => {
    it('lowercases and replaces non-alphanumeric runs with hyphens', () => {
      expect(slugifySeriesId('The Blackwood Saga')).toBe('the-blackwood-saga')
      expect(slugifySeriesId('Hollow Dawn: Book One')).toBe('hollow-dawn-book-one')
      expect(slugifySeriesId('  Padded   Spaces  ')).toBe('padded-spaces')
    })

    it('falls back to a stable name for unusable input', () => {
      expect(slugifySeriesId('!!!')).toBe('untitled-series')
      expect(slugifySeriesId('   ')).toBe('untitled-series')
    })

    it('collapses runs of hyphens', () => {
      expect(slugifySeriesId('foo---bar____baz')).toBe('foo-bar-baz')
    })
  })

  describe('deriveTenant', () => {
    it('returns "default" when no series id', () => {
      expect(deriveTenant(null)).toBe('default')
      expect(deriveTenant(undefined)).toBe('default')
      expect(deriveTenant('')).toBe('default')
      expect(deriveTenant('   ')).toBe('default')
    })

    it('returns series:<slug> when a series id is set', () => {
      expect(deriveTenant('Blackwood Saga')).toBe('series:blackwood-saga')
      expect(deriveTenant('book2')).toBe('series:book2')
    })
  })

  describe('readSemanticMemoryConfig', () => {
    it('defaults to disabled with default tenant', () => {
      const cfg = readSemanticMemoryConfig()
      expect(cfg.enabled).toBe(false)
      expect(cfg.seriesId).toBe(null)
      expect(cfg.tenant).toBe('default')
    })

    it('reads enabled flag', () => {
      cfgStore['storyline.semanticMemory.enabled'] = true
      expect(readSemanticMemoryConfig().enabled).toBe(true)
    })

    it('reads series id and derives tenant', () => {
      cfgStore['storyline.semanticMemory.enabled'] = true
      cfgStore['storyline.series.id'] = 'Hollow Dawn'
      const cfg = readSemanticMemoryConfig()
      expect(cfg.seriesId).toBe('Hollow Dawn')
      expect(cfg.tenant).toBe('series:hollow-dawn')
    })

    it('treats blank series id as none', () => {
      cfgStore['storyline.series.id'] = '   '
      const cfg = readSemanticMemoryConfig()
      expect(cfg.seriesId).toBe(null)
      expect(cfg.tenant).toBe('default')
    })
  })

  describe('ensureOptIn', () => {
    it('returns already-enabled without prompting if already on', async () => {
      cfgStore['storyline.semanticMemory.enabled'] = true
      const result = await ensureOptIn()
      expect(result).toBe('already-enabled')
      expect(showInfoMock).not.toHaveBeenCalled()
    })

    it('returns already-declined without prompting if dialog was shown and user declined', async () => {
      cfgStore['storyline.semanticMemory.enabled'] = false
      cfgStore['storyline.semanticMemory.firstRunDialogShown'] = true
      const result = await ensureOptIn()
      expect(result).toBe('already-declined')
      expect(showInfoMock).not.toHaveBeenCalled()
    })

    it('shows the dialog on first run; "Enable" persists enabled=true', async () => {
      showInfoMock.mockResolvedValue('Enable')
      const result = await ensureOptIn()
      expect(result).toBe('enabled')
      expect(showInfoMock).toHaveBeenCalledOnce()
      expect(cfgStore['storyline.semanticMemory.firstRunDialogShown']).toBe(true)
      expect(cfgStore['storyline.semanticMemory.enabled']).toBe(true)
    })

    it('shows the dialog on first run; "Not now" persists dialog-shown but leaves enabled false', async () => {
      showInfoMock.mockResolvedValue('Not now')
      const result = await ensureOptIn()
      expect(result).toBe('declined')
      expect(cfgStore['storyline.semanticMemory.firstRunDialogShown']).toBe(true)
      expect(cfgStore['storyline.semanticMemory.enabled']).toBeUndefined()
    })

    it('treats dismissal (undefined choice) as decline', async () => {
      showInfoMock.mockResolvedValue(undefined)
      const result = await ensureOptIn()
      expect(result).toBe('declined')
      expect(cfgStore['storyline.semanticMemory.firstRunDialogShown']).toBe(true)
    })
  })

  describe('resetOptInDialog', () => {
    it('clears the dialog-shown flag so the next ensureOptIn re-prompts', async () => {
      cfgStore['storyline.semanticMemory.firstRunDialogShown'] = true
      await resetOptInDialog()
      expect(cfgStore['storyline.semanticMemory.firstRunDialogShown']).toBe(false)
    })
  })
})
