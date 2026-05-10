/**
 * `@storyline/core/nuvector` — semantic-memory subpath.
 *
 * Importing from this path pulls the `@nusoft/nuvector` native binary into
 * the consumer's bundle graph; importing from `@storyline/core` does not.
 * NT-05 will wire stage saves and chapter writes through here.
 */
export { openProjectStore, openInMemoryStore, closeStore, STORYLINE_EMBEDDING_DIMENSIONS, DEFAULT_TENANT, NUVECTOR_RELATIVE_PATH, } from './memory/nuvector/store.js';
export type { StorylineNuVector, OpenStoreOptions, ContextPack, MemoryRecord, RetrievalQuery, UpsertRef, DeletionQuery, DeletionResult, SnapshotRef, } from './memory/nuvector/store.js';
//# sourceMappingURL=nuvector.d.ts.map