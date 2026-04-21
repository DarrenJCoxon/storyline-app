# Milestone 8 — Hybrid local / frontier AI routing

_Status: **EXPLORATORY** — logged for a future phase, not started. No build work until at least M7 ships._
_Parent: [../roadmap.md](../roadmap.md)_
_Last updated: 2026-04-21_

## Outcome

Storyline's per-token AI cost drops substantially (target: 60–80% reduction on a full planning run) **without any degradation in the quality of critique and structural reasoning that writers judge the product on.** Achieved by routing cheap scaffolding work (question phrasing, state capture, summarisation) to a local Ollama model and reserving the frontier API for the stages where reasoning quality actually matters.

## Why this milestone exists

The Save the Cat harness is tight: 14 fixed stages, a known state schema, and genre/beat reference material. A lot of the LLM calls during a planning run are low-reasoning-load — rephrasing the next question, echoing captured state back to the writer, generating a stage summary. Those calls don't need a frontier model. The critique passes (Beat Sheet validation, Consistency & Critique, Master Document synthesis) do.

Shipping a hybrid router means a writer can plan a full novel at near-zero marginal cost while still getting frontier-quality critique at the three or four stages it genuinely matters. It also opens a "local-only / offline" mode for writers who don't want any API dependency at all — at a clearly-communicated quality tradeoff.

The trigger model is **Gemma 4** on Ollama, specifically the 26B MoE variant (25.2B total / 3.8B active parameters, 256K context window). MoE economics give near-27B-dense quality at ~4B-dense inference cost, and 256K context means the full `state.json` fits in every prompt without custom summarisation.

## Prove-it gate

All three must be true:

1. **Blind-pairing test on critique quality.** For a real manuscript's Stage 7 (Beat Sheet) and Stage 13 (Consistency & Critique), the writer compares critique output from three routing configurations (`premium` = all frontier API, `balanced` = hybrid per the policy table below, `local-only` = all local) without knowing which is which. The `balanced` configuration must be rated **indistinguishable** from `premium` on the critique stages. If `balanced` feels worse, the router is wrong.
2. **Measured cost reduction on a full planning run.** End-to-end planning of a real book in `balanced` mode uses ≤40% of the tokens-billed-to-API of the same run in `premium` mode. If the saving isn't real, the milestone has no reason to exist.
3. **Zero regression when Ollama is unavailable.** Uninstalling Ollama mid-run falls back silently to API for every stage. No broken experience, no cryptic errors. Default behaviour with no Ollama installed is identical to today.

## Proposed routing policy

| Stage | Handler | Rationale |
|---|---|---|
| 1 Genre & Foundations | Local (E4B) | Structured capture. Low reasoning load. |
| 2 Story Seed & Premise | Local (E4B) | Mostly question phrasing + echo. |
| 3 Protagonist Deep Dive | Local (26B MoE) | Character work needs mid reasoning. |
| 4 Supporting Cast | Local (E4B) | Capture + schema. |
| 5 Relationship Web | Local (26B MoE) | Mid reasoning — relational consistency. |
| 6 Logline Refinement | Local (26B MoE) | Phrasing + structural compression. |
| **7 Beat Sheet** | **Frontier API** | The core critique. Never downgrade. |
| 8 B Story | Local (26B MoE) | Thematic link reasoning, but bounded. |
| 9 Subplots | Local (26B MoE) | Thread tracking. |
| 10 Scene Outline (pass 1) | Local (26B MoE) | High-level outline. |
| 10 Scene Outline (critique) | **Frontier API** | Structural review needs frontier. |
| 11 Plot Thread Registry | Local (E4B) | Bookkeeping. |
| 12 Chapter Flesh-Out | Local (26B MoE) | Bounded expansion. |
| **13 Consistency & Critique** | **Frontier API** | The whole-book reasoning pass. Never downgrade. |
| **14 Master Document** | **Frontier API** | Final synthesis. Never downgrade. |

Four stages go to the frontier API. Ten stay local. Exact split is subject to the prove-it gate — the router may need to escalate more stages if the blind-pairing test fails.

## Architecture sketch

```
lib/ai/
├── openrouter-client.js    (existing — frontier API)
├── local-client.js         (M8 — Ollama HTTP client, same interface)
└── model-router.js         (M8 — stage → handler mapping + fallback logic)

.storyline/config.json (new field)
{
  "ai": {
    "quality": "balanced"   // premium | balanced | local-only
  }
}

.storyline/state.json (new field per stage entry)
{
  "stages": {
    "7_beat_sheet": {
      ...existing...,
      "critiquedBy": "frontier-api:claude-sonnet-4-6"  // provenance
    }
  }
}
```

**Guardrails:**
- Every local critique response runs through a cheap heuristic check (beat-reference count, generic-phrasing pattern match). Below threshold → auto-escalate to API for that call only.
- Ollama unreachable (connection refused, timeout) → silent fallback to API. Logged, not surfaced as an error.
- `storyline config ai.quality premium` forces frontier for every call. `local-only` forces local and hides the frontier client entirely.
- Per-stage model provenance written to `state.json` so the writer (and we, during the prove-it test) can see which model produced which output.

## Dependencies

- **Blocked on M7 (multi-engine refactor) landing**, because the router should live at the platform layer, not inside the Storyline engine. If we add a router before M7, we'll have to move it.
- Requires Ollama as an optional install (not bundled). Ship detection + install instructions, not the binary.
- Gemma 4 license needs review before shipping any recommendation to install it — confirm the license permits the use we're pointing writers at.

## Risks

**Quality regression hidden by writer politeness.** Writers may not flag that critique feels shallower — they'll just trust the tool less. The blind-pairing prove-it gate is the defence; don't skip it.

**Hardware variance.** Gemma 4 26B MoE wants ~16–20GB RAM at reasonable quantisation. A writer on an 8GB MacBook Air gets the E4B only, which means more stages escalate to API, which means less cost saving. Router must gracefully degrade: detect available models at startup and adjust the policy table downward per machine.

**256K context is a trap if we stuff it.** Fitting the whole state in every prompt is convenient but expensive at inference time. Keep the old summarisation path as an option; don't assume 256K means "send everything every turn."

**Ollama as an install barrier.** Writers are not developers. "Install Ollama, pull a 16GB model, configure a daemon" is not acceptable UX. Either we invest in a one-click installer experience for this milestone or we keep local routing opt-in for technical users only and don't claim it as a default.

**Gemma 4 might not be the right model by the time we build this.** The local model landscape moves fast. Treat the routing policy as model-agnostic: the `local-client.js` talks to Ollama, the specific model ID is config. Re-evaluate the model choice at build time, not now.

## Cut list (explicitly NOT in this milestone)

- **Bundling Ollama or any model weights with Storyline.** Too big, too much licensing complexity. Detect + guide.
- **Fine-tuning a local model on Save the Cat critique.** Interesting future research, massively out of scope here.
- **A model-picker UI per stage.** One quality setting, three values. More knobs = decision fatigue.
- **Non-Ollama local backends (llama.cpp, MLX, LM Studio).** Pick one runtime, ship it well. Others are future work if there's demand.
- **Streaming responses from the local model into the VS Code UI differently from API responses.** Same interface, same UX.
- **Cost tracking / billing dashboard.** A single "estimated tokens saved this session" line is the most we need; a dashboard is feature-creep.

## Definition of done (when this milestone eventually runs)

- `lib/ai/local-client.js` and `lib/ai/model-router.js` shipped
- `storyline config ai.quality` command works; default is `balanced`
- Blind-pairing prove-it gate met on a real manuscript
- Cost reduction measured and documented
- Ollama-absent fallback verified
- `docs/engine-platform.md` updated with the routing architecture and the rule "critique stages never downgrade from frontier without explicit user opt-in"

## Lessons learned

_To be filled in at milestone closure._
