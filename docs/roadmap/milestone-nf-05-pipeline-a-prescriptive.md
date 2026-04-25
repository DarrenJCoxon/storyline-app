# Milestone NF-05 — Pipeline A (Prescriptive)

*Status: **DONE***
*Parent: [../storyline-nf-scope.md](../storyline-nf-scope.md)*
*Last updated: 2026-04-23*

## Outcome

A writer can plan a prescriptive non-fiction book — self-help, business, health, money, or relationships — end-to-end from `/storyline-nf start` through a complete master document plus a Framework Card. All 11 Pipeline A stages run conversationally, sub-mode fork (argument-driven vs personal-narrative braid) works, and the Evidence Map writes directly into the research subsystem from M1.

This is the earliest milestone where a real non-fiction book can be shipped using the harness. Pipeline A alone covers ~5 of the top 10 commercial categories.

## Why this milestone exists

Highest commercial payoff. If nothing else in the non-fiction roadmap landed, Pipeline A plus Book DNA plus research plus Framework Card would be a shippable product for more than half the addressable market.

## Prove-it gate

All three must be true:

1. **A prescriptive book plans end-to-end.** All 12 Book DNA stages plus all 11 Pipeline A stages complete on a real book, producing a master document that a writer could draft from without replanning anything structural.
2. **The Framework Card extracts correctly.** Stage 3 (Framework Design) produces a framework block that the NF-04 compile target renders into a genuinely shareable one-pager.
3. **Evidence Map is research-native.** Claims made in Stage 4 (Principles / Laws) are supported by research items captured in the M1 subsystem — not by a duplicate evidence store. Retrieval during drafting surfaces the right evidence for the right principle.

## Stories

- **NF-5.1 — Sub-mode fork at Stage 3.** UI routing and state: `subMode: "argument"` vs `"braid"`. Braid mode enables optional Stage 7 (Narrative Braid). *(Half day)*
- **NF-5.2 — Stage modules 1–3.** Core Thesis, Reader Objections, Framework Design. Framework Design writes the block that feeds NF-04. *(2 days)*
- **NF-5.3 — Stage modules 4–6.** Principles / Laws, Evidence Map, Application Layer. Evidence Map is a writer-facing wrapper over the research subsystem; creating an evidence entry creates a research item. *(2–3 days)*
- **NF-5.4 — Stage module 7 (optional).** Narrative Braid. Lightweight beat sheet for the personal-story threads. Conditional on sub-mode. *(1–2 days)*
- **NF-5.5 — Stage modules 8–9.** Chapter Plan, Opener & Closer Design. Opener chapter is reader-pain-made-vivid; closer is implementation/30-day plan. *(2 days)*
- **NF-5.6 — Stage module 10.** Consistency & Critique — prescriptive-specific failure modes: thesis drift across chapters, framework principles overlapping, evidence thin for specific principles, reader objections uncovered. *(1–2 days)*
- **NF-5.7 — Stage module 11.** Master Document generation. Prescriptive template. Includes framework block, principle/chapter map, evidence summary, opener/closer design. *(1 day)*
- **NF-5.8 — AI critique tuning.** Extend `lib/ai/narrative-voice-nf.js` with prescriptive-specific critique voice. *(1 day)*
- **NF-5.9 — Stage guides.** Conversational prompts for all 11 stages in `lib/ai/stage-guides-nf-pipeline-a.js`. *(2 days)*
- **NF-5.10 — Dogfood end-to-end.** Plan a real self-help or business book. Log friction. *(2–3 days)*
- **NF-5.11 — Triage and fix friction.** *(Variable)*
- **NF-5.12 — Gate check.** Apply the three prove-it criteria. Close milestone. *(Half day)*

## Risks

- **Framework quality.** A weak framework (overlapping principles, too many, too few) poisons the whole book. Mitigation: strong Stage 3 critique, framework pressure-test against comps.
- **Evidence Map duplication.** Writers may try to record evidence inline in the stage rather than using the research subsystem. Mitigation: the stage UI routes every evidence capture through `research.add` so there is no inline path.
- **Sub-mode decision creep.** Writers may flip between argument and braid sub-modes. Mitigation: commit point at Stage 3, reversible but requires explicit override.

## Out of scope for this milestone

- Cross-harness critique (e.g. DNA ↔ pipeline coherence) — lands in NF-08.
- Bibliography / endnote compile outputs — land in NF-09.
- Pipeline B and C — separate milestones.
