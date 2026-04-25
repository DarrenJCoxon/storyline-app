# Milestone NF-07 — Pipeline C (How-To / Skill Ladder)

*Status: **DONE***
*Parent: [../storyline-nf-scope.md](../storyline-nf-scope.md)*
*Last updated: 2026-04-23*

## Outcome

A writer can plan a how-to / practical-skill book — cooking, coding, craft, language, negotiation-as-skill — end-to-end, producing a master document, a rendered skill tree, a prerequisite graph, and a chapter-by-chapter lesson plan with drills and assessments.

## Why this milestone exists

Narrowest of the three pipelines, smallest build. Finishes the three-pipeline set and covers ~1 of the top 10 commercial categories. The skill tree as a real data structure (not prose) is what differentiates this pipeline from Pipeline A's framework.

## Prove-it gate

All three must be true:

1. **A how-to book plans end-to-end.** All 12 Book DNA stages plus all 11 Pipeline C stages complete on a real book. Master document contains a visual skill tree, ordered lesson plan, drills per lesson, and milestone assessments.
2. **The skill tree validates.** The Prerequisite Graph at Stage 5 rejects cycles, flags orphan sub-skills, flags unreachable end-states. A genuinely malformed tree fails the stage.
3. **Exercises are concrete.** Drills designed at Stage 7 are specific enough that a reader could attempt them — not "practice writing functions" but "write a function that takes a list of integers and returns the sum without using reduce."

## Stories

- **NF-7.1 — Stage modules 1–3.** Target Skill, Reader Starting Level, End-State Competency. End-state is measurable where possible. *(1–2 days)*
- **NF-7.2 — Skill Tree data structure.** `.storyline/skill-tree.json` as a real DAG. Nodes: sub-skills. Edges: prerequisites. Rendered as `.storyline/skill-tree.md` (outline) and optionally as SVG (NF-09). *(1–2 days)*
- **NF-7.3 — Stage modules 4–5.** Skill Decomposition, Prerequisite Graph. Graph validation: cycles rejected, orphans flagged, unreachable end-states flagged. *(1–2 days)*
- **NF-7.4 — Stage module 6.** Lesson Plan — one lesson per sub-skill, scoped to a chapter. Ordering derived from prerequisite graph topological sort. *(1 day)*
- **NF-7.5 — Stage module 7.** Exercise / Drill Design — per lesson. Prompts writer for concrete drills, not abstract ones. Each drill has: setup, task, expected outcome, common mistakes. *(1–2 days)*
- **NF-7.6 — Stage module 8.** Milestone / Assessment Design — checkpoints across the skill tree where the reader self-assesses. Specific pass criteria. *(1 day)*
- **NF-7.7 — Stage module 9.** Worked Examples & Common Mistakes — canonical examples and anti-patterns per lesson. *(1 day)*
- **NF-7.8 — Stage module 10.** Consistency & Critique — how-to-specific failure modes: gaps in the skill tree, unclear prerequisites, weak drills, unmeasured end-state, lessons too long or too short. *(1–2 days)*
- **NF-7.9 — Stage module 11.** Master Document generation. How-to template: skill tree visual, lesson order, drill catalogue, milestone map. *(1 day)*
- **NF-7.10 — AI critique tuning.** Extend `lib/ai/narrative-voice-nf.js` with how-to voice — pedagogical clarity, drill specificity, prerequisite rigor. *(1 day)*
- **NF-7.11 — Stage guides.** Conversational prompts for all 11 stages in `lib/ai/stage-guides-nf-pipeline-c.js`. *(2 days)*
- **NF-7.12 — Dogfood end-to-end.** Plan a real how-to book. Log friction. *(2 days)*
- **NF-7.13 — Triage and fix friction.** *(Variable)*
- **NF-7.14 — Gate check.** Apply the three prove-it criteria. Close milestone. *(Half day)*

## Risks

- **Skill tree drift.** Writer changes decomposition late and the prerequisite graph becomes stale. Mitigation: graph revalidates on every edit, stages downstream of 5 re-prompt if the tree changes materially.
- **Drill abstractness.** AI critique must push hard for concreteness or writers will default to vague drills. Mitigation: critique has explicit "drill specificity" check.
- **Overlap with Pipeline A.** Negotiation, communication, and similar skills straddle how-to and prescriptive. Mitigation: Book DNA Stage 1 category routing plus override at end of Book DNA decides.

## Out of scope for this milestone

- Visual skill-tree rendering (SVG in master doc) — NF-09.
- Cross-harness critique — NF-08.
- Interactive / web-native exercise formats — future product.
- Pipeline A and B — separate milestones.
