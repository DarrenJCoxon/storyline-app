import { NuVector } from '@nusoft/nuvector';
import type { ContextPack, MemoryRecord, RetrievalQuery, UpsertRef, DeletionQuery, DeletionResult, SnapshotRef } from '@nusoft/nuvector';
/**
 * OpenAI text-embedding-3-small returns 1536-dim vectors. Locking this
 * here avoids accidental drift if a future call site forgets to set it.
 */
export declare const STORYLINE_EMBEDDING_DIMENSIONS = 1536;
/**
 * Single-book default. Series mode (NT-10 / OQ-4) overrides this with
 * `series:<id>` once the writer sets `storyline.series.id`.
 */
export declare const DEFAULT_TENANT = "default";
/**
 * Where the project's vector index lives, relative to the project root.
 * Sits next to `.storyline/state.json` and `.storyline/memory.jsonl`.
 */
export declare const NUVECTOR_RELATIVE_PATH = ".storyline/memory.nv";
export type StorylineNuVector = NuVector;
export interface OpenStoreOptions {
    /** Tenant scope. Defaults to `DEFAULT_TENANT`. Series projects pass `series:<id>`. */
    tenant?: string;
}
/**
 * Open or create the local-file NuVector store for a Storyline project.
 * The store file is `<projectRoot>/.storyline/memory.nv`. The `.storyline/`
 * directory is created if it does not already exist.
 */
export declare function openProjectStore(projectRoot: string, options?: OpenStoreOptions): Promise<StorylineNuVector>;
/**
 * Open an in-memory NuVector store. Used by tests and any caller that
 * needs ephemeral semantic memory (no disk persistence).
 */
export declare function openInMemoryStore(options?: OpenStoreOptions): Promise<StorylineNuVector>;
/**
 * Close a store, flushing any pending writes. Symmetric with the
 * `openProjectStore` / `openInMemoryStore` factories so callers do not
 * need to import the underlying NuVector class.
 */
export declare function closeStore(store: StorylineNuVector): Promise<void>;
export type { ContextPack, MemoryRecord, RetrievalQuery, UpsertRef, DeletionQuery, DeletionResult, SnapshotRef, };
//# sourceMappingURL=store.d.ts.map