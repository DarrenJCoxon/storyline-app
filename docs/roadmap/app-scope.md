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

## The three-column layout

```
┌─────────┬──────────────────────┬────────────────────┐
│  Files  │   Writing Pane       │   Planning Chat    │
│         │   (TipTap editor)    │   (AI + stage rail)│
└─────────┴──────────────────────┴────────────────────┘
```

Files left, editor centre, planning chat right (VS Code secondary sidebar).

## AI integration

### Managed subscription

The extension sends messages to **our backend proxy** (`POST /chat`).
The proxy validates the licence key, routes to the appropriate AI model,
and streams the response back. Writers never interact with any AI
provider directly — OpenRouter (or any future provider) is a backend
implementation detail invisible to the extension and to the writer.

The only credential the extension ever holds is the licence key.

```
Extension  →  POST /chat (licence key + messages)
                  ↓
           Our backend proxy (Cloudflare Worker)
                  ↓  validates licence, routes model
           OpenRouter / AI provider  (our master key, never exposed)
                  ↓  SSE stream
Extension  ←  streamed response
```

### BYOK

Writers who bring their own API key call their chosen provider directly
from the extension. The backend is not involved in AI calls. The licence
key is used only to validate they have a software licence.

```
managed subscription  →  our backend proxy (POST /chat)
BYOK Anthropic        →  Anthropic API direct
BYOK OpenAI-compat    →  Together / LM Studio / OpenRouter (their key)
BYOK local            →  Ollama (localhost:11434, no key)
```

### Model routing

Lives on the backend for managed subscribers — we control it, we can
change models without an extension update.

| Tier   | Current model                        | Approx cost/call |
|--------|--------------------------------------|------------------|
| Light  | qwen/qwen3-30b-a3b                   | ~$0.003          |
| Medium | deepseek/deepseek-chat-v3-0324       | ~$0.005          |
| Strong | anthropic/claude-haiku-4-5           | ~$0.015          |

Full 14-stage plan end-to-end: ~$0.05–0.10 in API costs.

## Business model

| Plan    | Price   | AI access             | Backend needed       |
|---------|---------|-----------------------|----------------------|
| Starter | £9/mo   | 200 calls/mo via proxy| Licence + proxy      |
| Pro     | £19/mo  | 600 calls/mo via proxy| Licence + proxy      |
| BYOK    | £5/mo   | Their own key, direct | Licence only         |
| Free    | £0      | 10 calls via proxy    | None (hardcoded key) |

200 calls = ~14 complete book plans. Most Starter writers never hit the limit.

## Backend (minimal)

One Cloudflare Worker with three routes:

- `POST /validate` — licence key → plan info (no AI credentials returned)
- `POST /chat` — licence key + messages → streamed AI response (proxied)
- `POST /stripe-webhook` — subscription lifecycle → KV store

OpenRouter master API key stored as a Worker secret. Never in source
control, never sent to clients.

No user table. No session management. No auth system beyond the licence
key. Stripe is the subscription database.

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
