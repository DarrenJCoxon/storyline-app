# Storyline App — Scope & Product Overview

## What this is

A standalone consumer product derived from `storyline-vsc`. Where `storyline-vsc`
targets writers who already use Claude Code, Codex, or OpenCode, Storyline App
removes the AI harness dependency entirely and ships as a self-contained VS Code
extension (Phase 1) and eventually a true desktop app (Phase 2, Tauri).

Writers install one thing, sign up or enter an API key, and plan their book.
No terminal. No coding agent. No configuration.

## Storage model

**Everything stays local — this is a feature, not a limitation.**

The file-based model from `storyline-vsc` is carried over unchanged:

```
your-project/
├── .storyline/
│   └── state.json          ← all planning state, owned by the writer
├── manuscript/
│   └── chapter-01.md       ← prose, owned by the writer
├── docs/
│   └── chapters/           ← chapter cards, generated on save
├── output/                 ← compiled EPUBs and PDFs
└── compile.config.json
```

Writers own their data. It lives on their machine. It works offline (except
for AI calls). There is no sync, no cloud database, no account required to
open a project. The VS Code file browser is the navigation layer — exactly
as in `storyline-vsc`.

## Repo

`storyline-app` — cloned from `storyline-vsc` at v1.3.5, then diverges.

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
The writer can draft prose in the centre and glance right to see exactly
where they are in the planning process.

## AI integration

The planning conversation runs directly from the extension — no Claude Code
skill system. The extension builds a system prompt from the stage guides,
maintains turn history, streams AI responses, and saves state on stage
completion (to local `state.json`).

### Provider abstraction

```
managed subscription  → OpenRouter (multi-model, single API key server-side)
BYOK Anthropic        → Anthropic API direct
BYOK OpenAI-compat    → Together / OpenRouter / LM Studio / any compatible endpoint
BYOK local            → Ollama (localhost:11434)
```

BYOK users: zero backend. Key stored in VS Code SecretStorage. AI called
directly. Nothing touches a server.

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

| Plan    | Price   | AI access          | Backend needed |
|---------|---------|--------------------|----------------|
| Starter | £9/mo   | Managed OpenRouter | Licence key    |
| Pro     | £19/mo  | Managed OpenRouter | Licence key    |
| BYOK    | £5/mo   | Their own key      | Licence key    |
| Free    | £0      | 10 free AI calls   | None           |

Stripe handles all subscription state. A single serverless function validates
licence keys and provisions scoped OpenRouter keys. No database of our own.

## Backend (minimal)

One serverless function (Cloudflare Worker or Vercel Edge Function):

- `POST /validate` — given a licence key, returns: valid/invalid, plan tier,
  and a scoped OpenRouter API key (monthly spend-capped per tier)

Stripe webhooks update a simple KV store (Cloudflare KV or Vercel KV) when
subscriptions are created, renewed, or cancelled. The KV store maps
`licence_key → { plan, valid, expires }`. That's it.

No user table. No session management. No auth system. Stripe is the
subscription database.

## Design language

- **Layout:** Sans-serif throughout (Inter). User messages in rounded bubbles,
  AI responses free-flowing (no bubble). Stage rail top of chat pane.
- **Light mode:** `#F5F3EF` background, `#1C1C1E` text
- **Dark mode:** `#1A1A1A` background, `#E8E6E1` text
- **Accent:** `#C9A84C` (warm amber — consistent across both modes)
- **Input box:** Shadow on focus, no border colour

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
