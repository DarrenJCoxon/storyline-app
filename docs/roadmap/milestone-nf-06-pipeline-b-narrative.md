# Milestone NF-06 — Pipeline B (Narrative Non-Fiction)

*Status: **DONE***
*Parent: [../storyline-nf-scope.md](../storyline-nf-scope.md)*
*Last updated: 2026-04-23*

## Outcome

A writer can plan a popular science, history, or true crime book end-to-end — Gladwell-style idea-led books and Larson-style event-led books alike — producing a master document, a structured timeline, cast dossiers, and a complete Sourcing Register. The Sourcing Register is a filtered view over the research subsystem from M1, not a separate store.

## Why this milestone exists

Unlocks ~2 of the top 10 commercial categories. Tests whether the research subsystem design holds under its hardest case — narrative non-fiction with heavy sourcing burden where every scene needs a citation.

## Prove-it gate

All three must be true:

1. **A narrative non-fiction book plans end-to-end.** All 12 Book DNA stages plus all 10 Pipeline B stages complete on a real book. Master document includes a readable timeline, cast dossiers, scene list, and sourcing register.
2. **Idea-led and event-led forks both work.** The Structural Fork at Stage 4 produces genuinely different chapter outlines — not the same outline with a label change.
3. **Sourcing Register is a view, not a duplicate.** Every sourced claim is a research item from M1 with `subtype: "sourced-claim"`. Editing a source in the register updates the research item; editing the research item updates the register. One data layer, two renderings.

## Stories

- **NF-6.1 — Structural Fork at Stage 4.** State: `subMode: "idea-led" | "event-led"`. Each drives different Stage 8 chapter-outline logic. *(Half day)*
- **NF-6.2 — Stage modules 1–3.** Central Question / Thesis, Cast of Real People, Timeline. Cast dossiers reuse Protagonist Deep Dive patterns from the novel harness. *(2–3 days)*
- **NF-6.3 — Timeline as structured artifact.** `.storyline/timeline.json` with dates, events, people, locations. Queryable. Rendered as `.storyline/timeline.md`. *(1–2 days)*
- **NF-6.4 — Stage modules 4–5.** Structural Fork, Scene List. Scene list entries are research-linked (each scene references sources). *(2 days)*
- **NF-6.5 — Sourcing Register as research view.** `lib/stages-nf/pipeline-b/sourcing-register.js` — filters research items where `subtype === "sourced-claim"`, renders to `.storyline/sourcing/register.json` and `register.md`. No duplicate storage. *(1–2 days)*
- **NF-6.6 — Stage modules 7–8.** Thematic Through-Line, Chapter Outline. Chapter outline diverges based on Structural Fork sub-mode. *(2 days)*
- **NF-6.7 — Stage module 9.** Consistency & Critique — narrative non-fiction failure modes: factual gaps, unsourced scenes, weak momentum between chapters, thematic clarity drift. *(1–2 days)*
- **NF-6.8 — Stage module 10.** Master Document generation. Narrative non-fiction template including timeline visual (linked to NF-09), cast dossiers, sourcing register summary. *(1 day)*
- **NF-6.9 — AI critique tuning.** Extend `lib/ai/narrative-voice-nf.js` with narrative-non-fiction voice. *(1 day)*
- **NF-6.10 — Stage guides.** Conversational prompts for all 10 stages in `lib/ai/stage-guides-nf-pipeline-b.js`. *(2 days)*
- **NF-6.11 — Dogfood end-to-end.** Plan a real narrative non-fiction book (history or true crime). Log friction. *(2–3 days)*
- **NF-6.12 — Triage and fix friction.** *(Variable)*
- **NF-6.13 — Gate check.** Apply the three prove-it criteria. Close milestone. *(Half day)*

## Risks

- **Sourcing register UX.** Writers may want to see the register as a primary artifact and not realise it's a research view — that's fine, but edits must round-trip. Mitigation: explicit test in NF-6.5 that both write paths converge.
- **Timeline rendering cost.** Rich visual timeline in master document may delay compile. Mitigation: timeline renders to static markdown table by default; richer visual is optional NF-09 work.
- **Fact-check burden.** The harness cannot verify facts — it can only flag unsourced or thin-source claims. Mitigation: critique makes this explicit; the writer is the fact-checker.

## Out of scope for this milestone

- Cross-harness critique — NF-08.
- Bibliography / endnote / fact-check report compile outputs — NF-09.
- Rich visual timeline rendering — NF-09.
- Pipeline A and C — separate milestones.
