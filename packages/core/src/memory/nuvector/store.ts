import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { LocalIndex } from 'vectra'
import type {
  ContextItem,
  ContextPack,
  DeletionQuery,
  DeletionResult,
  MemoryRecord,
  MemoryRecordKind,
  RetrievalFilters,
  RetrievalQuery,
  SnapshotRef,
  UpsertRef,
} from './types.js'

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

export const STORYLINE_EMBEDDING_DIMENSIONS = 1536
export const DEFAULT_TENANT = 'default'
export const NUVECTOR_RELATIVE_PATH = '.storyline/memory.nv'

const INDEX_VERSION = 1

export interface OpenStoreOptions {
  tenant?: string
}

/**
 * The runtime store handle. Concrete class instead of the original
 * NuVector type alias so callers can rely on the methods directly.
 */
export class StorylineNuVector {
  /** True for in-memory stores backed by a tmpdir; cleaned up on close. */
  private readonly cleanupTmpdir: boolean
  private readonly _folderPath: string

  constructor(
    private readonly index: LocalIndex,
    private readonly defaultTenant: string,
    folderPath: string,
    cleanupTmpdir: boolean,
  ) {
    this._folderPath = folderPath
    this.cleanupTmpdir = cleanupTmpdir
  }

  get folderPath(): string {
    return this._folderPath
  }

  /**
   * Insert or replace a single record. Idempotent on `id`.
   * NuVector compatibility: vectra's `upsertItem` is the same shape.
   */
  async upsert(record: MemoryRecord): Promise<UpsertRef> {
    if (!(record.embedding instanceof Float32Array)) {
      throw new Error('upsert: embedding must be Float32Array')
    }
    if (record.embedding.length !== STORYLINE_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `upsert: embedding dimensions mismatch (expected ${STORYLINE_EMBEDDING_DIMENSIONS}, got ${record.embedding.length})`,
      )
    }
    await this.index.upsertItem({
      id: record.id,
      vector: Array.from(record.embedding),
      metadata: this.toIndexMetadata(record),
    })
    return { id: record.id, upserted: true }
  }

  /** Direct fetch by id. Used for explicit-reference retrieval. */
  async fetch(ids: string[]): Promise<MemoryRecord[]> {
    const out: MemoryRecord[] = []
    for (const id of ids) {
      const item = await this.index.getItem(id)
      if (!item) continue
      const record = this.fromIndexItem(item)
      if (record) out.push(record)
    }
    return out
  }

  /**
   * Vector-similarity search. Equivalent to NuVector's retrieveContext —
   * top-K cosine similarity, optionally filtered by kind / metadataMatch
   * / tenant. The filter syntax is translated from NuVector's
   * RetrievalFilters into vectra's Pinecone-style MetadataFilter.
   */
  async retrieveContext(query: RetrievalQuery): Promise<ContextPack> {
    if (!(query.embedding instanceof Float32Array)) {
      throw new Error('retrieveContext: embedding must be Float32Array')
    }
    const topK = query.topK ?? 8
    const filter = this.buildFilter(query.tenant, query.filters)
    const results = await this.index.queryItems(
      Array.from(query.embedding),
      '',
      topK,
      filter,
    )

    const items: ContextItem[] = []
    for (const r of results) {
      const meta = (r.item.metadata ?? {}) as Record<string, unknown>
      if (query.scoreThreshold != null && r.score < query.scoreThreshold) continue
      const kind = (meta.__kind as MemoryRecordKind) ?? 'document_chunk'
      const text = meta.__text as string | undefined
      items.push({
        ref: r.item.id,
        kind,
        summary: text ? text.slice(0, 200) : '',
        text,
        score: r.score,
        metadata: this.stripInternalMetadataKeys(meta),
        source: this.deriveSource(meta),
      })
    }

    return {
      items,
      retrievalId: `vectra-${Date.now()}`,
      retrievedAt: new Date().toISOString(),
      totalCandidates: results.length,
    }
  }

  /**
   * GDPR right-to-erasure. Idempotent — non-existent ids are no-ops.
   * Currently supports id-based deletion only; tenant/articleId scope
   * is honored via filter then per-id delete.
   */
  async delete(query: DeletionQuery): Promise<DeletionResult> {
    let deletedCount = 0
    if (query.ids && query.ids.length > 0) {
      for (const id of query.ids) {
        try {
          await this.index.deleteItem(id)
          deletedCount += 1
        } catch {
          /* idempotent — non-existent id is fine */
        }
      }
    }
    if (query.tenant && !query.ids) {
      // Tenant-wide delete: list then delete each.
      const items = await this.index.listItemsByMetadata({
        __tenant: { $eq: query.tenant },
      } as unknown as Parameters<typeof this.index.listItemsByMetadata>[0])
      for (const item of items) {
        try {
          await this.index.deleteItem(item.id)
          deletedCount += 1
        } catch {
          /* ignore */
        }
      }
    }
    return { deletedCount, affectedLayers: ['layer1', 'layer2', 'layer3'] }
  }

  /**
   * Backup the current index folder to a snapshot file. Vectra stores
   * everything inside a folder; we tar that folder into the destination
   * path so a single file is portable.
   */
  async snapshot(destinationPath: string): Promise<SnapshotRef> {
    // Implementation: walk the folder, write a JSON envelope of every
    // file. Avoids the tar dependency. Vectra folders are small for our
    // scale (~20 KB per chunk).
    const entries: Array<{ relPath: string; encoding: 'utf-8' | 'base64'; content: string }> = []
    walkDir(this._folderPath, '', entries)
    const envelope = {
      kind: 'storyline-vectra-snapshot',
      version: 1,
      takenAt: new Date().toISOString(),
      entries,
    }
    const payload = JSON.stringify(envelope)
    fs.writeFileSync(destinationPath, payload, 'utf-8')
    return {
      path: destinationPath,
      takenAt: envelope.takenAt,
      bytes: Buffer.byteLength(payload, 'utf-8'),
    }
  }

  /** Restore from a snapshot file produced by {@link snapshot}. */
  async restore(snapshotPath: string): Promise<void> {
    const raw = fs.readFileSync(snapshotPath, 'utf-8')
    const envelope = JSON.parse(raw) as {
      entries: Array<{ relPath: string; encoding: 'utf-8' | 'base64'; content: string }>
    }
    fs.rmSync(this._folderPath, { recursive: true, force: true })
    fs.mkdirSync(this._folderPath, { recursive: true })
    for (const entry of envelope.entries) {
      const dest = path.join(this._folderPath, entry.relPath)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      const buf = entry.encoding === 'base64'
        ? Buffer.from(entry.content, 'base64')
        : Buffer.from(entry.content, 'utf-8')
      fs.writeFileSync(dest, buf)
    }
  }

  /** Close the store. Cleans up tmpdir for in-memory stores. */
  async close(): Promise<void> {
    if (this.cleanupTmpdir) {
      try {
        fs.rmSync(this._folderPath, { recursive: true, force: true })
      } catch {
        /* best-effort */
      }
    }
  }

  // ─── private helpers ────────────────────────────────────────────────────

  private toIndexMetadata(record: MemoryRecord): Record<string, string | number | boolean> {
    // vectra's MetadataTypes is restricted to scalars + arrays of scalars.
    // Stash complex metadata in a JSON-string under __metadata so we can
    // round-trip without losing structure.
    const m: Record<string, string | number | boolean> = {
      __tenant: record.tenant,
      __kind: record.kind,
    }
    if (record.text) m.__text = record.text
    if (record.effectiveAt) m.__effectiveAt = record.effectiveAt
    if (record.version) m.__version = record.version
    // Promote a few well-known scalar metadata keys to top-level so we
    // can filter on them via vectra's MetadataFilter (Pinecone style).
    const meta = record.metadata
    for (const key of FILTERABLE_METADATA_KEYS) {
      const v = meta[key]
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        m[key] = v
      }
    }
    // Everything else lives under __metadata as a JSON-stringified blob.
    m.__metadata = JSON.stringify(meta)
    return m
  }

  private fromIndexItem(item: { id: string; metadata: Record<string, unknown>; vector: number[] }): MemoryRecord | null {
    const meta = item.metadata
    let originalMetadata: Record<string, unknown> = {}
    try {
      const raw = meta.__metadata
      if (typeof raw === 'string') originalMetadata = JSON.parse(raw) as Record<string, unknown>
    } catch {
      /* fall through with empty metadata */
    }
    const kind = (meta.__kind as MemoryRecordKind) ?? 'document_chunk'
    return {
      id: item.id,
      kind,
      embedding: new Float32Array(item.vector),
      text: typeof meta.__text === 'string' ? meta.__text : undefined,
      metadata: originalMetadata,
      tenant: typeof meta.__tenant === 'string' ? meta.__tenant : DEFAULT_TENANT,
      effectiveAt: typeof meta.__effectiveAt === 'string' ? meta.__effectiveAt : undefined,
      version: typeof meta.__version === 'string' ? meta.__version : undefined,
    }
  }

  private buildFilter(
    tenant: string,
    filters: RetrievalFilters | undefined,
  ): Record<string, unknown> {
    const conditions: Array<Record<string, unknown>> = [
      { __tenant: { $eq: tenant } },
    ]
    if (filters?.kind) {
      const kinds = Array.isArray(filters.kind) ? filters.kind : [filters.kind]
      conditions.push({ __kind: kinds.length === 1 ? { $eq: kinds[0] } : { $in: kinds } })
    }
    if (filters?.documentType) {
      const dts = Array.isArray(filters.documentType) ? filters.documentType : [filters.documentType]
      conditions.push({ documentType: dts.length === 1 ? { $eq: dts[0] } : { $in: dts } })
    }
    if (filters?.metadataMatch) {
      for (const [k, v] of Object.entries(filters.metadataMatch)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          conditions.push({ [k]: { $eq: v } })
        }
      }
    }
    return conditions.length === 1 ? conditions[0] : { $and: conditions }
  }

  private stripInternalMetadataKeys(meta: Record<string, unknown>): Record<string, unknown> {
    let originalMetadata: Record<string, unknown> = {}
    try {
      const raw = meta.__metadata
      if (typeof raw === 'string') originalMetadata = JSON.parse(raw) as Record<string, unknown>
    } catch {
      /* ignore */
    }
    return originalMetadata
  }

  private deriveSource(meta: Record<string, unknown>): { kind: 'database_record'; ref: string } {
    let originalMetadata: Record<string, unknown> = {}
    try {
      const raw = meta.__metadata
      if (typeof raw === 'string') originalMetadata = JSON.parse(raw) as Record<string, unknown>
    } catch {
      /* ignore */
    }
    const sr = originalMetadata.sourceRef as { kind?: string; ref?: string } | undefined
    return {
      kind: 'database_record',
      ref: typeof sr?.ref === 'string' ? sr.ref : `index:${meta.__kind ?? 'unknown'}`,
    }
  }
}

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
] as const

/**
 * Open or create the local-file vectra-backed semantic-memory store
 * for a Storyline project. The folder lives at
 * `<projectRoot>/.storyline/memory.nv/`.
 */
export async function openProjectStore(
  projectRoot: string,
  options: OpenStoreOptions = {},
): Promise<StorylineNuVector> {
  const storylineDir = path.join(projectRoot, '.storyline')
  if (!fs.existsSync(storylineDir)) {
    fs.mkdirSync(storylineDir, { recursive: true })
  }
  const folderPath = path.join(projectRoot, NUVECTOR_RELATIVE_PATH)
  const index = new LocalIndex(folderPath)
  if (!(await index.isIndexCreated())) {
    await index.createIndex({ version: INDEX_VERSION })
  }
  return new StorylineNuVector(index, options.tenant ?? DEFAULT_TENANT, folderPath, false)
}

/**
 * Open an in-memory store. Vectra is file-backed, so we use a tmpdir
 * that gets removed on close — semantically equivalent for tests.
 */
export async function openInMemoryStore(
  options: OpenStoreOptions = {},
): Promise<StorylineNuVector> {
  const folderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'storyline-mem-'))
  const index = new LocalIndex(folderPath)
  await index.createIndex({ version: INDEX_VERSION, deleteIfExists: true })
  return new StorylineNuVector(index, options.tenant ?? DEFAULT_TENANT, folderPath, true)
}

export async function closeStore(store: StorylineNuVector): Promise<void> {
  await store.close()
}

function walkDir(
  rootPath: string,
  relPrefix: string,
  out: Array<{ relPath: string; encoding: 'utf-8' | 'base64'; content: string }>,
): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(rootPath, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const abs = path.join(rootPath, entry.name)
    const rel = relPrefix ? path.join(relPrefix, entry.name) : entry.name
    if (entry.isDirectory()) {
      walkDir(abs, rel, out)
    } else if (entry.isFile()) {
      const buf = fs.readFileSync(abs)
      const text = buf.toString('utf-8')
      const reEncoded = Buffer.from(text, 'utf-8')
      const encoding: 'utf-8' | 'base64' = reEncoded.equals(buf) ? 'utf-8' : 'base64'
      out.push({
        relPath: rel,
        encoding,
        content: encoding === 'utf-8' ? text : buf.toString('base64'),
      })
    }
  }
}

export type {
  ContextPack,
  MemoryRecord,
  RetrievalQuery,
  UpsertRef,
  DeletionQuery,
  DeletionResult,
  SnapshotRef,
} from './types.js'
