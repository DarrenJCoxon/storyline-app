# NuOS trifecta integration backlog

Source: exploration session 2026-05-10. Goal: bring NuOS's persistent-memory + semantic-linking + decision-log capabilities into Storyline, using OpenAI's hosted embedding API rather than a local model.

Tickets are sized for one focused PR each. Pick from the top of each tier.

Status legend: `TODO` `IN-PROGRESS` `DONE` `BLOCKED` `WONTFIX`

* * *

## What this is and why

Storyline today saves planning state to `.storyline/state.json` + a flat `memory.jsonl` audit log + odd-flow MCP for key/value recall. None of that supports lookup-by-meaning ("find the scene where I established this character's grief"), none of it tracks **why** a decision was made, and the only cross-document linking primitive is the research linker's typed edges.

The NuOS trifecta ships three pieces (`@nusoft/nuvector` 0.1.5, `@nusoft/nuflow` 0.4.1, `@nusoft/nuwiki` 0.1.4 — all live on npm as of 2026-05-10). Of those:

- **NuVector** is the headline value for Storyline. Vector storage + retrieval with a four-layer hierarchical index (summaries / sections / citations / backlinks) that maps cleanly onto book / chapter / scene / quoted passage.
- **NuFlow** is built for regulated commits (school MIS, clinic) — overkill for creative drafting; deferred.
- **NuWiki** could compile a "story bible" later but is heavyweight today; deferred.

The integration adds three writer-facing capabilities:

1. **Persistent semantic memory** — search the manuscript by meaning, not keyword
2. **Links inside the book and beyond** — typed edges between scenes, characters, themes, and external research, with auto-suggestion
3. **Decision log** — a permanent record of every meaningful change to the planning state, with the *why* attached

**Framing (added 2026-05-10).** The target is **a single living knowledge graph of the entire project that evolves as the book is planned and written.** Every document the writer adds — planning state (all 14 stages), manuscript chapters and scenes, research items, notes, outlines — flows into the graph as a node. Edits update nodes; deletions remove them. Typed edges (NT-08) make the relationships first-class. The graph is not a side effect of search; it's the substrate. This promotes NT-08 from Tier 3 nice-to-have to a spine concern and expands NT-05's scope from "stage docs and chapters" to "every document source in the project."

The embedding model is **OpenAI `text-embedding-3-small`** (1536-dim, ~$0.02 per million tokens — a 100k-word manuscript indexes for roughly a quarter of a cent). NuVector is bring-your-own-embeddings, so swapping providers later is a single adapter change.

* * *

## Open questions — resolved 2026-05-10

- **OQ-1 · Storage backend.** RESOLVED: **NuVector local-file backend** (`storage: "./.storyline/memory.nv"`). Storyline is a local-first writing tool — the index lives next to the manuscript on the writer's disk, never on a remote Postgres. NuVector ships this mode by default; no provisioning, no `pg` dependency, no Hyperdrive. Override of the doc's original Neon lean.
- **OQ-2 · Where the embedding service lives.** RESOLVED: **Existing Cloudflare Worker.** OpenAI key stays server-side, rate-limit and budget guard reuse the `/chat` infra, single place for cost tracking. Architectural split: text leaves the writer's machine once for embedding; the resulting vectors are stored locally and never leave.
- **OQ-3 · Opt-in vs default-on.** RESOLVED: **Opt-in with first-run dialog.** Off by default; explicit consent on first feature touch.
- **OQ-4 · Series support timing.** RESOLVED: **Build series scoping into Tier 1 from day one.** NT-03's schema gets a real `workspace` / `tenant` field (mapped to NuVector's `tenant`); NT-05's upserts use it from the first commit. Override of the doc's original "defer to NT-10" lean — no migration later. NT-10 becomes the surface-it-in-UI ticket only.

* * *

## Tier 1 — foundations (must come first)

### NT-01 · Add `@nusoft/nuvector` to `@storyline/core` and prove local-file round-trip

**Status:** DONE (2026-05-10, branch `feat/nuvector-knowledge-graph`) · **Effort:** S (1–2 hrs) · **Risk:** low

**Shipped:**

- `@nusoft/nuvector@0.1.5` added as a `@storyline/core` dependency (native binary `@nusoft/nuvector-node-darwin-arm64` resolves correctly on Apple Silicon)
- New module `packages/core/src/memory/nuvector/store.ts` exposing `openProjectStore(projectRoot, { tenant })`, `openInMemoryStore({ tenant })`, `closeStore(store)`, plus pinned constants `STORYLINE_EMBEDDING_DIMENSIONS = 1536`, `DEFAULT_TENANT = "default"`, `NUVECTOR_RELATIVE_PATH = ".storyline/memory.nv"`
- Subpath entry `packages/core/src/nuvector.ts` and a matching `./nuvector` export in `packages/core/package.json` — the native binary stays out of the extension's esbuild graph until a caller explicitly imports the subpath. NT-05 will be the first consumer.
- 4 smoke tests in `packages/core/src/memory/nuvector/__tests__/store.test.ts`: in-memory round-trip via `fetch`, vector similarity via `retrieveContext`, local-file persistence across close + reopen (proves `<projectRoot>/.storyline/memory.nv` is created and survives), strict tenant isolation (foundation for series scoping per OQ-4)
- `npm run build` + `npm test` clean in `@storyline/core`; extension typecheck + esbuild bundle clean (9.0mb, unchanged)

With OQ-1 resolved to the local-file backend, NT-01 becomes a much smaller ticket: add the dependency where it lives (`packages/core`, alongside the existing `memory/` module), wrap NuVector's `open` / `upsert` / `retrieveContext` behind a thin Storyline-shaped API, and prove round-trip + persistence with a smoke test.

**Approach:**

- `npm install @nusoft/nuvector` in `packages/core/` (the extension and CLI both depend on core; the backend Worker does not)
- New module `packages/core/src/memory/nuvector/store.ts` exposing:
  - `openProjectStore(projectRoot, { tenant })` — opens `<projectRoot>/.storyline/memory.nv`
  - `openInMemoryStore({ tenant })` — for tests
  - `upsertChunk(store, record)` and `searchChunks(store, query)` — typed wrappers, dimensions locked at 1536 (OpenAI `text-embedding-3-small`)
  - `closeStore(store)`
- Smoke test in `packages/core/src/memory/nuvector/__tests__/store.test.ts`:
  - Opens an in-memory store, upserts a chunk with a deterministic fake 1536-dim vector, retrieves by id, asserts metadata + embedding fidelity
  - Opens a local-file store at a tmpdir path, upserts, closes, reopens, retrieves — proves persistence across process lifetime
- Export the wrapper from `@storyline/core`'s public surface so NT-05 can wire it into the existing `stage-memory.ts` flow

**Acceptance:**

- `npm run build` and `npm test` succeed in `packages/core/`
- Smoke test covers in-memory + local-file persistence
- No native build steps surprise the extension's bundling (esbuild) — verify by running the extension's build after install
- Tenant field threaded through (single value `"default"` in v1; OQ-4 series scoping wires it to `storyline.series.id` in a later ticket)

**Depends on:** none.

* * *

### NT-02 · OpenAI embedding adapter with retry, batch, and budget guard

**Status:** DONE (2026-05-10, branch `feat/nuvector-knowledge-graph`) · **Effort:** M (4–6 hrs) · **Risk:** low

**Shipped:**

- Pure adapter at `backend/src/embeddings/openai.ts`. `embed(texts, env): EmbedResult` transparently splits inputs above OpenAI's 2048-per-call cap, retries 429/5xx with exponential backoff + jitter (3 attempts max), and returns `{embeddings, totalTokens, model}`. Locked to `text-embedding-3-small` (1536 dims). Knows nothing about licences or KV.
- Fixture mode (`STORYLINE_EMBED_FIXTURE=1`): deterministic FNV-hashed fake vectors so tests are stable and don't burn tokens. Same input → same vector across calls.
- Typed errors: `EmbedConfigError` (no API key) → 503; `EmbedUpstreamError` (4xx/5xx after retries) → 502.
- Route handler at `backend/src/embed.ts`. Validates licence (with dev-bypass for `SL-DEV-LOCAL-TEST-KEY`), enforces per-key 60 req/min + per-IP 200 req/min rate limits (matches `/chat`), enforces a 10M-tokens/day per-licence budget tracked in KV (`embed:budget:<key>:<YYYY-MM-DD>`, 48h TTL), and reuses the existing `OPENAI_API_KEY` secret. Returns `{embeddings, model, totalTokens, budgetUsed, budgetLimit}` so the client can surface progress (NT-15).
- Charges no credits — at $0.02/M tokens, embedding is bounded by the daily budget rather than the credit ledger. BYOK licences rejected with 403 (they would embed locally, no proxy needed).
- Wired into `backend/src/index.ts` switch as `/embed`. `STORYLINE_EMBED_FIXTURE` added to `Env`.
- 14 tests cover: fixture determinism, empty input, missing API key, batching above 2048, retry on 429, no-retry on 401, malformed bodies, unknown licence, BYOK rejection, happy path with budget increment, budget accumulation across calls, budget-exceeded 429, oversized input, empty-input no-charge.
- All 100 backend tests passing; typecheck clean.

Single chokepoint for every embedding call. Wrong place to skimp on engineering — every other ticket depends on it.

**Approach:**

- New `backend/src/embeddings/openai.ts` exporting `embed(texts: string[]): Promise<number[][]>`
- Batch up to 2048 inputs per OpenAI call (their max)
- Exponential backoff on 429 / 5xx with jitter
- Per-licence-key daily token budget (default: 10M tokens/day — covers re-indexing a book a hundred times); reject with a typed error when exceeded
- Test fixture mode: when `STORYLINE_EMBED_FIXTURE=1`, return deterministic fake vectors so unit tests don't burn API budget

**Acceptance:**

- Single function call handles batches transparently
- Retries on transient failures, gives up after 3 attempts
- Budget guard enforced and logged via the existing `/log-error` infrastructure (CB-05)
- 100% test coverage in fixture mode

**Depends on:** none. Blocks every other ticket.

* * *

### NT-03 · Storyline → NuVector schema design document

**Status:** DONE (2026-05-10, branch `feat/nuvector-knowledge-graph`) · **Effort:** M (3–4 hrs) · **Risk:** low

**Shipped:** [`docs/design/nuos-memory-schema.md`](../design/nuos-memory-schema.md). 10 sections covering: every document source in the project (book metadata, all 14 fiction stages, all NF stages across pipelines A/B/C/Academic, beats, chapters, scenes, characters, research items, plot threads, decisions); chunk ID convention `book:<bookId>/<kind>:<localPath>` generalising the existing research-linker format; tenant strategy (`default` for single-book, `series:<id>` for series mode per OQ-4); NuVector kind mapping (NuWiki-shaped — `nuwiki_article_summary`/`nuwiki_section`/`nuwiki_citation` — to keep WU 004's layered search APIs accessible when they ship); per-layer metadata schemas; typed-edge taxonomy for NT-08 (`references-character`, `pays-off-setup`, `contradicts`, `supersedes-decision`, `mirrors-theme`, `links-to-research`, `evidence-for`, `derived-from`); markdown frontmatter dual-write; worked example walking a 3-chapter project through chunks, edges, and sample retrieval; v1 retrieval strategy via `retrieveContext` + kind filters (since `searchKnowledge` and graph traversal are deferred to NuVector WU 004/005); three open decisions deferred (long-scene chunking, NER provider, decision freshness). Cross-referenced from `docs/ARCHITECTURE.md`.

Before any embedding-on-save logic, lock the schema. NuVector's four layers (article summary → section → citation → backlink graph) need to map onto Storyline's natural hierarchy.

**Approach:**

- New `docs/design/nuos-memory-schema.md` covers:
  - **Layer 1 (summary):** book-level — title, premise, logline, genre
  - **Layer 2 (section):** chapter-level — chapter title + outline + 1-paragraph summary
  - **Layer 3 (citation):** scene-level + planning-stage-level chunks (one per scene, one per stage)
  - **Layer 4 (backlinks):** typed edges — `references-character`, `pays-off-setup`, `links-to-research`, `contradicts`, `supersedes-decision`
- Each chunk gets a stable ID: `book:default/chapter:5/scene:ch5-s2` (URI-shaped, mirrors the existing research linker's `chapter:N` / `scene:ch5-s2` pattern)
- Workspace field reserved for OQ-4 (series support); v1 hardcoded to `"default"`
- Metadata: `kind`, `stageId`, `chapterNumber`, `sceneNumber`, `wordCount`, `lastModified`
- Worked example: walk a tiny 3-chapter project end-to-end, show every chunk + every edge

**Acceptance:**

- Doc is concrete enough that NT-05 can be implemented without further design
- Schema reviewed against NuVector's API surface — no impedance mismatch
- Cross-referenced from `docs/ARCHITECTURE.md`

**Depends on:** none. Blocks NT-05 onward.

* * *

### NT-04 · User-facing opt-in with privacy disclosure

**Status:** DONE (2026-05-10, branch `feat/nuvector-knowledge-graph`) · **Effort:** S (2–3 hrs) · **Risk:** low

**Shipped:**

- Three settings on `extension/package.json`'s `contributes.configuration`:
  - `storyline.semanticMemory.enabled` (boolean, default `false`) — the master switch every NT-05+ feature checks before sending text to OpenAI
  - `storyline.semanticMemory.firstRunDialogShown` (boolean, default `false`, internal) — gate so we don't pester on every save after a user declines
  - `storyline.series.id` (string, default `""`) — series identifier per OQ-4; consumed by the tenant derivation
- New helper module [`extension/src/state/semantic-memory.ts`](../../extension/src/state/semantic-memory.ts) exposing `readSemanticMemoryConfig()`, `ensureOptIn()` (the gate every NT-05+ feature must pass), `deriveTenant()` / `slugifySeriesId()` (pure, fully tested), and `resetOptInDialog()` for completeness. Imports only `vscode`, never `@storyline/core/nuvector` — keeps the native binary out of the bundle until NT-05.
- Modal first-run dialog with two buttons (Enable / Not now); plain-English explanation that text is sent to OpenAI for embedding only, vectors stay local, OpenAI does not train on this data, and disable + delete are always available.
- 15 unit tests cover slugify edge cases, tenant derivation in both modes, config reads, all four ensureOptIn outcomes (already-enabled, already-declined, enable, decline including silent dismissal), and reset.
- PRIVACY.md §2.4 added — full disclosure of what's sent, when, retention model, lawful basis (consent), and how to disable / delete. §3 ("What we never collect") nuanced to flag the prose carve-out when semantic memory is on.
- 100/100 extension tests passing; typecheck clean; esbuild bundle still 9.0mb (no native binary contamination).

Indexing the manuscript means every chunk gets sent to OpenAI's US servers. That's a real privacy decision the writer must consciously make.

**Approach:**

- New setting `storyline.semanticMemory.enabled` (default `false`)
- First-run dialog when the writer hits any feature that needs it: explains plainly that *"enabling this sends your draft to OpenAI to build a search index. OpenAI does not train on this data, but the text leaves your machine. You can disable this and delete the index at any time."*
- Two buttons: "Enable" / "Not now"
- Disable flow: setting toggle off + "Delete my index" command that issues `nuvector.delete({workspace: "default"})` and shows a confirmation
- Update PRIVACY.md with a section on what gets sent, when, and how to opt out

**Acceptance:**

- Setting persists per-workspace
- Disabled state means zero embedding calls and zero NuVector reads (every dependent feature gracefully no-ops)
- Delete flow actually wipes the index (verify with a follow-up search returning empty)
- PRIVACY.md update reviewed

**Depends on:** NT-01 (need NuVector to know what to delete from).

* * *

## Tier 2 — persistent memory (the headline feature)

### NT-05 · Embed-on-save for every document source in the project

**Status:** DONE (2026-05-10, branch `feat/nuvector-knowledge-graph`) · **Effort:** L (2–3 days) · **Risk:** medium

**Shipped:**

- Bundling: marked `@nusoft/nuvector` and all platform-specific `@nusoft/nuvector-node-*` siblings external in `extension/esbuild.config.mjs` (matches the existing `sharp` pattern). `@nusoft/nuvector` added as a direct dep of `extension/package.json` so vsce-package ships the resolved native binary in the VSIX's `node_modules`.
- `SemanticMemoryService` class at `extension/src/state/semantic-memory-service.ts` (~250 lines): owns the local NuVector store handle (lazy open, single dispose), exposes typed `upsert`/`deleteByIds`/`search`. SHA-256 content hashing skips re-embedding when text is unchanged. Every public method short-circuits when `storyline.semanticMemory.enabled` is `false` and live-reads the config so toggle changes take effect immediately. Errors are logged via `diagnostic-log` and never thrown to callers — saves never block on indexing.
- `WorkerEmbedClient` calls the NT-02 `/embed` endpoint with the active licence key.
- Service wired into `activate()` in `extension/src/extension.ts` via `initSemanticMemoryService(context)`; disposed cleanly through `context.subscriptions.push({ dispose })`.
- **Stage saves** (`extension/src/state/memory.ts`): `pushToMemory` now fire-and-forgets a NuVector upsert in parallel with the existing odd-flow + jsonl writes. Maps to schema doc §5.2 (`nuwiki_section`, `documentType: 'storyline_stage'`).
- **Research items** (`extension/src/panels/ResearchPanel.ts`): add → upsert chunk; remove → delete chunk by id. Reads the item file through the new `parseFrontmatter` + `renderResearchItemAsText` helpers; reliability tier maps to NuVector's `confidence` per schema doc §5.3.
- **Chapter prose** (new `extension/src/state/chapter-semantic-watcher.ts`): `vscode.workspace.createFileSystemWatcher('manuscript/**/*.md')` with 5s per-file debounce. On change, embeds the whole-chapter chunk (Layer 1) plus one Layer 2 chunk per scene marker (`#`/`##` heading or `***` rule). Chapter deletes drop the Layer 1 chunk; scene-level cleanup is deferred to NT-08's edge sweep.
- Subpath export hardened: `@storyline/core/package.json` now exposes both `./nuvector` and `./dist/nuvector.js` so vite/vitest's strict exports check accepts the deep import the extension uses (working around `moduleResolution: node` not reading `exports`).
- 10 new service tests cover: disabled = no-op; first upsert + identical re-upsert dedup; content change re-embeds; embed throw → `failed`/'embed-failed'; malformed embedding shape → `failed`/'bad-embedding-shape'; search disabled → null; search round-trip via local store; delete clears hash so re-upsert embeds again; persistence across `dispose` + reopen; live config toggle takes effect on the next call.
- 110/110 extension tests passing (was 100 before NT-05); typecheck clean; esbuild bundle still 9.0mb with a single retained `@nusoft` reference (the runtime `require()` for the externalised package).

The seam: every meaningful write to the project's data model flows into the knowledge graph. Per the 2026-05-10 framing, that means **every** document source — not just stage docs and chapters:

- Planning state (all 14 stages: genre, premise, characters, beats, B-story, subplots, scene outline, etc.)
- Manuscript chapters and scenes
- Research items (the existing `lib/research/` linker's targets)
- Notes / outlines / any other doc kind enumerated in NT-03

Deletions are a first-class concern: when a scene is cut, a research item is removed, or a stage is reset, the corresponding chunk(s) must be removed from NuVector. The graph evolves with the project; stale nodes corrupt every downstream feature.

**Approach:**

- Extend `packages/core/src/memory/stage-memory.ts` (or a sibling `nuvector-memory.ts`): on every `appendMemoryLog` call, also build an embedding payload and POST to a new `backend/src/nuvector-upsert.ts` endpoint
- Extension chapter watcher (already exists for live preview) gains a debounced upsert hook: 5s after the writer stops typing, embed and upsert the chapter's scenes
- Diff-aware: only embed chunks whose content hash changed since last upsert (NuVector handles dedup but we save tokens by skipping unchanged scenes)
- Failure mode: embedding/upsert failures are logged via `reportException` (CB-05) but never block the save itself — the markdown file is the source of truth

**Acceptance:**

- Stage save → chunk visible via NuVector search within 2s
- Chapter edit → scene chunks updated within 5s of typing-stop
- Network failure → save still succeeds, error logged, retry on next save
- Integration test in `backend/src/__tests__/nuvector-upsert.test.ts` proves round-trip

**Depends on:** NT-01, NT-02, NT-03, NT-04.

* * *

### NT-06 · Backfill command: `storyline memory reindex`

**Status:** DONE (2026-05-10, branch `feat/nuvector-knowledge-graph`) · **Effort:** S (2–3 hrs) · **Risk:** low

**Shipped:**

- New module `extension/src/state/semantic-memory-reindex.ts` with three public entry points:
  - `estimateReindex(projectRoot)` — cheap pre-flight: walks state.json, manuscript/, and .storyline/research/ via filesystem stat (no embeddings), returns `{ stages, chapters, research, estimatedTokens, estimatedCostUsd }` at the published OpenAI `text-embedding-3-small` rate ($0.02 / 1M tokens, ~0.25 tokens/char heuristic).
  - `runReindex(projectRoot, progress, token)` — drives the backfill with `vscode.window.withProgress` increments per item. Uses the same upsert helpers as the live save hooks (`upsertStageToSemanticMemory`, `embedChapterFile`, `upsertResearchItemToSemanticMemory`) so the rebuilt index is byte-identical to live indexing. Honours cancellation tokens.
  - `reindexSemanticMemoryCommand()` — the user-facing flow: runs `ensureOptIn()` first, shows a modal confirmation with `"NN stage(s), MM chapter(s), KK research item(s). ~Xk tokens — about $Y."`, runs with a cancellable progress notification, reports outcome.
- Idempotent by construction: the SemanticMemoryService's content-hash dedup means a second reindex with no content changes returns 100% `skipped-unchanged` results. Re-running after a schema change retriggers an embed because text changes.
- Stage entries with empty data (default `{}` / `[]`) are silently skipped so default-state stages don't pollute the index.
- Three NT-05 helpers (`upsertStageToSemanticMemory`, `embedChapterFile`) promoted from private to public so the reindex shares logic with the live save hooks rather than duplicating it.
- Command registered as `storyline.reindexSemanticMemory` in `extension/package.json` (Command Palette title: `Storyline: Re-index Semantic Memory`) and wired through `safeCommand` in activation.
- 6 walker tests cover empty project, stage filtering (empty objects/arrays skipped), chapter file detection (only `.md`), research item detection, sane cost estimate at the published rate, missing-directory tolerance.
- 116/116 extension tests passing; typecheck + bundle clean.

**Deferred:** the CLI subcommand `storyline memory reindex` (`bin/storyline.js`). The CLI doesn't have access to the extension's secret-store-resolved licence key, so a CLI version needs its own auth flow. The extension command covers the primary user need; the CLI version moves to a follow-up ticket if writers ask for it.

Existing projects (and any project that ever opted out then opted back in) need a way to populate NuVector from current state. Also useful after a schema change in NT-03.

**Approach:**

- New CLI subcommand `storyline memory reindex` (lives in `bin/storyline.js`)
- Equivalent extension command `Storyline: Re-index semantic memory`
- Walks every stage doc + every chapter + every scene, embeds in batches of 100, upserts
- Progress bar with token-usage running total
- Idempotent — running twice produces the same index state
- Confirmation prompt with estimated cost ("Indexing this project will use ~3,200 tokens, costing approximately $0.0001. Continue?")

**Acceptance:**

- Reindex of a 100k-word project completes in <60s
- Cost estimate accurate to ±10%
- Re-running doesn't double-insert chunks
- Works from CLI and from VS Code command palette

**Depends on:** NT-05.

* * *

### NT-07 · Semantic search — chat slash command + sidebar webview

**Status:** PARTIAL — NT-07a DONE (2026-05-10, branch `feat/nuvector-knowledge-graph`); NT-07b deferred · **Effort:** L (1–2 days) · **Risk:** low

**Shipped (NT-07a — command-palette search):**

- New module `extension/src/state/semantic-memory-search.ts`. `searchSemanticMemoryCommand()` is the user flow: ensureOptIn → input box ("Search your project — by meaning, not keyword") → progress notification while embedding + retrieving → `vscode.window.showQuickPick` rendering top 10 results with human labels (`Chapter 5, scene 2`, `Planning — protagonist`, `Research — itm-7f3a`), score percentages, and a one-line preview from the chunk text.
- `resolveChunkIdToTarget(chunkId, projectRoot)` is the chunk-id → file mapper, exported for reuse: scene chunks → manuscript file (matches `01.md`, `01-opening.md`, `chapter-1.md`); chapter chunks → manuscript file; research chunks → `.storyline/research/<id>.md`; stage chunks → `planning/stages/<id>.md` with fallback to `state.json`. Strips the `book:<id>/` prefix and tolerates back-compat ids without the prefix.
- Selecting a result opens the file via `vscode.workspace.openTextDocument` + `showTextDocument`; missing-source case shows a helpful warning instead of a hard error.
- Command registered as `storyline.searchSemanticMemory` ("Storyline: Search Semantic Memory" with `$(search)` icon) and wired through `safeCommand`.
- 9 resolver tests cover unknown chunk shapes, scene/chapter/research/stage paths, chapter-prefix variants, missing-file fallbacks, state.json fallback, no-prefix back-compat.
- 125/125 extension tests passing; typecheck + bundle clean.

**Deferred (NT-07b):**

- In-chat `/find <query>` slash command in the planning chat — same plumbing as the palette command, plus a small extension to the chat command parser. Worth its own ticket since it touches the chat panel surface.
- Sidebar webview "Storyline: Memory" with persistent search input + result list + Cmd+Shift+M shortcut. Webview HTML/CSS/JS work — out of scope for this push.
- Click-through navigation to a specific line within a chapter (NT-07a opens the file but doesn't seek to the matching scene). Needs a per-scene byte-offset cache on upsert.

The first thing the writer experiences. "Find scenes about X" returns ranked results with previews.

**Approach:**

- New chat command `/find <query>` in the planning chat — embeds the query, calls `nuvector.retrieveContext`, renders top 8 results as cards with chunk preview, kind, location, and a "Jump to" button
- New sidebar view `Storyline: Memory` with a search input and persistent result list
- Results are click-through: chapter chunk → opens the chapter file at the right line; stage chunk → opens the stage doc
- Keyboard-first: Cmd+Shift+M opens the sidebar with focus in the search box

**Acceptance:**

- `/find` command works in the planning chat with results visible inline
- Sidebar view searchable from anywhere in VS Code
- Click-through navigation works for every chunk kind
- Search latency <500ms after the first call (warm connection pool)

**Depends on:** NT-05 (nothing to search until something's embedded).

* * *

## Tier 3 — links inside the book and beyond

### NT-08 · Extend the research linker schema with first-class typed edges

**Status:** TODO · **Effort:** M (4–6 hrs) · **Risk:** medium

Today's `lib/research/linker.js` handles research-item-to-target edges. NuVector's backlink layer (Layer 4 in NT-03) generalises this to any-chunk-to-any-chunk, with edge types.

**Approach:**

- Extend the linker schema with new edge types: `references-character`, `pays-off-setup`, `contradicts`, `supersedes-decision`, `mirrors-theme`
- Edges live in NuVector's backlink layer with their own metadata: `{from, to, kind, why?, createdAt}`
- The existing research linker becomes a special case (`links-to-research` edge type)
- Edges are queryable: "show me everything that references Sarah" returns every chunk with a `references-character → character:sarah` edge
- Markdown frontmatter sync: when an edge is added in the UI, also append it to the relevant file's frontmatter so the data is visible in plain text

**Acceptance:**

- Existing research links continue to work, now backed by NuVector
- Adding an edge programmatically reflects in both NuVector and the markdown frontmatter
- Edge queries return results in <200ms
- Schema change documented in NT-03's design doc

**Depends on:** NT-05.

* * *

### NT-09 · Auto-suggest links — inline hints when editing a scene

**Status:** TODO · **Effort:** L (1–2 days) · **Risk:** medium

The payoff feature. While the writer edits a scene, NuVector returns top-K semantically similar passages from elsewhere in the project. Surface them as inline suggestions: *"this scene resembles ch3-s4 (the bar fight) — link as a setup payoff?"*

**Approach:**

- Debounced (10s after typing-stop) call to `nuvector.retrieveContext` with the current scene's text
- Filter out the current scene itself + any chunks already explicitly linked
- Top 3 results with similarity score >0.8 surfaced as a CodeLens above the scene
- Click → opens a quick-pick: "Link as setup payoff / character reference / theme echo / dismiss"
- Dismissals are remembered — same pair won't re-suggest

**Acceptance:**

- Suggestions appear within 12s of the writer pausing
- Never suggest the chunk you're currently editing
- Dismissed suggestions stay dismissed for the session
- Performance: doesn't fire while typing, never blocks the editor

**Depends on:** NT-08.

* * *

### NT-10 · Cross-book series support — workspace-scoped indexes

**Status:** TODO · **Effort:** L (1–2 days) · **Risk:** medium

Series writers (book 2 of 5) want to query book 1 from book 2 without the indexes contaminating each other. NuVector supports workspace scoping; we just need to expose it.

**Approach:**

- New project-level setting `storyline.series.id` (free-text, e.g. `"the-blackwood-saga"`)
- When set, NuVector workspace becomes `series:<id>` instead of `default`
- Sibling projects in the same series share the index
- Search defaults to current-book-only with a "search whole series" toggle
- Sidebar shows a "Series" badge when active

**Acceptance:**

- Two projects with the same `series.id` see each other's chunks
- Search scope toggle works as expected
- Removing the series ID does not delete the chunks (just stops sharing)
- Migration path: existing single-book projects untouched

**Depends on:** NT-07.

* * *

## Tier 4 — decision log (the third ask)

### NT-11 · Define `decisions.jsonl` schema and typed appender

**Status:** TODO · **Effort:** S (2–3 hrs) · **Risk:** low

Today the only decision-like trail is `.storyline/memory.jsonl` — flat, unstructured, untyped. A first-class decision shape.

**Approach:**

- New file `.storyline/decisions.jsonl` (sibling to `memory.jsonl`)
- Schema: `{id, timestamp, stage, kind, before, after, why, embeddedAt?}`
- `kind` enum: `created | revised | cut | reordered | gated`
- New module `packages/core/src/decisions/append.ts` with a typed `appendDecision()`
- Cross-reference: every decision entry includes the chunk IDs it touched

**Acceptance:**

- Schema documented in `docs/design/nuos-memory-schema.md`
- TypeScript types exported from `@storyline/core`
- Append is atomic (rename-on-write to avoid partial JSONL)
- Test coverage for the appender

**Depends on:** NT-03.

* * *

### NT-12 · Wire stage-save flow to emit decision entries

**Status:** TODO · **Effort:** M (4–6 hrs) · **Risk:** medium

Every non-trivial save lands a decision entry. The "why" comes from the AI's reasoning text in the chat; if absent, the writer gets a one-line prompt.

**Approach:**

- `applyEmittedPatches` (the existing chokepoint) gains a decision-emission step
- Diff `before` and `after`; if the change is non-trivial (not just whitespace, not just typo-class edits), emit a decision
- The AI's reasoning text from the surrounding chat turn is captured as the default `why`
- If the AI didn't explain (rare — the planning chat almost always reasons aloud), surface a discrete prompt: *"In one sentence, why this change?"* — non-blocking, can be dismissed
- Decisions are mirrored into NuVector with a `decision:<id>` chunk so they're searchable

**Acceptance:**

- Every meaningful state change produces a decision entry
- The "why" field is populated for >90% of decisions automatically
- Dismissed prompts don't re-fire for the same decision
- Decisions visible via `/find` searches in NT-07

**Depends on:** NT-11, NT-05, NT-07.

* * *

### NT-13 · Decision search — "why did I cut the B-story callback?"

**Status:** TODO · **Effort:** S (2–3 hrs) · **Risk:** low

Reuses NT-07's semantic search infrastructure with a decision-specific filter.

**Approach:**

- New chat command `/why <query>` — same shape as `/find` but scoped to `kind: decision` chunks
- Returns ranked decisions with timestamp, stage, and the `why` field rendered prominently
- Click-through to the diff: shows `before` and `after` side-by-side

**Acceptance:**

- `/why` command works in planning chat
- Results show plain-English reasoning, not raw diffs
- Latency parity with `/find`

**Depends on:** NT-12.

* * *

### NT-14 · Decision timeline view

**Status:** TODO · **Effort:** L (1–2 days) · **Risk:** low

Chronological visualisation in the sidebar. Lets the writer scrub through how the project's shape changed over time.

**Approach:**

- New sidebar view `Storyline: Project History`
- Vertical timeline grouped by week, then day
- Each entry shows stage, kind icon, and the `why` line
- Click → opens the full diff in an editor
- Filter chips: by stage, by kind, by chapter

**Acceptance:**

- Timeline loads in <1s for projects up to 10,000 decisions
- Filtering is instant (client-side)
- Diff viewer reuses VS Code's native diff editor
- Empty state explains how decisions get logged

**Depends on:** NT-11, NT-12.

* * *

## Tier 5 — operational concerns

### NT-15 · Cost tracking and status-bar indicator

**Status:** TODO · **Effort:** S (2–3 hrs) · **Risk:** low

Writers should see, at a glance, what they're spending. Embedding costs are tiny but trust comes from transparency.

**Approach:**

- Status-bar item: `Storyline: $0.00 today` (clickable → opens detail view)
- Detail view: today / this week / this month, broken down by feature (indexing / search / auto-suggest)
- Backed by the per-licence-key tracking from NT-02
- Runs against local cache + reconciles with backend on focus

**Acceptance:**

- Status bar updates within 1s of a chargeable call
- Detail view matches backend records to the cent
- Optional: budget cap with warning at 80% / hard stop at 100%

**Depends on:** NT-02.

* * *

### NT-16 · Privacy: name-redaction toggle for sensitive projects

**Status:** TODO · **Effort:** M (4–6 hrs) · **Risk:** medium

Memoir writers, journalists, anyone working on something legally fraught may want to redact names/places before sending text to OpenAI. NuVector's index would still be useful — it just wouldn't contain real names.

**Approach:**

- Project-level setting `storyline.semanticMemory.redactProperNouns` (default off)
- When on, run a lightweight NER pass (using a small local model — `compromise` library is enough) before embedding
- Redacted tokens get stable pseudonyms (`PERSON_001`, `PLACE_002`) consistent across chunks
- Pseudonym map stored locally (never sent anywhere); used to reverse-translate search results before showing them to the writer

**Acceptance:**

- With redaction on, no real proper nouns reach OpenAI's API
- Search results show real names back to the writer (reverse mapping)
- Pseudonym map persists across sessions
- Toggle works mid-project (re-index required, prompted)

**Depends on:** NT-04, NT-05.

* * *

### NT-17 · Snapshot/export the semantic memory

**Status:** TODO · **Effort:** S (2–3 hrs) · **Risk:** low

NuVector ships a `snapshot()` API. Surface it as an export command so writers can back up their index alongside the manuscript or migrate to a new machine.

**Approach:**

- New command `Storyline: Export semantic memory`
- Calls `nuvector.snapshot({workspace: ...})` and writes the result to `.storyline/nuvector-snapshot.json`
- Sibling import command for restoring
- Snapshots are git-ignorable by default but can be committed for shared projects

**Acceptance:**

- Snapshot of a 100k-word project completes in <10s
- Round-trip (snapshot → wipe index → import) restores the exact state
- Snapshot file is human-inspectable (JSON, not opaque binary)

**Depends on:** NT-01.

* * *

## Deferred (out of scope for this backlog)

- **NT-18 · NuFlow integration** — the structured-commit-with-approval-gate pattern. May be useful for the publishing workflow (manuscript → cover → metadata → KDP submission with explicit approval at each gate) but not for creative drafting. Re-evaluate after Phase 5a stabilises.
- **NT-19 · NuWiki integration** — story bible compilation: one button that produces compiled, cited reference articles for every character / location / theme. Useful for the writer and for handing the project to a co-author. Heavy dependency stack (Postgres + object storage + LLM compile pipeline). Revisit after NT-08 ships and we know how rich the link graph actually gets.

* * *

## How to use this backlog

- Resolve the four open questions before starting NT-01
- Pick from top of Tier 1 first; work down
- Each ticket is one PR
- Update status inline (TODO → IN-PROGRESS → DONE)
- Add new tickets at the bottom of the relevant tier with the next NT-NN number
- The OpenAI embedding-provider call is locked in for v1; swapping to Voyage / Hugging Face later is a one-adapter change in NT-02 and does not touch any other ticket
