# Storyline — Startup Protocol

## Purpose

When `/storyline` is activated, this protocol runs first. Nothing else happens until startup is complete.

## Step 1: Check Project State

Run `storyline next` to get the current project state as JSON.

```bash
storyline next
```

Returns:
- `{ action: "init" }` — no project exists
- `{ complete: true, progress, action: "generate" }` — all stages done
- `{ complete: false, progress, currentStage, missingRequirements, gateBlocked }` — work in progress

## Step 2: Route by State

### New Project
If `action: "init"`:

1. Run `storyline init` to create `.storyline/` and `state.json`
2. Run `storyline next` again to confirm
3. Display:

```
Storyline — Save the Cat Planning Harness

Character-first. Beat-driven. Organically detects series potential.

Starting fresh — let's build your novel.
```

4. Begin Stage 1: Genre & Foundations

### Returning Project
If `currentStage` is returned:

1. Run `storyline status` for the full stage breakdown
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
All planning stages complete! Run `storyline generate` to create your master document.
```

## Step 3: Check Environment

Check if `OPENROUTER_API_KEY` is set in `.env`:

```bash
node -e "
import('fs').then(fs => {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf-8');
    const hasKey = env.includes('OPENROUTER_API_KEY=') && !env.match(/OPENROUTER_API_KEY=\s*$/);
    console.log('ENV_CHECK:' + (hasKey ? 'CONFIGURED' : 'MISSING'));
  } else {
    console.log('ENV_CHECK:NO_ENV');
  }
})
"
```

If `ENV_CHECK:MISSING` or `ENV_CHECK:NO_ENV`:

```
AI critique is available once you set OPENROUTER_API_KEY in .env
Copy .env.example to .env and add your key from openrouter.ai/keys
Rule-based checks are active regardless.
```

## Step 4: Begin Conversation

For new projects → Start Stage 1: Genre & Foundations

For returning projects → Continue from the current stage

The conversation is driven by you (the /storyline skill), not by the CLI. Use `storyline stage-info <stageId>` to get conversation guides, and `storyline save <stageId> '<json>'` to persist data.

## CLI Commands Reference

| Command | Purpose |
|---------|---------|
| `storyline init` | Set up `.storyline/` in current directory |
| `storyline start` | Show current status and next action |
| `storyline status` | Show progress and next recommended action |
| `storyline stages` | List all 14 stages with completion status |
| `storyline next` | Return next stage info as JSON (for skill) |
| `storyline stage-info <stage>` | Return stage conversation guide as JSON |
| `storyline save <stage> [json]` | Save stage data to state |
| `storyline traps` | Run story trap detection |
| `storyline checklist <stage>` | Run quality checklist for a stage |
| `storyline revise <stage>` | Show downstream impacts for revision |
| `storyline generate` | Output the master planning document |

## Startup Complete

Only after the appropriate message is displayed and the user confirms continuation should the actual planning begin. The conversation happens through you — the CLI is state-only.