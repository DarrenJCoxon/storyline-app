# Milestone 8 — Intelligent per-stage model routing

_Status: **EXPLORATORY** — logged for a future phase, not started._
_Parent: [../roadmap.md](../roadmap.md)_
_Last updated: 2026-04-22_

## Outcome

Storyline's per-token AI cost drops substantially (target: 60–80% reduction on a full planning run) **without any degradation in the quality of critique and structural reasoning that writers judge the product on.** Achieved by routing each stage to the right Claude model for the job — Haiku for capture/phrasing/bookkeeping, Sonnet for the mid-reasoning majority, Opus reserved for the two or three stages that genuinely need whole-book cross-stage reasoning.

## Why this milestone exists

The Save the Cat harness is tight: 14 fixed stages, a known state schema, genre/beat reference material. A meaningful fraction of LLM calls during a planning run are low-reasoning-load — rephrasing the next question, echoing captured state back to the writer, maintaining the plot thread registry. Those calls don't need Sonnet, let alone Opus. Running them on Haiku cuts cost roughly 20× per call against Opus and ~4× against Sonnet, with no quality impact because the task doesn't have reasoning in it.

Meanwhile, Stages 13 (Consistency & Critique) and 14 (Master Document) demand reasoning across the entire project state at once — every character, every beat, every subplot, checked for coherence. That's Opus work. Shipping a router that gets those right while pushing cheap work down-tier is a strict improvement on the current "one model for everything" default.

The routing lives inside the existing OpenRouter path — no new infrastructure, no new dependencies, no hardware concerns for the writer. Just a per-stage `model` parameter on the API call.

## Prove-it gate

All three must be true:

1. **Blind-pairing test on critique quality.** For a real manuscript's Stage 7 (Beat Sheet), Stage 13 (Consistency & Critique), and Stage 14 (Master Document), compare routed output against an all-Opus baseline without knowing which is which. Routed output must be rated **indistinguishable** from all-Opus on those stages. If it feels worse, the mapping is wrong — escalate the offending stage a tier and re-test.
2. **Measured cost reduction on a full planning run.** End-to-end planning of a real book using the routing policy costs ≤40% of the same run on all-Opus, and ≤70% of the same run on all-Sonnet. If the saving isn't real, the milestone has no reason to exist.
3. **Escalation path works silently.** When a Sonnet response fails the confidence check (see guardrails), the router retries on Opus without the writer noticing anything except "that critique was thorough." Zero surfaced errors.

## Routing policy

| Stage | Task character | Model |
|---|---|---|
| 1 Genre & Foundations | Structured capture, known taxonomy | **Haiku** |
| 2 Story Seed & Premise | Question phrasing + echo | **Haiku** |
| 3 Protagonist Deep Dive | Character nuance, backstory | Sonnet |
| 4 Supporting Cast | Schema capture, light reasoning | **Haiku** |
| 5 Relationship Web | Multi-character consistency | Sonnet |
| 6 Logline Refinement | Compression + judgement | Sonnet |
| 7 Beat Sheet | Save the Cat structural validation | Sonnet (→ Opus on escalation) |
| 8 B Story | Thematic-link reasoning | Sonnet |
| 9 Subplots | Thread interaction | Sonnet |
| 10 Scene Outline (pass 1) | High-level outline generation | Sonnet |
| 10 Scene Outline (critique) | Outline validation | Sonnet (→ Opus on escalation) |
| 11 Plot Thread Registry | Bookkeeping | **Haiku** |
| 12 Chapter Flesh-Out | Bounded expansion, two-pass | Sonnet |
| **13 Consistency & Critique** | **Whole-book cross-stage reasoning** | **Opus** |
| **14 Master Document** | **Full synthesis of 13 stages** | **Opus** |

Rough split: 4 stages on Haiku, 9 on Sonnet, 2 on Opus (plus Stage 7 / Stage 10-critique escalations). The cost shape is dominated by Sonnet; Opus usage is surgical.

The mapping is subject to the prove-it gate — if the blind-pairing test shows any of the Sonnet stages producing weaker critique than Opus would, promote that stage. Don't defend the table, defend the outcome.

## Architecture

```
lib/ai/
├── openrouter-client.js    (existing — takes `model` parameter already)
└── model-router.js         (M8 — stage → model mapping + confidence check + escalation)

.storyline/config.json (new field)
{
  "ai": {
    "quality": "balanced"   // economy | balanced | premium
  }
}
```

**Quality modes:**
- `economy` — push one tier lower across the board (Haiku for structured, Sonnet ceiling; no Opus). Clearly communicated: "critique will be faster and cheaper but less thorough."
- `balanced` — the table above. The default.
- `premium` — promote all Sonnet stages to Opus. For writers who want maximum critique quality and don't care about cost.

**Guardrails:**
- Every Sonnet critique response runs through a cheap heuristic check — specificity of beat references, presence of concrete revision suggestions vs. generic phrasing. Below threshold → silently retry on Opus for that call only. Log the escalation; surface a counter at stage-end ("2 of 8 critique points escalated to Opus").
- Per-stage model provenance written to `.storyline/state.json` so the writer (and we, during prove-it testing) can see which model produced which output.
- Every call still flows through the same OpenRouter client and the same error handling — model routing is a parameter change, not a new code path.

## Dependencies

- Can land without M7 (multi-engine refactor), because the router is thin and can be lifted into the platform later with minimal churn.
- Should land **after M6 ships** so we're not optimising cost on a moving target.
- No new runtime dependencies. OpenRouter call shape is already model-parameterised.

## Risks

**The mapping is a guess until it's tested.** The table above is my best judgement, not empirical. Stage 7 in particular is a hard call — Sonnet is usually enough for Save the Cat critique, but a writer working a genre subversion or an unusual structural choice might need Opus. The escalation path is the safety valve; lean on it rather than arguing the table.

**Haiku being "good enough" for capture is also an assumption.** Haiku 4.5 is capable at structured tasks but has been observed producing subtle formatting drift on JSON state writes. Stage 1, 2, 4, 11 handlers must validate state-schema output before committing it, same as we'd validate any LLM output — don't trust Haiku further than you'd trust Sonnet on the schema boundary.

**Confidence heuristics are fragile.** "Did this critique cite specific beats?" is a string-match test that can be gamed by the model generating beat names without substance. Keep the heuristic simple, accept false negatives (unnecessary Opus escalation) over false positives (weak critique that slips through). Re-tune after real use.

**Prompt tuning per model.** Haiku / Sonnet / Opus respond differently to the same system prompt — Haiku prefers shorter, more explicit instructions; Opus tolerates longer context and subtlety. Stage prompts may need per-tier variants. Not a blocker but adds implementation surface.

**Writers will ask "why did you use the cheap model on my book?"** Frame the quality setting honestly in docs: `balanced` gives you Opus-grade critique on the stages that matter and cheaper models only on stages where quality ceiling isn't the bottleneck. Per-stage provenance in `state.json` lets a curious writer verify.

## Possible future extension — local model tier

Once the routing architecture is in place, a fourth tier could push the cheapest stages (currently Haiku) to a local Ollama model — Gemma 4 E4B or similar — for writers who want zero API cost on the capture/bookkeeping stages. This was the original framing of this milestone; it's now demoted to "possible extension" because the Claude-tier routing delivers most of the cost benefit without hardware concerns, install UX problems, or model-drift quality worries.

If we pursue the local tier later:
- Slot a `local` handler in the router for stages 1, 2, 4, 11
- Add Ollama detection + silent fallback to Haiku if absent
- Add `local-only` as a fifth `ai.quality` value
- License check on the chosen model

Not part of M8 scope. Logged here so it's not lost.

## Cut list (explicitly NOT in this milestone)

- **Local model routing.** See "possible future extension" above. Not here.
- **Prompt-by-prompt model routing within a single stage.** Stage-level granularity is plenty. Per-prompt would be a rabbit hole.
- **A model-picker UI per stage.** One quality setting, three values. More knobs = decision fatigue.
- **Model routing for prose generation.** Storyline doesn't generate prose. Out of scope permanently.
- **Cross-provider routing** (GPT-4, Gemini, etc.). Stick to Claude — that's the harness's voice-tuning target.
- **A cost dashboard.** A single "estimated tokens / cost this session" line is the most we need.
- **Auto-detection of "this is a hard book"** to promote all stages. Writer uses `premium` if they want that. Don't guess.

## Definition of done (when this milestone eventually runs)

- `lib/ai/model-router.js` shipped, with the stage→model table and the confidence-check escalation
- `storyline config ai.quality` command works; default is `balanced`
- Per-stage model provenance in `state.json`
- Blind-pairing prove-it gate met on a real manuscript
- Cost reduction measured and documented
- `docs/engine-platform.md` updated with the routing architecture and the rule "stages 13 and 14 never downgrade from Opus without explicit user opt-in"

## Lessons learned

_To be filled in at milestone closure._
