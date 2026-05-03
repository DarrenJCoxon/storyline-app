# Storyline — AI Optimisation Plan
*Dated 2026-05-03 · Pre-ship improvement backlog*

---

## Executive summary

Storyline's current architecture sends 10,000–15,000 tokens of system-prompt context on every chat turn. The AI's memory of prior decisions is stored but never retrieved during live conversations. For series work — and for complex books with 14 completed planning stages — this produces expensive, repetitive, and increasingly inconsistent responses.

The NuWiki pattern from the nuOS architecture doc is the right model: instead of injecting raw JSON state, maintain a **compiled understanding layer** — short, dense, semantically indexed articles per planning domain — and retrieve only the articles relevant to the current stage. The synthesis has been done once, in advance. The AI's job becomes navigation and reasoning, not reconstruction.

This plan covers three areas in priority order:

1. **Token reduction** — fix the context bloat immediately (2–3× cost reduction)
2. **Wiki layer** — compiled understanding per planning domain (accuracy + consistency)
3. **Memory retrieval** — wire odd-flow search into prompt assembly (cross-turn recall)
4. **Series intelligence** — multi-book continuity as a first-class concern
5. **Speed** — prompt caching, parallel calls, model selection sharpening

---

## Current state: what's actually happening

### System prompt assembly (system-prompt.ts)

Every turn sends:

| Component | Approx tokens | Notes |
|---|---|---|
| `EXTENSION_OVERRIDE` | ~700 | CLI→JSON-block adapter, always identical |
| `SKILL.md` (fiction or NF) | **~8,600** | Full harness — 34 KB file |
| `stageInfo` block | ~400–800 | Stage guide + persona + triggers |
| **Full state JSON** | **~1,000–5,000** | `stripStateForPrompt` strips only `_meta` |
| Trigger docs (syllabuses, research) | 0–2,000 | Side-loaded per stage |
| **Total** | **~11,000–17,000** | Per turn, before any conversation turns |

`stripStateForPrompt` strips exactly one key (`_meta`). For a book mid-planning — Stage 9, protagonist + cast + beats + scene outline all complete — the raw state JSON is 3,000–5,000 tokens. It includes null fields, empty arrays, and data that has no bearing on the current stage.

### Memory (memory.ts)

- **Write path**: on each stage save, spawn odd-flow CLI subprocess, store `stageId:timestamp → JSON patch` in a local SQLite + vector DB.
- **Read path**: `searchMemory()` exists but is **never called during prompt assembly**. The AI has no access to prior decisions at inference time except what's in the raw state JSON.
- **Retrieval**: completely absent from `buildSystemPrompt()`.

### The core problem

```
Writer saves Stage 3 (protagonist)
→ odd-flow stores the patch  ← stored, never seen again during chat
→ state.json updated         ← dumped in full into every subsequent prompt
```

For Stage 10 (scene outline), the AI sees the protagonist data as raw JSON fields buried in a 5,000-token blob. No synthesis, no weighting, no connection to what was decided in Stage 7 (beat sheet) and why. No detection of drift.

For a series, there is no cross-book memory at all.

---

## Optimisation 1 — Stage-scoped state injection (immediate)

**Severity**: HIGH · **Effort**: 1 day · **Impact**: 40–60% token reduction per turn

### Problem

`stripStateForPrompt` dumps the full project state. Stage 4 (supporting cast) doesn't need the full beat sheet. Stage 7 (beat sheet) doesn't need the raw chapter-by-chapter outline.

### Fix

Replace the full-state dump with a **stage-relevance map** that specifies which state fields each stage actually needs. Everything else is omitted.

```typescript
// extension/src/conversation/stage-context-map.ts

const STAGE_FIELDS: Record<string, (keyof ProjectState)[]> = {
  genre:         ['genre'],
  premise:       ['genre', 'premise'],
  protagonist:   ['genre', 'premise', 'protagonist'],
  characters:    ['genre', 'protagonist', 'characters'],
  relationships: ['protagonist', 'characters'],
  logline:       ['genre', 'premise', 'protagonist', 'characters'],
  beatSheet:     ['genre', 'premise', 'protagonist', 'characters', 'logline', 'beatSheet'],
  bStory:        ['protagonist', 'characters', 'beatSheet', 'bStory'],
  subplots:      ['protagonist', 'beatSheet', 'bStory', 'subplots'],
  sceneOutline:  ['premise', 'protagonist', 'beatSheet', 'bStory', 'subplots', 'sceneOutline'],
  plotThreads:   ['characters', 'beatSheet', 'sceneOutline', 'plotThreads'],
  chapterOutline:['beatSheet', 'sceneOutline', 'plotThreads', 'chapterOutline'],
  critique:      ['genre', 'premise', 'protagonist', 'characters', 'beatSheet', 'bStory', 'subplots', 'sceneOutline'],
  masterDoc:     ['genre', 'premise', 'protagonist', 'characters', 'logline', 'beatSheet', 'bStory', 'subplots', 'sceneOutline', 'plotThreads'],
}

export function stateForStage(stageId: string, state: ProjectState): Partial<ProjectState> {
  const fields = STAGE_FIELDS[stageId] ?? Object.keys(state) as (keyof ProjectState)[]
  return Object.fromEntries(fields.map(k => [k, state[k]]).filter(([, v]) => v != null && v !== '' && JSON.stringify(v) !== '{}' && JSON.stringify(v) !== '[]'))
}
```

**Token saving estimate**: 
- Stage 1–4: save 2,000–4,000 tokens (most of the state doesn't exist yet or is irrelevant)
- Stage 7–9: save 1,000–2,000 tokens (remove finished stages not needed for current work)
- Stage 13 (critique): intentionally keeps more context — but even here, remove null fields

### Also: strip null fields everywhere

The current state JSON includes dozens of `"fieldName": null` entries. None carry information. Strip them at serialization time.

```typescript
function compactJson(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(compactJson).filter(v => v != null)
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => [k, compactJson(v)])
    )
  }
  return obj
}
```

---

## Optimisation 2 — Compiled wiki layer (the NuWiki pattern)

**Severity**: HIGH · **Effort**: 3–4 days · **Impact**: accuracy, consistency, series support

### The insight (from NuWiki)

Raw JSON is the source of truth. But the AI doesn't need the source of truth — it needs **compiled understanding**. Compiled understanding is:
- Pre-synthesised from the raw data
- Densely informative in ~200 tokens
- Cross-referenced to related decisions
- Stale-flagged when its source changes

### The Storyline wiki

After each stage save, compile a short article that captures what was decided and why. Store in `.storyline/wiki/`.

```
.storyline/
  state.json              ← source of truth (unchanged)
  memory.jsonl            ← append-only audit log (unchanged)
  wiki/
    protagonist.md        ← 200-token compiled article
    cast.md               ← all characters + relationship web
    structure.md          ← beat sheet + B story + subplots as a unified arc summary
    world.md              ← genre, tone, setting, audience
    series.md             ← series arc + per-book roles (if multi-book)
    logline.md            ← logline + premise hook
    scenes.md             ← scene outline summary (chapter groups)
    themes.md             ← thematic throughlines (compiled from beat sheet + B story)
    index.md              ← master index with freshness timestamps
```

### Article format

Each article is 150–250 tokens of flowing prose. Not field-by-field JSON. Not a template. Synthesis.

Example `protagonist.md` after Stage 3:

```markdown
---
stage: protagonist
compiled: 2026-05-03T14:22:00Z
sourceHash: abc123
fresh: true
relatedArticles: [cast, structure, world]
---

Sarah Chen (38) is a forensic accountant — precise, methodical, emotionally armoured since her
daughter's disappearance five years ago. She wants to close the Harmon case (external: justice);
she needs to trust another person without controlling the outcome (internal: letting go). Her ghost
is the night she chose to work late instead of picking Maya up from school. Her flaw is that she
turns everything into a case to be solved, including people. Arc direction: controlled → open.
Voice: clipped, exact, uses financial metaphors unconsciously.
```

This is what the AI gets for Stage 7 (beat sheet) when it needs to know the protagonist — 200 tokens of precise, synthesised understanding, not 600 tokens of raw JSON with null fields.

### Compilation trigger

```typescript
// extension/src/wiki/compile-article.ts

// Called async after each stage save — never blocks the chat response.
export async function compileWikiArticle(
  stageId: string,
  state: ProjectState,
  projectDir: string,
  licenceManager: LicenceManager,
  backendUrl: string,
): Promise<void>
```

Compilation uses **Haiku** for simple stages (genre, cast, logline), **Sonnet** for synthesis-heavy stages (protagonist, beat sheet, structure). The compilation prompt:

```
You are compiling a planning wiki article for a novelist.

Article type: {articleType}
Token budget: 200 tokens maximum.

Write a dense, flowing prose summary that captures the key decisions and their narrative logic.
Lead with the most important facts. Include decisions, character choices, and their reasoning.
Do NOT use bullet points or field labels. Write for an AI reader that will use this to stay
consistent across a 14-stage planning process.

Source data:
{relevantStateJson}

Output: a single prose paragraph, maximum 200 tokens.
```

### Stage → article mapping

Each stage save touches one or more articles:

| Stage saved | Articles updated |
|---|---|
| genre | world |
| premise | world, logline |
| protagonist | protagonist |
| characters | cast |
| relationships | cast (relationship section appended) |
| logline | logline |
| beatSheet | structure |
| bStory | structure (B story section) |
| subplots | structure (subplots section) |
| sceneOutline | scenes |
| plotThreads | themes |
| chapterOutline | scenes (chapter-level detail) |

### Stage → articles injected

Instead of raw state JSON, inject wiki articles:

| Stage | Articles injected | Est. tokens |
|---|---|---|
| genre | world (if exists) | 0–200 |
| premise | world | 200 |
| protagonist | world | 200 |
| characters | protagonist, world | 400 |
| relationships | protagonist, cast | 400 |
| logline | protagonist, world | 400 |
| beatSheet | protagonist, cast, world, logline | 800 |
| bStory | protagonist, cast, structure | 600 |
| subplots | protagonist, cast, structure | 600 |
| sceneOutline | protagonist, cast, structure, logline | 800 |
| plotThreads | cast, structure, scenes | 600 |
| chapterOutline | structure, scenes, themes | 600 |
| critique | protagonist, cast, structure, scenes, themes, logline | 1,200 |
| masterDoc | all | 1,800 |

Compare to current: **1,000–5,000 tokens of raw JSON** → **200–1,800 tokens of compiled prose**. For most stages, this is a 3–4× reduction with higher signal density.

### Freshness tracking

The article index tracks a `sourceHash` (hash of the relevant state fields). If the source state changes after compilation, the article is marked `stale`. A stale article still gets injected (better than nothing) but with a `⚠️ stale — recompile pending` header so the AI knows to weight it appropriately.

---

## Optimisation 3 — Wire memory retrieval into prompt assembly

**Severity**: MEDIUM · **Effort**: 1 day · **Impact**: cross-turn and cross-stage recall

### Problem

`searchMemory()` exists. It's never called in `buildSystemPrompt()`. The AI can't ask "what did we decide about the antagonist?" and get an answer grounded in prior saves.

### Fix: semantic retrieval on prompt assembly

Before building the system prompt, run a background retrieval against odd-flow for queries relevant to the current stage. Inject the top-3 hits as a `# Prior decisions` block.

```typescript
// In buildSystemPrompt (or called before it in ChatPanel)

const stageQueries: Record<string, string[]> = {
  beatSheet:     ['protagonist motivation', 'story premise hook', 'antagonist'],
  bStory:        ['protagonist flaw', 'protagonist need', 'B story character'],
  subplots:      ['protagonist arc', 'supporting cast roles'],
  sceneOutline:  ['beat sheet structure', 'protagonist', 'antagonist', 'B story'],
  chapterOutline:['scene outline', 'chapter groupings'],
  critique:      ['all decisions', 'protagonist', 'beats', 'themes'],
}

async function retrieveRelevantMemory(stageId: string, limit = 3): Promise<string> {
  const queries = stageQueries[stageId]
  if (!queries?.length) return ''
  
  // Run all queries in parallel, deduplicate by key, take top 3 by score
  const results = await Promise.all(queries.map(q => searchMemory(q, 5)))
  const deduped = deduplicateHits(results.flat())
  if (!deduped.length) return ''
  
  return `# Prior decisions (retrieved from memory)\n\n` +
    deduped.slice(0, limit).map(h => `**${h.key}**: ${h.value}`).join('\n\n')
}
```

This adds ~300–600 tokens of highly relevant prior context. For Stage 10 (scene outline), the AI can recall the protagonist's ghost from Stage 3 and the pivotal beats from Stage 7 without having that raw JSON still in the state block.

**Important**: this retrieval is on the **compiled wiki articles** stored in odd-flow (not the raw JSON patches). The wiki articles are what get stored in odd-flow after compilation, not the raw stage data. The existing `stageId:timestamp` patch storage is the audit log; the wiki articles are the retrieval targets.

---

## Optimisation 4 — Prompt caching (immediate, zero code)

**Severity**: MEDIUM · **Effort**: 0 days · **Impact**: 70–90% cache hit on system prompt tokens

### Problem

Anthropic's prompt cache has a 5-minute TTL. The system prompt currently contains the state JSON inline, which changes on every save. Even a small state change invalidates the entire cache — meaning the 8,600-token SKILL.md is re-billed on every turn after a save.

### Fix: structure the system prompt so the static prefix is stable

Move all dynamic content (stageInfo, state, wiki articles) to the END of the system prompt. The prefix — `EXTENSION_OVERRIDE` + `SKILL.md` — is identical for all turns of the same book type. This gives a stable ~9,000-token cached prefix.

```
[CACHED]  EXTENSION_OVERRIDE  (~700 tokens, always identical)
[CACHED]  SKILL.md            (~8,600 tokens, same for all fiction projects)
[DYNAMIC] wiki articles       (200–1,800 tokens, injected at end)
[DYNAMIC] stage brief         (400–800 tokens)
[DYNAMIC] state               (minimal, stage-scoped — post Opt 1)
```

With Anthropic prompt caching, once the first turn caches the prefix, subsequent turns within 5 minutes pay only for the dynamic suffix. For rapid back-and-forth planning sessions, this is the single highest-ROI change — and it requires only reordering the prompt components, not changing their content.

The backend already uses `anthropic-beta: prompt-caching-2024-07-31` (check the chat.ts OpenRouter headers). If not, add it. OpenRouter passes it through to Anthropic.

---

## Optimisation 5 — Cross-stage consistency check

**Severity**: MEDIUM · **Effort**: 1–2 days · **Impact**: accuracy, writer trust

### Problem

There is no mechanism to detect when a decision in Stage 7 contradicts what was established in Stage 3. The critique-api.js catches some structural issues with static rules, but not semantic drift.

### Fix: lightweight wiki integrity pass

After each save, run a quick (Haiku) consistency check against the two or three most semantically related wiki articles. If a contradiction is found, surface it as a non-blocking warning in the chat.

```typescript
// extension/src/wiki/integrity-check.ts

export async function checkWikiIntegrity(
  changedArticle: string,
  relatedArticles: string[],
  projectDir: string,
): Promise<IntegrityWarning[]>

interface IntegrityWarning {
  kind: 'contradiction' | 'drift' | 'gap'
  article: string
  relatedArticle: string
  description: string
  suggestion: string
}
```

Example: writer changes protagonist's `flaw` in Stage 3 after completing the beat sheet in Stage 7. The integrity check detects that the beat sheet's All Is Lost moment was motivated by a flaw that no longer exists. It surfaces:

> ⚠️ **Consistency note**: Your protagonist's flaw has changed (Stage 3). Beat 11 (All Is Lost) in your beat sheet was built around the original flaw — you may want to revisit it.

This runs async, non-blocking. It uses Haiku so it's cheap. It builds writer trust by showing the tool is tracking coherence on their behalf.

---

## Optimisation 6 — Series intelligence

**Severity**: MEDIUM · **Effort**: 2–3 days · **Impact**: enables the most powerful use case

### Problem

Series context (`state.premise.seriesContext`) exists as a data field. But:
- There is no series-level wiki
- Each book project is isolated
- Working on Book 3 has no access to decisions from Book 1 or Book 2
- Character continuity, world-building rules, and arc throughlines cannot be enforced across books

### Fix: series wiki

When a project is part of a series, create a series-level wiki alongside the book wiki.

```
.storyline/
  state.json
  wiki/
    [book-level articles]
    series/
      arc.md              ← overall series arc, what each book accomplishes
      world.md            ← world-building decisions that persist across books
      characters/
        sarah-chen.md     ← character state at END of each book they appear in
      continuity.md       ← explicit continuity rules ("Sarah never forgives X")
      index.md
```

**Cross-book retrieval**: when working on Book 2, the system prompt for Stage 3 (protagonist) injects `series/characters/sarah-chen.md` — a compiled article summarising where the character ended up at the close of Book 1, what changed, and what must remain true for Book 2.

**Series consistency checker**: any Stage 3 save on Book 2 runs an integrity check against the series character article. If Book 2's protagonist has a trait that contradicts Book 1's ending state, it flags it immediately.

This is the feature that makes Storyline the unambiguous best tool for series writers — a problem no other planning tool even attempts to solve.

---

## Optimisation 7 — Model selection sharpening

**Severity**: LOW · **Effort**: half day · **Impact**: 15–20% cost reduction

### Current routing (model-router.js)

The routing table is well-designed. Specific improvements:

1. **Stage 1 (genre), Stage 11 (plotThreads)**: currently Haiku — correct, keep.
2. **Stage 4 (characters)**: currently Haiku. Cast stage often involves nuanced character arc work. Consider Sonnet for the `arc` and `relationships` sub-questions within Stage 4, Haiku for structured capture of name/role.
3. **Stage 6 (logline)**: currently Sonnet. Logline is high-signal — consider making the critique escalation path explicit (Sonnet → Opus if the logline fails the "save the cat" test on first attempt).
4. **Wiki compilation**: Haiku for simple stages (genre, cast basic, plotThreads), Sonnet for synthesis stages (protagonist, structure, themes). Opus never for wiki compilation — it's background synthesis, not the primary creative conversation.

### Turn history compression

Currently, all turns for the current stage are sent on every API call. A long Stage 7 (beat sheet) session with 20 back-and-forth turns adds 3,000–6,000 tokens to every call.

Implement a **rolling summary**: when a stage exceeds 12 turns, compress the oldest 8 turns into a 300-token Haiku-generated summary and drop the raw turns. The summary is injected as a `[conversation summary]` block at the top of the messages array.

```typescript
// extension/src/conversation/turn-compressor.ts

export async function compressOldTurns(
  turns: Turn[],
  stageId: string,
  backendUrl: string,
  licenceKey: string,
): Promise<{ compressed: Turn[]; summary: string | null }>
```

This caps per-stage conversation context at ~4,000 tokens regardless of session length.

---

## Implementation order

### Wave 1 (1–2 days, no new files, immediate token savings)
1. **Opt 1**: Stage-scoped state injection + null field stripping
2. **Opt 4**: Reorder system prompt components for cache stability

### Wave 2 (3–4 days, new wiki layer)
3. **Opt 2**: Wiki compiler + article injection into system prompt
4. **Opt 3**: Memory retrieval wired into prompt assembly (retrieval = wiki articles in odd-flow)

### Wave 3 (2–3 days, consistency and series)
5. **Opt 5**: Cross-stage integrity checker
6. **Opt 6**: Series wiki — cross-book article injection + continuity checker

### Wave 4 (half day, polish)
7. **Opt 7**: Model routing sharpening + turn compression

---

## Token budget targets (post-optimisation)

| Stage | Current est. tokens | Target post-opt | Reduction |
|---|---|---|---|
| Stage 1 (genre) | 10,500 | 9,500 | ~10% (mostly caching benefit) |
| Stage 4 (characters) | 11,500 | 9,800 | ~15% |
| Stage 7 (beat sheet) | 14,000 | 10,200 | ~27% |
| Stage 10 (scene outline) | 16,000 | 11,000 | ~31% |
| Stage 13 (critique) | 18,000 | 12,000 | ~33% |

With prompt caching active, **cached turns** (within 5 minutes) cost only the dynamic suffix:

| Stage | Cached turn cost | Saving vs current |
|---|---|---|
| Stage 7 | ~1,800 tokens | ~87% |
| Stage 10 | ~2,200 tokens | ~86% |

For a typical planning session (20 turns per stage, most within the cache window), the effective per-turn cost drops to ~15% of current.

---

## Why this makes Storyline the best planning tool ever built

The combination of these optimisations produces something no other writing tool has:

1. **The AI knows the book as well as the writer does** — compiled wiki articles mean it never loses track of what was decided and why, across all 14 stages.

2. **It catches contradictions before the writer notices them** — the integrity checker is a passive continuity editor, always watching.

3. **Series writers can trust it across books** — the series wiki maintains character and world-building state across projects. This is an entirely unsolved problem in every other tool.

4. **It gets faster the longer you use it** — prompt caching + wiki compression means long planning sessions are cheaper per turn than short ones, inverted from current behaviour.

5. **The AI's responses are more precise** — 200 tokens of compiled understanding beats 5,000 tokens of raw JSON every time. The model can reason about the protagonist with full context rather than pattern-matching against a JSON blob.

6. **It scales to complexity** — a 7-book fantasy series with 100 named characters doesn't bloat the context window. The wiki layer ensures the AI always operates within a bounded, relevant context regardless of total project scope.

---

*Next step: implement Wave 1 (stage-scoped state injection + prompt cache ordering) — these two changes require no new infrastructure, reduce cost immediately, and set up the cache prefix stability that makes Wave 2 more valuable.*
