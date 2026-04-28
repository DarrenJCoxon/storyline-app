# NF Writing OS — overview

*Created: 2026-04-28*

## Why this exists as a folder, not a milestone

The original `milestone-nf-11-planning-to-writing.md` grew from a planning-to-writing handoff into a 22-story programme spanning state contracts, claim ledgers, figure registries, academic categories, writing cockpits, and drafting companions. That is not one milestone. It is a product direction with several milestones inside it.

This folder splits the work into focused milestones that each:

- ship something a writer can feel,
- close in three weeks or less,
- have a prove-it gate of three or four criteria, not eight,
- and reference one shared model rather than reinventing it.

## The core moat (what we are actually building)

Most writing tools stop at outline generation. Storyline's non-fiction position is **evidence-aware, reader-outcome-aware, file-backed planning that flows directly into drafting** — not a better chat box, not a ghost writer.

Four commitments that hold across every milestone:

1. **Plan, scaffold, critique. Never generate prose.** The writer writes.
2. **Every artefact lives on disk.** Nothing the writer needs to draft should live only in `state.json` or `memory.jsonl`.
3. **One normalized writing model.** Every downstream surface (chapter cards, manuscript seed, master doc, research register, claim ledger, side panels, manuscript-to-plan diff) reads the same shape. No module branches on raw NF state.
4. **Tests ship with the code.** Every milestone with a normalizer, renderer, detector, or schema change ships fixture-backed tests in the same PR. Refactors that touch existing code (e.g. NF-11.0's state contract) must add regression tests against current behaviour *before* the refactor, so the refactor proves byte-identical output. The repo already has ~20 vitest files in [`tests/`](../../../tests/) with a `fixtures/` directory — extend that infrastructure, don't parallel-implement.

## Milestone series

Each milestone has its own doc in this folder.

| Milestone | Title | Status | Closes the writer's... |
|-----------|-------|--------|------------------------|
| **NF-11** | [Planning → writing handoff](nf-11-planning-to-writing.md) | PROPOSED | "I just finished planning, where is my book?" blocker. |
| **NF-12** | [Claim / evidence ledger](nf-12-claim-evidence-ledger.md) | PROPOSED | "Is this claim supported, and where?" question. |
| **NF-13** | [Figure & visual planning (with image-2 generation)](nf-13-figure-planning.md) | PROPOSED | "What diagrams and images does this book need — and can they be generated?" gap. |
| **NF-14** | [Academic category — Textbook / Revision Guide](nf-14-academic.md) | PROPOSED | "Storyline doesn't fit my book type" complaint. |

The existing fiction-led [milestone-10-drafting-companion.md](../milestone-10-drafting-companion.md) absorbs the NF-aware drafting cockpit work. We do not start a parallel cockpit milestone here.

## Order

Land NF-11 first. The other three milestones depend on its state contract and `getWritingPlan(state)` view. NF-12, NF-13, and NF-14 can then run in any order; NF-14 is the most self-contained.

## What this folder is not

- A vision doc. The strategic thesis lives in [storyline-nf-scope.md](../../storyline-nf-scope.md). Milestone docs reference it, not duplicate it.
- A grand-launch announcement. Closure criteria are about whether the writer can complete a book, not whether the marketing claim is defensible.
- A speculative roadmap. Anything not currently buildable from existing code + reasonable spec sits in [future-work.md](future-work.md), not numbered as a story.

## Cross-cutting model: `getWritingPlan(state)`

NF-11 introduces `packages/core/src/state/writing-plan.ts` exporting `getWritingPlan(state): WritingPlan`. Every later milestone consumes it. The exact shape evolves with each milestone — chapters and sections in NF-11; claims in NF-12; figures in NF-13; academic outcomes in NF-14 — but the rule holds: downstream code reads the plan, not raw state.

**The same function serves fiction.** [FIC-A](../fiction-book-brain/fic-a-normalization.md) extends `WritingPlan` with fiction-specific fields (`scenes`, `beats`, `protagonist`, `cast`, `relationships`, `plotThreads`, `bStory`). NF-11.1 must therefore design the type as mode-aware from day one (`mode: 'fiction' | 'nonfiction'`) rather than NF-shaped first and fiction-retrofitted later. If NF-11 lands before FIC-A, the NF-11 author should at minimum stub the fiction fields and link to FIC-A; if FIC-A is in flight at the same time, sequence NF-11.1 first as the foundation both series consume.

## Cross-folder relationships

This series and the [Fiction Book Brain](../fiction-book-brain/00-overview.md) series build the same product from two ends. The shared rules:

- **One normalizer.** `getWritingPlan(state)` is mode-aware. Both folders read through it.
- **One figure model.** `FigurePlanItem` (NF-13) is mode-agnostic. Fiction's cast / setting / prop visuals consume the same shape.
- **One promise-detection function.** Promise-payoff (FIC-C) and claim-evidence (NF-12) are conceptually distinct — narrative promises vs factual claims — but share the detector skeleton extracted in FIC-C.3 from existing `extension/lib/ai/critique-api.js`.
- **One critique-wiring path.** FIC-PRE wires fiction critique into the chat panel; the same fix lights up NF critique on the same code path. NF-11 should explicitly check NF critique flows after FIC-PRE lands.
- **One cockpit milestone.** Existing [Milestone 10](../milestone-10-drafting-companion.md) is where prose-vs-plan critique lives for both modes. Neither folder reinvents it.
