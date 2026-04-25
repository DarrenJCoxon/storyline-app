# M1 — Core Architecture

## Goal

Repo, tooling, and all foundational infrastructure in place before any UI is built.
Every subsequent milestone builds on this — nothing ships until M1 is solid.

## Deliverables

### Repo scaffold

```
storyline-app/
├── extension/          # VS Code extension (Phase 1 shell)
│   ├── src/
│   │   ├── extension.ts
│   │   ├── ai/         # Provider abstraction + model router
│   │   ├── auth/       # Supabase session + credits
│   │   ├── planning/   # Ported core logic
│   │   └── panels/     # WebView panel registrations
│   └── webview/        # React + Vite UI
├── backend/
│   └── supabase/
│       ├── migrations/
│       └── functions/
├── packages/
│   └── core/           # @storyline/core (shared logic, private)
└── tauri/              # Phase 2 placeholder
```

### Supabase schema

```sql
create table profiles (
  id uuid references auth.users primary key,
  plan text default 'free',           -- free | starter | pro | byok
  credits_remaining int default 10,
  stripe_customer_id text,
  stripe_subscription_id text,
  byok boolean default false,
  created_at timestamptz default now()
);

create table credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  delta int not null,                 -- negative = spent, positive = granted
  reason text not null,               -- stage_save | subscription_renewal | signup_bonus
  stage_id text,
  model text,
  tokens_used int,
  created_at timestamptz default now()
);

-- RLS: users read/write only their own rows
alter table profiles enable row level security;
alter table credit_events enable row level security;
```

### Stripe products

- Free (no product — handled in Supabase only)
- Starter — £9/month recurring, 100 credits on renewal
- Pro — £19/month recurring, 300 credits on renewal
- BYOK — £5/month recurring, no credit allocation

### Edge functions

- `credits-deduct` — called after each stage save. Validates session, checks
  balance, inserts negative credit_event, returns new balance.
- `credits-topup` — called by stripe-webhook on `invoice.payment_succeeded`.
  Inserts positive credit_event per plan tier.
- `stripe-webhook` — handles subscription lifecycle: created, updated, deleted,
  payment succeeded/failed. Updates profiles.plan accordingly.

### AI provider abstraction

```typescript
interface AIProvider {
  id: string
  chat(
    messages: Message[],
    options: ChatOptions
  ): AsyncIterable<string>
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
1. `OpenRouterProvider` — managed subscription. API key server-side, routed
   through backend proxy or issued as short-lived scoped token.
2. `AnthropicProvider` — BYOK, direct Anthropic SDK.
3. `OpenAICompatProvider` — BYOK, covers Together.ai, LM Studio, OpenRouter
   with user's own key.
4. `OllamaProvider` — local. Calls `localhost:11434/v1/chat/completions`.

### Model router

```typescript
type Tier = 'light' | 'medium' | 'strong'

const STAGE_TIERS: Record<string, Tier> = {
  genre:         'light',
  premise:       'light',
  protagonist:   'medium',
  characters:    'light',
  relationships: 'light',
  logline:       'medium',
  beatSheet:     'medium',
  bStory:        'light',
  subplots:      'light',
  sceneOutline:  'medium',
  plotThreads:   'light',
  chapterOutline:'medium',
  critique:      'strong',
  masterDoc:     'strong',
}

const MANAGED_MODELS: Record<Tier, string> = {
  light:  'qwen/qwen3-30b-a3b',
  medium: 'deepseek/deepseek-chat-v3-0324',
  strong: 'anthropic/claude-haiku-4-5-20251001',
}
```

### CI

GitHub Actions on every push to `main` and all PRs:
- TypeScript typecheck (`tsc --noEmit`)
- Unit tests (`vitest run`)
- Extension package build (`vsce package --no-dependencies`)

## Technical tasks

- [ ] Init repo with agreed structure, TypeScript config, Vite config for webview
- [ ] Set up Supabase project, run initial migration
- [ ] Create Stripe products and configure webhook endpoint
- [ ] Implement `credits-deduct` edge function with test coverage
- [ ] Implement `credits-topup` edge function
- [ ] Implement `stripe-webhook` edge function
- [ ] Implement `AIProvider` interface + all four providers
- [ ] Implement model router
- [ ] Port `@storyline/core` from `storyline-vsc` lib/ (state, transitions,
      stage-guides, story-traps, coaching-personas)
- [ ] Write unit tests for all four providers (mock HTTP)
- [ ] Write unit tests for model router
- [ ] Set up GitHub Actions CI
- [ ] Document environment variables in `.env.example`

## Dependencies

None — this is the foundation.

## Success criteria

- `ai.chat()` streams correctly against all four providers in unit tests
- `credits-deduct` rejects when balance is 0
- `credits-deduct` succeeds and returns new balance when balance > 0
- Stripe webhook correctly tops up credits on `invoice.payment_succeeded`
- Supabase RLS verified: user A cannot read user B's credit_events
- CI passes on a clean clone with only `npm install`
