# Milestone 11 — Fiction Book Brain

*Status: **SPLIT** into [fiction-book-brain/](fiction-book-brain/00-overview.md) (2026-04-28)*

The original monolithic M11 grew to 27 stories spanning critique wiring, normalization, scene contracts, promise/payoff ledgers, character arcs, story bibles, knowledge-state tracking, visual story bibles, series bibles, and genre engines. That's a programme, not a milestone — the same pattern that broke the original NF-11 monolith.

It has been split into a focused series under [`docs/roadmap/fiction-book-brain/`](fiction-book-brain/00-overview.md), anchored to a ground-truth [codebase audit](fiction-book-brain/00-fiction-audit-2026-04-28.md):

- **[FIC-PRE — Critique wiring fix](fiction-book-brain/fic-pre-critique-wiring.md)** — pre-milestone bug fix. `runCritique` is dead code; the "AI critique after every stage" promise is currently broken. Half a week.
- **[FIC-A — Fiction normalization & lib consolidation](fiction-book-brain/fic-a-normalization.md)** — typed `getWritingPlan(state)` for fiction, scene capture/render reconciliation, beat-ID drift fix, byte-identical lib duplicate removal.
- **[FIC-B — Scene contracts](fiction-book-brain/fic-b-scene-contracts.md)** — goal/obstacle/stakes/turn/value-shift on every scene. Foundation for plan-vs-draft critique.
- **[FIC-C — Promises, payoffs, threads](fiction-book-brain/fic-c-promises.md)** — refactor existing NF promise-payoff into a mode-agnostic detector; ledger; plot-thread upgrade.
- **[FIC-D — Story bible & arc matrix](fiction-book-brain/fic-d-story-bible.md)** — pure derivations from existing planning state. No new capture.

The original document's Phase E (cockpit / plan-vs-draft critique) folds into the existing [Milestone 10](milestone-10-drafting-companion.md) — `compareManuscriptToPlan` and `snapshotManuscript` already exist; M10's job is to surface them, not rebuild them. Phase F (visual story bible) folds into [NF-13](nf-writing-os/nf-13-figure-planning.md) by making `FigurePlanItem` mode-agnostic. Phase G (series bible), genre engines, and knowledge-state tracking are deferred to [future-work.md](fiction-book-brain/future-work.md).

Start with [Fiction Book Brain overview](fiction-book-brain/00-overview.md). Then read the audit before scoping any work — the original Codex review contained at least one fabricated example (the `beat05BreakIntoTwo.choice` claim) and missed substantial existing infrastructure (`extension/lib/ai/critique-api.js` already implements promise-payoff for NF; `extension/lib/manuscript/compare.js` already does plan-vs-draft).
