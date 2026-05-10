import path from 'node:path'
import fs from 'node:fs'
import { NuVector } from '@nusoft/nuvector'
import type {
  ContextPack,
  MemoryRecord,
  RetrievalQuery,
  UpsertRef,
  DeletionQuery,
  DeletionResult,
  SnapshotRef,
} from '@nusoft/nuvector'

/**
 * OpenAI text-embedding-3-small returns 1536-dim vectors. Locking this
 * here avoids accidental drift if a future call site forgets to set it.
 */
export const STORYLINE_EMBEDDING_DIMENSIONS = 1536

/**
 * Single-book default. Series mode (NT-10 / OQ-4) overrides this with
 * `series:<id>` once the writer sets `storyline.series.id`.
 */
export const DEFAULT_TENANT = 'default'

/**
 * Where the project's vector index lives, relative to the project root.
 * Sits next to `.storyline/state.json` and `.storyline/memory.jsonl`.
 */
export const NUVECTOR_RELATIVE_PATH = '.storyline/memory.nv'

export type StorylineNuVector = NuVector

export interface OpenStoreOptions {
  /** Tenant scope. Defaults to `DEFAULT_TENANT`. Series projects pass `series:<id>`. */
  tenant?: string
}

/**
 * Open or create the local-file NuVector store for a Storyline project.
 * The store file is `<projectRoot>/.storyline/memory.nv`. The `.storyline/`
 * directory is created if it does not already exist.
 */
export async function openProjectStore(
  projectRoot: string,
  options: OpenStoreOptions = {},
): Promise<StorylineNuVector> {
  const storylineDir = path.join(projectRoot, '.storyline')
  if (!fs.existsSync(storylineDir)) {
    fs.mkdirSync(storylineDir, { recursive: true })
  }
  const storagePath = path.join(projectRoot, NUVECTOR_RELATIVE_PATH)
  return NuVector.open({
    storage: storagePath,
    dimensions: STORYLINE_EMBEDDING_DIMENSIONS,
    metric: 'cosine',
    tenant: options.tenant ?? DEFAULT_TENANT,
    tenantStrategy: 'strict',
  })
}

/**
 * Open an in-memory NuVector store. Used by tests and any caller that
 * needs ephemeral semantic memory (no disk persistence).
 */
export async function openInMemoryStore(
  options: OpenStoreOptions = {},
): Promise<StorylineNuVector> {
  return NuVector.open({
    storage: 'memory:',
    dimensions: STORYLINE_EMBEDDING_DIMENSIONS,
    metric: 'cosine',
    tenant: options.tenant ?? DEFAULT_TENANT,
    tenantStrategy: 'strict',
  })
}

/**
 * Close a store, flushing any pending writes. Symmetric with the
 * `openProjectStore` / `openInMemoryStore` factories so callers do not
 * need to import the underlying NuVector class.
 */
export async function closeStore(store: StorylineNuVector): Promise<void> {
  await store.close()
}

export type {
  ContextPack,
  MemoryRecord,
  RetrievalQuery,
  UpsertRef,
  DeletionQuery,
  DeletionResult,
  SnapshotRef,
}
