# Milestone 8 — Per-stage model routing inside the subscription

*Status: **CURRENT** — initial scaffolding landed; prove-it gate pending real-manuscript blind pairing.Parent: ../roadmap.mdLast updated: 2026-04-22*

## Outcome

A full Storyline planning run stays well inside the parent harness's subscription quota, runs faster on the trivial stages, and keeps deep-reasoning quality on Stages 13 and 14 — by routing each stage to the right Claude model (Haiku / Sonnet / Opus) rather than letting every stage burn whichever model the user's session happens to be on. No API keys, no per-token billing, no new providers. The routing lives inside the harness's native subagent primitive (Claude Code's Agent tool, with equivalents on OpenCode and Codex as those harnesses support it).

## Why this milestone exists

Storyline runs inside an agentic harness — Claude Code, OpenCode, or Codex — on the user's existing subscription. The planning conversation is conducted by the parent session's model. That means:

- **Every stage burns the same model.** If a writer is on Opus, Stage 1 (Genre & Foundations) and Stage 14 (Master Document) consume Opus capacity equally. Stage 1 doesn't need Opus. Stage 14 does. That's a waste of quota on one end and — if the writer is on Sonnet — a quality ceiling on the other.
- **Subscription caps are real.** Claude's Max plan has rolling 5-hour and weekly limits. A planning run that punches through a cap mid-Stage-13 is a genuinely bad writer experience. Pushing capture/bookkeeping stages to a Haiku subagent preserves the parent session's quota for the stages that actually need whole-book reasoning.
- **Speed matters on the cheap stages.** Stages 1, 2, 4, and 11 are structured capture — the writer types a short answer, the harness echoes it back, state gets written. On Haiku those round-trips are noticeably faster than on Sonnet/Opus. Feels like the harness has picked up pace.
- **Context hygiene.** Pushing "format this answer into the state schema" work into a subagent keeps the parent conversation's context focused on the story itself, not on JSON-shaping.

Stages 13 (Consistency & Critique) and 14 (Master Document) genuinely need reasoning across the entire project state at once. They are Opus work. The routing table makes that the rule, not a coincidence of what model the user happened to be running.

## Prove-it gate

All three must be true:

1. **Blind-pairing test on critique quality.** For a real manuscript's Stage 7 (Beat Sheet), Stage 13 (Consistency & Critique), and Stage 14 (Master Document), compare routed-subagent output against an all-Opus baseline without knowing which is which. Routed output must be rated **indistinguishable** from all-Opus on Stages 13 and 14. If it feels worse, the mapping is wrong — escalate the offending stage a tier and re-test.
2. **Quota preservation on a full run.** A full planning run of a real novel completes without hitting the subscription's rolling cap and forcing a pause. Measured indirectly: no subagent escalation should push the parent session above its typical single-sitting usage envelope. If routing fails to save quota compared to an all-parent-model run, the milestone has no reason to exist.
3. **Escalation path works silently.** When a Sonnet subagent's response fails the confidence check (see guardrails), the router retries on Opus without the writer noticing anything except "that critique was thorough." Zero surfaced errors.

Note: per-token dollar cost is not a prove-it criterion here — the subscription is flat-fee. The analogues are quota burn and latency.

## Routing policy

| Stage | Task character | Model |
| --- | --- | --- |
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

Rough split: 4 stages on Haiku, 9 on Sonnet, 2 on Opus (plus Stage 7 / Stage 10-critique escalations). The quota shape is dominated by Sonnet; Opus is surgical.

The mapping is subject to the prove-it gate — if the blind-pairing test shows any Sonnet stage producing weaker critique than Opus would, promote it. Don't defend the table, defend the outcome.

## Architecture

Routing happens *inside the skill*, not in the Node CLI. The CLI manages state; the parent harness conducts the conversation. Routing is a skill instruction that tells the parent, at stage boundaries, to delegate to a subagent pinned to a specific model.

```
skill/
├── SKILL.md                       (existing — conducts conversation in-chat)
└── docs/routing/
    ├── stage-model-map.md         (M8 — stage→model table, authoritative)
    └── confidence-check.md        (M8 — heuristic for escalation)

.storyline/config.json (new field)
{
  "ai": {
    "quality": "balanced"          // economy | balanced | premium
  }
}
```

### Subagent delegation per harness

- **Claude Code** — native Agent tool, `model: "haiku" | "sonnet" | "opus"` parameter. Subagent output is absorbed by the same subscription as the parent session. This is the primary implementation target.
- **OpenCode** — implement when/if OpenCode exposes an equivalent subagent-with-model-pinning primitive. Until then, stages run on whatever model the user's OpenCode session is using (no routing). Documented as a known gap, not a blocker.
- **Codex** — same as OpenCode. Implement when Codex has a parity primitive.

Harness-agnostic phrasing in the skill: *"At stage boundary, delegate critique to a subagent pinned to the model named in the routing table. If the harness does not support per-invocation model pinning, fall back to the parent session's model and note it in* `state.json` *provenance."*

### Quality modes

- `economy` — push one tier lower across the board (Haiku for structured, Sonnet ceiling; no Opus escalation). Clearly communicated to the writer: "critique will be faster but less thorough."
- `balanced` — the table above. Default.
- `premium` — promote all Sonnet stages to Opus. For writers who want maximum critique depth and have headroom in their subscription.

### Guardrails

- Every Sonnet critique subagent's response runs through a cheap heuristic check — specificity of beat references, presence of concrete revision suggestions vs. generic phrasing. Below threshold → silently retry on an Opus subagent for that call only. Log the escalation; surface a counter at stage-end ("2 of 8 critique points escalated to Opus").
- Per-stage model provenance written to `.storyline/state.json` so the writer (and we, during prove-it testing) can see which model produced which output, and whether the harness supported pinning or fell back.
- No new code path. Subagent invocation is a first-class harness primitive in Claude Code; M8 is skill instructions plus a config field plus the confidence-check heuristic.

## Dependencies

- Must land **after M1 proves itself** — the harness has to produce good plans end-to-end before we optimise routing of its critique calls.
- Should land **after M6 ships** so we're not tuning routing against a moving harness.
- No runtime dependencies. Uses Claude Code's existing Agent tool directly. OpenCode/Codex adapters deferred until those harnesses expose parity primitives.
- **Obsoletes lib/ai/openrouter-client.js**, which is already dead code imported only by lib/engine.js:79. That deletion is a housekeeping task for this milestone, not a separate one.

## Risks

**The mapping is a guess until it's tested.** The table above is judgement, not empirical. Stage 7 in particular is a hard call — Sonnet is usually enough for Save the Cat critique, but a writer working a genre subversion might need Opus. The escalation path is the safety valve; lean on it rather than arguing the table.

**Haiku being "good enough" for capture is also an assumption.** Haiku 4.5 is capable at structured tasks but has been observed producing subtle formatting drift on JSON state writes. Stage 1, 2, 4, 11 handlers must validate state-schema output before committing it — don't trust a Haiku subagent further than you'd trust Sonnet on the schema boundary.

**Confidence heuristics are fragile.** "Did this critique cite specific beats?" is a string-match test that can be gamed by a model generating beat names without substance. Keep it simple, accept false negatives (unnecessary Opus escalation) over false positives (weak critique that slips through). Re-tune after real use.

**Subagent-model pinning is Claude-Code-first.** OpenCode and Codex users get parent-model uniform behaviour until their harnesses expose equivalents. That's acceptable — document it, don't try to fake it.

**Subscription-cap behaviour during escalation.** If many stages escalate to Opus in one sitting, a Max-plan writer could still hit a rolling cap. The escalation counter surfaces this; if it's common, the fix is promoting the stage in the table rather than papering over with silent retries.

**Prompt tuning per model.** Haiku, Sonnet, and Opus respond differently to the same system prompt. Stage-boundary subagent briefs may need per-tier variants. Not a blocker but adds surface.

**"Why did you use the cheap model on my book?"** Writers will ask. Frame `balanced` honestly: Opus-grade critique on the stages that matter; cheaper-model subagents only where quality ceiling isn't the bottleneck. Per-stage provenance in `state.json` lets a curious writer verify.

## Cut list (explicitly NOT in this milestone)

- **Local model routing (Ollama, llama.cpp, etc).** Out. The subscription covers the stages that need cheap models via Haiku. Hardware concerns, install UX, drift — all avoided.
- **API-key / OpenRouter / Anthropic-API path.** Out. Storyline is a subscription-harness product. There is no per-token billing relationship to optimise.
- **Prompt-by-prompt routing within a stage.** Stage-level granularity is plenty.
- **Per-stage model-picker UI.** One quality setting, three values. More knobs = decision fatigue.
- **Routing for prose generation.** Storyline doesn't generate prose. Permanently out of scope.
- **Cross-provider routing** (GPT, Gemini, etc). Stick to Claude — it's the harness's voice-tuning target.
- **A cost/quota dashboard.** The escalation counter at stage-end is enough surface. Writers don't need a spend tracker.
- **Auto-detection of "this is a hard book"** to promote all stages. Writer uses `premium` if they want that. Don't guess.

## Definition of done (when this milestone eventually runs)

- Stage→model table and escalation rules documented in `skill/docs/routing/stage-model-map.md` and referenced from skill/SKILL.md.
- `storyline-vsc config ai.quality` command works; default is `balanced`.
- Claude Code implementation of subagent-delegated critique at every stage boundary, with confidence-check escalation on Stage 7 and Stage 10-critique.
- Per-stage model provenance in `state.json` (including "fell back to parent model" where applicable).
- Blind-pairing prove-it gate met on a real manuscript.
- Quota-preservation prove-it gate met on a full run.
- `lib/ai/openrouter-client.js` deleted and lib/engine.js:79 simplified (no longer routes through a dead module).
- `docs/engine-platform.md` updated with the routing architecture and the rule "Stages 13 and 14 never downgrade from Opus without explicit user opt-in (`economy` mode)."

## Lessons learned

*To be filled in at milestone closure.*