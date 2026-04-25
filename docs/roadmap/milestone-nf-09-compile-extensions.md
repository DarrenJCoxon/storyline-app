# Milestone NF-09 — Compile pipeline extensions

*Status: **DONE***
*Parent: [../storyline-nf-scope.md](../storyline-nf-scope.md)*
*Last updated: 2026-04-23*

## Outcome

The existing EPUB/PDF compile pipeline extends with non-fiction-specific outputs: bibliography, endnotes, fact-check report, visual skill tree (Pipeline C), visual timeline (Pipeline B), and objection index (Pipeline A). All generated from data the pipelines already produce — no new content capture required.

## Why this milestone exists

Non-fiction books ship with bibliographies and endnotes; that has been true since before publishing was digital. Pipeline B adds a sourcing register that has to become endnotes on compile. Pipeline C's skill tree is more useful as a visual than as a markdown outline. These are the last pieces between "the harness plans a non-fiction book" and "the harness ships a non-fiction book."

## Prove-it gate

All three must be true:

1. **A compiled non-fiction EPUB contains the right extras.** Bibliography rendered correctly, endnotes linked per chapter, fact-check report included as an appendix or adjacent artifact (configurable).
2. **Pipeline-specific visuals embed cleanly.** Skill tree (Pipeline C) and timeline (Pipeline B) render as embedded SVG/PNG in the master document and in compiled EPUB/PDF, not as broken images or walls of text.
3. **Nothing regresses for fiction.** Novel compile remains identical. Non-fiction-specific targets skip cleanly when no Book DNA / pipeline data is present.

## Stories

- **NF-9.1 — Bibliography generation.** `lib/research/compile.js` — reads research items, produces a citation-ready bibliography in a standard style (Chicago default, optionally APA/MLA). Configurable. *(1–2 days)*
- **NF-9.2 — Endnote rendering per chapter.** Each chapter pulls linked research items (via M1 linker) and renders endnotes inline or at chapter end. *(1–2 days)*
- **NF-9.3 — Fact-check report artifact.** Summary of research verification states — verified vs pending vs disputed counts, full list of unverified claims. Optional inclusion in compiled book; always produced as a separate artifact. *(1 day)*
- **NF-9.4 — Skill tree visual.** SVG rendering of `.storyline/skill-tree.json` as a DAG. Embedded in master document and compiled book. *(1–2 days)*
- **NF-9.5 — Timeline visual.** Rendering of `.storyline/timeline.json` as a horizontal timeline (or stacked for parallel-narrative event-led books). Embedded. *(1–2 days)*
- **NF-9.6 — Objection index (Pipeline A).** Appendix option listing reader objections (Stage 2) and the chapter that addresses each. *(1 day)*
- **NF-9.7 — Reader transformation summary.** Front matter option: before/after from Book DNA Stage 3 as a reader-facing one-paragraph promise. *(Half day)*
- **NF-9.8 — Framework Card cross-reference.** Compiled book references the Framework Card (NF-04) as a downloadable/companion asset when present. *(Half day)*
- **NF-9.9 — Compile target wiring.** Each new output is an opt-in-by-default target in the compile pipeline. Skip logic when data absent. *(1 day)*
- **NF-9.10 — Configuration.** `storyline-nf compile --citation-style=chicago|apa|mla`, `--include-fact-check`, `--include-objection-index`. Sensible defaults. *(Half day)*
- **NF-9.11 — Fiction regression test.** Compile an existing novel project. Confirm byte-identical (or near-identical) output to pre-milestone. *(Half day)*
- **NF-9.12 — Dogfood on completed books.** Compile the Pipeline A/B/C books planned in NF-5/6/7. *(1 day)*
- **NF-9.13 — Gate check.** Apply the three prove-it criteria. Close milestone. *(Half day)*

## Risks

- **Citation-style rendering complexity.** Chicago, APA, MLA each have edge cases. Mitigation: ship Chicago well, others as best-effort with documented limitations.
- **Visual rendering toolchain.** Skill tree and timeline rendering may need a dependency not yet in the project. Mitigation: evaluate in NF-04 (Framework Card) and commit then.
- **Fiction regression.** Changes to the compile pipeline could break novel output. Mitigation: NF-9.11 runs against a reference novel snapshot, fails the gate on any diff.

## Out of scope for this milestone

- Interactive / web-native versions of skill tree and timeline — future product.
- Custom citation styles beyond Chicago/APA/MLA.
- Index generation (book-end subject index) — deliberately deferred; available tooling is weak and this is post-MVP.
