# NuVector schema for Storyline (NT-03)

**Status:** v1 design, ratified 2026-05-10
**Implements:** NT-03 of [docs/backlog/nuos-trifecta-integration.md](../backlog/nuos-trifecta-integration.md)
**Cross-refs:** NT-01 (foundation), NT-05 (embed-on-save), NT-08 (typed edges), NT-10 (series support)

The 2026-05-10 framing locks the goal: **a single living knowledge graph of the entire project that evolves as the book is planned and written.** Every document source feeds the graph as a node; edits update; deletions remove. This document defines the mapping between Storyline's data model and `@nusoft/nuvector`'s storage layer so NT-05 onwards has zero design ambiguity.

NuVector ships with three storage backends, four hierarchical layers, and a fixed taxonomy of record kinds. We use the **local-file backend** (per OQ-1), map our content onto the **NuWiki-shaped kinds** (because the semantics fit), and accept that the **layer-specific search APIs are deferred to NuVector WU 004** — v1 retrieval goes through `retrieveContext` with kind filters.

* * *

## 1 · Document sources in Storyline

Every source below becomes one or more chunks in NuVector. NT-05 wires each save path; this section is the authoritative enumeration.

| Source | Where it lives | Plural? | Notes |
|---|---|---|---|
| **Book metadata** | `.storyline/state.json` (`genre`, `premise`, `logline`, `bookDna`) | No (1 per project) | Aggregated into a single Layer 1 record. |
| **Planning stages — fiction** | `.storyline/state.json` (14 stages: `mode`, `genre`, `premise`, `protagonist`, `characters`, `relationships`, `logline`, `beatSheet`, `bStory`, `subplots`, `sceneOutline`, `plotThreads`, `chapterOutline`, `critique`, `masterDoc`) | Yes (one chunk per stage) | Stage data is structured; each stage emits a Layer 2 record summarising it. Multi-entity stages (`characters`, `relationships`) emit Layer 3 records per entity. |
| **Planning stages — non-fiction** | `.storyline/state.json` (12 Book DNA + 10–11 pipeline stages: A=Prescriptive / B=Narrative / C=Skill-Ladder / Academic) | Yes | Same layer mapping as fiction stages. |
| **Beat sheet beats** | `state.beatSheet.beats[]` (15 Save the Cat beats) | Yes | Each beat is a Layer 3 record so `/find "midpoint flip"` can hit the specific beat. |
| **Chapters** | `manuscript/<chapter>.md` (markdown files) and `state.chapterOutline[]` (planning shape) | Yes | Outline → Layer 2 chunk; manuscript prose → split into scene-level Layer 3 chunks via the manuscript's scene markers. |
| **Scenes** | Within chapter outlines (`FictionScene`) and within manuscript markdown (scene markers / `chN-sM` IDs) | Yes | Layer 3. Carries POV, location, conflict, summary; the prose is the embedded text. |
| **Characters** | `state.characters[]`, `state.protagonist`, NF cast (`pb-cast`) | Yes | Each character → Layer 3. Persistent identity across the book; targets of `references-character` edges. |
| **Research items** | `.storyline/research/<id>.md` (managed by `lib/research/`) | Yes | Layer 3 (citation). Subtypes: `note`, `quote`, `statistic`, `case-study`, `interview`, `sourced-claim`, `worldbuilding`, `period`, `profession`. Carry reliability tier + verification state. |
| **Plot threads / subplots** | `state.plotThreads[]`, `state.subplots[]` | Yes | Layer 3 — searchable as "show me the threads about ___". |
| **Decisions (NT-11)** | `.storyline/decisions.jsonl` | Yes | Layer 3 with kind `decision`. The "why" field is the embedding target. |

**Sources we do *not* embed:**

- The flat `memory.jsonl` audit log — superseded by the decision log (NT-11) and the chunks themselves.
- Generated outputs (master document, glossary, claim ledger) — derived from chunks, never their source. Re-generated from current state on demand.
- AI chat transcripts — ephemeral; the planning state is the source of truth.

* * *

## 2 · Identifier convention

Every chunk gets a stable, URI-shaped ID. The format generalises the existing research-linker convention (`chapter:N` / `scene:chN-sM` / `stage:X` / `claim:Y`) with two additions: a **book scope** (so series mode doesn't collide) and a **field qualifier** for sub-stage chunks.

```
[ book:<bookId>/ ] <kind>:<localPath> [ /<fieldKey> ]
```

Where:
- `<bookId>` — derived from `_meta.projectPath` slugified, or the explicit project name. Always present in series mode; in single-book mode v1, kept as `book:default/` so the schema is uniform across modes.
- `<kind>` — one of: `book`, `chapter`, `scene`, `stage`, `beat`, `character`, `research`, `plotThread`, `subplot`, `decision`.
- `<localPath>` — kind-specific identifier (chapter number, scene's `chN-sM`, stage id, etc.).
- `<fieldKey>` — optional sub-field (e.g. `protagonist.want` for an embedding of just the want field).

### Examples

| Source | Chunk ID |
|---|---|
| The book itself | `book:default/book:summary` |
| Chapter 5 (outline) | `book:default/chapter:5` |
| Chapter 5, scene 2 | `book:default/scene:ch5-s2` |
| The protagonist's "want" field | `book:default/stage:protagonist/want` |
| The protagonist as a character | `book:default/character:marlowe` |
| Beat #8 (Midpoint) | `book:default/beat:beat08Midpoint` |
| A research item | `book:default/research:itm-7f3a91b2` |
| A decision | `book:default/decision:dec-2026-05-10-a3` |

### Series mode

When `storyline.series.id` is set, the tenant changes (see §3) and `<bookId>` becomes the project's slug, not `default`:

```
book:hollow-dawn/scene:ch5-s2
book:cold-river/scene:ch5-s2     ← same local path, different book, both safe
```

* * *

## 3 · Tenant strategy

NuVector's `tenant` is the routing key. Strict mode (`tenantStrategy: 'strict'`, set in NT-01) means a query under tenant A *cannot* see records under tenant B — verified by NT-01's tenant-isolation test.

| Mode | Tenant value | Cross-book search? |
|---|---|---|
| Single-book (v1 default) | `default` | N/A — only one book. |
| Series (`storyline.series.id` set) | `series:<seriesId>` | Yes — all books in the series share the tenant. The `book:<bookId>` prefix in chunk IDs disambiguates. |

**Migration**: a writer turning a single-book project into a series later reindexes (NT-06) under the new tenant. The old `default` tenant's contents can be safely deleted via `nuvector.delete({ tenant: 'default' })`.

* * *

## 4 · NuVector kind mapping

NuVector v0.1.5 ships a fixed taxonomy of record kinds. We pick from the NuWiki-shaped subset because the four-layer semantics fit Storyline's natural hierarchy, and we leave room to migrate to layer-specific search APIs once they ship in WU 004.

| Storyline source | NuVector `kind` | Layer | Why |
|---|---|---|---|
| Book metadata aggregate | `nuwiki_article_summary` | 1 | One per project — the entry point ~70% of queries terminate at. |
| Chapter outline | `nuwiki_article_summary` | 1 | A chapter is itself a coherent "article" with sections (scenes). |
| Stage summary | `nuwiki_section` | 2 | Stages are conceptually sections of the project; embedded with the book summary as a prefix so retrieval understands them in context. |
| Scene (outline + prose) | `nuwiki_section` | 2 | Scenes are sections of a chapter. |
| Character | `nuwiki_citation` | 3 | A character is a precision-retrieval target — exact-match is the value ("scenes that reference Sarah"). |
| Research item | `nuwiki_citation` | 3 | Native fit. Already evidence-shaped. |
| Beat sheet beat | `nuwiki_citation` | 3 | Precision retrieval ("the midpoint beat") matters more than summary-level. |
| Plot thread / subplot | `nuwiki_citation` | 3 | Same — query by name or theme. |
| Decision | `document_chunk` | n/a | Decisions are operational records with specific schema (NT-11), not part of the article hierarchy. Use the generic kind so the rest of the Layer 1–3 retrieval surface isn't polluted. |
| Provenance (audit) | `workflow_provenance` | n/a | Reserved for NT-12 — every meaningful save lands a provenance entry via `nuvector.remember()`. |

**Why not `document_chunk` for everything?** Two reasons:
1. The four-layer search APIs (`searchKnowledge`, `searchArticles`, `searchSectionsInArticles`, `searchCitations`) ship in NuVector WU 004 and only return NuWiki-shaped records. Mapping correctly now means we get layered search for free when those land.
2. The existing kind taxonomy carries semantic information NuVector uses internally (e.g. layer-specific freshness defaults, citation indexing strategies). Using the NuWiki kinds aligns Storyline with the package's design intent.

* * *

## 5 · Per-layer metadata schemas

Every chunk carries a `tenant`, an `id`, an `embedding` (1536-dim Float32Array, OpenAI `text-embedding-3-small`), and an optional `text` (the human-readable version). The shape below specifies what goes in `metadata`.

NuVector v0.1.5's TypeScript types narrow the metadata for NuWiki kinds via `NuWikiArticleSummaryRecord`, `NuWikiSectionRecord`, `NuWikiCitationRecord`. The Storyline-specific keys live alongside those required fields.

### 5.1 · Layer 1 — book + chapter summaries

NuVector requires: `articleId`, `documentType`, `subject`, `version`, `sectionCount`, `lastCompiledAt`, `isFresh`, `backlinks: {inboundCount, outboundCount}`, `summaryTokenLength`.

**Storyline extensions (in metadata)**:
```ts
{
  // NuVector required
  articleId: 'book:default/book:summary',     // matches the chunk id
  documentType: 'storyline_book' | 'storyline_chapter',
  subject: { kind: 'book' | 'chapter', id: 'default' | '5' },
  version: 'v17',                             // stage save count; bumped on every patch
  sectionCount: 14,                           // for book = stages count; for chapter = scene count
  lastCompiledAt: '2026-05-10T17:42:11.000Z',
  isFresh: true,
  backlinks: { inboundCount: 0, outboundCount: 8 },
  summaryTokenLength: 512,

  // Storyline-specific
  bookId: 'default',
  mode: 'fiction' | 'nonfiction',
  pipeline: 'novel' | 'A' | 'B' | 'C' | 'academic',
  chapterNumber?: 5,                          // chapter Layer 1 only
  estimatedWords?: 4500,                      // chapter only
}
```

The `text` field carries: book = title + premise + logline + tone summary; chapter = chapter title + outline beat + 1-paragraph summary auto-generated by the Worker on save.

### 5.2 · Layer 2 — stage + scene sections

NuVector requires: `articleId` (the parent's id), `documentType`, `subject`, `version`, `sectionKey`, `sectionHeading`, `citationCount`, `parentArticleSummary`, `position`.

**Storyline extensions**:
```ts
{
  articleId: 'book:default/chapter:5',        // for scenes; or 'book:default/book:summary' for stages
  documentType: 'storyline_scene' | 'storyline_stage',
  subject: { kind: 'scene' | 'stage', id: 'ch5-s2' | 'protagonist' },
  version: 'v3',
  sectionKey: 'ch5-s2' | 'protagonist',
  sectionHeading: 'Marlowe finds the cipher' | 'Protagonist Deep Dive',
  citationCount: 0,
  parentArticleSummary: '<short prefix from Layer 1>',  // NuVector handles this automatically
  position: 2,                                // scene position in chapter, or stage index in pipeline

  // Storyline-specific
  bookId: 'default',
  stageId?: 'protagonist',                    // stage chunks only
  chapterNumber?: 5,                          // scene chunks only
  sceneNumber?: 2,                            // scene chunks only
  pov?: 'Marlowe',                            // scene
  location?: 'the docks',                     // scene
  wordCount?: 1240,                           // scene prose word count
  hasPose: true,                              // scene has manuscript prose, not just outline
}
```

The `text` field for a stage is the consolidated answers to the stage's questions (rendered by `writeStageDoc` already). For a scene with prose, the `text` is the prose itself; for outline-only scenes, the summary + conflict + whatChanges fields concatenated.

### 5.3 · Layer 3 — characters / research / beats / threads

NuVector requires: `articleId`, `documentType`, `subject`, `version`, `citationId`, `sourceRef`, `confidence`, `sectionKey`.

**Storyline extensions** (one schema per Storyline kind; all share these required NuVector fields):

```ts
// Character
{
  articleId: 'book:default/book:summary',     // characters are book-level citations
  documentType: 'storyline_character',
  subject: { kind: 'character', id: 'marlowe' },
  citationId: 'character:marlowe',
  sourceRef: { kind: 'database_record', ref: 'state.json#protagonist' },
  confidence: 1.0,                            // user-asserted, always 1.0
  sectionKey: 'protagonist',

  bookId: 'default',
  role: 'protagonist' | 'supporting' | 'antagonist',
  want: '...', need: '...', flaw: '...',
  arcDirection: 'positive' | 'negative' | 'flat',
}

// Research item
{
  articleId: 'book:default/book:summary',
  documentType: 'storyline_research',
  subject: { kind: 'research', id: 'itm-7f3a91b2' },
  citationId: 'research:itm-7f3a91b2',
  sourceRef: {
    kind: 'document' | 'external_system',
    ref: 'https://example.com/article',
    citationLabel: 'Bartholomew (2019), p. 47',
  },
  confidence: 0.9,                            // mapped from reliability tier (primary=1.0, peer-reviewed=0.9, secondary=0.7, anecdotal=0.5)
  sectionKey: 'research',

  bookId: 'default',
  subtype: 'quote' | 'statistic' | ...,       // from existing ITEM_SUBTYPES
  reliabilityTier: 'primary' | 'peer-reviewed' | 'secondary' | 'anecdotal',
  verificationState: 'verified' | 'pending' | 'disputed' | 'needs-follow-up',
  legacyLinks: ['chapter:5', 'scene:ch5-s2'], // existing item.links[] preserved verbatim for back-compat
}

// Beat
{
  articleId: 'book:default/book:summary',
  documentType: 'storyline_beat',
  subject: { kind: 'beat', id: 'beat08Midpoint' },
  citationId: 'beat:beat08Midpoint',
  sourceRef: { kind: 'database_record', ref: 'state.json#beatSheet.beats.beat08Midpoint' },
  confidence: 1.0,
  sectionKey: 'beatSheet',

  bookId: 'default',
  beatIndex: 8,
  beatName: 'Midpoint',
  genreVariant: 'standard',
}

// Plot thread / subplot — analogous shape with documentType: 'storyline_plot_thread' | 'storyline_subplot'.
```

* * *

## 6 · Layer 4 — typed edges (NT-08 preview)

NuVector's graph layer (`NuVectorGraph` from the `/graph` subpath) provides typed edges. The traversal API (`traverseFromArticle`) is deferred to WU 005 in v0.1.5; until then, edges are recorded but only fetchable by direct query.

### 6.1 · Edge types

Storyline-defined edge kinds, layered onto NuVector's base `LinkType` (`mentions`, `supports_outcome`, `contradicts`, `evidence_for`, `derived_from`, plus arbitrary strings):

| Edge kind | From → To | Meaning | Source |
|---|---|---|---|
| `references-character` | scene / stage / research → character | This chunk talks about that character. | Auto-suggested via NER + manual confirmation (NT-09). |
| `pays-off-setup` | scene → scene | The first scene plants something the second scene resolves. | Manual; suggestion from NT-09. |
| `contradicts` | any → any | Continuity inconsistency. | Critique surfaces (NT-13 in non-fiction; story-traps in fiction). |
| `supersedes-decision` | decision → decision | Later decision overrides earlier. | NT-12 emits these automatically. |
| `mirrors-theme` | scene → scene | Thematic echo / parallel structure. | Manual + NT-09 suggestion. |
| `links-to-research` | scene / stage / claim → research | Existing research-linker edge, now first-class. | Existing `lib/research/linker.js` (preserved verbatim in `legacyLinks` metadata + emitted as edges). |
| `evidence-for` | research → claim | NF Pipeline B claim ledger backing. | Existing claim ledger; auto-emitted from `claim:<id>` linker entries. |
| `derived-from` | chunk → chunk | This chunk's content originated from that one (compile output, summary of). | NT-12 auto-emits during stage saves. |

### 6.2 · Edge representation

Edges live in NuVector's graph layer (Layer 4). Until graph traversal ships, they're stored with metadata mirroring:

```ts
{
  from: 'book:default/scene:ch5-s2',
  to:   'book:default/character:marlowe',
  kind: 'references-character',
  why?: 'Scene mentions Marlowe by name in line 7',  // optional human note
  createdAt: '2026-05-10T...',
  createdBy: 'auto' | 'manual' | 'critique',
}
```

### 6.3 · Markdown frontmatter sync

When an edge is added in the UI, also append to the relevant file's frontmatter so the data is plain-text visible (the source of truth principle: NuVector retrieves; markdown holds operational truth):

```yaml
---
links:
  - chapter:5                        # legacy link format preserved
  - kind: references-character
    target: character:marlowe
    why: Mentioned in line 7
---
```

This dual-write means a writer can `git diff` to see graph changes, and the index can be rebuilt from frontmatter alone (NT-06 reindex).

* * *

## 7 · Worked example — a 3-chapter project

Project: "Hollow Dawn" (single book, fiction, primaryGenre = thriller). 3 chapters, 7 scenes, 4 characters, 6 research items.

### 7.1 · Chunks

```
Layer 1 (4 records):
  book:default/book:summary
  book:default/chapter:1
  book:default/chapter:2
  book:default/chapter:3

Layer 2 (21 records):
  book:default/stage:genre
  book:default/stage:premise
  book:default/stage:protagonist
  ... (11 more stages, only completed ones get embedded)
  book:default/scene:ch1-s1
  book:default/scene:ch1-s2
  ... (5 more scenes)

Layer 3 (25 records):
  book:default/character:marlowe        (protagonist)
  book:default/character:agnes-vey      (supporting)
  book:default/character:the-broker     (antagonist)
  book:default/character:tomas          (supporting)
  book:default/research:itm-7f3a91b2    (a quote about 1890s docks)
  book:default/research:itm-c0d2e8a1    (a statistic about ciphers)
  ... (4 more research items)
  book:default/beat:beat01OpeningImage
  ... (14 more beats)
  book:default/plotThread:cipher
  book:default/plotThread:agnes-debt

Decision log (1 record per save, growing):
  book:default/decision:dec-2026-05-10-a1
  book:default/decision:dec-2026-05-10-a2
  ...
```

Total at this scale: ~50 chunks. NuVector handles this trivially; HNSW retrieval stays sub-10ms.

### 7.2 · Edges

```
references-character:
  book:default/scene:ch5-s2          → book:default/character:marlowe
  book:default/scene:ch5-s2          → book:default/character:agnes-vey
  book:default/stage:protagonist     → book:default/character:marlowe

links-to-research:
  book:default/scene:ch1-s1          → book:default/research:itm-7f3a91b2
  book:default/scene:ch1-s2          → book:default/research:itm-c0d2e8a1

pays-off-setup:
  book:default/scene:ch3-s2          → book:default/scene:ch1-s1   (the cipher hint pays off)

derived-from:
  book:default/chapter:1             → book:default/stage:sceneOutline
  book:default/decision:dec-…        → book:default/stage:protagonist
```

### 7.3 · Sample retrieval

Writer asks `/find "what scenes set up the cipher subplot?"`:

1. Embed the query text (1536-dim).
2. `nuvector.retrieveContext({ embedding, tenant: 'default', topK: 8, filters: { kind: ['nuwiki_section'] } })`.
3. Filter results to scenes (`documentType: 'storyline_scene'`).
4. Top hit: `scene:ch1-s1` (where the cipher first appears) at score 0.87.
5. UI renders: chapter, scene, summary, "Jump to" button.

Writer asks `/why "did I cut the bar fight?"`:

1. Embed query.
2. `nuvector.retrieveContext({ embedding, tenant: 'default', topK: 5, filters: { kind: ['document_chunk'], metadataMatch: { documentType: 'storyline_decision' } } })`.
3. UI renders the decision's `why` field with a side-by-side diff.

* * *

## 8 · v1 retrieval strategy (given WU 003 limitations)

NuVector v0.1.5 ships only the data path methods (`upsert`, `upsertBatch`, `retrieveContext`, `fetch`, `delete`, `remember`, `snapshot`, `restore`, `close`). The four-layer search APIs and graph traversal are deferred.

**v1 retrieval pattern — single API:** `retrieveContext` with kind filters.

```ts
// Equivalent to "search Layer 1 only":
retrieveContext({
  embedding,
  tenant,
  filters: { kind: 'nuwiki_article_summary' },
  topK: 5,
})

// Equivalent to "search Layer 2 within a chapter":
retrieveContext({
  embedding,
  tenant,
  filters: {
    kind: 'nuwiki_section',
    metadataMatch: { articleId: 'book:default/chapter:5' },
  },
  topK: 10,
})

// Equivalent to "find characters":
retrieveContext({
  embedding,
  tenant,
  filters: {
    kind: 'nuwiki_citation',
    metadataMatch: { documentType: 'storyline_character' },
  },
  topK: 5,
})
```

**When WU 004 ships**: swap to `searchKnowledge` / `searchArticles` / `searchSectionsInArticles` / `searchCitations` for layer-specific paths. The chunk shape is forward-compatible.

**Graph traversal v1**: stored as edge records, queried by direct fetch + filter on `from`/`to` metadata. When `traverseFromArticle` ships in WU 005, swap to BFS traversal.

* * *

## 9 · Open decisions deferred

These don't block NT-05 but should be revisited before NT-08 / NT-12 ship.

- **OQ-A · Embedding granularity for long scenes.** A 4,000-word scene exceeds OpenAI's effective per-input embedding context. Option (i): truncate to first ~8K tokens (cheap, loses tail context). Option (ii): split scenes into sub-chunks (Layer 3 sub-citations) and aggregate at retrieval time. **Lean: (ii)**; revisit when first 5k+ word scene shows up in testing.
- **OQ-B · NER provider for `references-character` auto-suggestion.** Local (`compromise`, no network) vs server-side (better recall, more latency). **Lean: local first**, escalate to server-side only if recall is poor.
- **OQ-C · Decision freshness boundary.** When a stage is rewritten, do older decisions about that stage stay queryable? **Lean: yes — decisions are immutable history; they get a `supersedes` edge but the original record stays.**

* * *

## 10 · Summary — what NT-05 needs from this doc

- The kind mapping in §4 (which Storyline source → which NuVector kind / layer)
- The metadata schemas in §5 (what to put in metadata for each kind)
- The chunk ID format in §2 (`book:<bookId>/<kind>:<localPath>` with optional `/<fieldKey>`)
- The tenant strategy in §3 (`default` or `series:<id>`, set once at store-open time)
- The retrieval pattern in §8 (use `retrieveContext` with kind + metadataMatch filters until WU 004 lands)

NT-08's typed-edge schema (§6) is informational here; it ships separately.
