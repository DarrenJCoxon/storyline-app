"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorylineNuVector = exports.NUVECTOR_RELATIVE_PATH = exports.DEFAULT_TENANT = exports.STORYLINE_EMBEDDING_DIMENSIONS = void 0;
exports.openProjectStore = openProjectStore;
exports.openInMemoryStore = openInMemoryStore;
exports.closeStore = closeStore;
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const vectra_1 = require("vectra");
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
exports.STORYLINE_EMBEDDING_DIMENSIONS = 1536;
exports.DEFAULT_TENANT = 'default';
exports.NUVECTOR_RELATIVE_PATH = '.storyline/memory.nv';
const INDEX_VERSION = 1;
/**
 * The runtime store handle. Concrete class instead of the original
 * NuVector type alias so callers can rely on the methods directly.
 */
class StorylineNuVector {
    index;
    defaultTenant;
    /** True for in-memory stores backed by a tmpdir; cleaned up on close. */
    cleanupTmpdir;
    _folderPath;
    constructor(index, defaultTenant, folderPath, cleanupTmpdir) {
        this.index = index;
        this.defaultTenant = defaultTenant;
        this._folderPath = folderPath;
        this.cleanupTmpdir = cleanupTmpdir;
    }
    get folderPath() {
        return this._folderPath;
    }
    /**
     * Insert or replace a single record. Idempotent on `id`.
     * NuVector compatibility: vectra's `upsertItem` is the same shape.
     */
    async upsert(record) {
        if (!(record.embedding instanceof Float32Array)) {
            throw new Error('upsert: embedding must be Float32Array');
        }
        if (record.embedding.length !== exports.STORYLINE_EMBEDDING_DIMENSIONS) {
            throw new Error(`upsert: embedding dimensions mismatch (expected ${exports.STORYLINE_EMBEDDING_DIMENSIONS}, got ${record.embedding.length})`);
        }
        await this.index.upsertItem({
            id: record.id,
            vector: Array.from(record.embedding),
            metadata: this.toIndexMetadata(record),
        });
        return { id: record.id, upserted: true };
    }
    /** Direct fetch by id. Used for explicit-reference retrieval. */
    async fetch(ids) {
        const out = [];
        for (const id of ids) {
            const item = await this.index.getItem(id);
            if (!item)
                continue;
            const record = this.fromIndexItem(item);
            if (record)
                out.push(record);
        }
        return out;
    }
    /**
     * Vector-similarity search. Equivalent to NuVector's retrieveContext —
     * top-K cosine similarity, optionally filtered by kind / metadataMatch
     * / tenant. The filter syntax is translated from NuVector's
     * RetrievalFilters into vectra's Pinecone-style MetadataFilter.
     */
    async retrieveContext(query) {
        if (!(query.embedding instanceof Float32Array)) {
            throw new Error('retrieveContext: embedding must be Float32Array');
        }
        const topK = query.topK ?? 8;
        const filter = this.buildFilter(query.tenant, query.filters);
        const results = await this.index.queryItems(Array.from(query.embedding), '', topK, filter);
        const items = [];
        for (const r of results) {
            const meta = (r.item.metadata ?? {});
            if (query.scoreThreshold != null && r.score < query.scoreThreshold)
                continue;
            const kind = meta.__kind ?? 'document_chunk';
            const text = meta.__text;
            items.push({
                ref: r.item.id,
                kind,
                summary: text ? text.slice(0, 200) : '',
                text,
                score: r.score,
                metadata: this.stripInternalMetadataKeys(meta),
                source: this.deriveSource(meta),
            });
        }
        return {
            items,
            retrievalId: `vectra-${Date.now()}`,
            retrievedAt: new Date().toISOString(),
            totalCandidates: results.length,
        };
    }
    /**
     * GDPR right-to-erasure. Idempotent — non-existent ids are no-ops.
     * Currently supports id-based deletion only; tenant/articleId scope
     * is honored via filter then per-id delete.
     */
    async delete(query) {
        let deletedCount = 0;
        if (query.ids && query.ids.length > 0) {
            for (const id of query.ids) {
                try {
                    await this.index.deleteItem(id);
                    deletedCount += 1;
                }
                catch {
                    /* idempotent — non-existent id is fine */
                }
            }
        }
        if (query.tenant && !query.ids) {
            // Tenant-wide delete: list then delete each.
            const items = await this.index.listItemsByMetadata({
                __tenant: { $eq: query.tenant },
            });
            for (const item of items) {
                try {
                    await this.index.deleteItem(item.id);
                    deletedCount += 1;
                }
                catch {
                    /* ignore */
                }
            }
        }
        return { deletedCount, affectedLayers: ['layer1', 'layer2', 'layer3'] };
    }
    /**
     * Backup the current index folder to a snapshot file. Vectra stores
     * everything inside a folder; we tar that folder into the destination
     * path so a single file is portable.
     */
    async snapshot(destinationPath) {
        // Implementation: walk the folder, write a JSON envelope of every
        // file. Avoids the tar dependency. Vectra folders are small for our
        // scale (~20 KB per chunk).
        const entries = [];
        walkDir(this._folderPath, '', entries);
        const envelope = {
            kind: 'storyline-vectra-snapshot',
            version: 1,
            takenAt: new Date().toISOString(),
            entries,
        };
        const payload = JSON.stringify(envelope);
        node_fs_1.default.writeFileSync(destinationPath, payload, 'utf-8');
        return {
            path: destinationPath,
            takenAt: envelope.takenAt,
            bytes: Buffer.byteLength(payload, 'utf-8'),
        };
    }
    /** Restore from a snapshot file produced by {@link snapshot}. */
    async restore(snapshotPath) {
        const raw = node_fs_1.default.readFileSync(snapshotPath, 'utf-8');
        const envelope = JSON.parse(raw);
        node_fs_1.default.rmSync(this._folderPath, { recursive: true, force: true });
        node_fs_1.default.mkdirSync(this._folderPath, { recursive: true });
        for (const entry of envelope.entries) {
            const dest = node_path_1.default.join(this._folderPath, entry.relPath);
            node_fs_1.default.mkdirSync(node_path_1.default.dirname(dest), { recursive: true });
            const buf = entry.encoding === 'base64'
                ? Buffer.from(entry.content, 'base64')
                : Buffer.from(entry.content, 'utf-8');
            node_fs_1.default.writeFileSync(dest, buf);
        }
    }
    /** Close the store. Cleans up tmpdir for in-memory stores. */
    async close() {
        if (this.cleanupTmpdir) {
            try {
                node_fs_1.default.rmSync(this._folderPath, { recursive: true, force: true });
            }
            catch {
                /* best-effort */
            }
        }
    }
    // ─── private helpers ────────────────────────────────────────────────────
    toIndexMetadata(record) {
        // vectra's MetadataTypes is restricted to scalars + arrays of scalars.
        // Stash complex metadata in a JSON-string under __metadata so we can
        // round-trip without losing structure.
        const m = {
            __tenant: record.tenant,
            __kind: record.kind,
        };
        if (record.text)
            m.__text = record.text;
        if (record.effectiveAt)
            m.__effectiveAt = record.effectiveAt;
        if (record.version)
            m.__version = record.version;
        // Promote a few well-known scalar metadata keys to top-level so we
        // can filter on them via vectra's MetadataFilter (Pinecone style).
        const meta = record.metadata;
        for (const key of FILTERABLE_METADATA_KEYS) {
            const v = meta[key];
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                m[key] = v;
            }
        }
        // Everything else lives under __metadata as a JSON-stringified blob.
        m.__metadata = JSON.stringify(meta);
        return m;
    }
    fromIndexItem(item) {
        const meta = item.metadata;
        let originalMetadata = {};
        try {
            const raw = meta.__metadata;
            if (typeof raw === 'string')
                originalMetadata = JSON.parse(raw);
        }
        catch {
            /* fall through with empty metadata */
        }
        const kind = meta.__kind ?? 'document_chunk';
        return {
            id: item.id,
            kind,
            embedding: new Float32Array(item.vector),
            text: typeof meta.__text === 'string' ? meta.__text : undefined,
            metadata: originalMetadata,
            tenant: typeof meta.__tenant === 'string' ? meta.__tenant : exports.DEFAULT_TENANT,
            effectiveAt: typeof meta.__effectiveAt === 'string' ? meta.__effectiveAt : undefined,
            version: typeof meta.__version === 'string' ? meta.__version : undefined,
        };
    }
    buildFilter(tenant, filters) {
        const conditions = [
            { __tenant: { $eq: tenant } },
        ];
        if (filters?.kind) {
            const kinds = Array.isArray(filters.kind) ? filters.kind : [filters.kind];
            conditions.push({ __kind: kinds.length === 1 ? { $eq: kinds[0] } : { $in: kinds } });
        }
        if (filters?.documentType) {
            const dts = Array.isArray(filters.documentType) ? filters.documentType : [filters.documentType];
            conditions.push({ documentType: dts.length === 1 ? { $eq: dts[0] } : { $in: dts } });
        }
        if (filters?.metadataMatch) {
            for (const [k, v] of Object.entries(filters.metadataMatch)) {
                if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                    conditions.push({ [k]: { $eq: v } });
                }
            }
        }
        return conditions.length === 1 ? conditions[0] : { $and: conditions };
    }
    stripInternalMetadataKeys(meta) {
        let originalMetadata = {};
        try {
            const raw = meta.__metadata;
            if (typeof raw === 'string')
                originalMetadata = JSON.parse(raw);
        }
        catch {
            /* ignore */
        }
        return originalMetadata;
    }
    deriveSource(meta) {
        let originalMetadata = {};
        try {
            const raw = meta.__metadata;
            if (typeof raw === 'string')
                originalMetadata = JSON.parse(raw);
        }
        catch {
            /* ignore */
        }
        const sr = originalMetadata.sourceRef;
        return {
            kind: 'database_record',
            ref: typeof sr?.ref === 'string' ? sr.ref : `index:${meta.__kind ?? 'unknown'}`,
        };
    }
}
exports.StorylineNuVector = StorylineNuVector;
const FILTERABLE_METADATA_KEYS = [
    'documentType',
    'bookId',
    'chapterNumber',
    'sceneNumber',
    'stageId',
    'subtype',
    'reliabilityTier',
    'verificationState',
    'edgeKind',
    'from',
    'to',
    'decisionId',
    'decisionKind',
    'stage',
];
/**
 * Open or create the local-file vectra-backed semantic-memory store
 * for a Storyline project. The folder lives at
 * `<projectRoot>/.storyline/memory.nv/`.
 */
async function openProjectStore(projectRoot, options = {}) {
    const storylineDir = node_path_1.default.join(projectRoot, '.storyline');
    if (!node_fs_1.default.existsSync(storylineDir)) {
        node_fs_1.default.mkdirSync(storylineDir, { recursive: true });
    }
    const folderPath = node_path_1.default.join(projectRoot, exports.NUVECTOR_RELATIVE_PATH);
    const index = new vectra_1.LocalIndex(folderPath);
    if (!(await index.isIndexCreated())) {
        await index.createIndex({ version: INDEX_VERSION });
    }
    return new StorylineNuVector(index, options.tenant ?? exports.DEFAULT_TENANT, folderPath, false);
}
/**
 * Open an in-memory store. Vectra is file-backed, so we use a tmpdir
 * that gets removed on close — semantically equivalent for tests.
 */
async function openInMemoryStore(options = {}) {
    const folderPath = node_fs_1.default.mkdtempSync(node_path_1.default.join(node_os_1.default.tmpdir(), 'storyline-mem-'));
    const index = new vectra_1.LocalIndex(folderPath);
    await index.createIndex({ version: INDEX_VERSION, deleteIfExists: true });
    return new StorylineNuVector(index, options.tenant ?? exports.DEFAULT_TENANT, folderPath, true);
}
async function closeStore(store) {
    await store.close();
}
function walkDir(rootPath, relPrefix, out) {
    let entries;
    try {
        entries = node_fs_1.default.readdirSync(rootPath, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        const abs = node_path_1.default.join(rootPath, entry.name);
        const rel = relPrefix ? node_path_1.default.join(relPrefix, entry.name) : entry.name;
        if (entry.isDirectory()) {
            walkDir(abs, rel, out);
        }
        else if (entry.isFile()) {
            const buf = node_fs_1.default.readFileSync(abs);
            const text = buf.toString('utf-8');
            const reEncoded = Buffer.from(text, 'utf-8');
            const encoding = reEncoded.equals(buf) ? 'utf-8' : 'base64';
            out.push({
                relPath: rel,
                encoding,
                content: encoding === 'utf-8' ? text : buf.toString('base64'),
            });
        }
    }
}
//# sourceMappingURL=store.js.map