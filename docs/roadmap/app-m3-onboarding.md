# M3 — Onboarding

## Goal

A new writer installs the extension and reaches a live planning conversation
within 3 minutes. No docs, no terminal, no configuration file to edit.

## Activation model

**BYOK writers:** no backend, no account, no licence key. Enter key → start.

**Managed subscription writers:** buy via Stripe → receive licence key by
email → enter key once in the extension → validated against the serverless
function → scoped OpenRouter key cached in SecretStorage → start.

The extension never asks for an email address or password. The licence key
is the credential.

## Deliverables

### First-run detection

On extension activation, check:
1. No `.storyline/state.json` in the open workspace — new project
2. No licence key or BYOK key found in VS Code SecretStorage — not set up

If either condition is true, open the OnboardingPanel.

### OnboardingPanel flow

```
Welcome → Choose Plan → Setup → New Project → [ChatPanel opens]
```

**Screen 1: Welcome**
- Storyline wordmark + tagline ("Plan your book. Write your story.")
- Two primary CTAs: "Subscribe" / "Bring your own key"
- "What is this?" expander (one-paragraph explainer)

**Screen 2a: Subscribe**
- Plan cards — Starter (£9/mo) / Pro (£19/mo)
- "Continue free" link below (10 free AI calls, no card required)
- On plan select: opens Stripe Checkout in system browser
- After payment: Stripe sends licence key by email
- Writer pastes licence key into field: "Enter your licence key"
- Extension calls `POST /validate`, receives scoped OpenRouter key,
  stores both in SecretStorage
- Advances to Screen 3

**Screen 2b: BYOK**
- Provider dropdown: Anthropic / OpenAI-compatible / Ollama (local)
- API key input (stored in SecretStorage, never logged or transmitted)
- For Ollama: base URL field (`http://localhost:11434`), no key needed
- "Test connection" — fires a minimal chat request, shows ✓ or specific error
- On success: advances to Screen 3

**Screen 3: New Project**
- Project name (defaults to workspace folder name)
- Optional genre hint ("What kind of book?" — seeds Stage 1)
- "Create project" button
- Scaffolds `.storyline/state.json`, `output/`, `docs/chapters/`, `manuscript/`
- All local writes — no network call

After Screen 3: OnboardingPanel closes, ChatPanel opens at Stage 1.

### Licence key storage

Both the licence key and the resolved OpenRouter key are stored in VS Code
SecretStorage (OS keychain-backed, encrypted). On each extension activation:

1. Read licence key from SecretStorage
2. If found, call `POST /validate` — if still valid, cache and use OpenRouter key
3. If validation fails (expired, cancelled), show re-subscribe prompt inline

No polling. Validation only runs on activation or when the writer manually
re-enters a key. If the writer is offline, use the cached OpenRouter key
until it fails at the API level.

### Free tier

10 free AI calls using a shared rate-limited OpenRouter key hardcoded in the
extension. No Stripe, no licence key, no email. When the 10 calls are
exhausted, a gentle upgrade prompt appears above the input box. The writer's
local state is always intact — only new AI calls are gated.

### Re-configuration paths

- "Manage subscription" command → opens Stripe customer portal in browser
- "Change AI provider" command → opens BYOK setup screen
- "Enter licence key" command → re-runs licence validation
- No sign-out concept — just replace the key in SecretStorage

### Plan display

Shown compactly in the ChatPanel header:
- Managed: "Starter plan"
- BYOK: "BYOK — [provider name]"
- Free: "Free — 4 calls remaining"
- Limit reached: banner above input with upgrade CTA

## Technical tasks

- [ ] Build `OnboardingPanel` webview with four-screen flow
- [ ] Build Welcome screen component (Subscribe / BYOK CTAs)
- [ ] Build plan card components (Starter / Pro)
- [ ] Implement Stripe Checkout redirect (opens system browser)
- [ ] Build licence key input + validation call to `POST /validate`
- [ ] Build BYOK setup component (provider dropdown, key input, test connection)
- [ ] Build new project wizard component
- [ ] Implement project scaffold function (all local writes)
- [ ] Implement SecretStorage read/write for licence key + OpenRouter key
- [ ] Implement activation-time validation with offline cache fallback
- [ ] Implement free tier call counter (stored in `globalState`)
- [ ] Build plan display in ChatPanel header
- [ ] Build "limit reached" banner + upgrade CTA
- [ ] Implement "Manage subscription" command (Stripe portal redirect)
- [ ] Implement "Change AI provider" command
- [ ] Implement "Enter licence key" command

## Dependencies

M1 (serverless validate endpoint, Stripe products, AI provider abstraction).
M2 (ChatPanel must exist to open after onboarding completes).

## Success criteria

- Subscriber flow: install → paste licence key → first AI message under 3 min
- BYOK flow: install → enter key → first AI message under 90 seconds
- Free flow: install → skip → first AI message under 60 seconds
- Licence key survives VS Code restart
- BYOK key survives VS Code restart
- "Test connection" reports failure for a bad key with a useful error message
- Free tier counter is accurate and persists across restarts
- Offline writer can still open their project and read past state
