# Milestone NF-04 — Framework Card compile artifact

*Status: **DONE***
*Parent: [../storyline-nf-scope.md](../storyline-nf-scope.md)*
*Last updated: 2026-04-23*

## Outcome

The compile pipeline can extract a framework — the named model inside a Pipeline A prescriptive book (e.g. "4 Laws of Behavior Change") — and render it as a standalone one-page PDF and PNG. The artifact is shareable as a marketing asset, lead magnet, or speaking-slide template. It ships before Pipeline A lands, runs against a placeholder framework block, and gracefully skips when no framework is present (fiction, Pipeline B, Pipeline C).

## Why this milestone exists

Small, isolated, and it de-risks the compile pipeline change before Pipeline A starts producing real framework data. Shipping it early also gives Pipeline A (NF-05) a clear rendering target to plan its framework data shape against.

## Prove-it gate

All three must be true:

1. **Given a framework block, the compile pipeline outputs a shareable one-pager.** PDF and PNG both produced, both legible, both visually clean.
2. **The artifact is skipped cleanly when no framework is present.** Fiction projects, Pipeline B projects, and Pipeline C projects do not produce an empty or broken framework card — they produce nothing.
3. **The framework card is the book's framework.** Not a generic brand asset. Title, subtitle, named model, numbered principles, author byline. A reader who has never seen the book can identify it from the card alone.

## Stories

- **NF-4.1 — Framework block schema.** JSON shape: `title`, `subtitle`, `modelName`, `principles: [...]`, `author`, `coverAccent` (color hint). Lives in state at `state.stages.pipelineA.framework` for Pipeline A; placeholder path for this milestone. *(Half day)*
- **NF-4.2 — Rendering template.** One-page template (probably HTML/CSS → PDF via the existing compile toolchain, or Typst if already in use). Layout: title block, named model banner, principles as list or 2×2 grid depending on count, author byline. *(1–2 days)*
- **NF-4.3 — Compile target wiring.** Extend the compile pipeline with a `framework-card` target. Outputs to `output/framework-card.pdf` and `output/framework-card.png`. *(1 day)*
- **NF-4.4 — CLI flag.** `storyline-nf compile --framework-card` (and include it by default when a framework block is present). *(Half day)*
- **NF-4.5 — Graceful skip logic.** Detect framework presence; skip target silently when absent. Log a single-line info message. *(Half day)*
- **NF-4.6 — Placeholder framework data.** For testing before Pipeline A lands, seed a hand-authored framework block into a test state. Confirm rendering. *(Half day)*
- **NF-4.7 — Visual polish pass.** Typography, spacing, contrast. The card must look professional enough to actually use as a marketing asset. *(1 day)*
- **NF-4.8 — Gate check.** Apply the three prove-it criteria. Close milestone. *(Half day)*

## Risks

- **Renderer choice lock-in.** Whichever rendering toolchain is chosen here will be reused for M9 compile extensions. Mitigation: confirm compatibility with planned M9 outputs (timelines, skill trees) before committing.
- **Template rigidity.** A single template for all frameworks may not fit every framework shape (3 principles vs 12 laws). Mitigation: conditional layouts based on principle count.

## Out of scope for this milestone

- Framework content itself — lives in Pipeline A (NF-05).
- Other marketing artifacts (subtitle A/B, reader avatar card) — future milestone.
- Animated/video versions of the card.
