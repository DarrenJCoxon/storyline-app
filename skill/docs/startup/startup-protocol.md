# Novel Writer — Startup Protocol

## Purpose

When `/novel` is activated, this protocol runs first. Nothing else happens until startup is complete.

## Step 1: Check Project State

Run `nw next` to get the current project state as JSON.

```bash
nw next
```

Returns:
- `{ action: "init" }` — no project exists
- `{ complete: true, progress, action: "generate" }` — all stages done
- `{ complete: false, progress, currentStage, missingRequirements, gateBlocked }` — work in progress

## Step 2: Route by State

### New Project
If `action: "init"`:

1. Run `nw init` to create `.novel-writer/` and `state.json`
2. Run `nw next` again to confirm
3. Display:

```
Novel Writer — Save the Cat Planning Harness

Character-first. Beat-driven. Organically detects series potential.

Starting fresh — let's build your novel.
```

4. Begin Stage 1: Genre & Foundations

### Returning Project
If `currentStage` is returned:

1. Run `nw status` for the full stage breakdown
2. Display:

```
Novel Writer — Returning to [Project Title]

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
All planning stages complete! Run `nw generate` to create your master document.
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

The conversation is driven by you (the /novel skill), not by the CLI. Use `nw stage-info <stageId>` to get conversation guides, and `nw save <stageId> '<json>'` to persist data.

## CLI Commands Reference

| Command | Purpose |
|---------|---------|
| `nw init` | Set up `.novel-writer/` in current directory |
| `nw start` | Show current status and next action |
| `nw status` | Show progress and next recommended action |
| `nw stages` | List all 14 stages with completion status |
| `nw next` | Return next stage info as JSON (for skill) |
| `nw stage-info <stage>` | Return stage conversation guide as JSON |
| `nw save <stage> [json]` | Save stage data to state |
| `nw traps` | Run story trap detection |
| `nw checklist <stage>` | Run quality checklist for a stage |
| `nw revise <stage>` | Show downstream impacts for revision |
| `nw generate` | Output the master planning document |

## Startup Complete

Only after the appropriate message is displayed and the user confirms continuation should the actual planning begin. The conversation happens through you — the CLI is state-only.