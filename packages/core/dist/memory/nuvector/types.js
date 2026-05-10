"use strict";
/**
 * Storyline semantic-memory public types. Originally mirrored
 * @nusoft/nuvector's TypeScript surface; the engine now lives behind
 * vectra (pure JS, Electron-safe) but the type contract stays the same
 * so every NT-05+ caller keeps working.
 *
 * Only the subset of NuVector's contract we actually use is defined
 * here. The four-layer search APIs (searchKnowledge,
 * searchSectionsInArticles, etc.) and the graph-traversal APIs were
 * deferred to NuVector WU 004/005 and our v1 retrieval doesn't use
 * them — they live in the schema doc as forward-compat targets only.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=types.js.map