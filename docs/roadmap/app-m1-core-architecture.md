# M1 — Core Architecture

## Goal

Repo, tooling, and all foundational infrastructure in place before any UI
is built. Every subsequent milestone builds on this.

## Storage model

All project data is local — `.storyline/state.json`, `manuscript/`, `docs/`,
`output/`. No cloud database. No sync. This is carried over from
`storyline-vsc` unchanged and is a core product strength.

The only remote infrastructure needed is a single serverless function for
subscription validation and a Stripe integration for billing.

## Deliverables

### Repo scaffold

```
storyline-app/
├── extension/                  # VS Code extension (Phase 1 shell)
│   ├── src/
│   │   ├── extension.ts
│   │   ├── ai/                 # Provider abstraction + model router
│   │   ├── auth/               # Licence key validation + SecretStorage
│   │   ├── planning/           # Ported core logic (@storyline/core)
│   │   └── panels/             # WebView panel registrations
│   └── webview/                # React + Vite UI
├── backend/                    # Single serverless function
│   ├── validate/               # Licence key → plan + OpenRouter key
│   └── stripe-webhook/         # Subscription lifecycle → KV store
├── packages/
│   └── core/                   # @storyline/core (shared logic, private)
└── tauri/                      # Phase 2 placeholder
```

### Backend (minimal)

One Cloudflare Worker (or Vercel Edge Function) with two routes:

**`POST /validate`**
```
Request:  { licenceKey: string }
Response: { valid: boolean, plan: 'starter' | 'pro' | 'byok', openrouterKey: string }
```
Looks up the licence key in KV store. If valid and subscription active,
returns a scoped OpenRouter API key for the plan tier. Called once on
extension activation; result cached in VS Code SecretStorage.

**`POST /stripe-webhook`**
Handles Stripe subscription events:
- `customer.subscription.created` → write `{ plan, valid: true, expires }` to KV
- `customer.subscription.deleted` → write `{ valid: false }` to KV
- `invoice.payment_failed` → write `{ valid: false }` to KV
- `invoice.payment_succeeded` → refresh `expires`, write `{ valid: true }` to KV

KV schema (Cloudflare KV key = licence key):
```json
{
  "plan": "starter",
  "valid": true,
  "expires": "2026-05-25T00:00:00Z",
  "stripeSubscriptionId": "sub_xxx",
  "openrouterKeyId": "key_xxx"
}
```

No user table. No auth. No session. Stripe is the subscription database.

### Stripe products

- Starter — £9/month recurring
- Pro — £19/month recurring
- BYOK — £5/month recurring (software licence only, no AI key provisioned)

Stripe Checkout used for all purchases. On `checkout.session.completed`,
the webhook generates a licence key, writes it to KV, and emails it to
the customer via Stripe's receipt.

### OpenRouter key provisioning

Each subscriber gets their own OpenRouter API key, provisioned via the
OpenRouter API at subscription time and stored in KV alongside the licence
entry. Monthly spend caps set per plan tier:

| Plan    | Monthly spend cap |
|---------|-------------------|
| Starter | $2.00             |
| Pro     | $5.00             |

If a writer hits their cap mid-month, OpenRouter rejects the key and the
extension shows "AI limit reached — resets on [date]". No additional
infrastructure needed.

### AI provider abstraction

```typescript
interface AIProvider {
  id: string
  chat(messages: Message[], options: ChatOptions): AsyncIterable<string>
  isAvailable(): Promise<boolean>
}

interface ChatOptions {
  model: string
  systemPrompt: string
  maxTokens?: number
  temperature?: number
}
```

Four implementations:
1. `OpenRouterProvider` — managed subscription. Uses the scoped key
   returned by `/validate` and cached in SecretStorage.
2. `AnthropicProvider` — BYOK, direct Anthropic SDK.
3. `OpenAICompatProvider` — BYOK, covers Together.ai, LM Studio,
   OpenRouter with the writer's own key.
4. `OllamaProvider` — local, calls `localhost:11434/v1/chat/completions`.

### Model router

```typescript
type Tier = 'light' | 'medium' | 'strong'

const STAGE_TIERS: Record<string, Tier> = {
  genre:          'light',
  premise:        'light',
  protagonist:    'medium',
  characters:     'light',
  relationships:  'light',
  logline:        'medium',
  beatSheet:      'medium',
  bStory:         'light',
  subplots:       'light',
  sceneOutline:   'medium',
  plotThreads:    'light',
  chapterOutline: 'medium',
  critique:       'strong',
  masterDoc:      'strong',
}

const MANAGED_MODELS: Record<Tier, string> = {
  light:  'qwen/qwen3-30b-a3b',
  medium: 'deepseek/deepseek-chat-v3-0324',
  strong: 'anthropic/claude-haiku-4-5-20251001',
}
```

### Licence key storage

Licence key and resolved OpenRouter key stored in VS Code SecretStorage
(encrypted, OS keychain). Validated on extension activation. If validation
fails (expired, cancelled), extension shows a re-subscribe prompt. No
periodic polling — validation only runs on activation and after the writer
explicitly re-enters a key.

### CI

GitHub Actions on every push to `main` and all PRs:
- TypeScript typecheck (`tsc --noEmit`)
- Unit tests (`vitest run`)
- Extension package build (`vsce package --no-dependencies`)

## Technical tasks

- [ ] Init repo with agreed structure, TypeScript + Vite config
- [ ] Set up Cloudflare Worker (or Vercel) project for the backend
- [ ] Implement `POST /validate` endpoint with KV lookup
- [ ] Implement `POST /stripe-webhook` with subscription lifecycle handling
- [ ] Set up Cloudflare KV (or Vercel KV) namespace
- [ ] Create Stripe products (Starter / Pro / BYOK)
- [ ] Wire Stripe Checkout → webhook → KV → licence key email
- [ ] Integrate OpenRouter key provisioning API at subscription time
- [ ] Implement `AIProvider` interface + all four providers
- [ ] Implement model router
- [ ] Port `@storyline/core` from `storyline-vsc` lib/ (state, transitions,
      stage-guides, story-traps, coaching-personas)
- [ ] Implement licence key validation in extension (SecretStorage cache)
- [ ] Write unit tests for all four providers (mock HTTP)
- [ ] Write unit tests for model router
- [ ] Write unit tests for `/validate` endpoint
- [ ] Set up GitHub Actions CI
- [ ] Document environment variables in `.env.example`

## Dependencies

None — this is the foundation.

## Success criteria

- `ai.chat()` streams correctly against all four providers in unit tests
- `/validate` returns a valid OpenRouter key for an active licence
- `/validate` returns `{ valid: false }` for an expired or unknown key
- Stripe webhook correctly updates KV on subscription created/cancelled
- OpenRouter spend cap is enforced (test with a capped key)
- Licence key survives VS Code restart (SecretStorage)
- CI passes on a clean clone with only `npm install`
