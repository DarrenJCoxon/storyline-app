# M3 — Onboarding

## Goal

A new writer installs the extension and reaches a live planning conversation
within 3 minutes. No docs, no terminal, no configuration file to edit.

## Deliverables

### First-run detection

On extension activation, check for:
1. No `.storyline/state.json` in the open workspace — new project
2. Supabase session not found in VS Code SecretStorage — not logged in

If either condition is true, open the OnboardingPanel instead of ChatPanel.

### OnboardingPanel flow

Four screens, forward/back navigation, no page reload between them.

```
Welcome → Choose Plan → Setup → New Project → [ChatPanel opens]
```

**Screen 1: Welcome**
- Storyline wordmark, tagline ("Plan your book. Write your story.")
- Two primary CTAs: "Subscribe" / "Bring your own key"
- Small print link: "What is this?" (expands a one-paragraph explainer)

**Screen 2a: Subscribe**
- Plan cards — Starter (£9/mo, 100 credits) / Pro (£19/mo, 300 credits)
- "Start free" link below (10 lifetime credits, no card)
- On plan select: opens Stripe Checkout in system browser
- Stripe redirects back to a deep link (`vscode://storyline-app/auth/callback`)
  which the extension handles, stores session, advances to Screen 3

**Screen 2b: BYOK**
- Provider dropdown: Anthropic / OpenAI-compatible / Ollama (local)
- API key input (SecretStorage, never logged)
- For Ollama: base URL field (`http://localhost:11434`), no key needed
- "Test connection" button — fires a minimal chat request, shows ✓ or error
- On success: advances to Screen 3

**Screen 3: New Project**
- Project name input (defaults to workspace folder name)
- Genre hint (optional — "What kind of book?" — seeds the genre stage)
- "Create project" button
- Scaffolds `.storyline/state.json`, `output/`, `docs/chapters/`, `manuscript/`

After Screen 3: OnboardingPanel closes, ChatPanel opens at Stage 1 (Genre).

### Auth session management

- Supabase JWT stored in VS Code `SecretStorage` (encrypted, OS keychain)
- Refresh token rotated on each use
- On extension activate: attempt silent refresh. If refresh fails, clear session
  and show onboarding
- Credit balance cached in `ExtensionContext.globalState` and refreshed after
  each save

### Re-onboarding paths

- "Manage subscription" command → opens Stripe customer portal in browser
- "Change AI provider" command → opens BYOK setup screen in isolation
- "Sign out" command → clears SecretStorage, shows welcome screen

### Credits display

Shown in the ChatPanel header (top right of the pane):
- Managed: "47 credits remaining"
- BYOK: "Unlimited (BYOK)"
- Free: "6 credits remaining — Upgrade"
- 0 credits: full-width banner above input, "Upgrade to continue" CTA

## Technical tasks

- [ ] Implement `OnboardingPanel` webview with four-screen flow
- [ ] Build Welcome screen component
- [ ] Build plan card components (Starter / Pro / Free)
- [ ] Implement Stripe Checkout redirect + deep link callback handler
- [ ] Build BYOK setup component (provider dropdown, key input, test connection)
- [ ] Build new project wizard component
- [ ] Implement project scaffold function (`.storyline/`, `output/`, etc.)
- [ ] Implement Supabase auth in extension (sign in, session storage, refresh)
- [ ] Implement credits display in ChatPanel header
- [ ] Implement "Credits exhausted" banner + upgrade CTA
- [ ] Implement "Manage subscription" command (Stripe portal redirect)
- [ ] Implement "Change AI provider" command
- [ ] Implement "Sign out" command
- [ ] Handle deep link `vscode://storyline-app/auth/callback` in extension

## Dependencies

M1 (Supabase schema, Stripe products, AI provider abstraction).
M2 (ChatPanel must exist to open after onboarding completes).

## Success criteria

- New subscriber flow: install → subscribe → first AI message in under 3 minutes
- BYOK flow: install → enter key → first AI message in under 90 seconds
- Free flow: install → skip payment → first AI message in under 60 seconds
- Session survives VS Code restart (no re-login required)
- BYOK key survives VS Code restart (stored in SecretStorage)
- "Test connection" correctly reports failure for a bad key
- Credits balance always reflects server truth within one save cycle
