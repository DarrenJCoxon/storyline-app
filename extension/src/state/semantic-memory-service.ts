import * as vscode from 'vscode'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
// Deep path import: the extension's tsconfig uses moduleResolution=node
// (not bundler/node16), which doesn't read the package's `exports` field.
// Importing the dist file directly resolves both at compile time (the
// .d.ts sits next to the .js) and at runtime under Node's CommonJS
// resolution. The subpath is what's loaded; the literal path is just a
// TypeScript workaround.
import {
  openProjectStore,
  closeStore,
  STORYLINE_EMBEDDING_DIMENSIONS,
  type StorylineNuVector,
  type MemoryRecord,
  type RetrievalQuery,
  type ContextPack,
} from '@storyline/core/dist/nuvector.js'
import { readSemanticMemoryConfig, type SemanticMemoryConfig } from './semantic-memory.js'
import { logVerbose, logInfo, logError } from '../diagnostic-log.js'

/**
 * SemanticMemoryService — extension-host owner of the local NuVector
 * store. The single chokepoint that NT-05 save hooks call to push
 * planning state, manuscript prose, and research items into the
 * knowledge graph.
 *
 * Design notes:
 * - **Lazy open.** The store opens on first use and stays open until the
 *   extension deactivates. Closing happens once at shutdown.
 * - **Gated on opt-in.** Every public method short-circuits when
 *   `storyline.semanticMemory.enabled` is false. No network calls, no
 *   disk writes.
 * - **Diff-aware.** Each chunk's text is hashed (SHA-256, first 16 hex)
 *   and stored as `metadata.contentHash`. Re-upserting the same text is
 *   skipped without an embedding round-trip.
 * - **Fail soft.** Embedding/upsert errors log via diagnostic-log but
 *   never throw to callers. The markdown file (or state.json) remains
 *   the source of truth; the index is best-effort.
 */

interface ChunkInput {
  /** Stable chunk id following docs/design/nuos-memory-schema.md §2. */
  id: string
  /** NuVector record kind — see schema doc §4. */
  kind: MemoryRecord['kind']
  /** Human-readable text, becomes the embedding target. */
  text: string
  /** NuVector-required metadata + Storyline extensions per schema §5. */
  metadata: Record<string, unknown>
}

interface UpsertResult {
  status: 'upserted' | 'skipped-unchanged' | 'skipped-disabled' | 'failed'
  reason?: string
}

interface BackendClient {
  /** POST /embed → vectors. Throws on non-200. */
  embed(texts: string[]): Promise<number[][]>
}

/** Minimum context required to instantiate the service. */
export interface SemanticMemoryServiceDeps {
  /** Backend embedding client. Injected so tests can stub. */
  client: BackendClient
  /** Where the project lives — `.storyline/memory.nv` will be created here. */
  projectRoot: string
  /** Active config — re-read on every public call to honour live setting changes. */
  readConfig: () => SemanticMemoryConfig
}

export class SemanticMemoryService {
  private storePromise: Promise<StorylineNuVector | null> | null = null
  private readonly hashCache = new Map<string, string>()

  constructor(private readonly deps: SemanticMemoryServiceDeps) {}

  /**
   * Upsert a single chunk. No-ops cleanly when semantic memory is off,
   * when the content hash is unchanged from the previous upsert, or on
   * any backend / store failure.
   */
  async upsert(chunk: ChunkInput): Promise<UpsertResult> {
    const cfg = this.deps.readConfig()
    if (!cfg.enabled) return { status: 'skipped-disabled' }

    const contentHash = hashContent(chunk.text)
    if (this.hashCache.get(chunk.id) === contentHash) {
      return { status: 'skipped-unchanged' }
    }

    const store = await this.openStoreIfNeeded(cfg.tenant)
    if (!store) return { status: 'failed', reason: 'store-unavailable' }

    let embeddings: number[][]
    try {
      embeddings = await this.deps.client.embed([chunk.text])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`[Storyline] semantic-memory embed failed for ${chunk.id}: ${msg}`)
      return { status: 'failed', reason: 'embed-failed' }
    }

    if (!Array.isArray(embeddings) || !embeddings[0] || embeddings[0].length !== STORYLINE_EMBEDDING_DIMENSIONS) {
      logError(`[Storyline] semantic-memory: bad embedding shape for ${chunk.id}`)
      return { status: 'failed', reason: 'bad-embedding-shape' }
    }

    try {
      await store.upsert({
        id: chunk.id,
        kind: chunk.kind,
        embedding: new Float32Array(embeddings[0]),
        text: chunk.text,
        metadata: { ...chunk.metadata, contentHash },
        tenant: cfg.tenant,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`[Storyline] semantic-memory upsert failed for ${chunk.id}: ${msg}`)
      return { status: 'failed', reason: 'upsert-failed' }
    }

    this.hashCache.set(chunk.id, contentHash)
    logVerbose(`[Storyline] semantic-memory upserted ${chunk.id} (${chunk.text.length} chars)`)
    return { status: 'upserted' }
  }

  /**
   * Delete chunks by ids. Used when scenes are cut, research items
   * removed, etc. Idempotent.
   */
  async deleteByIds(ids: string[]): Promise<void> {
    const cfg = this.deps.readConfig()
    if (!cfg.enabled || ids.length === 0) return

    const store = await this.openStoreIfNeeded(cfg.tenant)
    if (!store) return

    try {
      await store.delete({ ids, reason: 'cleanup' })
      for (const id of ids) this.hashCache.delete(id)
      logVerbose(`[Storyline] semantic-memory deleted ${ids.length} chunk(s)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`[Storyline] semantic-memory delete failed: ${msg}`)
    }
  }

  /**
   * Search the index by text query. Returns null when semantic memory
   * is off (callers should branch on this rather than getting an empty
   * pack — empty pack means "nothing matched", null means "feature off").
   */
  async search(query: string, opts: { topK?: number; kindFilter?: MemoryRecord['kind'][] } = {}): Promise<ContextPack | null> {
    const cfg = this.deps.readConfig()
    if (!cfg.enabled) return null

    const store = await this.openStoreIfNeeded(cfg.tenant)
    if (!store) return null

    let embeddings: number[][]
    try {
      embeddings = await this.deps.client.embed([query])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`[Storyline] semantic-memory search embed failed: ${msg}`)
      return null
    }
    if (!embeddings[0]) return null

    const retrievalQuery: RetrievalQuery = {
      embedding: new Float32Array(embeddings[0]),
      tenant: cfg.tenant,
      topK: opts.topK ?? 8,
      filters: opts.kindFilter ? { kind: opts.kindFilter } : undefined,
    }

    try {
      return await store.retrieveContext(retrievalQuery)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`[Storyline] semantic-memory retrieve failed: ${msg}`)
      return null
    }
  }

  /**
   * Cleanly close the store. Safe to call repeatedly. Triggered from
   * the extension's deactivate hook.
   */
  async dispose(): Promise<void> {
    if (!this.storePromise) return
    const store = await this.storePromise.catch(() => null)
    this.storePromise = null
    this.hashCache.clear()
    if (store) {
      try {
        await closeStore(store)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logError(`[Storyline] semantic-memory close failed: ${msg}`)
      }
    }
  }

  private async openStoreIfNeeded(tenant: string): Promise<StorylineNuVector | null> {
    const existing = this.storePromise
    if (existing) return existing.catch(() => null)

    const fresh = openProjectStore(this.deps.projectRoot, { tenant }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`[Storyline] semantic-memory openStore failed: ${msg}`)
      this.storePromise = null
      throw err
    })
    this.storePromise = fresh
    return fresh.catch(() => null)
  }
}

/**
 * Stable hash for diff-aware skipping. SHA-256 first 16 hex — collision
 * probability is negligible at the scale of one project's chunks (max
 * ~10k for a giant series), and we only need it to skip re-embedding
 * unchanged text, not for any security purpose.
 */
function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/**
 * Default backend client — talks to the Worker's /embed endpoint using
 * the configured backendUrl + the active licence key.
 */
export class WorkerEmbedClient implements BackendClient {
  constructor(
    private readonly backendUrl: string,
    private readonly getLicenceKey: () => Promise<string | undefined>,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    const licenceKey = await this.getLicenceKey()
    if (!licenceKey) throw new Error('no-licence-key')

    const url = `${this.backendUrl.replace(/\/+$/, '')}/embed`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenceKey, texts }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`/embed ${res.status}: ${body.slice(0, 200)}`)
    }
    const json = (await res.json()) as { embeddings: number[][] }
    if (!json.embeddings || !Array.isArray(json.embeddings)) {
      throw new Error('/embed: malformed response')
    }
    return json.embeddings
  }
}

// Module singleton — instantiated once during activation, accessed by
// the save hooks. Set via `setSemanticMemoryService` so tests can swap.
let _service: SemanticMemoryService | null = null

export function setSemanticMemoryService(service: SemanticMemoryService | null): void {
  _service = service
}

export function getSemanticMemoryService(): SemanticMemoryService | null {
  return _service
}

/** Convenience for save hooks: derive the project root from VS Code's workspace. */
export function getProjectRoot(): string | null {
  const folder = vscode.workspace.workspaceFolders?.[0]
  return folder?.uri.fsPath ?? null
}

/** Convenience: where the store lives, useful for the eventual delete-index command. */
export function getStorePath(projectRoot: string): string {
  return path.join(projectRoot, '.storyline', 'memory.nv')
}
