import { LocalIndex } from 'vectra';
import type { ContextPack, DeletionQuery, DeletionResult, MemoryRecord, RetrievalQuery, SnapshotRef, UpsertRef } from './types.js';
/**
 * Storyline semantic-memory store. Originally backed by
 * `@nusoft/nuvector` (Rust NAPI), now backed by `vectra` (pure JS,
 * Electron-safe) after the NAPI binary was found to exit-code-5 the
 * VS Code extension host on first .open() call.
 *
 * The public API matches the original NuVector wrapper so every
 * NT-05+ caller keeps working without changes — only the internals
 * differ. Vectra stores the index as a folder of JSON files; we keep
 * the path `.storyline/memory.nv/` so existing reindex paths are
 * compatible.
 *
 * Performance note: vectra is ~10x slower than NAPI HNSW search but for
 * a project's scale (a few thousand chunks) flat search is still
 * single-digit milliseconds. The big win is reliability — no native
 * binding to fight with Electron's Node ABI.
 */
export declare const STORYLINE_EMBEDDING_DIMENSIONS = 1536;
export declare const DEFAULT_TENANT = "default";
export declare const NUVECTOR_RELATIVE_PATH = ".storyline/memory.nv";
export interface OpenStoreOptions {
    tenant?: string;
}
/**
 * The runtime store handle. Concrete class instead of the original
 * NuVector type alias so callers can rely on the methods directly.
 */
export declare class StorylineNuVector {
    private readonly index;
    private readonly defaultTenant;
    /** True for in-memory stores backed by a tmpdir; cleaned up on close. */
    private readonly cleanupTmpdir;
    private readonly _folderPath;
    constructor(index: LocalIndex, defaultTenant: string, folderPath: string, cleanupTmpdir: boolean);
    get folderPath(): string;
    /**
     * Insert or replace a single record. Idempotent on `id`.
     * NuVector compatibility: vectra's `upsertItem` is the same shape.
     */
    upsert(record: MemoryRecord): Promise<UpsertRef>;
    /** Direct fetch by id. Used for explicit-reference retrieval. */
    fetch(ids: string[]): Promise<MemoryRecord[]>;
    /**
     * Vector-similarity search. Equivalent to NuVector's retrieveContext —
     * top-K cosine similarity, optionally filtered by kind / metadataMatch
     * / tenant. The filter syntax is translated from NuVector's
     * RetrievalFilters into vectra's Pinecone-style MetadataFilter.
     */
    retrieveContext(query: RetrievalQuery): Promise<ContextPack>;
    /**
     * GDPR right-to-erasure. Idempotent — non-existent ids are no-ops.
     * Currently supports id-based deletion only; tenant/articleId scope
     * is honored via filter then per-id delete.
     */
    delete(query: DeletionQuery): Promise<DeletionResult>;
    /**
     * Backup the current index folder to a snapshot file. Vectra stores
     * everything inside a folder; we tar that folder into the destination
     * path so a single file is portable.
     */
    snapshot(destinationPath: string): Promise<SnapshotRef>;
    /** Restore from a snapshot file produced by {@link snapshot}. */
    restore(snapshotPath: string): Promise<void>;
    /** Close the store. Cleans up tmpdir for in-memory stores. */
    close(): Promise<void>;
    private toIndexMetadata;
    private fromIndexItem;
    private buildFilter;
    private stripInternalMetadataKeys;
    private deriveSource;
}
/**
 * Open or create the local-file vectra-backed semantic-memory store
 * for a Storyline project. The folder lives at
 * `<projectRoot>/.storyline/memory.nv/`.
 */
export declare function openProjectStore(projectRoot: string, options?: OpenStoreOptions): Promise<StorylineNuVector>;
/**
 * Open an in-memory store. Vectra is file-backed, so we use a tmpdir
 * that gets removed on close — semantically equivalent for tests.
 */
export declare function openInMemoryStore(options?: OpenStoreOptions): Promise<StorylineNuVector>;
export declare function closeStore(store: StorylineNuVector): Promise<void>;
export type { ContextPack, MemoryRecord, RetrievalQuery, UpsertRef, DeletionQuery, DeletionResult, SnapshotRef, } from './types.js';
//# sourceMappingURL=store.d.ts.map