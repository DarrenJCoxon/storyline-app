# Stage → model routing map

This is the authoritative table the `/storyline` skill uses at stage boundaries. It maps each planning stage to the Claude model that should handle that stage's critique subagent. The skill fetches the live routing via `npx storyline-vsc route <stageId>` — that CLI call factors in the current `ai.quality` setting and returns `{ model, escalateOn }`. This doc explains the rationale.

## Why route at all on a subscription plan

Storyline runs inside a subscription harness (Claude Code / OpenCode / Codex). The parent session's model handles every turn of the conversation. Without routing, Stage 1 (Genre) burns the same model as Stage 14 (Master Document). That is either wasteful (writer on Opus spending Opus quota on structured capture) or quality-limited (writer on Sonnet missing out on whole-book reasoning at critique time). Routing pushes capture/bookkeeping work to Haiku subagents and reserves Opus for the two stages that genuinely need whole-book reasoning.

## The map (quality mode: `balanced`, default)

| Stage | Stage id | Task character | Model |
| --- | --- | --- | --- |
| 1 Genre & Foundations | `genre` | Structured capture, known taxonomy | **Haiku** |
| 2 Story Seed & Premise | `premise` | Question phrasing + echo | **Haiku** |
| 3 Protagonist Deep Dive | `protagonist` | Character nuance, backstory | Sonnet |
| 4 Supporting Cast | `characters` | Schema capture, light reasoning | **Haiku** |
| 5 Relationship Web | `relationships` | Multi-character consistency | Sonnet |
| 6 Logline Refinement | `logline` | Compression + judgement | Sonnet |
| 7 Beat Sheet | `beatSheet` | Save the Cat structural validation | Sonnet (→ Opus on escalation) |
| 8 B Story | `bStory` | Thematic-link reasoning | Sonnet |
| 9 Subplots | `subplots` | Thread interaction | Sonnet |
| 10 Scene Outline (pass 1) | `sceneOutline` | High-level outline generation | Sonnet |
| 10 Scene Outline (critique) | `sceneOutline:critique` | Outline validation | Sonnet (→ Opus on escalation) |
| 11 Plot Thread Registry | `plotThreads` | Bookkeeping | **Haiku** |
| 12 Chapter Flesh-Out | `chapterOutline` | Bounded expansion, two-pass | Sonnet |
| **13 Consistency & Critique** | `critique` | **Whole-book cross-stage reasoning** | **Opus** |
| **14 Master Document** | `masterDoc` | **Full synthesis of 13 stages** | **Opus** |

## Quality modes

Set via `npx storyline-vsc config set ai.quality <mode>`. Stored in `.storyline/config.json`.

- `economy` — every tier shifted down by one. Haiku capture stages become Haiku still (floor), Sonnet stages become Haiku, Opus stages become Sonnet. No escalation on Stage 7 / Stage 10-critique. Use when the writer wants speed and does not need deep critique.
- `balanced` — the table above. Default.
- `premium` — all Sonnet stages promoted to Opus. Haiku capture stages stay on Haiku (schema-shaping doesn't benefit from Opus). Use when the writer has headroom and wants maximum critique depth.

## Stage-boundary delegation pattern (for the skill)

Routing is delivered via three **named pre-configured subagents** installed by `storyline init` into `<project>/.claude/agents/`:

- `storyline-critic-haiku` (model: haiku)
- `storyline-critic-sonnet` (model: sonnet)
- `storyline-critic-opus` (model: opus)

The model is pinned inside each agent's frontmatter — the skill invokes by name; it does not pass a model parameter and does not call the generic `general-purpose` subagent. This is the pattern that actually works because the parent sees named specialists in its tool list, not a generic subagent it can choose to skip.

At every stage boundary:

1. Run `npx storyline-vsc route <stageId>` and parse `{ subagentType, escalateSubagentType, qualityMode, model }` from stdout.
2. **Invoke the named subagent via the Task tool**, passing `subagent_type: <routed subagentType>`. Brief it with the stage's critique context — a snapshot of the relevant state (via `npx storyline-vsc status` / `stage-info`) plus the stage guide. The agent's own system prompt already defines its output format, scope, and identity line (every reply begins with `MODEL: <tier>` for verification).
3. When the subagent returns, run the confidence check (see `confidence-check.md`). If `escalateSubagentType` is set and the check fails, invoke the Task tool a second time with `subagent_type: "storyline-critic-opus"` and the same brief, and use that output instead.
4. Record provenance: `npx storyline-vsc record-model <stageId> <modelReported> [--escalated]`. `<modelReported>` is the value on the subagent's `MODEL:` line. This writes `state.modelProvenance[stageId]` so the writer (and future prove-it tests) can see which model produced which critique.
5. Render the critique back into the conversation as normal.

## Harness support

- **Claude Code** — the Task tool resolves named subagents from `<project>/.claude/agents/*.md` directly. This is the primary target and how the agents are designed to be used.
- **OpenCode / Codex** — if the harness doesn't support named-subagent resolution in the same way, the skill should fall back to the parent session's model and record with `--fallback`. No behaviour change for the writer; routing silently degrades.

## Do not argue the table — argue the outcome

If blind-pairing reveals a Sonnet stage producing weaker critique than Opus would on a real manuscript, promote that stage in `lib/ai/model-router.js`. This doc follows the code, not the other way round.
