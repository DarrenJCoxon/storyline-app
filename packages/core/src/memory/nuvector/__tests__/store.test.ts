import { describe, expect, it, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import {
  openInMemoryStore,
  openProjectStore,
  closeStore,
  STORYLINE_EMBEDDING_DIMENSIONS,
  DEFAULT_TENANT,
  NUVECTOR_RELATIVE_PATH,
} from '../store'
import type { StorylineNuVector } from '../store'

/**
 * NT-01 smoke tests. Goal: prove the local-file backend round-trips a
 * record through upsert + retrieveContext + fetch, and that a closed
 * store reopens with its records still intact.
 *
 * These tests use deterministic fake embeddings rather than real OpenAI
 * calls — NT-01 is the foundations ticket; the embedding adapter (NT-02)
 * is a separate ticket.
 */

const sceneText =
  'A scene where Marlowe finds the cipher tucked into the spine of the ledger.'

function makeFakeEmbedding(seed: number): Float32Array {
  // Deterministic, normalised-ish, just enough variance to exercise the
  // HNSW index. Real embeddings come from NT-02.
  const v = new Float32Array(STORYLINE_EMBEDDING_DIMENSIONS)
  for (let i = 0; i < v.length; i++) {
    v[i] = Math.sin(seed * 0.01 + i * 0.001)
  }
  return v
}

function freshTmpProjectRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'storyline-nuvector-'))
  return dir
}

describe('NuVector store wrapper (NT-01)', () => {
  let store: StorylineNuVector | null = null
  let tmpProjects: string[] = []

  afterEach(async () => {
    if (store) {
      await closeStore(store)
      store = null
    }
    for (const dir of tmpProjects) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    tmpProjects = []
  })

  it('opens an in-memory store and round-trips a record via fetch', async () => {
    store = await openInMemoryStore()

    const embedding = makeFakeEmbedding(1)
    const ref = await store.upsert({
      id: 'scene:ch5-s2',
      kind: 'document_chunk',
      embedding,
      text: sceneText,
      metadata: {
        chapter: 5,
        scene: 2,
        wordCount: 14,
      },
      tenant: DEFAULT_TENANT,
    })

    expect(ref.id).toBe('scene:ch5-s2')
    expect(ref.upserted).toBe(true)

    const fetched = await store.fetch(['scene:ch5-s2'])
    expect(fetched).toHaveLength(1)
    expect(fetched[0].id).toBe('scene:ch5-s2')
    expect(fetched[0].text).toBe(sceneText)
    expect(fetched[0].metadata.chapter).toBe(5)
    expect(fetched[0].metadata.scene).toBe(2)
    expect(fetched[0].embedding.length).toBe(STORYLINE_EMBEDDING_DIMENSIONS)
  })

  it('retrieves a record via vector similarity search', async () => {
    store = await openInMemoryStore()

    await store.upsert({
      id: 'scene:ch1-s1',
      kind: 'document_chunk',
      embedding: makeFakeEmbedding(7),
      text: 'Opening image — Marlowe at the docks before dawn.',
      metadata: { chapter: 1, scene: 1 },
      tenant: DEFAULT_TENANT,
    })
    await store.upsert({
      id: 'scene:ch5-s2',
      kind: 'document_chunk',
      embedding: makeFakeEmbedding(99),
      text: sceneText,
      metadata: { chapter: 5, scene: 2 },
      tenant: DEFAULT_TENANT,
    })

    const result = await store.retrieveContext({
      embedding: makeFakeEmbedding(99),
      tenant: DEFAULT_TENANT,
      topK: 2,
      filters: { kind: 'document_chunk' },
    })

    expect(result.items.length).toBeGreaterThan(0)
    // Closest match to seed 99 should be ch5-s2 itself.
    expect(result.items[0].ref).toBe('scene:ch5-s2')
  })

  it('persists a record across close + reopen on the local-file backend', async () => {
    const projectRoot = freshTmpProjectRoot()
    tmpProjects.push(projectRoot)

    // Phase 1: open, upsert, close.
    const first = await openProjectStore(projectRoot)
    await first.upsert({
      id: 'stage:protagonist',
      kind: 'document_chunk',
      embedding: makeFakeEmbedding(42),
      text: 'Marlowe — disgraced cartographer, 38, walks with a limp.',
      metadata: { stageId: 'protagonist', kind: 'planning' },
      tenant: DEFAULT_TENANT,
    })
    await closeStore(first)

    // Verify the file is on disk where we expect it.
    const expectedPath = path.join(projectRoot, NUVECTOR_RELATIVE_PATH)
    expect(fs.existsSync(expectedPath)).toBe(true)

    // Phase 2: reopen, fetch, verify the record survived.
    store = await openProjectStore(projectRoot)
    const fetched = await store.fetch(['stage:protagonist'])
    expect(fetched).toHaveLength(1)
    expect(fetched[0].text).toBe(
      'Marlowe — disgraced cartographer, 38, walks with a limp.',
    )
    expect(fetched[0].metadata.stageId).toBe('protagonist')
  })

  it('isolates tenants strictly (series scoping foundation)', async () => {
    store = await openInMemoryStore({ tenant: 'series:blackwood' })

    await store.upsert({
      id: 'scene:book1-ch1-s1',
      kind: 'document_chunk',
      embedding: makeFakeEmbedding(1),
      text: 'Book 1 opening.',
      metadata: { book: 1 },
      tenant: 'series:blackwood',
    })

    // A query under a different tenant must not see this record.
    const otherTenant = await store.retrieveContext({
      embedding: makeFakeEmbedding(1),
      tenant: 'default',
      topK: 5,
    })
    expect(otherTenant.items).toHaveLength(0)

    // The owning tenant sees it.
    const ownTenant = await store.retrieveContext({
      embedding: makeFakeEmbedding(1),
      tenant: 'series:blackwood',
      topK: 5,
    })
    expect(ownTenant.items.length).toBeGreaterThan(0)
    expect(ownTenant.items[0].ref).toBe('scene:book1-ch1-s1')
  })
})
