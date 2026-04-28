# NF-13 — Figure & visual planning (with generation)

*Status: **PROPOSED***
*Parent: [00-overview.md](00-overview.md)*
*Depends on: [NF-11](nf-11-planning-to-writing.md)*
*Created: 2026-04-28 · Updated: 2026-04-28 (image generation folded in)*

## Outcome

A non-fiction project with figures (diagrams, charts, tables, worked examples, illustrations, timelines, maps) has a tracked figure registry on disk and a writer-triggered generation workflow that turns registry rows into actual image files using the existing image-2 integration.

The writer plans figures during chapter-planning, opens the IllustrationsPanel, generates images one at a time against the registry's prompt brief and factual constraints, reviews each result, iterates the prompt until the figure is right, and accepts. Manuscript `{{figure: <id>}}` markers resolve to the produced images at draft time.

## Why this milestone exists

How-to books, prescriptive frameworks, and academic books often depend on visual explanation as much as prose. A book that promises "a diagram of the framework" and ships without one is a worse book; a book that ships with a misleading diagram is worse still.

Storyline already has image-2 generation working through the IllustrationsPanel. NF-13 turns that capability into a planning-driven workflow: figures are specified during chapter-planning, generated against those specs, reviewed and iterated by the writer, and surfaced inline in the manuscript. The writer does not have to invent prompts at draft time — the planning stage has already captured purpose, constraints, caption, and alt text.

This is the difference between Storyline and every other non-fiction tool on the market: figures are planned, generated, and verified inside the same environment, against the book's own factual context.

## Prove-it gate

Six criteria. All must be true.

1. **Registry generates.** A project with figures declared in any chapter plan produces `output/figure-registry.md` with one row per figure.
2. **Manuscript markers.** Each chapter's manuscript scaffold contains `{{figure: <id>}}` markers at the relevant section, resolvable to the registry entry.
3. **Generation works end-to-end.** Writer opens the IllustrationsPanel, sees registry rows, clicks "Generate" on a row, and an image-2 call produces `assets/figures/<figure-id>.png`. Registry status updates from `planned` to `produced`.
4. **Iteration works.** Writer can edit the prompt brief on a generated row and regenerate. Previous versions are kept (not silently overwritten) so the writer can compare.
5. **`FigurePlanItem` is mode-agnostic.** The model has no NF-only fields (e.g. no required `linkedPrinciple`). Fiction projects can produce figures (cast sheets, setting boards, prop images, chapter openers) through the same registry. Pipeline-specific fields are optional. This commitment is what lets fiction's [FIC-D Story Bible](../fiction-book-brain/fic-d-story-bible.md) and future fiction visual work consume the same shape rather than building a parallel system.
6. **Tests pass.** NF-13.7 covers registry generation, prompt synthesis, marker resolution, status transitions, and mode-agnostic shape (a fiction-shaped fixture renders without NF-only required fields).

## Stories

Six stories. NF-13.1 through NF-13.4 are planning-side; NF-13.5 and NF-13.6 are generation-side.

### Planning side

- **NF-13.1 — `FigurePlanItem` model.** Extend `WritingPlan` with `figures[]`. Fields:
  - `id`, `type`, `chapter`, `section`, `purpose`, `factualConstraints`, `caption`, `altText`, `sourceRights`
  - `imagePrompt` — a **structured prompt** designed for image-2's strengths, not a freeform brief. Sub-fields:
    - `subject` — what the figure depicts in one sentence
    - `composition` — layout / framing / orientation (e.g. "horizontal flow chart, left-to-right, 5 boxes")
    - `style` — visual style (e.g. "clean vector-style infographic, flat colours, sans-serif")
    - `textElements[]` — **explicit list of text strings that must appear in the image**, with placement (e.g. `{ text: "Step 1: Define", position: "top-left box" }`). This is image-2's killer feature — accurate rendered text — and the prompt model must exploit it.
    - `colourPalette` — hex codes or palette name (e.g. "navy + gold accent, white background")
    - `negativeConstraints[]` — what to avoid (e.g. "no human figures, no photorealistic textures, no 3D depth")
    - `aspectRatio` — `square` / `landscape` / `portrait` / explicit ratio
  - `status`: `planned` / `generating` / `produced` / `accepted` / `rejected`
  - `producedAssetPath`, `promptHistory[]` (for iteration)

  The chapter-plan stage captures the high-level figure intent; **NF-13.4a (below) generates the structured `imagePrompt` from that intent using a focused prompt-writing pass.** *(1 day)*

- **NF-13.2 — Figure registry renderer.** `packages/core/src/output/figure-registry.ts`. Generates `output/figure-registry.md` grouped by chapter. Includes a "figures by type" summary table at the top and a status column that reflects whether each figure is planned / produced / accepted. *(1 day)*

- **NF-13.3 — Figure markers in manuscript scaffold.** Extend NF-11.6's seeding so chapters with declared figures emit `{{figure: <id>}}` markers at the relevant section. Markers reference the registry entry; if the figure has been accepted, the rich editor renders the produced image inline. *(1 day)*

- **NF-13.4 — Stage-guide hooks for figure capture.** Add minimal figure prompts to the chapter-plan stages (`pa-chapters`, `pb-chapters`, `pc-lessons`, and Academic chapter stages) — one optional field per chapter: "Any diagrams, charts, or visual examples needed?" Captured into the chapter plan as freeform writer intent. Optional, never required. *(half day)*

- **NF-13.4a — Image-2 prompt synthesizer.** New core function `synthesizeImagePrompt(figureIntent, chapterContext, bookContext): ImagePrompt`. Converts the writer's freeform figure intent + the chapter / book context (subject, audience, voice) into the structured `imagePrompt` shape from NF-13.1. Runs once per figure when the chapter-plan stage saves; output goes into the registry. Image-2-aware rules:
  - **Always populate `textElements[]`** when the figure has labels, steps, axis titles, or callouts — image-2 renders text well and accurate text is the strongest differentiator over older models.
  - **Default to flat / vector / infographic style** for diagrams unless the writer explicitly asks for photorealism.
  - **Always include a `negativeConstraints[]` list** — image-2's failure modes (extra fingers, garbled small text, drift from factual constraints) are predictable and pre-emptible.
  - **Pull palette from book DNA** (cover accent / brand colour from `pa-framework` or book-DNA voice-tone stage) so figures cohere across the book.

  This is NOT another LLM round-trip per figure during generation — it runs once at chapter-plan save and the output is editable by the writer in the registry. The writer can tune any prompt manually before clicking "Generate". *(2 days)*

### Generation side

- **NF-13.5 — Registry-driven figure generation.** Extend the existing IllustrationsPanel to read the figure registry from `getWritingPlan(state)`. List all `planned` and `rejected` rows. Each row exposes the structured `imagePrompt` fields as editable inputs (subject, composition, style, textElements list, palette, negative constraints, aspect ratio) — the writer can tune before generating. A "Generate" button serializes the structured prompt into image-2's input format and calls the existing image-2 integration. On success: save to `assets/figures/<figure-id>.png`, update `status` to `produced`, attach asset path. On failure: surface error inline, leave status as `planned`. **Writer-triggered only — never auto-generate on plan save. One figure per click.** *(2 days)*

- **NF-13.6 — Iteration and accept/reject workflow.** For `produced` figures: writer can (a) Accept (status → `accepted`, marker resolves to image in editor), (b) Regenerate (edit prompt brief inline, append previous prompt to `promptHistory`, generate again, save as `<figure-id>-v2.png` etc.), (c) Reject (status → `rejected`, asset path cleared but file kept on disk). Show a thumbnail strip of all versions so the writer can visually compare iterations. *(2 days)*

- **NF-13.7 — Tests.** New `tests/figure-registry.test.js` covering: (a) registry renders from a fixture with declared figures across all `type` values; (b) `synthesizeImagePrompt` produces a structured `imagePrompt` with `textElements[]` and `negativeConstraints[]` populated for a sample diagram intent; (c) figure markers in manuscript files resolve to registry entries; (d) status transitions (planned → produced → accepted) update the registry output; (e) `FigurePlanItem` is mode-agnostic — a fiction-shaped fixture (cast sheet, setting board) renders correctly with no NF-only required fields. Image-2 calls themselves are mocked — this milestone's tests cover the registry + prompt-synthesis logic, not the network round-trip. *(1 day)*

## Risks

- **Premature visual lock-in.** Writers don't always know their figures at planning time. Mitigation: figures are optional; the registry just shows what's been captured. Empty registries are fine.
- **Generation cost.** A 60-figure textbook generating on every save would hemorrhage credits. Mitigation: generation is **writer-triggered only**, one figure per click. No auto-generation on plan save. No bulk-generate-all button.
- **Prompt-iteration churn.** First-attempt image-2 outputs rarely land. Mitigation: the iteration workflow (NF-13.6) treats this as the norm — versioned outputs, prompt-history visibility, a thumbnail strip. The writer is expected to iterate.
- **Factual-constraint slippage.** image-2 may produce visually plausible but factually wrong diagrams (e.g. a process flow with the wrong number of steps). Mitigation: the registry's factual-constraints field is included in the generation prompt; the accept/reject flow puts the writer as the verifier; alt text written by the writer at planning time forces them to articulate what the figure must show.
- **Asset-path stability.** If figure IDs change, manuscript markers break. Mitigation: figure IDs are immutable once assigned; only prompt brief / type / caption / alt text are editable.
- **Rights / sourcing.** Generated images need rights/attribution metadata for compile time. Mitigation: the existing source/rights field stays mandatory; for image-2 outputs it's pre-filled with the model name and generation timestamp, editable by the writer.

## Out of scope

- Auto-generation on plan save. Always writer-triggered.
- Bulk "generate all" actions. One at a time, with review.
- Vector / SVG output. image-2 produces raster; sufficient for most book figures. Vector is a separate later milestone if needed.
- Inpainting / mask edits / region-specific regeneration. Whole-image regenerate only in this milestone.
- Multi-model fallback (e.g. trying a different model when image-2 fails). One model, well-integrated.
- Figure-to-syllabus linking — that's NF-14 territory.

## Closure

The book's visual contract is on disk, tracked, and **executable**. The writer plans figures in chapter-planning, generates them with one click, iterates until each is right, and accepts. The manuscript references the produced images directly. No external image tool. No prompt-engineering tax at draft time. No compile-time discovery that figures don't exist.

This is the point where Storyline stops being a planning environment that hands off to other tools and starts being the place a non-fiction book is actually built.
