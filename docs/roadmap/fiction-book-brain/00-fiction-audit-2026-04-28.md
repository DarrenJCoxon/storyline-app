# Fiction codebase audit — 2026-04-28

*Purpose: ground-truth state of the fiction harness before scoping the M11 series. Every claim below is verified against current code on 2026-04-28; line numbers refer to the working tree at that date.*

This audit replaces the speculative claims in `milestone-11-fiction-book-brain.md`. Where Codex's review was right, this confirms it. Where it was wrong, this corrects it. Nothing in the milestone series should be planned against the original document's examples without checking them here first.

## TL;DR

- **Critique is wired but never called.** Real bug. Highest-priority single fix.
- **Three lib roots exist.** Real drift. Two of three are byte-identical copies. The third has uncoordinated improvements.
- **Beat field-name drift exists, but not where Codex said.** Real drift on beat *IDs* in label tables (`beat11DarkNightOfTheSoul` instead of canonical `beat11BlackMoment`). The `beat05BreakIntoTwo.choice` example Codex cited was wrong — the schema and all readers correctly use `threshold`.
- **Scene model is thin, as claimed.** 7 fields per scene, no goal/obstacle/stakes/turn/value-shift. Confirmed.
- **Story bible / arc matrix / promise ledger / cockpit don't exist.** Greenfield, not refactor.
- **A `critique-api.js` already exists in `extension/lib/ai/`** with `promise-payoff` infrastructure for NF. Codex's review didn't mention this. It's NF-only and would need fiction extension, not invention.

## 1. Critique wiring

### What's claimed

- System prompt advertises "AI critique after every stage."
- `ChatPanel.runCritique(stageId, state)` exists and calls the backend `/critique` endpoint.

### What's actually true

`packages/core/.../ChatPanel.ts:705` defines `runCritique`. It is **never called** from anywhere in the file or the wider extension source. Single grep match in the whole `ChatPanel.ts`:

```
705:  private async runCritique(stageId: string, state: ProjectState): Promise<void> {
716:    const response = await fetch(`${getBackendUrl()}/critique`, {
730:      this.post({ type: 'critiqueCard', findings: data.findings, tier: data.tier ?? 'structural', stageId })
```

The post-save side-effect chain in `applyEmittedPatches` runs:

1. Memory push (`pushToMemory`)
2. Story traps (`runStoryTraps` — deterministic)
3. Series detector (premise stage only)
4. Downstream impacts notice
5. Stage-doc write
6. Stage advance
7. `fireOpeningPrompt` for next stage

`runCritique` is absent. Backend has four critique prompts in `backend/critique-prompts/` (`validate.md`, `structural.md`, `prose.md`, `synthesis.md`), the route exists, the panel handler exists. It's all dressed up with nowhere to go.

**Implication.** The product makes a promise it doesn't keep. This is the highest-priority single fix in the entire fiction series. It's not a milestone — it's a bug fix that should ship before any new feature work.

## 2. Lib drift

### What's claimed

"Fiction logic is split between root `lib`, `packages/core`, and extension-local copies."

### What's actually true

There are **three** locations with overlapping fiction output renderers:

| File | Root `/lib/output/` | `extension/lib/output/` | `extension/src/editor/` or `packages/core/src/output/` |
|---|---|---|---|
| `chapter-doc.js` | exists | byte-identical to root | superseded by `extension/src/editor/chapter-cards.ts` (different impl) |
| `master-doc.js` | exists | exists (superset of root) | `packages/core/src/output/master-doc.ts` (TS rewrite) |
| `stage-doc.js` | exists | exists | `packages/core/src/output/stage-doc.ts` (TS rewrite, partial coverage) |
| `book-dna-doc.js` | exists (NF) | exists (NF) | **no core equivalent** |
| `nf-stage-doc.js` | exists (NF) | exists (NF) | **no core equivalent** |
| `pipeline-{a,b,c}-master.js` | exists (NF) | exists (NF) | **no core equivalent** |

### Verified facts

- `extension/lib/output/chapter-doc.js` and `lib/output/chapter-doc.js` are **byte-identical**. Copy-paste duplication, not divergent forks.
- The extension's compiled chat panel uses `extension/src/editor/chapter-cards.ts`, *not* either `chapter-doc.js`. The duplicates are dead in the extension path.
- The CLI (`bin/storyline.js`) imports `lib/output/chapter-doc.js` (`writeAllChapterCards`), `lib/output/master-doc.js`, `lib/output/stage-doc.js`. The CLI is the only live consumer of root `/lib/output/`.
- **Extension master-doc command imports root `/lib/output/master-doc.js`**, not the core TS version. `extension/src/extension.ts:311` does `await import('../../lib/output/master-doc.js')` — the core `packages/core/src/output/master-doc.ts` is not reachable from the master-doc command, only from the chat panel side-effects (where it's also not currently called).

### Implication

The "consolidate" story (Codex's FIC-11.2) was scoped at 2–3 days. Reality is bigger and has live-consumer constraints:

- CLI consumers must keep working.
- `extension/lib/` is what gets bundled into the VSIX — extension code can dynamic-import it. Reality: only one extension command does (`generateMasterDoc` → `lib/output/master-doc.js`), but kill it carelessly and that command breaks.
- The TS rewrites in `packages/core/src/output/` are partial (no NF coverage at all).

Realistic scope:

1. Treat root `/lib/output/` as canonical for now (CLI depends on it).
2. Make `packages/core/src/output/` import or re-export from root rather than parallel-implement. Or: port root `/lib/output/` JS to core TS in one disciplined sweep with regression tests.
3. Delete `extension/lib/output/` byte-duplicates after confirming nothing in the bundled extension imports them.

This is at least 1–2 weeks of careful work, not 2–3 days. Call it honestly in the milestone.

## 3. Beat field-name drift

### What's claimed

"Several fiction helpers appear to read stale beat or metadata keys. Examples include checks looking for `beat05BreakIntoTwo.choice` when the schema uses `threshold`."

### What's actually true

**The cited example is wrong.** Verified by grepping the whole tree: there are zero references to `beat05BreakIntoTwo.choice` or `beats.beat05BreakIntoTwo.choice`. Every reader correctly uses `threshold`:

- Schema (`packages/core/src/state/project-state.ts:171`) declares `beat05BreakIntoTwo: { scene, falseReality, threshold, notes }`.
- Stage guide (`packages/core/src/ai/stage-guides.ts:218`) writes to `threshold`.
- Stage-doc renderer (`packages/core/src/output/stage-doc.ts:163`) reads `beat.threshold`.
- Coaching personas check (`packages/core/src/ai/coaching-personas.ts:207`) reads `beat05BreakIntoTwo.threshold`.

The closest match to "choice" is the question label in `stage-guides.ts:218` — `"What is the CHOICE they make?"` — which writes to `threshold`. That's prose copy, not a field accessor. Codex pattern-matched on the prose of the question.

### What's actually drifted

Beat **ID** drift exists in label tables:

| Canonical (schema) | Drifted ID found in code |
|---|---|
| `beat11BlackMoment` | `beat11DarkNightOfTheSoul` |
| `beat12Beat13` | `beat12BreakIntoThree` |

Locations:

- `extension/src/editor/chapter-cards.ts:16-17` — BEAT_NAMES table uses drifted IDs. Chapter cards display the canonical IDs (`beat11BlackMoment`) raw because the lookup misses.
- `extension/lib/output/chapter-doc.js:25-26` — same drift in the byte-identical duplicate.
- `lib/output/chapter-doc.js:25-26` — same drift in the root copy.

Renderers in `packages/core/src/output/` (master-doc.ts, stage-doc.ts) use the canonical IDs correctly.

### Implication

The drift Codex flagged at the high level is real, but the specific example given is wrong. Any fixture-backed-test story (Codex's FIC-11.1) must:

1. Re-audit drift from scratch — do not trust the original doc's examples.
2. Add tests for the *actual* drifts found (beat11/beat12 ID mismatches in chapter-cards renderers).
3. Fix the renderers' BEAT_NAMES tables to canonical IDs.

The right list of drifts to fix is short, not extensive.

## 4. Scene model

### What's claimed

Current scene fields: POV, location, time of day, summary, purpose, conflict, what changes, beats, notes — too thin for a writing cockpit.

### What's actually true

Verified at `packages/core/src/ai/stage-guides.ts:295-305`. Scene fields:

```
sceneNumber  (required, number)
pov          (required)
location     (optional)
summary      (required)
conflict     (required)
whatChanges  (required)
notes        (optional)
```

**That's seven fields, with three required.** The rendered shape in `master-doc.ts:267-272` adds `timeOfDay`, `purpose`, and `beats` columns — implying readers expect those fields too — but they aren't captured by the stage guide. The capture/render shapes are inconsistent.

### Implication

Codex's claim is correct *and understated*. The scene model isn't just thin, it's internally inconsistent — the master-doc renders columns the stage doesn't capture. Any scene-contract upgrade (FIC-11.7) needs to:

1. Pick a single canonical scene shape.
2. Update the stage guide and the renderer in lockstep.
3. Migrate existing projects (existing scenes won't have goal/obstacle/stakes/turn/value-shift fields).

The migration risk is real. Existing fiction projects in flight will need backfill defaults.

## 5. Story bible / arc matrix / promise ledger / cockpit

### What's claimed

"M11 should generate `output/story-bible.md`, `output/character-arc-matrix.md`, `output/promise-payoff-ledger.md`, `output/plot-thread-ledger.md`, `output/visual-story-bible.md`."

### What's actually true

Greenfield. Zero matches across `packages/core/src/`, `extension/src/`, root `/lib/` for any of these artefact names. No render pipeline, no schema fields, no data — except what's listed under §6 below.

### Implication

These are new product capability, not refactors. Each deserves a focused milestone, not a phase inside one milestone. Treat the original doc's Phase C and Phase D as separate milestones (M11D promise/payoff, M11E character/relationship/continuity bible).

## 6. Existing critique-api: NF-only, with promise-payoff infrastructure

### What Codex didn't notice

`extension/lib/ai/critique-api.js` already exists. 717+ lines. Exports `runFullCritique(state, researchGaps)`, `generateCritiqueReport(state, projectDir, researchGaps)`, `buildSummaryMarkdown(critiqueResult)`.

It already implements:

- DNA ↔ pipeline coherence checks
- Reader-avatar drift detection
- **`checkPromisePayoff(state)`** — promise-payoff gap detection (line 325)
- Comp-adjacency
- Research-gap quality scoring

It is **NF-only**. All branches read `state.nfStages`, `state.pipeline`, NF-specific fields. There is no fiction code path.

It is consumed only by `bin/commands/nf.js` (CLI). The extension does not call it.

### Implication

The promise-payoff concept Codex put forward as new fiction work has **prior art** in NF. The right move:

1. Extract promise-payoff detection into a mode-agnostic core function.
2. Have NF and fiction both consume it through the unified `getWritingPlan(state)` view.
3. Wire it into the extension critique path (which is currently dead — see §1).

This is leverage. Don't reinvent promise-payoff for fiction; refactor the existing implementation to cover both modes.

## 7. State schema

### What's claimed

"The fiction state schema is mature."

### What's actually true

Mature for planning, weak for derived data. `ProjectState`:

- `chapterOutline: unknown[]` — typed as `unknown`. Every renderer narrows it locally with inline casts. No shared typed `Chapter` or `Scene`.
- `plotThreads: unknown[]` — same.
- `subplots: unknown[]` — same.
- `relationships: unknown[]` — same.
- `critique` shape declared but only carries `flaggedIssues[]`, `resolvedIssues[]`, three string fields. No claim model, no promise model, no arc state, no continuity facts.

### Implication

A normalized `WritingPlan` view (NF-11.1) needs companion typed shapes for `Chapter`, `Scene`, `PlotThread`, `Relationship`, etc. If we expand the *raw* schema before having the normalized view, we create more migration burden. Order: build `getWritingPlan(state)` *first* with strict types, *then* let the raw state catch up under the cover of the adapter.

## 8. Manuscript-side capability that already exists

`extension/lib/manuscript/` has working implementations of:

- `notes.js` — scans manuscript for inline `{{...}}` notes, formats a report. Wired to a VS Code command.
- `snapshot.js` — captures manuscript state for diffing. Wired.
- `compare.js` — `compareManuscriptToPlan(state, projectDir)` already does plan-vs-draft comparison. Wired to a VS Code command.

These are not surfaced in the chat panel or anywhere obvious. Codex described "plan-vs-draft critique" as new work; in fact the structural primitive is there.

### Implication

The Drafting Companion (Milestone 10) work has more existing infrastructure than the original doc credited. Plan-vs-draft critique can ship as integration work — surface `compareManuscriptToPlan` in the cockpit, augment its output with the new `WritingPlan` view, plug into the critique pipeline once §1 is fixed.

## 9. Backend critique infrastructure

`backend/src/critique.ts` and `backend/critique-prompts/` define a four-tier system: validate / structural / prose / synthesis. `backend/src/reasoning.ts` maps stages to reasoning tiers (some explicitly listed, e.g. `pa-critique`, `pb-critique`, `pc-critique`).

The route exists. The prompts exist. The tiering exists.

The extension just doesn't call it.

### Implication

When §1's fix lands, fiction stages need explicit tier assignments (currently absent — fiction's `critique` stage isn't in the reasoning map). This is a small addition, not a redesign.

## What this audit changes about the milestone scope

Concrete scope adjustments based on ground truth:

1. **`fix-critique-wiring` is its own pre-milestone story.** Single fix, blocks nothing else, restores a credibility-critical product promise. Land before anything else.
2. **`getWritingPlan(state)` becomes one shared NF/fiction normalizer.** Not two parallel functions. NF-11.1 (already in the NF series) should be expanded to be mode-aware as part of the fiction work.
3. **The lib-consolidation story splits in two.** "Port root `/lib/output/` to `packages/core/src/output/` with parity" is one piece. "Delete byte-identical extension/lib copies" is a much smaller piece. Don't bundle them.
4. **Promise-payoff is refactor work, not new capability.** Extract `checkPromisePayoff` from `extension/lib/ai/critique-api.js` and generalise. Saves weeks vs the new-build framing.
5. **Manuscript-compare is plumbing work, not new capability.** `compareManuscriptToPlan` already runs. Surface it; augment it; don't rebuild it.
6. **Scene contract migration must be a gate criterion**, not an aside. Existing projects break without backfill defaults.
7. **Drift fixes need a fresh audit pass.** Codex's specific examples are unreliable. Re-audit for the milestone, list the *actual* drifts, fix only those.
8. **Story bible / arc matrix / continuity / series** are genuinely new milestones. Don't bundle.

## Notes for the milestone series

The series at `docs/roadmap/fiction-book-brain/` should reference this audit by date, not paraphrase its claims. If anything in this audit becomes stale (new code lands), update *this file* with a new date-stamped section rather than letting the milestone docs drift back to wrong assumptions.

---

# Drift findings — verified list (FIC-A.0 deliverable)

*Added: 2026-04-28 (same-day re-audit per FIC-A.0 to replace Codex's speculative drift list with verified evidence).*

This section is the canonical drift list for FIC-A. Every item is verified against the working tree on 2026-04-28 with grep evidence. Anything Codex claimed but I cannot verify is *not* on this list — those are out of scope for FIC-A's drift fixes.

## Drift D1: Beat-ID drift in chapter-card BEAT_NAMES tables

**Severity: medium (user-visible). Already known from §3 above.**

Schema (`packages/core/src/state/project-state.ts:171-178`) declares canonical beat IDs:

- `beat11BlackMoment`
- `beat12Beat13`

Three files contain BEAT_NAMES lookup tables with drifted IDs:

| File | Line | Drifted IDs |
|---|---|---|
| `extension/src/editor/chapter-cards.ts` | 16-17 | `beat11DarkNightOfTheSoul`, `beat12BreakIntoThree` |
| `extension/lib/output/chapter-doc.js` | 25-26 | same drift (byte-identical to root) |
| `lib/output/chapter-doc.js` | 25-26 | same drift |

**Effect**: when a chapter has `beat: 'beat11BlackMoment'`, the chapter card displays the raw schema ID rather than the friendly "Black Moment" name.

**Fix**: update all three BEAT_NAMES tables to use canonical IDs. Add a unit test that the BEAT_NAMES table covers every key in `DEFAULT_STATE.beatSheet.beats`.

## Drift D2: Plot-thread type field — `t.type` vs `t.threadType`

**Severity: medium (user-visible regression in master-doc only).**

Capture schema (`packages/core/src/ai/stage-guides.ts` `plotThreads` stage) writes `threadType`:

```js
{ key: 'threadType', label: 'Type', hint: 'mystery, relationship, world-building, character-arc', required: true }
```

Readers split:

| File | Line | Reads | Status |
|---|---|---|---|
| `packages/core/src/output/stage-doc.ts` | 279 | `t.threadType \|\| t.type \|\| '-'` | defensive — handles both |
| `packages/core/src/memory/stage-memory.ts` | 226 | `t.threadType \|\| t.type` | defensive |
| `packages/core/src/output/master-doc.ts` | 283 | `t.type` | **DRIFT** — captured field is `threadType` |
| `lib/output/master-doc.js` | 243 | `t.type` | same drift in CLI consumer |
| `lib/output/stage-doc.js` | 246 | `t.threadType \|\| t.type \|\| '-'` | defensive |
| `lib/memory/stage-memory.js` | 225 | `t.threadType \|\| t.type` | defensive |

**Effect**: master document renders the plot-thread type column as `undefined`. Stage doc and memory pick it up correctly via the fallback.

**Fix**: update `master-doc.ts:283` and `lib/output/master-doc.js:243` to read `t.threadType || t.type || '-'` (matching stage-doc's defensive pattern). After FIC-A.5 (canonical-source consolidation), keep only the defensive read in the canonical renderer.

## Drift D3: Scene capture/render schema mismatch

**Severity: medium (renderers display columns the stage never captures).**

Capture schema (`packages/core/src/ai/stage-guides.ts:295-305` `chapterOutline.nested.scenes.fields`) captures **7 fields**:

```
sceneNumber (required), pov (required), location, summary (required),
conflict (required), whatChanges (required), notes
```

Renderers read **11 fields**:

| Reader | Reads beyond capture |
|---|---|
| `packages/core/src/output/master-doc.ts:266,269,272` | `sc.timeOfDay`, `sc.purpose`, `sc.beats` |
| `packages/core/src/output/stage-doc.ts:307,309,312` | `sc.timeOfDay`, `sc.purpose`, `sc.beats` |
| `extension/src/editor/chapter-cards.ts:76,82,85,88` | `sc.estimatedWords`, `sc.timeOfDay`, `sc.purpose`, `sc.beats` |

**Effect**: any project that completed `chapterOutline` displays empty Time / Purpose / Serves columns (and chapter cards display empty word-count brackets) because the writer was never asked for those values.

**Fix**: pick a single canonical scene shape. Either expand the stage guide to capture the four extra fields (preferred — the renderers already render them), or strip the columns from the renderers. This is FIC-A.3's job, not FIC-A.0's.

**Note for FIC-B**: the scene-contract upgrade will add even more fields (`goal`, `obstacle`, `stakes`, `storyTurn`, etc.). FIC-A.3 should resolve the *existing* mismatch first — don't conflate it with the FIC-B schema expansion.

## Drift D4: Lib byte-duplication

**Severity: low (no behaviour difference, but enables future drift).**

Already documented in §2 above. Verified again today:

- `lib/output/chapter-doc.js` and `extension/lib/output/chapter-doc.js`: byte-identical (md5 confirmed).
- `extension/lib/output/master-doc.js`, `extension/lib/output/stage-doc.js`, `extension/lib/output/book-dna-doc.js`, `extension/lib/output/nf-stage-doc.js`, `extension/lib/output/pipeline-{a,b,c}-master.js`: all duplicates of root `/lib/output/`.

The bundled extension does not import from `extension/lib/output/` for any consumer I can find. The chat panel uses `extension/src/editor/chapter-cards.ts`. The `storyline.generateMasterDoc` command uses `lib/output/master-doc.js` from the project root via dynamic import.

**Fix**: delete `extension/lib/output/*.js` after re-confirming no consumers (FIC-A.5).

## Non-drifts (claims that look like drift but aren't)

The following accessors look unfamiliar but are *not* drift:

- **`ch.opening`, `ch.closing`, `ch.number`, `ch.title`, `ch.filename`, `ch.wordCount`, `ch.sceneCount`, `ch.pov`** in `lib/manuscript/snapshot.js` — these are computed from prose snapshots, not planning state. Different domain.
- **`ch.linkedCount`** in `research/critique.ts` — derived from research-item links count, not a state field.
- **`p.first`, `p.includes`, `p.classList`** etc. in various places — these are method calls on string/array `p` variables, not `Protagonist.*` accesses. Naming collision, not drift.

## Out-of-scope drift not fixed by FIC-A

- `lib/output/master-doc.js` (the JS root version) has the same `t.type` drift as the TS core version. FIC-A.5 only deletes byte-duplicates; the root JS-vs-TS divergence is the broader port-to-core problem deferred until after writing-os milestones stabilise. **Workaround**: the root JS still works (its `t.type` read just produces `undefined`, same as the TS version) — fix it the same time we port the renderer to core.

## FIC-A drift-fix scope

After this audit, FIC-A's drift-fix work is:

1. **D1 (beat IDs)** → FIC-A.4. Update three BEAT_NAMES tables. Add unit test.
2. **D2 (plot-thread type)** → FIC-A.4 extension. Update `master-doc.ts:283` to defensive read. Same fix in `lib/output/master-doc.js`.
3. **D3 (scene capture/render)** → FIC-A.3. Reconcile in one canonical direction.
4. **D4 (byte-duplicates)** → FIC-A.5. Delete after re-verification.

Codex's specific examples that did NOT survive verification (`beat05BreakIntoTwo.choice`, "blurb generation reading flat beat names") are not in scope. The schema is correct; only the readers above are drifted.
