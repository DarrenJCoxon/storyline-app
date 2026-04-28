# FIC-A — Fiction normalization & lib consolidation

*Status: **DONE** (2026-04-28) — except FIC-A.5 (lib cleanup) deferred to a separate destructive-change PR.*
*Parent: [00-overview.md](00-overview.md)*
*Depends on: [FIC-PRE](fic-pre-critique-wiring.md). Coordinates with [NF-11](../nf-writing-os/nf-11-planning-to-writing.md).*
*Anchored to: [00-fiction-audit-2026-04-28.md](00-fiction-audit-2026-04-28.md) §2, §3, §4, §7*
*Created: 2026-04-28*
*Closed: 2026-04-28*

## What shipped

- **FIC-A.0**: Drift re-audit. Verified ground-truth findings D1–D4 documented in the audit file's appended "Drift findings" section. Codex's `beat05BreakIntoTwo.choice` example proven false; D2 (plot-thread `t.type` vs `t.threadType`) added to the fix list.
- **FIC-A.1**: [`packages/core/src/state/writing-plan.ts`](../../../packages/core/src/state/writing-plan.ts) ships `getWritingPlan(state)`. Mode-aware from day one. Designed against fiction's harder shape so NF-11.1 fits as the simpler branch. Drift-aware: D2 normalized at read time, D3 fields included as optional, FIC-B scene-contract slots reserved.
- **FIC-A.2**: 6 fixtures + 39 tests in [`tests/writing-plan.test.js`](../../../tests/writing-plan.test.js). Critical regression net: `nf-pipeline-a-canonical.json` and `nf-pipeline-a-legacy.json` produce byte-identical normalized output (asserted via `JSON.stringify` equality). Schema-coverage tests added for the FIC-A.3 reconciliation.
- **FIC-A.3**: `chapterOutline` stage guide expanded to capture `timeOfDay`, `purpose`, `beats`, `estimatedWords` — reconciles with what renderers display. No required-field changes (no migration risk).
- **FIC-A.4**: D1 + D2 drift fixed across three BEAT_NAMES tables and two master-doc renderers. New [`tests/fiction-drift.test.js`](../../../tests/fiction-drift.test.js) — 8 regression-net tests that fail loudly if any beat is renamed in the schema without updating renderer tables, or if any renderer reverts to `t.type`-only reads.
- **FIC-A.6**: Planning-complete handoff card replaces three silent dead-ends in ChatPanel. New [`extension/src/conversation/planning-complete.ts`](../../../extension/src/conversation/planning-complete.ts) helper, new `PlanningCompleteCard` component, full webview wiring including `Open chapter 1` action.

**Deferred**:
- **FIC-A.5**: Delete `extension/lib/output/*.js` byte-duplicates. Audit confirmed they have zero consumers in extension src. Deferred to a separate destructive-change PR — the duplicates are dead weight, not broken weight, and rm operations need explicit approval.

All 822 root tests + 46 extension tests pass.

---

(Original spec preserved below for reference.)


## Outcome

Fiction code reads from one normalized writing-plan view. Capture and render shapes for chapters and scenes are consistent. Beat-ID drift in chapter-card renderers is fixed. The byte-identical lib duplicates are removed.

This is the foundation milestone. Every later fiction milestone consumes `getWritingPlan(state)` rather than poking at raw `state.json`.

## Why this milestone exists

The audit found three separate consistency problems that compound:

1. **Capture/render schema drift** — the chapter-outline stage guide captures 7 scene fields; the master-doc renderer expects 10. Renderers display columns the stage doesn't capture.
2. **Beat-ID drift** — chapter-card renderers use `beat11DarkNightOfTheSoul` and `beat12BreakIntoThree` while the schema uses `beat11BlackMoment` and `beat12Beat13`. Chapter cards display raw IDs in those positions.
3. **Lib duplication** — `lib/output/chapter-doc.js` and `extension/lib/output/chapter-doc.js` are byte-identical. Three separate output renderer locations for chapters, master doc, and stage doc; only one is canonical per consumer.

Solving all three with one pass via the normalizer is cheaper and safer than three independent fixes that risk landing inconsistently.

## Prove-it gate

Five criteria. All must be true.

1. **One normalizer.** `getWritingPlan(state)` returns a `WritingPlan` whose `mode === 'fiction'` branch produces typed `Chapter[]`, `Scene[]`, `PlotThread[]`, `Relationship[]`, `Character[]`, `Beat[]`. NF projects continue to work through the same function.
2. **Capture/render shapes match.** The chapterOutline stage guide and the master-doc renderer reference the same scene fields. Either the guide captures everything the renderer needs, or the renderer drops the missing columns. No silent column-mismatch.
3. **Beat-ID drift fixed.** Chapter cards display friendly names for all 15 canonical beat IDs. No raw `beat11BlackMoment` strings appear anywhere user-facing.
4. **Single canonical output renderer per artefact.** Root `/lib/output/master-doc.js`, `/lib/output/stage-doc.js`, and `/lib/output/chapter-doc.js` are the canonical sources OR ported to `packages/core/src/output/` with parity. Byte-duplicates in `extension/lib/output/` are deleted. The CLI (`bin/storyline.js`) and the extension chat panel both use the same renderer for each artefact.
5. **No silent dead-end.** When fiction planning completes (last `masterDoc` save), the chat panel posts a planning-complete handoff card. The writer is never returned to silence. Same shape as NF-11.8 for non-fiction.
6. **Tests pass.** FIC-A.2 (fixture-backed parity tests, including a real-world fiction project state captured before the migration) passes on CI. The fixture set is the regression net for every later fiction milestone.

## Stories

Six stories.

- **FIC-A.0 — Re-audit drift.** Before fixing anything, walk the codebase fresh and produce a complete drift list — beat IDs, scene fields, chapter fields, plot-thread fields, relationship fields. Update [00-fiction-audit-2026-04-28.md](00-fiction-audit-2026-04-28.md) with a new section listing every actual drift found. Do not trust the original Codex review's specific examples. *(1 day)*

- **FIC-A.1 — Fiction-aware `getWritingPlan(state)`.** Extend the NF-11.1 `WritingPlan` type with fiction-specific fields: `chapters` (typed `Chapter[]` with `Scene[]`), `beats` (typed `Beat[]` with all canonical IDs), `protagonist`, `cast`, `relationships`, `plotThreads`, `bStory`. The fiction branch reads `state.chapterOutline`, `state.beatSheet.beats`, etc., into the typed shape. Tolerant to partially planned projects; strict types so missing fields fail loudly in TS. *(2 days)*

- **FIC-A.2 — Fixture-backed parity tests.** Add fiction fixture states (a partly-planned project, a fully-planned project, a project with the drifted beat IDs). Tests prove that chapter cards, master doc, stage docs, and story traps all read the same shapes through the normalizer. Tests fail loudly if anyone introduces new drift. *(1 day)*

- **FIC-A.3 — Reconcile scene capture/render shapes.** Pick one canonical scene shape. Update either `stage-guides.ts` to capture the missing fields (`timeOfDay`, `purpose`, `beats`) or update `master-doc.ts` to drop columns the stage doesn't capture. Document the choice. Ensure stage-doc, master-doc, and chapter-cards all read the same shape. *(1 day)*

- **FIC-A.4 — Fix verified drift in renderers (D1 + D2).** Per the FIC-A.0 audit findings:
  - **D1 (beat IDs)**: update `BEAT_NAMES` tables in `extension/src/editor/chapter-cards.ts:16-17`, `extension/lib/output/chapter-doc.js:25-26`, and `lib/output/chapter-doc.js:25-26` to canonical schema IDs (`beat11BlackMoment`, `beat12Beat13` instead of the drifted `beat11DarkNightOfTheSoul`, `beat12BreakIntoThree`).
  - **D2 (plot-thread type)**: update `packages/core/src/output/master-doc.ts:283` and `lib/output/master-doc.js:243` to defensive read (`t.threadType || t.type || '-'`) — currently they read `t.type` which is undefined since the captured field is `threadType`.
  - **Tests**: add `tests/fiction-drift.test.js` with two cases: (a) BEAT_NAMES tables in all three locations cover every key from `DEFAULT_STATE.beatSheet.beats`; (b) master-doc renderer produces a non-`undefined` plot-thread type column when fed a fixture state captured under the canonical `threadType` shape. *(1 day)*

- **FIC-A.5 — Lib consolidation.** Delete `extension/lib/output/chapter-doc.js`, `extension/lib/output/master-doc.js`, `extension/lib/output/stage-doc.js` after confirming via grep that nothing in the bundled extension imports them. The extension chat panel already uses `extension/src/editor/chapter-cards.ts` and `packages/core/src/output/*.ts`. The CLI continues to use root `/lib/output/*.js`. Document the canonical-source-per-artefact mapping in a top-level `docs/architecture/output-renderers.md` so future drift has a name. *(1 day)*

- **FIC-A.6 — Fiction planning-complete handoff card.** Mirror of [NF-11.8](../nf-writing-os/nf-11-planning-to-writing.md). When fiction's `masterDoc` stage saves, the chat panel posts a `planningComplete` message with a handoff card listing generated artefacts: master doc, chapter cards, manuscript files, and (once later milestones land) story bible, arc matrix, promise/payoff ledger. Card offers actions: open chapter 1 (primary), open master doc, open story bible, open arc matrix, open promise ledger. Removes the silent null-stage return for fiction in `handleUserMessage` — same fix NF-11.8 makes for NF. *(1–2 days)*

## Implementation order

1. FIC-A.0 — re-audit before any fixes.
2. FIC-A.1 / FIC-A.2 — normalizer + tests, no behaviour change yet.
3. FIC-A.3 — reconcile capture/render.
4. FIC-A.4 — beat-ID fix.
5. FIC-A.5 — lib cleanup.
6. FIC-A.6 — handoff card (closes the writer-visible gap).

## Risks

- **Migration of existing projects.** If FIC-A.3 changes the captured scene shape, existing fiction `state.json` files miss fields. Mitigation: normalizer applies sensible defaults (`timeOfDay: null`, `purpose: ''`, `beats: ''`); no project breaks.
- **Fiction unbroken.** Mitigation: fixture tests in FIC-A.2 must include a "real-world fiction project state" fixture, captured from a working project. Any change that breaks rendering of that fixture fails the gate.
- **Hidden third-party consumers of `extension/lib/output/`.** Mitigation: grep the entire repo (including dist/, bundles/) for imports before deletion. If anything dynamic-imports those paths, fix the import to point at canonical sources before deleting.
- **CLI vs extension drift.** Once core absorbs renderers, CLI (`bin/storyline.js`) continues importing root `/lib/output/`. Mitigation: scoped to this milestone — keep CLI on root JS for now. A future milestone may unify, but not as part of FIC-A.

## Out of scope

- Porting root `/lib/output/` JS to `packages/core/src/output/` TS. That's a 1–2 week sweep with NF coverage implications. Defer until after the writing-os milestones land — at that point we'll have one shared output pipeline serving both modes.
- New artefacts (story bible, arc matrix, promise ledger). Those are FIC-C and FIC-D.
- Scene contract upgrade. That's FIC-B.

## Out of scope (long-term but flagged)

The "three-lib" problem still exists after FIC-A — root `/lib/`, `extension/lib/`, `packages/core/src/`. FIC-A.5 only removes the byte-identical duplicates. The deeper consolidation needs to wait until both fiction and NF writing-os milestones are stable and we have the test coverage to do it safely.

## Closure

Fiction code reads through one normalized model. Capture and render shapes match. Beat IDs are consistent. Byte-identical duplicates are gone. Every subsequent fiction milestone has a typed, drift-free foundation to build on.
