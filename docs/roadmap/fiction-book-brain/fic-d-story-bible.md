# FIC-D — Story bible & arc matrix

*Status: **PROPOSED***
*Parent: [00-overview.md](00-overview.md)*
*Depends on: [FIC-A](fic-a-normalization.md). Independent of FIC-B and FIC-C.*
*Anchored to: [00-fiction-audit-2026-04-28.md](00-fiction-audit-2026-04-28.md) §5*
*Created: 2026-04-28*

## Outcome

Two new derived artefacts ship for every fiction project:

- **`output/story-bible.md`** — cast, relationships, locations, recurring objects, and continuity facts as a single readable reference. Generated from existing planning state. Refreshed on every relevant save.
- **`output/character-arc-matrix.md`** — protagonist and major supporting characters laid out across chapters, showing each character's want / need / lie / wound / pressure scenes / midpoint shift / all-is-lost impact / finale choice / final state.

Both are pure derivations. No new schema, no new stages, no new data capture in this milestone — these milestones turn data the planning stages already capture into surfaces the writer can read.

## Why this milestone exists

The audit confirmed both artefacts are greenfield (no prior code). They are also low-risk because they consume existing fields. The leverage is high: every fiction writer benefits from a story bible they didn't have to build by hand.

Defer everything that requires *new* capture (timeline knowledge state, who-knows-what tracking, multi-POV consistency) to a future milestone. This one ships derivations only.

## Prove-it gate

Four criteria. All must be true.

1. **Story bible generates.** A fiction project with populated cast / relationships / locations (anywhere they exist in current state) produces `output/story-bible.md` in a readable, navigable format. No new state fields required.
2. **Arc matrix generates.** A fiction project with a populated beat sheet, protagonist arc, and at least one chapter-with-scenes produces `output/character-arc-matrix.md` showing the protagonist's movement across the book's chapters. Major supporting characters with their own arc fields appear too.
3. **Refresh discipline.** Both files are derived. Each file's header states "Auto-generated; edits will be overwritten." Both refresh after saves to relevant stages (cast / relationships / chapterOutline / beatSheet for story bible; protagonist / characters / chapterOutline for arc matrix).
4. **Tests pass.** FIC-D.6 covers both renderers against fixture states with various shapes (fully-planned, partly-planned, no-relationships, no-locations). Snapshot tests pin the output format; future renderer changes have to update the snapshot deliberately rather than drift silently.

## Stories

Five stories.

- **FIC-D.1 — Story-bible model in `WritingPlan`.** Extend `WritingPlan` with `storyBible: { cast: Character[], relationships: Relationship[], locations: Location[], recurringObjects: RecurringObject[], continuityFacts: ContinuityFact[] }`. The first three already exist in state in some form; locations and recurring objects derive from chapter-outline scene `location` fields and (optionally) writer-captured prop notes; continuity facts are initially empty (writer-captured later). *(1 day)*

- **FIC-D.2 — Story-bible renderer.** New `packages/core/src/output/story-bible.ts` exporting `generateStoryBible(state, projectPath)`. Output groups: Cast (one section per character with the inner-engine table — want / need / lie / wound / flaw / arc), Relationships, Locations (with chapters that use each location), Recurring Objects, Continuity Facts. Refreshed after saves to character / relationship / chapter-outline stages. *(2 days)*

- **FIC-D.3 — Arc-matrix model.** Extend `WritingPlan` with `arcMatrix: { characters: CharacterArcRow[] }`. Each row: characterName, role, want, need, lie, wound, chapterPresence (which chapters the character appears in, derived from scene-level POV/cast tracking), beatPressure (which beats apply pressure to this character's flaw, derived from beat-sheet entries), midpointShift, allIsLostImpact, finaleChoice, finalState. *(2 days)*

- **FIC-D.4 — Arc-matrix renderer.** New `packages/core/src/output/character-arc-matrix.ts` exporting `generateCharacterArcMatrix(state, projectPath)`. Output: a table-per-character with chapter columns showing presence and pressure beats; below each table, the want/need/lie/wound block; below that, the major-beat impact rows. Refreshed after saves to protagonist / characters / chapterOutline / beatSheet. *(2 days)*

- **FIC-D.5 — Wire artefacts into the planning-complete handoff card.** Extend [FIC-A.6](fic-a-normalization.md)'s fiction handoff card to include "Open story bible" and "Open arc matrix" actions alongside the existing "Open chapter 1" and "Open master doc." Card content updates dynamically based on which artefacts the project has produced — story bible only appears once cast/relationships are populated; arc matrix only appears once protagonist + a chapter outline exist. *(half day)*

- **FIC-D.6 — Tests.** New `tests/story-bible.test.js` and `tests/arc-matrix.test.js` covering: **Story bible** — (a) renders correctly from a fixture with cast + relationships + locations populated; (b) skips empty sections rather than printing "(none)" placeholders; (c) refresh on cast/relationships/chapter-outline saves produces the expected diff (auto-generated header, no merge of writer hand-edits); (d) location list correctly aggregates chapter-presence (chapter 3 uses "warehouse", chapter 7 uses "warehouse" → location "warehouse" lists chapters 3 and 7). **Arc matrix** — (a) protagonist row contains all required arc-stage fields (want/need/lie/wound, midpoint shift, all-is-lost impact, finale choice, final state) for a fully-planned fixture; (b) chapter-presence is correctly inferred from scene-level POV; (c) supporting characters with their own arc fields appear, characters without don't; (d) handoff card surfaces the artefact actions only once the underlying data is present. Reuses fixtures from FIC-A.2. *(1 day)*

## Implementation order

1. FIC-D.1 — story-bible model.
2. FIC-D.2 — story-bible renderer (visible artefact lands).
3. FIC-D.3 — arc-matrix model.
4. FIC-D.4 — arc-matrix renderer.
5. FIC-D.5 — handoff card wiring.

## Risks

- **Empty-section noise.** Projects without populated locations or recurring objects shouldn't have empty sections. Mitigation: renderer skips empty sections rather than printing "(none)" placeholders. Continuity facts may be empty in many projects — flag explicitly with "Continuity facts grow as you draft" rather than blank silence.
- **Arc-matrix density.** A 30-chapter book with 6 major characters produces a wide table. Mitigation: split tables per character, not one big grid. Each character gets a focused view.
- **Cast-presence detection accuracy.** Inferring which characters appear in which chapters requires reading scene-level POV and (ideally) named-character mentions. Mitigation: ship with POV-only detection in this milestone; cast-presence beyond POV is a future enhancement.
- **Stale-file risk.** If the writer hand-edits the story bible, those edits get lost on next regenerate. Mitigation: file header says "Auto-generated"; the generator does not merge hand edits. Writers who want their own bible should keep notes in `docs/notes/` instead.

## Out of scope

- Knowledge-state tracking (who knows what when). That's its own milestone — multi-POV mystery / thriller fiction needs a real state machine and is not a derivation. See [future-work.md](future-work.md).
- Timeline tracking (when events happen relative to each other). Same — needs new capture, not just rendering.
- Continuity-fact capture stage. The renderer surfaces facts if they exist; capturing them is a future milestone.
- Series bible. Series-level state across multiple books is a different scope.
- Visual story bible. Folds into NF-13's mode-agnostic figure registry; fiction's cast/setting visuals consume the same `FigurePlanItem` shape.

## Closure

Two new readable references appear in the writer's project: a story bible they can hand to their editor, and an arc matrix that shows whether their characters actually move across the book. Both come free from data the planning stages already capture. Writers gain visible value with zero new questions to answer.
