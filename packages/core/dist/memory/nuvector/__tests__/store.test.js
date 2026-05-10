"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const store_1 = require("../store");
/**
 * NT-01 smoke tests. Goal: prove the local-file backend round-trips a
 * record through upsert + retrieveContext + fetch, and that a closed
 * store reopens with its records still intact.
 *
 * These tests use deterministic fake embeddings rather than real OpenAI
 * calls — NT-01 is the foundations ticket; the embedding adapter (NT-02)
 * is a separate ticket.
 */
const sceneText = 'A scene where Marlowe finds the cipher tucked into the spine of the ledger.';
function makeFakeEmbedding(seed) {
    // Deterministic, normalised-ish, just enough variance to exercise the
    // HNSW index. Real embeddings come from NT-02.
    const v = new Float32Array(store_1.STORYLINE_EMBEDDING_DIMENSIONS);
    for (let i = 0; i < v.length; i++) {
        v[i] = Math.sin(seed * 0.01 + i * 0.001);
    }
    return v;
}
function freshTmpProjectRoot() {
    const dir = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'storyline-nuvector-'));
    return dir;
}
(0, vitest_1.describe)('NuVector store wrapper (NT-01)', () => {
    let store = null;
    let tmpProjects = [];
    (0, vitest_1.afterEach)(async () => {
        if (store) {
            await (0, store_1.closeStore)(store);
            store = null;
        }
        for (const dir of tmpProjects) {
            node_fs_1.default.rmSync(dir, { recursive: true, force: true });
        }
        tmpProjects = [];
    });
    (0, vitest_1.it)('opens an in-memory store and round-trips a record via fetch', async () => {
        store = await (0, store_1.openInMemoryStore)();
        const embedding = makeFakeEmbedding(1);
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
            tenant: store_1.DEFAULT_TENANT,
        });
        (0, vitest_1.expect)(ref.id).toBe('scene:ch5-s2');
        (0, vitest_1.expect)(ref.upserted).toBe(true);
        const fetched = await store.fetch(['scene:ch5-s2']);
        (0, vitest_1.expect)(fetched).toHaveLength(1);
        (0, vitest_1.expect)(fetched[0].id).toBe('scene:ch5-s2');
        (0, vitest_1.expect)(fetched[0].text).toBe(sceneText);
        (0, vitest_1.expect)(fetched[0].metadata.chapter).toBe(5);
        (0, vitest_1.expect)(fetched[0].metadata.scene).toBe(2);
        (0, vitest_1.expect)(fetched[0].embedding.length).toBe(store_1.STORYLINE_EMBEDDING_DIMENSIONS);
    });
    (0, vitest_1.it)('retrieves a record via vector similarity search', async () => {
        store = await (0, store_1.openInMemoryStore)();
        await store.upsert({
            id: 'scene:ch1-s1',
            kind: 'document_chunk',
            embedding: makeFakeEmbedding(7),
            text: 'Opening image — Marlowe at the docks before dawn.',
            metadata: { chapter: 1, scene: 1 },
            tenant: store_1.DEFAULT_TENANT,
        });
        await store.upsert({
            id: 'scene:ch5-s2',
            kind: 'document_chunk',
            embedding: makeFakeEmbedding(99),
            text: sceneText,
            metadata: { chapter: 5, scene: 2 },
            tenant: store_1.DEFAULT_TENANT,
        });
        const result = await store.retrieveContext({
            embedding: makeFakeEmbedding(99),
            tenant: store_1.DEFAULT_TENANT,
            topK: 2,
            filters: { kind: 'document_chunk' },
        });
        (0, vitest_1.expect)(result.items.length).toBeGreaterThan(0);
        // Closest match to seed 99 should be ch5-s2 itself.
        (0, vitest_1.expect)(result.items[0].ref).toBe('scene:ch5-s2');
    });
    (0, vitest_1.it)('persists a record across close + reopen on the local-file backend', async () => {
        const projectRoot = freshTmpProjectRoot();
        tmpProjects.push(projectRoot);
        // Phase 1: open, upsert, close.
        const first = await (0, store_1.openProjectStore)(projectRoot);
        await first.upsert({
            id: 'stage:protagonist',
            kind: 'document_chunk',
            embedding: makeFakeEmbedding(42),
            text: 'Marlowe — disgraced cartographer, 38, walks with a limp.',
            metadata: { stageId: 'protagonist', kind: 'planning' },
            tenant: store_1.DEFAULT_TENANT,
        });
        await (0, store_1.closeStore)(first);
        // Verify the file is on disk where we expect it.
        const expectedPath = node_path_1.default.join(projectRoot, store_1.NUVECTOR_RELATIVE_PATH);
        (0, vitest_1.expect)(node_fs_1.default.existsSync(expectedPath)).toBe(true);
        // Phase 2: reopen, fetch, verify the record survived.
        store = await (0, store_1.openProjectStore)(projectRoot);
        const fetched = await store.fetch(['stage:protagonist']);
        (0, vitest_1.expect)(fetched).toHaveLength(1);
        (0, vitest_1.expect)(fetched[0].text).toBe('Marlowe — disgraced cartographer, 38, walks with a limp.');
        (0, vitest_1.expect)(fetched[0].metadata.stageId).toBe('protagonist');
    });
    (0, vitest_1.it)('isolates tenants strictly (series scoping foundation)', async () => {
        store = await (0, store_1.openInMemoryStore)({ tenant: 'series:blackwood' });
        await store.upsert({
            id: 'scene:book1-ch1-s1',
            kind: 'document_chunk',
            embedding: makeFakeEmbedding(1),
            text: 'Book 1 opening.',
            metadata: { book: 1 },
            tenant: 'series:blackwood',
        });
        // A query under a different tenant must not see this record.
        const otherTenant = await store.retrieveContext({
            embedding: makeFakeEmbedding(1),
            tenant: 'default',
            topK: 5,
        });
        (0, vitest_1.expect)(otherTenant.items).toHaveLength(0);
        // The owning tenant sees it.
        const ownTenant = await store.retrieveContext({
            embedding: makeFakeEmbedding(1),
            tenant: 'series:blackwood',
            topK: 5,
        });
        (0, vitest_1.expect)(ownTenant.items.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(ownTenant.items[0].ref).toBe('scene:book1-ch1-s1');
    });
});
//# sourceMappingURL=store.test.js.map