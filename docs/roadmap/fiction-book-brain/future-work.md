# Future work — beyond FIC-PRE through FIC-D

*Created: 2026-04-28*

Items that came out of the original Codex review but are deliberately *not* scoped into FIC-PRE, FIC-A, FIC-B, FIC-C, or FIC-D. Listed here so they're not lost — and so they don't bloat milestones that are about to ship.

## Folded into existing milestones

- **Plan-vs-draft critique** → [Milestone 10 — Drafting Companion](../milestone-10-drafting-companion.md). The infrastructure for plan-vs-draft compare already exists (`extension/lib/manuscript/compare.js`, wired to a VS Code command). Surfacing it, augmenting it with `WritingPlan` view, and integrating it into the cockpit is M10's job. FIC-B and FIC-C feed M10 the data it needs (scene contracts, promise/payoff ledger).
- **Writing cockpit / side-panel chapter view** → also M10. The fiction milestone series produces the data; M10 is the visible cockpit surface.
- **Honest critique status UI** → handled by FIC-PRE for the chat panel; M10 absorbs the pattern for the cockpit.
- **Visual story bible** → folds into [NF-13 Figure Planning](../nf-writing-os/nf-13-figure-planning.md). Make `FigurePlanItem` mode-agnostic and let fiction consume it for cast sheets, setting boards, prop images. Don't build a parallel system.

## Genuinely future fiction milestones

These deserve their own milestones, not stories inside FIC-A through FIC-D.

### FIC-E — Genre engines (tiered)

The original Codex doc bundled six genres into one bullet (FIC-11.12). Each genre has its own beat vocabulary, its own promise types, its own failure modes, and its own test fixtures. Realistic structure:

- **FIC-E.1 — Romance, mystery, thriller** (tier-1 commercial genres). Each genre adds typed promise-payoff types (HEA tracking; clue/red-herring/fair-play; threat-escalation/false-victory) on top of FIC-C's generalised promise system, plus genre-specific story-trap detectors.
- **FIC-E.2 — Fantasy/SF, horror, literary** (tier-2). World-rule consistency, dread rhythm, thematic image systems.

Each tier is its own milestone with one story per genre. Do not start until FIC-C ships and we have a real fiction project planned through it to test against.

### FIC-F — Knowledge-state & timeline

"Track when events happen and who knows what by chapter" — Codex called this 3 days. It's a research project. A real state machine for who-knows-what across multi-POV mystery/thriller fiction is a multi-week milestone of its own. Defer until at least one mystery or thriller writer has used the FIC-A through FIC-E surface and articulated what they actually need.

Scope discipline when this lands: probably `knowledgeState[characterName]: { factsKnown[], factsBelieved[], factsWithheld[] }` keyed per chapter, with story-trap detectors for "character acts on a fact they couldn't know in this chapter." Don't try to solve the philosophical problem of fiction logic in code.

### FIC-G — Series bible

Series detection works today (`detectSeriesPotential`). Full series planning is genuinely useful for series fiction (a major commercial market) but presupposes single-book cockpit usage. Defer until single-book fiction projects ship through M10 and writers ask for series support.

When this lands: series-level promise tracking across books, recurring-cast continuity, world-rule continuity, book-to-book entry/exit state, series visual identity feeding into the figure registry.

### FIC-H — Manuscript-compare augmentation

`compareManuscriptToPlan` already runs. The next step is to augment its findings with the new `WritingPlan` view: "scene 3 of chapter 7 is in your plan with goal X but your draft of chapter 7 has no scene matching that goal." This needs FIC-B (scene contracts) to be live and probably FIC-C (promises) too.

Likely small — a focused milestone of a week or two — but only after M10 has integrated the existing compare output into the cockpit.

## Genuinely future, not yet a milestone

- **Real-time as-you-type critique.** Out of scope for the foreseeable future — too noisy, too expensive, and the manuscript-compare model (run on demand) is the right pattern.
- **Grammar / spelling / style checking.** Specialist tools (Grammarly, ProWritingAid) own this. Storyline integrates them at most.
- **Multi-author collaboration.** Single-writer model is current. Multi-writer is a different product.
- **Cloud sync / cross-device project state.** Out of scope long-term unless the desktop-only model proves limiting.
- **Scrivener / Word import.** Already exists as Milestone 09. Future enhancements to that milestone live in its own doc.
- **AI prose generation.** Not on any roadmap. The fiction harness is a planning and critique environment, not a ghostwriter.

## Speculative — flag for product, not engineering

- **"Fiction book brain" public framing.** The strategic thesis is real but it's a marketing position, not a milestone. Living vision lives in the original [milestone-11 stub](../milestone-11-fiction-book-brain.md) or `docs/roadmap.md`.
- **Comparison with established tools.** Scrivener, Plottr, Dabble, Campfire — what Storyline does differently is the plan/draft/critique loop with critique that knows the plan. That's a marketing message, not a milestone.

## When to promote items off this list

An item moves from `future-work.md` into a numbered fiction milestone when:

1. A real fiction writer has hit it as a blocker, OR
2. The existing fiction milestones (FIC-PRE through FIC-D) have shipped and the item is the next-most-valuable thing the writer would notice.

Until one of those is true, it stays here.
