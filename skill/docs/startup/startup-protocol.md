# Storyline — Startup Protocol

## Purpose

When `/storyline` is activated, this protocol runs first. Nothing else happens until startup is complete.

## CLI invocation note

Storyline is distributed via npm under the package name **`storyline-cli`**. Users install it with `npx storyline-cli init` and do **not** get a global `storyline` binary on their PATH. Every CLI call you make in this skill must therefore go through `npx storyline-cli <subcommand>` — never bare `storyline ...`. The first call in a session may pause briefly while npm warms its cache; subsequent calls are instant.

## Step 1: Check Project State

Run `npx storyline-cli next` to get the current project state as JSON.

```bash
npx storyline-cli next
```

Returns:
- `{ action: "init" }` — no project exists
- `{ complete: true, progress, action: "generate" }` — all stages done
- `{ complete: false, progress, currentStage, missingRequirements, gateBlocked }` — work in progress

## Step 2: Route by State

### New Project
If `action: "init"`:

1. Run `npx storyline-cli init` to create `.storyline/` and `state.json`
2. Run `npx storyline-cli next` again to confirm
3. Display:

```
Storyline — Save the Cat Planning Harness

Character-first. Beat-driven. Organically detects series potential.

Starting fresh — let's build your novel.
```

4. Begin Stage 1: Genre & Foundations

### Returning Project
If `currentStage` is returned:

1. Run `npx storyline-cli status` for the full stage breakdown
2. Display:

```
Storyline — Returning to [Project Title]

Genre: [Genre] / [Sub-Genre]
Protagonist: [Name]
Target: [X]K words
Current Stage: [Stage Name]

[Show gate warnings if any]
[Show missing requirements if any]
```

3. Ask if they want to continue from where they left off, or jump to a specific stage

### Complete Project
If `complete: true`:

```
All planning stages complete! Run `npx storyline-cli generate` to create your master document.
```

## Step 3: Confirm Routing Mode

Run `npx storyline-cli config get ai.quality` and note the value (defaults to `balanced` if no config file exists yet — that's fine, no need to prompt).

Routing modes:

- `economy` — every stage shifted one tier down; no Opus escalation. Faster, less thorough critique.
- `balanced` — default. Haiku on capture stages, Sonnet on the middle, Opus on Stages 13 / 14.
- `premium` — all Sonnet stages promoted to Opus. Maximum critique depth.

The writer can change this mid-project with `npx storyline-cli config set ai.quality <mode>`. Don't surface this unless they ask — the default is the right default.

## Step 4: Begin Conversation

For new projects → Start Stage 1: Genre & Foundations

For returning projects → Continue from the current stage

The conversation is driven by you (the /storyline skill), not by the CLI. Use `npx storyline-cli stage-info <stageId>` to get conversation guides, and `npx storyline-cli save <stageId> '<json>'` to persist data.

## CLI Commands Reference

All commands are invoked as `npx storyline-cli <subcommand>`.

| Command | Purpose |
|---------|---------|
| `npx storyline-cli init` | Set up `.storyline/` in current directory |
| `npx storyline-cli start` | Show current status and next action |
| `npx storyline-cli status` | Show progress and next recommended action |
| `npx storyline-cli stages` | List all 14 stages with completion status |
| `npx storyline-cli next` | Return next stage info as JSON (for skill) |
| `npx storyline-cli stage-info <stage>` | Return stage conversation guide as JSON |
| `npx storyline-cli save <stage> [json]` | Save stage data to state |
| `npx storyline-cli traps` | Run story trap detection |
| `npx storyline-cli checklist <stage>` | Run quality checklist for a stage |
| `npx storyline-cli revise <stage>` | Show downstream impacts for revision |
| `npx storyline-cli generate` | Output the master planning document |
| `npx storyline-cli route <stage>` | Return `{ model, escalateOn, qualityMode }` for a stage — use at stage boundaries to pin subagent model |
| `npx storyline-cli record-model <stage> <model>` | Record which model handled critique for a stage |
| `npx storyline-cli config get/set ai.quality <mode>` | Read / change routing mode (economy / balanced / premium) |

## Startup Complete

Only after the appropriate message is displayed and the user confirms continuation should the actual planning begin. The conversation happens through you — the CLI is state-only.