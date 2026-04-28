# FIC-PRE — Critique wiring fix

*Status: **DONE** (2026-04-28)*
*Parent: [00-overview.md](00-overview.md)*
*Anchored to: [00-fiction-audit-2026-04-28.md](00-fiction-audit-2026-04-28.md) §1*
*Created: 2026-04-28*
*Closed: 2026-04-28*

## What shipped

- **FIC-PRE.1**: `runCritique` wired into `applyEmittedPatches` after the existing post-save side-effects (story traps, series detector, downstream impacts, stage doc) and before stage advance. Fire-and-forget pattern matching `pushToMemory` — never blocks advance.
- **FIC-PRE.2**: Backend `reasoning.ts` and `critique.ts` tier mappings audited; all fiction and NF stages already correctly tiered. No backend changes required.
- **FIC-PRE.3**: Decision logic extracted into pure module [`critique-wiring.ts`](../../../extension/src/conversation/critique-wiring.ts) (`shouldSkipCritique`, `interpretCritiqueOk`, `interpretCritiqueHttpError`, `interpretCritiqueNetworkError`, `detectProviderKind`). 30-test suite at [`critique-wiring.test.ts`](../../../extension/src/conversation/__tests__/critique-wiring.test.ts) covers the contract end-to-end including regression nets that fail loudly if any structural fiction or NF stage is accidentally added to the deny list. All 46 extension tests pass.

Bundle rebuilt, VSIX repackaged, local Tauri app rebundled to new DMG.

---

(Original spec preserved below for reference.)


## Outcome

The product promise "AI critique after every stage" is true for **both fiction and non-fiction**. After a stage saves, the chat panel either shows the critique result or shows an honest status explaining why critique didn't run. It never silently skips.

The wiring fix lives in `applyEmittedPatches` in `ChatPanel.ts` — the same code path serves both modes. FIC-PRE therefore restores critique for non-fiction projects as well, even though the audit was fiction-focused. NF-11's prove-it gate should be re-checked after FIC-PRE lands to confirm NF stages produce critique cards on save.

## Why this is a pre-milestone, not a story inside FIC-A

`runCritique` is defined in `ChatPanel.ts:705`, calls a working backend route, handles the response — and is **never called from anywhere**. The system prompt and user-facing copy promise critique-after-save. The current behaviour is a credibility-destroying bug, not a feature gap.

Putting this inside a normalization milestone would gate the fix behind weeks of refactor work. It's a 2–3 hour wiring change that should ship as soon as it's verified.

## Prove-it gate

Four criteria. All must be true.

1. **Critique runs after eligible stage saves.** When the writer completes a structure-bearing stage (protagonist / relationships / logline / beatSheet / bStory / subplots / sceneOutline / chapterOutline / critique) and the save passes the gate, the model-backed critique is invoked. Stages in `NO_CRITIQUE_STAGES` (mode, master-docs, validate-tier stages: genre / premise / characters / plotThreads) deliberately skip — the existing UX choice that suppresses validate-tier nags is preserved.
2. **Critique provenance is honest.** The chat panel surfaces which tier ran (validate / structural / prose / synthesis) and the stage it ran against. If the backend call fails, the panel says so — does not fall back to silence.
3. **No double-run with story traps.** Deterministic story traps (`runStoryTraps`) and model critique do not produce duplicate findings. Story traps fire first; model critique fires after, framed as "in addition to the deterministic checks above…"
4. **Tests pass.** FIC-PRE.3's `tests/critique-wiring.test.js` covers the wiring contract end-to-end against mocked fetch. Tests pass on CI before the milestone closes.

## Stories

Three stories. Ship together.

- **FIC-PRE.1 — Wire `runCritique` into `applyEmittedPatches`.** In `ChatPanel.ts`, add `runCritique` invocation after the existing post-save side effects, before stage advance. Use the existing `NO_CRITIQUE_STAGES` guard. Make the call non-blocking — critique result is decoration, not a precondition for advancing. Surface failures via the existing `streamError` path with a tier-aware message ("Structural critique unavailable: <reason>"). *(half day)*

- **FIC-PRE.2 — Add the fiction `critique` stage to the backend reasoning map.** `backend/src/reasoning.ts` lists NF critique stages but not fiction's `critique` stage explicitly. Confirm fiction stage tier mappings exist and add anything missing. Document the tier choice per fiction stage in the same file. *(half day)*

- **FIC-PRE.3 — Tests.** New `tests/critique-wiring.test.js` covering: (a) `runCritique` is invoked from `applyEmittedPatches` for a structure-bearing stage save (mock the fetch); (b) `NO_CRITIQUE_STAGES` deny-listed stages skip the call (mode, masterDoc, pa-master, pb-master, pc-master, genre, premise, characters, plotThreads); (c) BYOK / Ollama providers skip silently with a console log; (d) backend 4xx/5xx responses post `streamError` with the status code; (e) 402 responses do *not* post a streamError (handled elsewhere); (f) network errors surface as honest "Critique unavailable (network)" messages. Fetch is stubbed; this is a pure logic test of the wiring contract. *(half day)*

## Risks

- **Latency surprise.** Adding a synchronous-ish backend call after every save could feel slow. Mitigation: critique is fired-and-forgotten — the chat panel posts the card when the response arrives; it doesn't block stage advance. Same pattern as memory push and stage-doc write.
- **Cost surprise.** Critique calls cost credits. Mitigation: respect the existing licence/credits guard in `streamResponse`; if credits are exhausted at critique time, post an honest message and skip rather than charge.
- **Hallucinated quotes.** Model critique might cite plan content that doesn't exist. Mitigation: critique prompts already exist (`backend/critique-prompts/`); verify they constrain output to supplied state. If they don't, that's a separate prompt-engineering fix, but log the issue for the FIC-A milestone.

## Out of scope

- New critique tiers or new prompts.
- Stage-specific critique customisation beyond what's already in the backend.
- Plan-vs-draft critique — that's Milestone 10.
- Surfacing critique findings in the writing cockpit — also Milestone 10.

## Closure

The product no longer makes a promise it doesn't keep. The four-tier critique infrastructure that already exists in the backend is finally reachable from the writer's chat panel. Every later fiction milestone can build on critique that actually runs.
