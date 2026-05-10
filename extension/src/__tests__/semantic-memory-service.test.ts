import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Vitest hoists vi.mock above imports; vi.hoisted gives us shared state.
const { logVerboseMock, logErrorMock } = vi.hoisted(() => ({
  logVerboseMock: vi.fn(),
  logErrorMock: vi.fn(),
}))

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: undefined },
}))

vi.mock('../diagnostic-log.js', () => ({
  logVerbose: logVerboseMock,
  logInfo: vi.fn(),
  logError: logErrorMock,
}))

import {
  SemanticMemoryService,
  type SemanticMemoryServiceDeps,
} from '../state/semantic-memory-service.js'
import { STORYLINE_EMBEDDING_DIMENSIONS } from '@storyline/core/dist/nuvector.js'

const ENABLED_CFG = { enabled: true, seriesId: null, tenant: 'default' as const }
const DISABLED_CFG = { enabled: false, seriesId: null, tenant: 'default' as const }

function fakeEmbedding(seed: number): number[] {
  const v = new Array<number>(STORYLINE_EMBEDDING_DIMENSIONS)
  for (let i = 0; i < v.length; i++) v[i] = Math.sin(seed * 0.01 + i * 0.001)
  return v
}

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'storyline-sem-svc-'))
}

function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true })
}

function makeService(opts: { initiallyEnabled?: boolean } = {}) {
  const projectRoot = tmpProject()
  let cfg = opts.initiallyEnabled === false ? DISABLED_CFG : ENABLED_CFG
  const embedSpy = vi.fn(async (texts: string[]) => texts.map((t, i) => fakeEmbedding(t.length + i)))
  const deps: SemanticMemoryServiceDeps = {
    client: { embed: embedSpy },
    projectRoot,
    readConfig: () => cfg,
  }
  const service = new SemanticMemoryService(deps)
  return {
    service,
    embedSpy,
    projectRoot,
    cleanup: async () => {
      await service.dispose()
      rmrf(projectRoot)
    },
    setEnabled: (enabled: boolean) => {
      cfg = enabled ? ENABLED_CFG : DISABLED_CFG
    },
  }
}

const baseChunk = {
  id: 'book:default/scene:ch1-s1',
  kind: 'nuwiki_section' as const,
  text: 'Marlowe finds the cipher in the spine of the ledger.',
  metadata: {
    articleId: 'book:default/chapter:1',
    documentType: 'storyline_scene',
    subject: { kind: 'scene', id: 'ch1-s1' },
    version: 'v1',
    sectionKey: 'ch1-s1',
    sectionHeading: 'Found',
    citationCount: 0,
    parentArticleSummary: '',
    position: 1,
    bookId: 'default',
    chapterNumber: 1,
    sceneNumber: 1,
    wordCount: 9,
    hasPose: true,
  },
}

describe('SemanticMemoryService (NT-05)', () => {
  let harness: ReturnType<typeof makeService> | null = null

  beforeEach(() => {
    logVerboseMock.mockClear()
    logErrorMock.mockClear()
  })

  afterEach(async () => {
    if (harness) {
      await harness.cleanup()
      harness = null
    }
  })

  it('skips upsert when semantic memory is disabled', async () => {
    harness = makeService({ initiallyEnabled: false })
    const result = await harness.service.upsert(baseChunk)
    expect(result.status).toBe('skipped-disabled')
    expect(harness.embedSpy).not.toHaveBeenCalled()
  })

  it('upserts on first call, then skips on the same content (hash dedup)', async () => {
    harness = makeService()
    const first = await harness.service.upsert(baseChunk)
    expect(first.status).toBe('upserted')
    expect(harness.embedSpy).toHaveBeenCalledTimes(1)

    const second = await harness.service.upsert(baseChunk)
    expect(second.status).toBe('skipped-unchanged')
    expect(harness.embedSpy).toHaveBeenCalledTimes(1)
  })

  it('re-embeds when content changes', async () => {
    harness = makeService()
    await harness.service.upsert(baseChunk)
    const updated = { ...baseChunk, text: 'Marlowe finds the cipher AND a key.' }
    const result = await harness.service.upsert(updated)
    expect(result.status).toBe('upserted')
    expect(harness.embedSpy).toHaveBeenCalledTimes(2)
  })

  it('reports failure when /embed throws (and never throws to caller)', async () => {
    harness = makeService()
    harness.embedSpy.mockRejectedValueOnce(new Error('budget exceeded'))
    const result = await harness.service.upsert(baseChunk)
    expect(result.status).toBe('failed')
    expect(result.reason).toBe('embed-failed')
    expect(logErrorMock).toHaveBeenCalled()
  })

  it('reports failure on a malformed embedding response', async () => {
    harness = makeService()
    harness.embedSpy.mockResolvedValueOnce([[1, 2, 3]]) // wrong shape
    const result = await harness.service.upsert(baseChunk)
    expect(result.status).toBe('failed')
    expect(result.reason).toBe('bad-embedding-shape')
  })

  it('search returns null when disabled', async () => {
    harness = makeService({ initiallyEnabled: false })
    const result = await harness.service.search('cipher')
    expect(result).toBeNull()
    expect(harness.embedSpy).not.toHaveBeenCalled()
  })

  it('search round-trips through the local store when enabled', async () => {
    harness = makeService()
    await harness.service.upsert(baseChunk)
    const result = await harness.service.search('cipher')
    expect(result).not.toBeNull()
    expect(result!.items.length).toBeGreaterThan(0)
    expect(result!.items[0].ref).toBe(baseChunk.id)
  })

  it('deleteByIds removes a chunk and clears its hash so a re-upsert embeds again', async () => {
    harness = makeService()
    await harness.service.upsert(baseChunk)
    expect(harness.embedSpy).toHaveBeenCalledTimes(1)

    await harness.service.deleteByIds([baseChunk.id])

    const result = await harness.service.upsert(baseChunk)
    expect(result.status).toBe('upserted')
    expect(harness.embedSpy).toHaveBeenCalledTimes(2)
  })

  it('persists across dispose + reopen', async () => {
    harness = makeService()
    await harness.service.upsert(baseChunk)
    const projectRoot = harness.projectRoot
    await harness.service.dispose()

    const second = new SemanticMemoryService({
      client: { embed: harness.embedSpy },
      projectRoot,
      readConfig: () => ENABLED_CFG,
    })
    const result = await second.search('cipher')
    expect(result).not.toBeNull()
    expect(result!.items[0].ref).toBe(baseChunk.id)
    await second.dispose()
  })

  it('opt-in toggle takes effect on next call (live config)', async () => {
    harness = makeService({ initiallyEnabled: false })
    let r = await harness.service.upsert(baseChunk)
    expect(r.status).toBe('skipped-disabled')

    harness.setEnabled(true)
    r = await harness.service.upsert(baseChunk)
    expect(r.status).toBe('upserted')
  })
})
