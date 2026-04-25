# Storyline Non-Fiction — Scope

*Status: **PLANNED***
*Last updated: 2026-04-23*
*Sibling of: [storyline fiction harness](../skill/SKILL.md) — this scope describes a parallel non-fiction harness.*

## One-line summary

A parallel planning harness inside Storyline, activated via `/storyline-nf`, that reuses the VS Code writing surface, compile pipeline, preview, and state machinery — only the planning layer is new — and adds a cross-cutting research subsystem retrofitted to the existing novel harness.

## Product shape

Storyline today plans novels using Save the Cat. Non-fiction adds a second planning layer alongside it. Memoir stays on the novel harness with a truth-constraint toggle; it does not get its own pipeline.

Everything downstream of planning is shared: writing surface, compile (EPUB/PDF), preview, state files, memory.

## Pipelines in scope

Three pipelines cover the commercial Amazon non-fiction top ten (minus memoir, which reuses the novel harness).

| Pipeline | Categories covered | Weight |
|---|---|---|
| **A — Prescriptive** | Self-Help, Business, Health, Money, Relationships | ~5 of 10 |
| **B — Narrative Non-Fiction** | Popular Science/History, True Crime | ~2 of 10 |
| **C — How-To / Skill Ladder** | Practical Skills (coding, cooking, craft, language) | ~1 of 10 |

**Out of scope:** devotional/daily formats, pure reference books (cookbooks as indexes), academic monographs, religious/spiritual argument.

## Book DNA — Phase 0 (12 stages, all pipelines)

Upgraded from preamble to full phase. This is the commercial moat and gates every pipeline.

1. **Category & Market Positioning** — Amazon category, BISAC, KDP placement, competitive set, price band, length norms, cover conventions.
2. **Reader Avatar** — demographics, psychographics, beliefs already held, pain phrased in their own words.
3. **Reader Transformation** — before-state and after-state in observable terms.
4. **The One Big Idea** — the pre-verbal insight the book delivers (distinct from thesis).
5. **Author Angle & Authority** — credibility inventory, unique vantage, the "why this author" story.
6. **Core Promise & Subtitle Engineering** — commercial promise, subtitle A/B candidates, keyword integration.
7. **Comps Deep Dive** — 3–5 titles with review mining, structural teardown, white-space analysis.
8. **Voice & Tone** — register, persona, formality, humor, vulnerability level.
9. **Evidence Philosophy** — science-led / story-led / opinion-led / hybrid.
10. **Commercial Model** — standalone / lead magnet / course pairing / speaking vehicle / consulting funnel.
11. **Working Title Pressure-Test** — title + subtitle pairings tested against comps and category.
12. **Book DNA Consolidation** — shareable block downstream stages reference.

Output: `.storyline/book-dna.md` + `.json`.

## Pipeline A — Prescriptive (11 stages)

Sub-mode fork at Stage 3: **argument-driven** vs **personal-narrative braid**.

1. Core Thesis
2. Reader Objections
3. Framework Design *(feeds Framework Card compile artifact)*
4. Principles / Laws
5. Evidence Map *(writes into research subsystem)*
6. Application Layer — exercises, scripts, checklists
7. Narrative Braid *(optional, sub-mode only)*
8. Chapter Plan
9. Opener & Closer Design
10. Consistency & Critique
11. Master Document

## Pipeline B — Narrative Non-Fiction (10 stages)

Structural fork at Stage 4: **idea-led** (*Sapiens*) vs **event-led** (*Devil in the White City*, most true crime).

1. Central Question / Thesis
2. Cast of Real People
3. Timeline
4. Structural Fork
5. Scene List
6. Sourcing Register *(view over research subsystem)*
7. Thematic Through-Line
8. Chapter Outline
9. Consistency & Critique
10. Master Document

## Pipeline C — How-To / Skill Ladder (11 stages)

1. Target Skill
2. Reader Starting Level
3. End-State Competency
4. Skill Decomposition
5. Prerequisite Graph
6. Lesson Plan
7. Exercise/Drill Design
8. Milestone / Assessment Design
9. Worked Examples & Common Mistakes
10. Consistency & Critique
11. Master Document

## Research subsystem (cross-cutting)

Applies to **both fiction and non-fiction**. Retrofitted to the novel harness in the same pass. In non-fiction it is core; in fiction it handles worldbuilding, period, profession research.

Not a stage — a subsystem that runs from Book DNA through drafting. Items accrete over time; both planning stages and drafting sessions read and write.

### Components

- **Capture** — notes, quotes, URLs, PDFs, transcripts, images.
- **Source metadata** — citation, date accessed, reliability tier (primary / peer-reviewed / secondary / anecdotal).
- **Tagging & linking** — bidirectional items ↔ chapters, scenes, principles, claims.
- **Verification state** — verified / pending / disputed / needs follow-up.
- **AI organisation** — clusters similar items, flags thin areas, suggests follow-up research.
- **Retrieval during drafting** — semantic search surfaces relevant items via AgentDB (same memory invocation as novel).
- **Compile integration** — bibliography, endnotes, fact-check report as compile artifacts.

### Storage

```
.storyline/
  research/
    items/          # one file per research item (markdown + frontmatter)
    sources/        # source metadata
    index.json      # structured index
    index.md        # human-readable mirror
  sourcing/         # Pipeline B only
    register.json
    register.md
```

### Code layout

```
lib/research/
  capture.js        # add/edit research items
  index.js          # index maintenance, embeddings
  linker.js         # item ↔ chapter/claim links
  retrieval.js      # semantic retrieval during drafting
  compile.js        # bibliography, endnotes, fact-check report
  critique.js       # gap analysis, reliability warnings
```

### Memory integration

Research items embed into the **same AgentDB namespace as the novel harness memory**. A research item is a memory record with `type: "research"` and typed metadata. No new memory infrastructure.

## Framework Card compile artifact

The named framework in Pipeline A (e.g. "4 Laws of Behavior Change") is extracted as a standalone one-page PDF/PNG alongside the master document. Usable as marketing asset, lead magnet, or speaking-slide template. Graceful skip if no framework exists.

## State schema

```
{
  "mode": "fiction" | "nonfiction",
  "pipeline": "novel" | "A" | "B" | "C",
  "subMode": "argument" | "braid" | "idea-led" | "event-led" | null,
  "bookDna": { /* 12 stages */ },
  "stages": { /* pipeline-specific */ },
  "research": {
    "indexPath": ".storyline/research/index.json",
    "itemCount": 0,
    "verificationStats": { "verified": 0, "pending": 0, "disputed": 0 }
  }
}
```

## File layout

```
lib/stages-nf/
  book-dna/         # 12 shared deep stages
  pipeline-a/       # prescriptive
  pipeline-b/       # narrative NF
  pipeline-c/       # how-to
lib/research/       # cross-cutting, used by both harnesses
lib/ai/
  narrative-voice-nf.js
  research-critique.js
```

## Command surface

- `/storyline-nf` — new command via skill system. Parallel to `/storyline`.
- `storyline-nf start | status | stages | generate` — parity with novel harness commands.
- `storyline research add | search | link | gaps` — research subsystem, shared by both harnesses.
- `storyline-nf compile --framework-card` — Framework Card extraction.

## Model routing

Reuses `lib/ai/model-router.js`. First-pass allocation:

- **Haiku:** Reader Avatar fields, Comps collection, Skill Decomposition lists, Scene List drafting.
- **Sonnet:** Framework Design, Thesis, Objection mapping, Chapter Planning, critique passes.
- **Opus:** Core Thesis pressure-testing, Consistency & Critique, cross-stage coherence.

## Milestones

Ten milestones, detailed in [docs/roadmap/](roadmap/):

1. Research subsystem (retrofit to novel harness)
2. State schema & command surface
3. Book DNA Phase 0 (all 12 stages)
4. Framework Card compile artifact
5. Pipeline A — Prescriptive
6. Pipeline B — Narrative Non-Fiction
7. Pipeline C — How-To / Skill Ladder
8. Cross-harness consistency & critique layer
9. Compile pipeline extensions
10. Polish, dogfooding, docs

### Dependency graph

```
M1 (Research) ──────────┬──> M5 (Pipeline A) ──┐
                        │                       │
M2 (Schema/Command) ────┤                       │
                        │                       │
M3 (Book DNA) ──────────┼──> M6 (Pipeline B) ──┼──> M8 (Critique) ──> M9 (Compile) ──> M10 (Polish)
                        │                       │
M4 (Framework Card) ────┤                       │
                        │                       │
                        └──> M7 (Pipeline C) ──┘
```

M1–M4 are ship-independent (M4 depends lightly on M3). M5–M7 are parallelisable after M1–M4 land. M8–M10 are sequential tail. M5 is the earliest point a writer can ship a non-fiction book.

### Sizing

| Milestone | Size |
|---|---|
| M1 Research | L |
| M2 Schema/Command | S |
| M3 Book DNA | L |
| M4 Framework Card | S |
| M5 Pipeline A | L |
| M6 Pipeline B | M |
| M7 Pipeline C | M |
| M8 Critique | M |
| M9 Compile | M |
| M10 Polish | M |

## Shared behaviours inherited from novel harness

- Conversational, not templated.
- AI critique after every stage with category-specific reasoning.
- Two-pass chapter outline — high-level approved first, then fleshed.
- Per-stage model routing.
- State in `.storyline/state.json` with a `pipeline` field at top.
- `output/master-document.md` generated at the end.
- Memory invoked identically to novel harness via AgentDB with HNSW search.

## Deliberately excluded

- Devotional / daily-meditation formats.
- Pure reference books (cookbook-as-index).
- Academic monographs and dissertations.
- Religious/spiritual argument (doctrinally sensitive, separate product).
- Prose generation — this harness plans; writers draft.
