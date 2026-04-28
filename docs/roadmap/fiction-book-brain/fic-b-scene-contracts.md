# FIC-B — Scene contracts

*Status: **PROPOSED***
*Parent: [00-overview.md](00-overview.md)*
*Depends on: [FIC-A](fic-a-normalization.md) (the typed normalizer + reconciled shapes)*
*Anchored to: [00-fiction-audit-2026-04-28.md](00-fiction-audit-2026-04-28.md) §4*
*Created: 2026-04-28*

## Outcome

Every planned scene carries a contract rich enough to support plan-vs-draft critique: goal, obstacle, stakes, conflict source, value shift, story turn, beat function, character-arc function, plot-thread movement. The chapter card surfaces the contract; the manuscript scaffold seeds section headers from it; the writer knows what each scene must achieve before drafting.

## Why this milestone exists

The audit confirmed the scene model is thin (7 captured fields, 3 required) and inconsistent (master-doc renders columns the guide doesn't capture). The current shape is enough for a list of scenes; it's not enough to power critique that says anything beyond generic prose advice.

A scene contract isn't bureaucratic over-specification — it's the standard scene-craft vocabulary writers already use. Goal / obstacle / stakes / turn / value-shift maps directly to how scenes work as story units. Without them captured at planning time, plan-vs-draft critique can only compare summaries to summaries.

## Prove-it gate

Four criteria. All must be true.

1. **Scene contract schema lands.** A new fiction `chapterOutline` save captures the contract fields: goal, obstacle, stakes, conflictSource, valueShiftStart, valueShiftEnd, storyTurn, beatFunction, arcFunction, threadMovement, draftStatus.
2. **Chapter card surfaces the contract.** When `getWritingPlan(state)` returns a chapter with scene contracts, the rendered chapter card in `docs/chapters/<NN>-<slug>.md` shows each scene's goal / obstacle / stakes / turn block, not just a summary.
3. **Existing projects keep working.** A project with scenes captured under the old shape (no contract fields) renders correctly through the normalizer with sensible defaults. Migration does not break in-flight fiction projects.
4. **Tests pass.** FIC-B.6 covers old-shape, new-shape, mixed-shape, and migration-default cases. Tests run on a fixture set that includes a real-world fiction project state — that fixture's render output before and after the migration is documented in the test as the migration contract.

## Stories

Five stories.

- **FIC-B.1 — Scene contract schema in stage guide.** Update `chapterOutline` stage guide nested scene fields to capture: `goal` (required), `obstacle` (required), `stakes` (required), `conflictSource` (optional), `valueShiftStart` (optional one-word emotion), `valueShiftEnd` (optional one-word emotion), `storyTurn` (required — what reverses or shifts), `beatFunction` (optional — which Save the Cat beat this scene serves), `arcFunction` (optional — character-arc movement), `threadMovement` (optional — which plot threads progress), `draftStatus` (defaults to `not-started`). Keep existing fields (`pov`, `location`, `summary`, `conflict`, `whatChanges`, `notes`) as-is for backward compatibility. *(2 days)*

- **FIC-B.2 — Normalizer support for old + new scene shapes.** Update `getWritingPlan(state)` so the fiction `Scene` type carries the new contract fields, with sensible defaults for projects captured under the old shape. Document the migration: a scene without `goal`/`obstacle`/`stakes` renders as "(contract not captured)" in the card, prompting the writer to flesh it out without breaking the build. *(1 day)*

- **FIC-B.3 — Chapter card renderer upgrade.** Update `extension/src/editor/chapter-cards.ts` (and the eventual core port) to render scene contracts as a small structured block per scene: Goal / Obstacle / Stakes / Turn / Value shift inline, not just a summary line. Existing cards for projects without contract data still render — they just say "(contract not yet planned)". *(1–2 days)*

- **FIC-B.4 — Fiction manuscript scaffold seeds from contracts.** Today, fiction's `project-scaffold.ts` seeds a single `manuscript/chapter-01.md` and the writer hand-creates the rest. After FIC-B, fiction needs per-chapter manuscript seeding equivalent to NF-11.6: when `chapterOutline` saves and chapters with scenes exist, write `manuscript/<NN>-<slug>.md` per chapter (only if missing) with H1 chapter title, H2 per-scene blocks, and goal / obstacle / stakes / turn as italic guidance above each prose space. Same write-if-missing + content-fingerprint semantics as NF-11.6 — the existing `manuscript/chapter-01.md` is replaced only if its content fingerprint matches the unmodified `SEED_CHAPTER` constant. The seeding implementation should be a generic core function `seedManuscriptFromPlan(plan, projectDir)` that consumes `getWritingPlan(state)` and serves both modes — fiction's section structure here, NF's section structure for NF-11.6. *(2 days)*

- **FIC-B.5 — Scene contract validation in `runStoryTraps`.** Add deterministic checks: scene with no `storyTurn`, scene with `valueShiftStart === valueShiftEnd` (no value movement), scene with no `goal` linked to no `arcFunction` and no `threadMovement` (a scene that does nothing for any axis of the story). These surface as story-trap cards on save. *(1 day)*

- **FIC-B.6 — Tests.** New `tests/scene-contracts.test.js` covering: (a) old-shape fiction projects (7 scene fields) normalize through `getWritingPlan(state)` with sensible defaults — no break on existing fixtures from FIC-A.2; (b) new-shape projects with full contract fields render correctly through chapter cards; (c) mixed-shape projects (some scenes with contract fields, some without) render the captured fields and stub the missing ones with "(contract not yet planned)"; (d) FIC-B.5 story traps fire correctly: a fixture with a no-turn scene produces the expected trap card; a value-shift-equal-start-and-end scene produces the expected card; (e) manuscript scaffold seeded from a contract-bearing chapter contains the expected H2 sections with goal/obstacle/stakes/turn guidance — and is *not* regenerated when the writer has touched the file. *(1–2 days)*

## Implementation order

1. FIC-B.1 — schema first.
2. FIC-B.2 — normalizer + migration defaults.
3. FIC-B.3 — chapter card renderer.
4. FIC-B.4 — manuscript scaffold integration (depends on NF-11.6 manuscript seeding being live for fiction; coordinate sequencing).
5. FIC-B.5 — validation traps.

## Risks

- **Field fatigue.** 11 new fields per scene is a lot to ask. Mitigation: only `goal`, `obstacle`, `stakes`, and `storyTurn` are required. The rest are optional. The stage guide opener should explicitly say so.
- **Existing-project regression.** Mitigation: FIC-A.2 fixture set must grow to include a "real fiction project with old scene shape" fixture; FIC-B.2's defaults must keep that fixture rendering correctly through every renderer.
- **Critique noise.** Adding contract validation in story traps could flood low-quality scenes with warnings. Mitigation: traps fire as warnings, not errors; the writer can complete the stage with warnings present.
- **Scope creep into prose-craft theory.** "Value shift" and "story turn" are real terms (Robert McKee, Shawn Coyne) but easy to over-spec. Mitigation: keep field labels plain English; let the AI in conversation explain them when asked.

## Out of scope

- Genre-specific scene contracts (mystery clue placement, romance beat type, thriller pressure level). That's a future milestone.
- Plan-vs-draft critique consumption of scene contracts. That's Milestone 10's job — FIC-B *makes the contract available*; M10 *uses it for critique*.
- Multi-POV scene complexity (one scene with two POVs, etc.). The current `pov` field is single-string. Defer.

## Closure

Scenes become contracts. The writer knows what each scene must do before drafting it. Chapter cards become useful drafting references, not summary lists. The data foundation for plan-vs-draft critique exists. Milestone 10 can now build a cockpit that says "this scene's planned turn is X but the draft never reaches it."
