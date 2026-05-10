"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NUVECTOR_RELATIVE_PATH = exports.DEFAULT_TENANT = exports.STORYLINE_EMBEDDING_DIMENSIONS = void 0;
exports.openProjectStore = openProjectStore;
exports.openInMemoryStore = openInMemoryStore;
exports.closeStore = closeStore;
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const nuvector_1 = require("@nusoft/nuvector");
/**
 * OpenAI text-embedding-3-small returns 1536-dim vectors. Locking this
 * here avoids accidental drift if a future call site forgets to set it.
 */
exports.STORYLINE_EMBEDDING_DIMENSIONS = 1536;
/**
 * Single-book default. Series mode (NT-10 / OQ-4) overrides this with
 * `series:<id>` once the writer sets `storyline.series.id`.
 */
exports.DEFAULT_TENANT = 'default';
/**
 * Where the project's vector index lives, relative to the project root.
 * Sits next to `.storyline/state.json` and `.storyline/memory.jsonl`.
 */
exports.NUVECTOR_RELATIVE_PATH = '.storyline/memory.nv';
/**
 * Open or create the local-file NuVector store for a Storyline project.
 * The store file is `<projectRoot>/.storyline/memory.nv`. The `.storyline/`
 * directory is created if it does not already exist.
 */
async function openProjectStore(projectRoot, options = {}) {
    const storylineDir = node_path_1.default.join(projectRoot, '.storyline');
    if (!node_fs_1.default.existsSync(storylineDir)) {
        node_fs_1.default.mkdirSync(storylineDir, { recursive: true });
    }
    const storagePath = node_path_1.default.join(projectRoot, exports.NUVECTOR_RELATIVE_PATH);
    return nuvector_1.NuVector.open({
        storage: storagePath,
        dimensions: exports.STORYLINE_EMBEDDING_DIMENSIONS,
        metric: 'cosine',
        tenant: options.tenant ?? exports.DEFAULT_TENANT,
        tenantStrategy: 'strict',
    });
}
/**
 * Open an in-memory NuVector store. Used by tests and any caller that
 * needs ephemeral semantic memory (no disk persistence).
 */
async function openInMemoryStore(options = {}) {
    return nuvector_1.NuVector.open({
        storage: 'memory:',
        dimensions: exports.STORYLINE_EMBEDDING_DIMENSIONS,
        metric: 'cosine',
        tenant: options.tenant ?? exports.DEFAULT_TENANT,
        tenantStrategy: 'strict',
    });
}
/**
 * Close a store, flushing any pending writes. Symmetric with the
 * `openProjectStore` / `openInMemoryStore` factories so callers do not
 * need to import the underlying NuVector class.
 */
async function closeStore(store) {
    await store.close();
}
//# sourceMappingURL=store.js.map