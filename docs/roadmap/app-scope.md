# Storyline App — Scope & Product Overview

## What this is

A standalone consumer product derived from `storyline-vsc`. Where `storyline-vsc`
targets writers who already use Claude Code, Codex, or OpenCode, Storyline App
removes the AI harness dependency entirely and ships as a self-contained VS Code
extension (Phase 1) and eventually a true desktop app (Phase 2, Tauri).

Writers install one thing, sign up or enter an API key, and plan their book.
No terminal. No coding agent. No configuration.

## Repo

`storyline-app` — cloned from `storyline-vsc` at the point of fork, then diverges.

Shared planning logic (`lib/state`, `lib/ai/stage-guides`, `lib/ai/story-traps`,
`lib/ai/coaching-personas`) is copied at fork time and extracted into a private
`@storyline/core` npm package once both products have settled.

## The three-column layout

```
┌─────────┬──────────────────────┬────────────────────┐
│  Files  │   Writing Pane       │   Planning Chat    │
│         │   (TipTap editor)    │   (AI + stage rail)│
└─────────┴──────────────────────┴────────────────────┘
```

Files left, editor centre, planning chat right (VS Code secondary sidebar).
This is the core UX — a writer can draft prose in the centre and glance right
to see exactly where they are in the planning process.

## AI integration

The planning conversation runs directly from the extension — no Claude Code skill
system. The extension builds a system prompt from the stage guides, maintains
turn history, streams AI responses, and saves state on stage completion.

### Provider abstraction

```
managed subscription  → OpenRouter (multi-model, single API key server-side)
BYOK Anthropic        → Anthropic API direct
BYOK OpenAI-compat    → Together / OpenRouter / LM Studio / any compatible endpoint
BYOK local            → Ollama (localhost:11434)
```

### Model routing

Stage-aware: cheap models for conversational turns, stronger models for critique
and master document generation.

| Tier   | Managed model                        | Approx cost/stage |
|--------|--------------------------------------|-------------------|
| Light  | qwen/qwen3-30b-a3b (OpenRouter)      | ~$0.003           |
| Medium | deepseek/deepseek-chat-v3-0324       | ~$0.005           |
| Strong | anthropic/claude-haiku-4-5           | ~$0.015           |

Full 14-stage plan end-to-end: ~$0.05–0.10 in API costs.

## Business model

| Plan    | Price   | Credits/month | AI cost/month | Margin  |
|---------|---------|---------------|---------------|---------|
| Free    | £0      | 10 lifetime   | ~£0.05        | —       |
| Starter | £9/mo   | 100/mo        | ~£0.50        | ~£8.50  |
| Pro     | £19/mo  | 300/mo        | ~£1.50        | ~£17.50 |
| BYOK    | £5/mo   | unlimited     | £0            | ~£5.00  |

1 credit = 1 planning stage saved. Credits reset monthly on subscription plans.

## Design language

- **Layout:** Sans-serif throughout (Inter). User messages in rounded bubbles,
  AI responses free-flowing (no bubble). Stage rail top of chat pane.
- **Light mode:** `#F5F3EF` background, `#1C1C1E` text
- **Dark mode:** `#1A1A1A` background, `#E8E6E1` text
- **Accent:** `#C9A84C` (warm amber — consistent across both modes)
- **Input box:** Shadow on focus, no border colour (clean, writing-tool feel)

## Milestones

| Milestone | Focus                          | Phase |
|-----------|--------------------------------|-------|
| M1        | Core architecture              | 1     |
| M2        | Chat pane                      | 1     |
| M3        | Onboarding                     | 1     |
| M4        | Three-column layout + editor   | 1     |
| M5        | Compile pipeline               | 1     |
| M6        | Polish + beta                  | 1     |
| M7        | Tauri desktop app              | 2     |
