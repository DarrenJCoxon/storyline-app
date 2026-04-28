# Fiction Book Brain — overview

*Created: 2026-04-28*

## Why this exists as a folder, not a milestone

The original `milestone-11-fiction-book-brain.md` grew to 27 stories across 7 phases — a programme, not a milestone. This folder splits it into focused milestones that each:

- ship something a writer notices,
- close in three weeks or less,
- have a prove-it gate of three or four criteria, not nine,
- and reference one shared writing-plan model rather than reinventing it.

## Ground truth

Every milestone in this folder is anchored to the codebase audit at [00-fiction-audit-2026-04-28.md](00-fiction-audit-2026-04-28.md). Read that first. It corrects several inaccuracies in the original Codex review (notably the wrongly-cited `beat05BreakIntoTwo.choice` example) and surfaces eight findings that change the shape of the work — most importantly that **substantial promise-payoff and manuscript-compare infrastructure already exists** but is unwired or NF-only.

The series is therefore weighted toward refactor and integration, not greenfield invention. Where Codex assumed new builds, prior art exists in `extension/lib/ai/critique-api.js` (NF promise-payoff) and `extension/lib/manuscript/compare.js` (plan-vs-draft compare). Don't rebuild what's already there.

## The core moat (shared with NF Writing OS)

Storyline owns the loop between **plan / scaffold / draft / critique**. Four commitments hold across every fiction milestone:

1. **Plan, scaffold, critique. Never generate prose.** The writer writes.
2. **Every artefact lives on disk.** Nothing the writer needs to draft should live only in `state.json` or `memory.jsonl`.
3. **One normalized writing-plan model.** Fiction and non-fiction both consume `getWritingPlan(state)` — already specified in [NF-11](../nf-writing-os/nf-11-planning-to-writing.md). Fiction extends it; it does not parallel-implement.
4. **Tests ship with the code.** Every milestone with a normalizer, renderer, detector, or schema change ships fixture-backed tests in the same PR. Refactors of existing code (e.g. FIC-A's beat-ID drift fix, FIC-C.3's promise-payoff extraction) must add regression tests against current behaviour *before* the refactor, so the refactor proves byte-identical output for the unchanged path. Use the existing vitest infrastructure in [`tests/`](../../../tests/) with [`tests/fixtures/`](../../../tests/fixtures/) for state snapshots — don't parallel-implement.

## Milestone series

| Milestone | Title | Status | Closes the writer's... |
|-----------|-------|--------|------------------------|
| **FIC-PRE** | [Critique wiring fix (pre-milestone)](fic-pre-critique-wiring.md) | **DONE** (2026-04-28) | "AI critique after every stage" broken-promise bug. |
| **FIC-A** | [Fiction normalization & lib consolidation](fic-a-normalization.md) | **DONE** (2026-04-28; FIC-A.5 lib cleanup deferred) | Scene-shape inconsistency, beat-ID drift, three-lib mess. |
| **FIC-B** | [Scene contracts](fic-b-scene-contracts.md) | PROPOSED | Thin scene model that can't carry plan-vs-draft critique. |
| **FIC-C** | [Promises, payoffs, threads](fic-c-promises.md) | PROPOSED | "Did chapter 3's setup actually pay off?" question. |
| **FIC-D** | [Story bible & arc matrix](fic-d-story-bible.md) | PROPOSED | "Who knows what when?" continuity nightmare. |

Genre engines, knowledge-state tracking, series bibles, and visual story bibles are deliberately deferred to [future-work.md](future-work.md). Plan-vs-draft critique folds into the existing [Milestone 10 Drafting Companion](../milestone-10-drafting-companion.md), not a parallel implementation here.

## Order

1. **FIC-PRE** ships first as a bug fix, not a milestone. Restores the broken critique promise. Half a week.
2. **FIC-A** is the foundation. Every later milestone reads through `getWritingPlan(state)`.
3. FIC-B / FIC-C / FIC-D can sequence in that order, or B → C and D in parallel if appetite exists. D depends on C only for the plot-thread surface; arc matrix and story bible are otherwise independent.

## What this folder is not

- A vision doc. The strategic thesis lives in [../../roadmap.md](../../roadmap.md) and the original [milestone-11 stub](../milestone-11-fiction-book-brain.md).
- A repository for speculative scope. Anything not currently buildable from existing code + reasonable spec sits in [future-work.md](future-work.md).
- A parallel cockpit milestone. The writing cockpit is Milestone 10 territory; this folder feeds it.

## Cross-cutting model: `getWritingPlan(state)`

NF-11.1 introduces `packages/core/src/state/writing-plan.ts` exporting `getWritingPlan(state): WritingPlan`. Fiction milestones read and extend the same function. The `mode` field on `WritingPlan` determines which renderers consume which fields. Two parallel normalizers is the drift problem we're already solving — don't recreate it.

**Sequencing across folders.** NF-11.1 lands the function. FIC-A.1 extends it with fiction-specific fields. If both series are in flight, sequence NF-11.1 before FIC-A.1 — the type contract is harder to design retroactively than to extend. If FIC-A starts first (because critique wiring or scene-contracts urgency), the FIC-A author owns the initial mode-aware type and NF-11.1 picks up the NF fields.

## Cross-folder relationships

This series and the [NF Writing OS](../nf-writing-os/00-overview.md) series build the same product from two ends. The shared rules:

- **One normalizer.** `getWritingPlan(state)` is mode-aware. Both folders read through it.
- **One figure model.** `FigurePlanItem` (NF-13) is mode-agnostic. Fiction's cast / setting / prop visuals consume the same shape rather than building a parallel visual story bible.
- **One promise-detection function.** Fiction's narrative promises (FIC-C) and NF's factual claims (NF-12) are conceptually distinct — payoffs vs verification — but FIC-C.3 extracts the detection skeleton from existing `extension/lib/ai/critique-api.js` into one mode-agnostic core function that both ledgers consume.
- **One critique-wiring path.** FIC-PRE fixes the dead `runCritique` path in the chat panel. The same fix lights up NF critique on the same code path. After FIC-PRE lands, NF-11 should verify NF critique flows the same way.
- **One cockpit milestone.** Existing [Milestone 10](../milestone-10-drafting-companion.md) is where prose-vs-plan critique lives for both modes. Neither folder reinvents it.

**Two ledgers, one detector.** The fiction `output/promise-payoff-ledger.md` and the NF `output/claim-evidence-ledger.md` are intentionally separate files with separate vocabularies. A reader cares about both — "did chapter 7 pay off the clue from chapter 3" (fiction) and "is this statistic sourced" (NF) — but the questions don't merge. Fiction projects produce the promise ledger only; NF projects produce the claim ledger only. The shared layer is the detection skeleton, not the artefact.
