# Milestone NF-03 — Book DNA Phase 0 (all 12 stages)

*Status: **DONE***
*Parent: [../storyline-nf-scope.md](../storyline-nf-scope.md)*
*Last updated: 2026-04-23*

## Outcome

A writer can complete all 12 Book DNA stages conversationally, end-to-end, with AI critique after each stage. The output is a `book-dna.md` and `book-dna.json` that every downstream pipeline can reference. Book DNA is the commercial moat — a writer finishing it has a concrete reader, a named promise, a positioning map, a subtitle, and a commercial model locked in, all before a single chapter is designed.

## Why this milestone exists

Book DNA is what makes this harness optimal rather than generic. The novel harness starts with Genre & Foundations and gets to protagonist fast; non-fiction needs more upfront market and reader work because the book's commercial fate is largely set by the reader/promise/positioning triangle. Twelve stages is deliberately deep — deeper than any non-fiction planning tool on the market.

## Prove-it gate

All three must be true:

1. **All 12 stages run end-to-end conversationally.** No templates. Questions adapt. AI critique after each stage flags real issues (thin reader avatar, framework overlapping with comps, subtitle that doesn't pay off the promise).
2. **The generated Book DNA document is useful.** Reading it, a stranger can say who the book is for, what it promises, what makes the author qualified, how it is different from its comps, and what commercial model it slots into — without reading anything else.
3. **It gates pipeline selection correctly.** Category chosen in Stage 1 routes the project to Pipeline A / B / C when pipeline stages land in NF-05/06/07. The routing is visible in state but not yet enforced.

## Stories

- **NF-3.1 — Stage guides for all 12 stages.** Conversational prompts in `lib/ai/stage-guides-nf-dna.js` mirroring the novel harness pattern. Question order, hints, validation messages per stage. *(2–3 days)*
- **NF-3.2 — Stage modules 1–4.** Category & Market Positioning, Reader Avatar, Reader Transformation, One Big Idea. One file each in `lib/stages-nf/book-dna/`. *(2 days)*
- **NF-3.3 — Stage modules 5–8.** Author Angle & Authority, Core Promise & Subtitle Engineering, Comps Deep Dive, Voice & Tone. *(2 days)*
- **NF-3.4 — Stage modules 9–12.** Evidence Philosophy, Commercial Model, Working Title Pressure-Test, Book DNA Consolidation. *(2 days)*
- **NF-3.5 — AI critique per stage.** `lib/ai/narrative-voice-nf.js` with category-specific critique (e.g. comps too distant, reader avatar too broad, subtitle keyword-stuffed). *(1–2 days)*
- **NF-3.6 — Model routing.** Update `lib/ai/model-router.js` with per-stage model choices. Haiku for listy/structured stages, Sonnet for framework/positioning, Opus for One Big Idea and Consolidation. *(Half day)*
- **NF-3.7 — Consolidation output.** Stage 12 renders `.storyline/book-dna.md` (human) and `.storyline/book-dna.json` (machine-readable, downstream reference). *(1 day)*
- **NF-3.8 — Category routing to pipeline.** Stage 1 sets `state.pipeline` based on category choice (Pipeline A for 5 prescriptive categories, B for narrative, C for how-to). Writer can override. *(Half day)*
- **NF-3.9 — Dogfood end-to-end.** Run all 12 stages on a real non-fiction book idea. Log friction. *(1–2 days)*
- **NF-3.10 — Triage and fix friction.** *(Variable)*
- **NF-3.11 — Gate check.** Apply the three prove-it criteria. Close milestone. *(Half day)*

## Risks

- **Stage fatigue.** Twelve deep stages before any pipeline content risks writers abandoning. Mitigation: AI critique at each stage must feel valuable in-the-moment, not like a gate — validated in dogfood (NF-3.9).
- **Comps Deep Dive scope creep.** "Review mining" could become a research project. Mitigation: scope it to 3–5 comps, structured prompts, time-boxed in the stage guide.
- **Category miscategorisation.** Writer picks wrong category in Stage 1 and hits a pipeline that doesn't fit. Mitigation: override available, and pipeline selection is re-confirmed at end of Stage 12.

## Out of scope for this milestone

- Pipeline-specific stages — land in NF-05/06/07.
- Framework Card artifact — lands in NF-04 (framework data lives in Pipeline A, but the compile target is standalone).
- Cross-stage coherence checks — land in NF-08.
