# M1 — Core Architecture

## Goal

Repo, tooling, and all foundational infrastructure in place before any UI
is built. Every subsequent milestone builds on this.

## Storage model

All project data is local — `.storyline/state.json`, `manuscript/`, `docs/`,
`output/`. No cloud database. No sync. This is carried over from
`storyline-vsc` unchanged and is a core product strength.

The only remote infrastructure needed is a small backend proxy that handles
managed AI calls and validates licences. Writers never interact with it
directly and never see any AI provider credentials.

## Deliverables

### Repo scaffold

```
storyline-app/
├── extension/                  # VS Code extension (Phase 1 shell)
│   ├── src/
│   │   ├── extension.ts
│   │   ├── ai/                 # Provider abstraction + model router
│   │   ├── auth/               # Licence key + SecretStorage
│   │   ├── planning/           # Ported core logic (@storyline/core)
│   │   └── panels/             # WebView panel registrations
│   └── webview/                # React + Vite UI
├── backend/                    # Cloudflare Worker (or Vercel Edge)
│   ├── src/
│   │   ├── validate.ts         # Licence key → plan info
│   │   ├── chat.ts             # Streaming AI proxy
│   │   └── stripe-webhook.ts   # Subscription lifecycle → KV
│   └── wrangler.toml
├── packages/
│   └── core/                   # @storyline/core (shared logic, private)
└── tauri/                      # Phase 2 placeholder
```

### Backend (Cloudflare Worker)

Three routes. The master OpenRouter API key lives as a Worker secret —
it never leaves the server and is never sent to the extension.

---

**`POST /validate`**
```
Request:  { licenceKey: string }
Response: { valid: boolean, plan: 'starter' | 'pro' | 'byok' }
```
Looks up the licence key in KV. Returns plan info only — no AI keys,
no tokens. Called once on extension activation; result cached in
`globalState`. If offline, uses the last cached result.

---

**`POST /chat`** ← the key endpoint
```
Request:  {
  licenceKey: string,
  messages:   Message[],
  stageId:    string
}
Response: SSE stream of text chunks
```
This is how managed AI calls work:

1. Validate licence key against KV (fast — in-memory cache in the Worker)
2. Check plan is active and not rate-limited
3. Route to correct model based on `stageId`:
   - `deepseek/deepseek-v4-flash` — all stages except critique and masterDoc
   - `deepseek/deepseek-v4-pro` — Stage 13 (Consistency & Critique) and Stage 14 (Master Document)
4. Call OpenRouter with the master API key (Worker secret)
5. Stream the response back to the extension via SSE

The extension knows nothing about OpenRouter or which model was used. It sends
messages and receives a stream. Model assignments can change without any
extension update — routing lives entirely on the server.

---

**`POST /stripe-webhook`**
Handles Stripe subscription events — updates KV accordingly:
- `customer.subscription.created` → `{ plan, valid: true, expires }`
- `customer.subscription.deleted` / `invoice.payment_failed` → `{ valid: false }`
- `invoice.payment_succeeded` → refresh `expires`, `valid: true`

---

KV schema (key = licence key):
```json
{
  "plan": "starter",
  "valid": true,
  "expires": "2026-05-25T00:00:00Z",
  "stripeSubscriptionId": "sub_xxx",
  "callsThisMonth": 47,
  "monthResets": "2026-05-01T00:00:00Z"
}
```

`callsThisMonth` is incremented on each `/chat` request. If it exceeds
the plan limit the Worker returns `429` and the extension shows "AI limit
reached — resets on [date]". No spend cap logic delegated to OpenRouter —
we own the rate limiting.

### Stripe products

- Starter — £9/month recurring
- Pro — £19/month recurring
- BYOK — £5/month recurring (software licence only — `/chat` not used)

On `checkout.session.completed`: webhook generates a licence key, writes
to KV, emails it to the customer via Stripe's receipt.

### Plan limits

| Plan    | AI calls/month | Model routing    |
|---------|---------------|------------------|
| Starter | 200           | light/medium/strong |
| Pro     | 600           | light/medium/strong (priority) |

200 calls is ~14 full book plans. Writers rarely hit it.

### AI provider abstraction (extension-side)

```typescript
interface AIProvider {
  id: string
  chat(messages: Message[], options: ChatOptions): AsyncIterable<string>
  isAvailable(): Promise<boolean>
}
```

Two implementations for the extension:

1. **`ManagedProvider`** — calls `POST /chat` on our backend with the
   licence key. Receives SSE stream. Knows nothing about OpenRouter.

2. **`BYOKProvider`** — calls the writer's own AI provider directly
   (Anthropic / OpenAI-compatible / Ollama). Licence key is used only
   for plan validation, not for AI calls.

The model router lives **on the backend** for managed subscribers
(so we can change models without an extension update). For BYOK,
a client-side router applies using the writer's chosen provider.

### Licence key storage

Licence key stored in VS Code SecretStorage (OS keychain-backed).
That is the only credential the extension ever holds. No AI keys,
no tokens, no OpenRouter references anywhere in the extension code.

### CI

GitHub Actions on every push to `main` and all PRs:
- TypeScript typecheck (`tsc --noEmit`)
- Unit tests (`vitest run`)
- Extension package build (`vsce package --no-dependencies`)
- Worker build + type check (`wrangler deploy --dry-run`)

## Technical tasks

- [ ] Init repo with agreed structure, TypeScript + Vite config
- [ ] Set up Cloudflare Worker project (`wrangler init`)
- [ ] Set up Cloudflare KV namespace (production + preview)
- [ ] Implement `POST /validate` with KV lookup
- [ ] Implement `POST /chat` with SSE streaming proxy to OpenRouter
- [ ] Implement per-licence call counting in KV
- [ ] Implement `POST /stripe-webhook` with full subscription lifecycle
- [ ] Store OpenRouter master key as Worker secret (`wrangler secret put`)
- [ ] Implement server-side model routing (stageId → flash or pro; config in Worker)
- [ ] Create Stripe products (Starter / Pro / BYOK)
- [ ] Wire Stripe Checkout → webhook → KV → licence key email
- [ ] Implement `ManagedProvider` in extension (SSE consumer)
- [ ] Implement `BYOKProvider` in extension (direct API call)
- [ ] Implement `OllamaProvider` in extension (local, no key needed)
- [ ] Port `@storyline/core` from `storyline-vsc` lib/
- [ ] Implement licence key validation in extension (SecretStorage)
- [ ] Write unit tests for `/validate` and `/chat` endpoints
- [ ] Write unit tests for `ManagedProvider` and `BYOKProvider`
- [ ] Set up GitHub Actions CI
- [ ] Document environment variables in `.env.example`

## Dependencies

None — this is the foundation.

## Success criteria

- `POST /chat` streams a valid response for an active licence key
- `POST /chat` returns 401 for an invalid or expired licence key
- `POST /chat` returns 429 when the monthly call limit is exceeded
- `POST /validate` returns correct plan info, no AI keys in the response
- Stripe webhook correctly updates KV on all subscription events
- OpenRouter API key does not appear anywhere in extension source,
  bundle, or SecretStorage — verified by grep on the built extension
- Licence key survives VS Code restart (SecretStorage)
- CI passes on a clean clone with only `npm install`
