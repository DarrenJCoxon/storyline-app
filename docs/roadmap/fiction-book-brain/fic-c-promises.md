# FIC-C — Promises, payoffs, threads

*Status: **DONE***
*Parent: [00-overview.md](00-overview.md)*
*Depends on: [FIC-A](fic-a-normalization.md), [FIC-B](fic-b-scene-contracts.md). Refactors prior art in `extension/lib/ai/critique-api.js`.*
*Anchored to: [00-fiction-audit-2026-04-28.md](00-fiction-audit-2026-04-28.md) §6*
*Created: 2026-04-28*

## Outcome

Storyline tracks the book's promises, payoffs, and plot threads as first-class objects. The writer sees `output/promise-payoff-ledger.md` listing every setup with its planned payoff, status, and risk. The plot-thread registry upgrades from name+type to a tracked dossier with introduction, development, last-touched chapter, planned resolution, and unresolved-risk surface. Setup-without-payoff — the most common reader-experience failure mode in fiction — becomes visible during planning.

## Why this milestone exists

Plot threads exist in state today (`state.plotThreads[]`) but as flat name/type/status records. Fiction critique never touches them. Meanwhile, **promise-payoff infrastructure already exists for non-fiction**: `extension/lib/ai/critique-api.js:325` implements `checkPromisePayoff(state)` against NF state. The fiction equivalent is largely a refactor: extract the detection logic into a mode-agnostic core function, generalise the data model, render the ledger.

This is leverage. Don't rebuild what's already there.

## Prove-it gate

Four criteria. All must be true.

1. **Promise/payoff ledger ships.** A fiction project with at least one populated chapter outline produces `output/promise-payoff-ledger.md` listing every detected promise with type, setup chapter/scene, expected payoff chapter, actual payoff (if drafted), status (planned / set up / paid off / unresolved), risk level.
2. **Plot threads are first-class.** `getWritingPlan(state).plotThreads` returns typed records with introduced-at, developed-in, last-touched, planned-resolution, payoff-scene, risk. The chapter card surfaces which threads each chapter touches.
3. **Detection is shared with NF.** The promise-payoff detection function lives in `packages/core/src/critique/` and is consumed by both fiction and NF critique paths. The original `extension/lib/ai/critique-api.js:checkPromisePayoff` either delegates to it or is deleted in favour of it.
4. **Tests pass — and pin existing NF behaviour.** FIC-C.6's first test file is the NF regression net: byte-identical findings before and after the FIC-C.3 extraction, against a Pipeline A fixture. Without this, the refactor is unsafe. FIC-C.6's second test file covers fiction-side ledger generation across realistic scenarios.

## Stories

Five stories.

- **FIC-C.1 — Promise / payoff data model.** Extend `WritingPlan` with `promises: PromisePayoffItem[]`. Each item: id, type (clue / secret / wound / weapon-on-the-wall / prophecy / romance-beat / subplot / genre-promise), setupChapter, setupScene, plannedPayoffChapter, plannedPayoffScene, actualPayoffChapter, actualPayoffScene, status, risk, notes. Detection extracts these from chapter scene contracts (FIC-B's `threadMovement` and `arcFunction` fields), plot-thread registry, and explicit setup/payoff fields if the writer captured them. *(2 days)*

- **FIC-C.2 — Plot-thread registry upgrade.** Expand the `plotThreads` stage guide to capture: introducedScene, developedScenes (multi), lastTouchedChapter (computed), plannedResolutionScene, payoffScene (when drafted), unresolvedRisk (boolean), linkedPromises (id list). Update the stage's `STAGE_REQUIREMENTS` accordingly. Existing projects with flat threads get sensible defaults via the normalizer. *(2 days)*

- **FIC-C.3 — Extract & generalise `checkPromisePayoff`.** Move the detection logic from `extension/lib/ai/critique-api.js:325` into `packages/core/src/critique/promise-payoff.ts` as a mode-agnostic function consuming `WritingPlan`. The fiction branch detects promises from scene contracts and plot threads; the NF branch detects them from the existing chapter/principle/objection structures. NF's existing CLI consumer (`bin/commands/nf.js`) keeps working through a thin shim. *(2 days)*

- **FIC-C.4 — Promise/payoff ledger renderer.** New `packages/core/src/output/promise-payoff-ledger.ts` exporting `generatePromisePayoffLedger(state, projectPath)`. Output: `output/promise-payoff-ledger.md` grouped by status (unresolved → planned → paid-off), with a risk-summary header listing the top 3 most-at-risk promises. Triggered after chapter-outline saves, plot-threads saves, and (eventually) manuscript-compare runs. *(2 days)*

- **FIC-C.5 — Wire ledger into chat-panel critique.** When critique fires after a fiction save (FIC-PRE made this possible), include promise-payoff findings in the critique card. Format: "3 setups have no planned payoff: [titles]; 1 thread last touched chapter 4, 9 chapters ago." Findings link back to the ledger file. *(1 day)*

- **FIC-C.6 — Tests.** Two test files. **First** (`tests/promise-payoff-detector.test.js`): pin existing NF behaviour. Take a Pipeline A fixture state, run the existing `extension/lib/ai/critique-api.js:checkPromisePayoff`, capture findings, then run the FIC-C.3 generalised detector against the same state and assert byte-identical findings. This is the regression net for the refactor — without it, the extraction risks breaking the only live consumer of promise-payoff today (NF CLI). **Second** (`tests/promise-payoff-fiction.test.js`): fixture-backed tests that fiction projects produce the expected ledger — a project with a clue setup in chapter 3 and no planned payoff produces an unresolved-status entry; a project with matching setup-and-payoff produces a planned-status entry; risk summary correctly identifies the top-3 most-at-risk promises. Plot-thread upgrade tests: existing flat-thread fixtures still parse correctly through the normalizer. *(2 days)*

## Implementation order

1. FIC-C.1 — data model extension first (no behaviour change).
2. FIC-C.3 — extract the existing NF function, prove parity, then generalise.
3. FIC-C.2 — plot-thread upgrade in the stage guide.
4. FIC-C.4 — ledger renderer.
5. FIC-C.5 — critique-card integration.

## Risks

- **Generalising NF code introduces regressions.** Mitigation: pin the existing NF behaviour with fixture tests *before* refactoring. NF behaviour after the refactor must produce byte-identical findings against those fixtures.
- **False-positive promises.** The detector may flag every minor setup as a "promise needing payoff." Mitigation: type the promise list — only certain types (clue, secret, weapon-on-the-wall, romance-beat, prophecy) require explicit payoff; others (subplot, wound) are softer signals. Calibrate against a real fiction project before shipping the gate.
- **Ledger fatigue.** A 60-chapter book might produce 50+ promises. Mitigation: ledger is grouped by status, top-of-file shows top-3 risk; the writer reads the summary first. Full table is reference.
- **Plot-thread schema migration.** Existing fiction projects have flat threads. Mitigation: normalizer fills defaults; stage guide accepts both shapes during a transition period.

## Out of scope

- Genre-specific promise types (romance HEA tracking, mystery fair-play solution, thriller false-victory pressure). Those are genre-engine territory — see [future-work.md](future-work.md).
- Automated payoff detection from manuscript prose. The ledger tracks what the *plan* says; manuscript-compare (Milestone 10) is the surface that catches "the draft never paid this off."
- Story bible / arc matrix / continuity. That's FIC-D.

## What shipped

- **FIC-C.1**: `PromisePayoffItem`, `PromiseType`, `PromiseStatus`, `PromiseRisk` types added to `writing-plan.ts`; `WritingPlan.promises` typed and populated via `detectFictionPromises`; `WritingPlan.nfPromise` added with `paThesisText`/`paFrameworkName` for NF parity.
- **FIC-C.2**: `FictionPlotThread` extended with `introducedScene`, `developedScenes`, `plannedResolutionScene`, `payoffScene`, `unresolvedRisk`, `linkedPromises`, `lastTouchedChapter`; `plotThreads` stage guide updated with 6 new optional dossier fields.
- **FIC-C.3**: `packages/core/src/critique/promise-payoff.ts` — `checkNfPromisePayoff` and `findFictionPromiseGaps` extracted; `critique-api.js:checkPromisePayoff` replaced with a one-line shim.
- **FIC-C.4**: `packages/core/src/output/promise-payoff-ledger.ts` — `generatePromisePayoffLedger`; wired into `ChatPanel.ts` after fiction chapter/plot-thread saves.
- **FIC-C.5**: `findFictionPromiseGaps` findings surfaced as `promise-payoff-gaps` critique card in `ChatPanel.ts`.
- **FIC-C.6**: 45 tests across `tests/promise-payoff-detector.test.js` (NF parity, Pipeline A/B/C edge cases) and `tests/promise-payoff-fiction.test.js` (fiction promise inference, gap detection, ledger output, legacy thread compatibility).
- **Bug fix**: `readNfPromise` extended with top-level state fallback, matching `readNfChapters` pattern — NF legacy fixtures now produce byte-identical plans to canonical fixtures.

## Closure

Storyline knows the book's promises and tracks whether they pay off. Writers stop discovering at chapter 23 that they introduced a clue in chapter 5 and forgot it. The fiction system gains its strongest single moat — and uses NF prior art instead of reinventing it.
