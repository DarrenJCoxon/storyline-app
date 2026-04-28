# NF-11 — Planning → writing handoff

*Status: **PROPOSED***
*Parent: [00-overview.md](00-overview.md) · [../../storyline-nf-scope.md](../../storyline-nf-scope.md)*
*Created: 2026-04-27 · Split: 2026-04-28*

## Outcome

By the end of any non-fiction planning run, the writer has a complete, file-backed scaffold sitting in their project:

- one manuscript file per chapter, pre-seeded with H2 section headers, section purpose notes, and `{{research: …}}` markers;
- one `docs/chapters/<NN>-<slug>.md` reference card per chapter;
- a non-fiction-aware `output/master-document.md`;
- an `output/research-todo.md` grouped by chapter and section;
- a chat-panel handoff card with an "Open chapter 1" action.

Nothing the writer needs to start drafting lives only in `state.json` or `memory.jsonl`. The chat panel never returns silence after the last master stage saves.

## Why this milestone exists

NF-01 through NF-10 produced a tool that captures planning answers. They do not produce a tool that hands the writer a drafting environment. After two hours of planning, the writer is dropped into an editor with one blank chapter file and zero scaffolding.

There are two fixable causes:

1. **State-contract drift.** CLI saves to `state.nfStages[stageId]`; extension saves to top-level keys; downstream code branches on whichever it sees. The same project can produce different artefacts depending on which path captured the data.
2. **Fiction-only output paths.** `writeAllChapterCards`, `writeStageDoc`, and `generateMasterDocument` all read fiction-shaped fields and skip non-fiction projects entirely.

NF-11 fixes both: a canonical state contract with a compatibility adapter, plus generalized output paths driven by one normalized writing-plan view.

## Prove-it gate

Four criteria. All must be true.

1. **State contract is stable.** A project planned through either the CLI or the extension produces the same normalized writing plan. Existing projects with top-level NF stage keys continue to work through the compatibility adapter. Tested against fixtures from both paths.
2. **End-of-planning artefact set.** A fresh Pipeline A project completed end-to-end produces, on disk: one manuscript file per chapter, one `docs/chapters/` card per chapter, `output/master-document.md`, and `output/research-todo.md`.
3. **No silent dead-ends.** After the last master stage saves, the chat panel renders a planning-complete card listing the artefacts and offering "Open chapter 1". If the writer types after handoff, a concise drafting-mode reminder is shown — not a silent null-stage return.
4. **Fiction unbroken.** All existing fiction flows continue to work: chapter cards, master doc, manuscript seeding, editor reroute, manuscript-to-plan compare.
5. **Type is fiction-extensible.** `WritingPlan` is declared with `mode: 'fiction' | 'nonfiction'` and stub fiction fields (or, if FIC-A.1 lands first, the full fiction shape). The type is *not* NF-shaped with fiction added later. This commitment is what stops the second normalizer drift problem before it starts.
6. **Tests pass.** NF-11.2 (normalizer parity across legacy + canonical state shapes, all three pipelines + fiction) and NF-11.9 (end-to-end output-pipeline integration with idempotent manuscript-seed regeneration) both pass on CI before the milestone closes.

Pipeline B and Pipeline C parity is required for the artefact set but is not separately gated — the normalizer is the abstraction that buys parity, so if A passes and the normalizer covers B/C, parity follows.

## Stories

Eight stories, ship together.

- **NF-11.0 — Canonical NF state contract.** Standardize persisted NF data under `state.nfStages[stageId]`. Update extension save handling so emitted NF patches are written into the canonical shape. Add a compatibility adapter that reads existing top-level stage keys for legacy projects. Tests for both CLI-created and extension-created states. *(1–2 days)*

- **NF-11.1 — `getWritingPlan(state)` normalizer.** Add `packages/core/src/state/writing-plan.ts`. Returns a uniform `WritingPlan` shape with `mode: 'fiction' | 'nonfiction'`, `pipeline`, `chapters[]`, and a flat `researchItems[]` list pulled from chapter `keyResearch` + the existing research subsystem. Branches on mode/pipeline once, internally — every downstream consumer reads the plan, not raw state. **Mode-aware type from day one**: include stub fiction fields (`scenes`, `beats`, `protagonist`, `cast`, `relationships`, `plotThreads`, `bStory`) so [FIC-A.1](../fiction-book-brain/fic-a-normalization.md) can populate them without retrofitting the type. The fiction branch can return empty arrays if FIC-A hasn't landed yet — but the *shape* must be there. *(1–2 days)*

- **NF-11.2 — Normalizer fixtures and tests.** Fixture states for Pipeline A, Pipeline B, Pipeline C, and existing fiction in `tests/fixtures/writing-plan/`. Tests in `tests/writing-plan.test.js` prove all four produce a coherent writing plan with chapters, sections, and research items, and that no downstream code needs to switch on pipeline. **Critically**: legacy-shape fixtures (top-level `state['pa-chapters']` keys) and canonical-shape fixtures (`state.nfStages['pa-chapters']`) must produce byte-identical normalized output — this is the regression net for NF-11.0's compatibility adapter. *(1–2 days)*

- **NF-11.3 — Generalized chapter-card renderer.** Move `extension/src/editor/chapter-cards.ts` logic into `packages/core/src/output/chapter-cards.ts`. Render from `getWritingPlan(state)`. Fiction behaviour identical. NF cards include chapter mission, principle/question/objective, section list with section purpose, key research, and word target. *(2 days)*

- **NF-11.4 — NF stage-doc renderers.** Extend `packages/core/src/output/stage-doc.ts` with renderers for NF stages (DNA + Pipeline A/B/C). Generic `renderNfStageFromGuide` driven by each guide's `summary[]` field, with stage-specific overrides for chapter-plan / evidence-map / sourcing-register stages. Consolidate any existing `lib/output/nf-stage-doc.js` work rather than rebuild. *(1–2 days)*

- **NF-11.5 — NF master document generator.** Add `packages/core/src/output/nf-master-doc.ts` exporting `generateNfMasterDocument(state, projectPath)`. Output covers DNA (title/subtitle/category/audience/promise/transformation), author angle, voice/tone, evidence philosophy, commercial model, pipeline structure, chapter outline, research summary. Wire into `pa-master`/`pb-master`/`pc-master` saves. *(2 days)*

- **NF-11.6 — NF manuscript seeding.** Add `packages/core/src/editor/seed-manuscript.ts` exporting `seedManuscriptFromPlan(plan, projectDir)`. Triggered after the chapter-plan stage saves. For each chapter, write `manuscript/<NN>-<slug>.md` only if missing. Body for NF: H1 title, metadata quote block, H2 section headers with italic "Section purpose:" lines, `{{research: …}}` markers from `keyResearch`. Removes default `manuscript/chapter-01.md` only if its content fingerprint matches the unmodified `SEED_CHAPTER` constant. **Generic shape**: the function is mode-aware so [FIC-B.4](../fiction-book-brain/fic-b-scene-contracts.md) can extend it with fiction-specific section bodies (per-scene blocks with goal / obstacle / stakes / turn) without duplicating the file-walking + write-if-missing + fingerprint logic. *(2 days)*

- **NF-11.7 — Research-todo register.** Add `packages/core/src/output/research-todo.ts`. Generate `output/research-todo.md` from the writing plan, grouped by chapter and section, with status tags (pending / captured / verified). Loose research items appear in a clearly labelled tail section. Refreshed after chapter-plan and evidence stage saves. *(1–2 days)*

- **NF-11.8 — Planning-complete handoff card.** Extend `ChatPanel.ts` and the webview with a `planningComplete` message type and `PlanningCompleteCard` component. Card lists generated artefacts and offers actions: open chapter 1 (primary), open master doc, open research todo. If the writer types after handoff, post a one-line drafting-mode reminder. Remove the silent null-stage return in `handleUserMessage`. *(1–2 days)*

- **NF-11.9 — Output-pipeline integration tests.** New `tests/nf-output-pipeline.test.js` covering the end-to-end save flow: a Pipeline A fixture state is fed through `applyEmittedPatches`-equivalent logic, and the test asserts that all expected disk artefacts appear: chapter cards in `docs/chapters/`, manuscript files in `manuscript/`, master doc in `output/`, research-todo in `output/`, stage doc in `output/stages/`. Manuscript-seed regeneration is idempotent and writer-prose preservation is verified (a manuscript file with content NOT matching the seed fingerprint is never overwritten). Reuses fixtures from NF-11.2. *(1 day)*

## Implementation order

Land in order to keep intermediate states shippable:

1. NF-11.0 — state contract first, everything depends on it.
2. NF-11.1 / NF-11.2 — normalizer + fixtures, no behaviour change yet.
3. NF-11.3 — chapter cards via normalizer (fiction unchanged).
4. NF-11.4 — stage-doc renderers (pure addition).
5. NF-11.6 — manuscript seeding (visible writer benefit lands here).
6. NF-11.5 — NF master doc.
7. NF-11.7 — research-todo register.
8. NF-11.8 — handoff card (closes the gate).

## Risks

- **State-shape ambiguity between CLI and extension.** Mitigation: NF-11.0's adapter, fixture coverage for both paths.
- **Schema looseness in section arrays.** LLMs may save `sections` in shapes that drift from the guide. Mitigation: tolerant normalizer in NF-11.1 with sensible fallbacks (default section types, warning logs).
- **Manuscript overwrite.** Writers must not lose prose. Mitigation: write-if-missing plus content fingerprint check for the default seed.
- **Cross-pipeline branching explosion.** Mitigation: branching contained inside `getWritingPlan(state)`; downstream consumers see one shape.

## Out of scope (covered by other milestones)

- Claim / evidence ledger → [NF-12](nf-12-claim-evidence-ledger.md).
- Figure / visual planning → [NF-13](nf-13-figure-planning.md).
- Academic category (Textbook / Revision Guide) → [NF-14](nf-14-academic.md).
- Drafting companion / writing cockpit → existing [Milestone 10](../milestone-10-drafting-companion.md).
- AI prose generation. Storyline plans; the writer writes.
- Real-time web research or automatic citation fetching.

## Closure

With NF-11 closed, a writer who completes non-fiction planning lands in a fully scaffolded project: chapter files seeded with their plan, reference cards on disk, a master document they can show to an editor, and a research register listing what they still need to gather. The chat panel hands them off cleanly to chapter 1. Nothing the writer needs is hidden behind JSON.

This is the foundation. NF-12, NF-13, and NF-14 build evidence-awareness, visual planning, and academic category support on top of the same `getWritingPlan(state)` view.
