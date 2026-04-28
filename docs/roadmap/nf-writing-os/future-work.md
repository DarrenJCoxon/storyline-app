# Future work — beyond NF-11 to NF-14

*Created: 2026-04-28*

Items that are good ideas but **not** scoped into the NF-11/12/13/14 milestone series. Listed here so they're not lost — and so they don't bloat the milestones that are about to ship.

## Folded into existing milestones

These were proposed in the original NF-11 monolith but belong to milestones that already exist:

- **Side-panel chapter card overlay / writing cockpit** → fold into [Milestone 10 — Drafting Companion](../milestone-10-drafting-companion.md). The fiction cockpit milestone already exists; expanding it to handle NF chapters via `getWritingPlan(state)` is the natural home.
- **Pipeline-specific drafting critique (per-section quality checks)** → also Milestone 10 territory. The drafting companion is where prose-vs-plan critique lives, not the planning OS.
- **Manuscript-to-plan diff (NF)** → extend the existing fiction `compareManuscriptToPlan` (in `extension/lib/manuscript/compare.js`) to read `getWritingPlan(state)`. A small, additive extension to existing infra rather than a new milestone story.

## Genuinely future

Worth doing, but not yet:

- ~~AI image generation against the figure registry.~~ **Folded into [NF-13](nf-13-figure-planning.md)** (2026-04-28). image-2 is already integrated and renders text reliably enough that prompt quality is now the bottleneck — so prompt synthesis (NF-13.4a) and writer-triggered generation (NF-13.5/.6) belong in the same milestone as figure planning, not a follow-up.
- **Reader-promise coverage map.** A report mapping the book's promise / transformation / objections / principles to chapter payoff, flagging promises with no chapter delivery. Genuinely valuable but adds another generated artefact on top of NF-11/12/13 — defer until those land and we see whether the master-doc + research-todo + claim-ledger trio is enough.
- **Real-time research fetching.** Web search integration for evidence capture. Significant infra cost, ongoing maintenance burden, and the existing manual-capture workflow is fine for the writers we're targeting. Revisit only if writer feedback proves it's a blocker.
- **Citation-style export.** APA / MLA / Chicago formatting from the claim ledger. One-day add when there's writer demand; not a milestone.
- **Fact-checking integrations.** Plagiarism / claim-verification tools. Out of scope long-term — Storyline is a planning environment, not a legal review tool.
- **Co-author / multi-writer support.** Single-writer is the current model. Multi-writer is a different product.
- **Spec-aware academic templates.** AQA / OCR / Edexcel / IB-specific syllabus parsing for Textbook / Revision Guide projects. Out of scope for NF-14; generic editable templates cover the highest-volume cases. Revisit if a writer asks.

## Speculative — flag for product, not engineering

- **"Storyline OS" public framing.** The strategic thesis ("non-fiction writing operating system") is real, but it's a marketing position, not a milestone. Living vision doc at [../../storyline-nf-scope.md](../../storyline-nf-scope.md) is the right place for it.
- **Writer telemetry beyond stage completion times.** Already partly covered by Milestone NF-10's opt-in telemetry. Revisit if patterns emerge from real-world usage.

## When to promote items off this list

An item moves from `future-work.md` into a numbered milestone when:

1. A real writer has hit it as a blocker, OR
2. The existing milestones have shipped and the item is the next-most-valuable thing the writer would notice.

Until one of those is true, it stays here.
