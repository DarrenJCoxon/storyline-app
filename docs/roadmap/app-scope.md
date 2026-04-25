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

### Credit packs

The extension sends messages to **our backend proxy** (`POST /chat`).
The proxy validates the licence key, checks the writer's credit balance,
routes to the AI model, streams the response, then deducts credits.
Writers never interact with any AI provider directly — OpenRouter is a
backend implementation detail invisible to the extension and the writer.

The only credential the extension ever holds is the licence key.

```
Extension  →  POST /chat (licence key + messages)
                  ↓
           Our backend proxy (Cloudflare Worker)
                  ↓  validates key, checks credits, routes model
           OpenRouter / AI provider  (our master key, never exposed)
                  ↓  SSE stream
Extension  ←  streamed response  (credits deducted on completion)
```

### BYOK

Writers who bring their own API key call their chosen provider directly
from the extension. The backend is not involved in AI calls. The licence
key is used only to validate they have a software licence.

```
credit pack writers  →  our backend proxy (POST /chat)
BYOK Anthropic       →  Anthropic API direct
BYOK OpenAI-compat   →  Together / LM Studio / OpenRouter (their key)
BYOK local           →  Ollama (localhost:11434, no key)
```

### Model routing

Lives on the backend — we control it, we can change models without
an extension update.

| Model                       | Stages    | Our cost/full plan |
|-----------------------------|-----------|-------------------|
| deepseek/deepseek-v4-flash  | All 1–14  | ~$0.05            |

Single model for all stages. Flash matches Pro on every benchmark
relevant to creative planning (MMLU-Pro gap: 1.3 pts; SWE gap: 1.6 pts).
Pro's advantages are in factual recall and terminal tool use — neither
applies here. Routing config lives in the Worker; model can be changed
without touching the extension.

## Business model

| Tier    | Price      | AI access                        | Backend needed   |
|---------|------------|----------------------------------|------------------|
| Free    | £0         | Credits for one complete plan    | Proxy (free key) |
| Credits | £10 / £20  | ~6 / ~12 full book journeys      | Proxy            |
| BYOK    | £20/yr     | Their own key, unlimited         | Licence only     |

**Free tier:** enough credits to plan one complete book end-to-end
(all 14 stages, planning only). No card required. Writing mentor chat
requires a paid credit pack. One free allocation per installation.

**Credit packs:** bought once, no expiry, no subscription. Writers top
up when they run low. £10 buys roughly 6 complete book journeys at our
10× markup on AI cost (~$0.05/plan → $0.50 charged).

**BYOK:** annual software licence only. No AI costs to us. Writer
supplies their own API key and calls their provider directly.

## Backend (minimal)

One Cloudflare Worker with three routes:

- `POST /validate` — licence key → type + credit balance (no AI credentials)
- `POST /chat` — licence key + messages → streamed AI response (proxied)
- `POST /stripe-webhook` — payment events → credit top-up in KV

OpenRouter master API key stored as a Worker secret. Never in source
control, never sent to clients.

No user table. No session management. No auth system beyond the licence
key. Stripe handles one-time credit purchases; KV is the credit ledger.

## Design language

### Layout
Three columns: file explorer (left) · manuscript editor (centre) · planning
chat (right). UI chrome uses Inter throughout. Manuscript prose uses the
writer's chosen font — Serif or Sans — toggled from the editor toolbar.

### Theme
A three-button pill in the chat pane header switches modes instantly:

| Button | Behaviour |
|--------|-----------|
| ☀️ Light | Moleskine paper palette |
| 🌙 Dark | Near-black with warm grey text |
| 💻 System | Follows OS `prefers-color-scheme` |

Preference stored in `globalState` — survives restarts.

### Colour palette

**Dark mode**

| Zone | Background | Text |
|------|-----------|------|
| Activity bar | `#0D0D0D` | — |
| File sidebar | `#161616` | `#6A6866` |
| Editor | `#1C1C1C` | `#CCC8C0` |
| Chat pane | `#1A1A1A` | `#E8E6E1` |
| Stage rail | `#141414` | — |
| Input footer | `#111111` | — |

**Light mode — Moleskine paper**

| Zone | Background | Text |
|------|-----------|------|
| Activity bar | `#2A2A2A` | — |
| File sidebar | `#E8E7E4` | `#7A7875` |
| Editor | `#F7F6F4` | `#1E1C1A` |
| Chat pane | `#F2F1EF` | `#1E1C1A` |
| Stage rail | `#E9E8E5` | — |
| Input footer | `#E2E1DE` | — |

Activity bar stays dark in light mode — icon contrast requires it.

**Accent:** `#C9A84C` (dark) / `#B8922A` (light) — warm amber throughout.

### Typography

- **UI font:** Inter (labels, stage rail, chat, input hints)
- **Manuscript font:** Writer-selectable
  - *Serif* — Lora (default). Warm, traditional, suits long-form fiction.
  - *Sans* — Inter. Clean, contemporary.
  - Toggle sits in the editor toolbar. Preference stored in `globalState`.

### Chat pane details

- **User messages:** Rounded bubble — `#252525` (dark) / `#E6E4E0` (light),
  radius `16px 16px 3px 16px`, right-aligned
- **AI responses:** Free-flowing, no bubble, no background, left-aligned
- **Stage rail:** Collapsible — click the header to toggle open/closed.
  A smooth CSS transition slides the list. When collapsed, the active stage
  name appears inline in the header so the writer always knows where they are.
- **Input box:** Amber focus ring (`rgba(201,168,76,0.20)`), no border colour

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
