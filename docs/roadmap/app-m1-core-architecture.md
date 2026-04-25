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
Response: { valid: boolean, type: 'credits' | 'byok' | 'free', creditBalance: number }
```
Looks up the licence key in KV. Returns type and current credit balance —
no AI keys, no tokens. Called once on extension activation; result cached
in `globalState`. If offline, uses the last cached result.

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
2. Check credit balance > 0; return `402` if exhausted
3. Route to `deepseek/deepseek-v4-flash` for all stages (config in Worker env)
4. Call OpenRouter with the master API key (Worker secret)
5. Stream the response back to the extension via SSE
6. On stream completion, deduct credits from KV balance

The extension knows nothing about OpenRouter or which model was used. It sends
messages and receives a stream. The model can be changed without touching the
extension — routing config lives entirely in the Worker.

---

**`POST /stripe-webhook`**
Handles Stripe payment events — tops up credit balance in KV:
- `checkout.session.completed` → generate licence key, write initial
  credit balance to KV, email key to customer via Stripe receipt
- `payment_intent.succeeded` (top-up) → add credits to existing balance

No subscription events. No expiry. Credits don't expire.

---

KV schema (key = licence key):
```json
{
  "type": "credits",
  "valid": true,
  "creditBalance": 950,
  "totalPurchased": 1000,
  "stripeCustomerId": "cus_xxx"
}
```

Free tier keys use `type: "free"` with a fixed starting balance sufficient
for one complete 14-stage plan. Free balance cannot be topped up — writer
must purchase a credit pack to continue beyond planning.

BYOK keys use `type: "byok"` — `/chat` is never called, balance irrelevant.

`creditBalance` is decremented on each completed `/chat` stream. If balance
reaches 0 the Worker returns `402` and the extension shows "Credits
exhausted — top up to continue".

### Stripe products

- **Credits £10** — one-time payment, adds credit balance to KV
- **Credits £20** — one-time payment, adds credit balance to KV (bulk)
- **BYOK licence** — £20/year recurring (software only, no AI proxy used)

On `checkout.session.completed`: webhook generates a licence key, writes
credit balance to KV, emails key to the customer via Stripe's receipt.
Top-up purchases for existing keys look up the existing KV record by
`stripeCustomerId` and increment `creditBalance`.

### Credit balance

| Tier        | Starting balance | Approx book journeys |
|-------------|-----------------|----------------------|
| Free        | One full plan   | 1 (planning only)    |
| £10 pack    | 1,000 credits   | ~6 complete journeys |
| £20 pack    | 2,200 credits   | ~13 complete journeys|
| BYOK        | n/a             | Unlimited (own key)  |

One full 14-stage plan costs ~160 credits (our AI cost ~$0.05, writer
charged ~$0.50 at 10× markup). Writing mentor chat draws from the same
balance at the same rate.

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
- [ ] Implement `POST /validate` with KV lookup (returns type + creditBalance)
- [ ] Implement `POST /chat` with SSE streaming proxy to OpenRouter
- [ ] Implement credit balance check and post-stream deduction in KV
- [ ] Implement `POST /stripe-webhook` for one-time payments and top-ups
- [ ] Store OpenRouter master key as Worker secret (`wrangler secret put`)
- [ ] Implement server-side model routing (Flash for all stages; env config)
- [ ] Create Stripe products (Credits £10 / Credits £20 / BYOK annual)
- [ ] Wire Stripe Checkout → webhook → KV → licence key email
- [ ] Implement top-up flow: existing customer → look up by stripeCustomerId → increment balance
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

- `POST /chat` streams a valid response when credit balance > 0
- `POST /chat` returns `401` for an invalid licence key
- `POST /chat` returns `402` when credit balance is exhausted
- `POST /validate` returns correct type and creditBalance, no AI keys
- Credit balance decrements correctly after each completed stream
- Stripe webhook correctly provisions free, £10, and £20 credit balances
- Top-up correctly increments an existing balance without overwriting
- Free tier balance is capped — cannot be topped up via webhook
- OpenRouter API key does not appear anywhere in extension source,
  bundle, or SecretStorage — verified by grep on the built extension
- Licence key survives VS Code restart (SecretStorage)
- CI passes on a clean clone with only `npm install`
