# Milestone NF-08 — Cross-harness consistency & critique layer

*Status: **DONE***
*Parent: [../storyline-nf-scope.md](../storyline-nf-scope.md)*
*Last updated: 2026-04-23*

## Outcome

A unified critique API sits above per-pipeline critique, adding meta-critique that looks across the whole book. It catches drift that no single stage could catch: Book DNA promises that no chapter delivers, reader avatar drift mid-manuscript, Evidence Philosophy mismatches with Evidence Map, subtitle-to-closer mismatches, comp-adjacency collapse. One command, `storyline-nf critique`, produces a full-book audit report that runs automatically at master document generation.

## Why this milestone exists

Every pipeline ships with its own local critique. But the biggest quality issues in non-fiction are cross-stage: a book that promises one thing and delivers another, a reader avatar that was crisp in Stage 2 and vague by Chapter 8, a framework that drifts from the thesis. Local critique cannot see these. A meta layer can.

## Prove-it gate

All three must be true:

1. **Cross-stage drift is detected.** On a seeded project with deliberate drift (Book DNA promise not delivered, avatar misaligned with chapter language), the critique layer flags the drift specifically — not generically.
2. **False positives are rare.** On a well-planned book, the critique does not flag spurious issues. A writer should trust the report, not filter it.
3. **It runs automatically at generate time.** `storyline-nf generate` includes the critique report as a section of the master document or as an adjacent artifact. No separate invocation needed.

## Stories

- **NF-8.1 — Unified critique API.** `lib/ai/critique-api.js` — a plugin shape that per-pipeline critique modules conform to. Returns structured findings (severity, location, suggestion). *(1 day)*
- **NF-8.2 — Retrofit existing pipeline critique.** Wrap Pipeline A/B/C Stage-10 critique into the new API without behavior change. *(1 day)*
- **NF-8.3 — DNA ↔ pipeline coherence check.** Each Book DNA stage has expected downstream signatures. Evidence Philosophy "science-led" expects Evidence Map weighted toward peer-reviewed. Promise must be delivered by a specific chapter. Commercial Model must match opener/closer choices. *(2 days)*
- **NF-8.4 — Reader avatar drift detection.** Compares language/tone/assumed-knowledge in Book DNA Stage 2 against chapter content. Flags chapters addressing a different reader. *(1–2 days)*
- **NF-8.5 — Promise-payoff audit.** Every promise in DNA Stage 6 is mapped to a specific chapter delivering it. Unmapped promises flagged. Over-promising flagged. *(1 day)*
- **NF-8.6 — Comp-adjacency check.** Runs Stage 7 (Comps Deep Dive) against the finished plan. Has the book drifted into being too similar to a comp? Too distant from all comps (market-nonexistent)? *(1 day)*
- **NF-8.7 — Research subsystem gap integration.** Pull in `lib/research/critique.js` output from M1. Unified report includes research gaps alongside coherence findings. *(Half day)*
- **NF-8.8 — `storyline-nf critique` command.** On-demand full audit. Output: markdown report at `output/critique-report.md`. *(1 day)*
- **NF-8.9 — Auto-run at generate.** `storyline-nf generate` invokes critique and includes summary in master document. Full report linked. *(Half day)*
- **NF-8.10 — Dogfood on completed Pipeline A/B/C books.** Run against books planned in NF-5/6/7 dogfood. Confirm drift detection and false-positive rate. *(1–2 days)*
- **NF-8.11 — Tune severity and phrasing.** Based on dogfood. *(1 day)*
- **NF-8.12 — Gate check.** Apply the three prove-it criteria. Close milestone. *(Half day)*

## Risks

- **Cost.** Cross-stage critique may require long-context calls to Opus. Mitigation: cache per-section embeddings, run incrementally on changed stages only.
- **False positives eroding trust.** If the report nags, writers ignore it. Mitigation: severity tiers, suppressible per-finding, tuned hard in NF-8.11.
- **Scope creep into Pipeline-specific issues.** Meta-critique should not duplicate local critique. Mitigation: the unified API deliberately separates cross-stage from in-stage findings.

## Out of scope for this milestone

- Compile-pipeline fact-check report (that is NF-09, and consumes research subsystem output directly).
- Real-time critique during drafting — future milestone.
- Critique of prose style in drafted chapters — this milestone only critiques the plan.
