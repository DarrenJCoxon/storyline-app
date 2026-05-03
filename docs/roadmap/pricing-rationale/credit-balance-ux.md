# Credit balance UX

The visibility plan for credits across the lifecycle: balance always shown,
proactive warnings before zero, modal at zero, AI features gated when
exhausted but writing/compile/preview still work.

---

## What's shipped

### ✅ Free users see balance in chat header (v0.1.58)

Prior behaviour: free users saw `Free plan — Stage X of Y` with no
visibility into how many of their starter credits were left. Paid users
already had `247 credits remaining`.

New behaviour: **`Free plan · 247 credits`** — keeps the free-tier
prefix so the user knows they're on the trial, surfaces the running
balance, and updates live on every chat turn via the existing
`creditUpdate` postMessage.

Source: [extension/webview/src/planning/components/Header.tsx:23-32](../../../extension/webview/src/planning/components/Header.tsx).

The `creditUpdate` flow is already wired in [extension/src/panels/ChatPanel.ts:409-410](../../../extension/src/panels/ChatPanel.ts)
— fired after every successful chat turn when the backend returns the
new balance. Reducer in [extension/webview/src/planning/App.tsx:241-242](../../../extension/webview/src/planning/App.tsx)
updates `state.creditInfo.balance`.

### ✅ Exhausted modal exists (pre-existing)

`promptOnCreditsExhausted` in [extension/src/onboarding/licence-prompt.ts:24-44](../../../extension/src/onboarding/licence-prompt.ts)
shows a modal when the backend returns 402:

> Your Storyline credits are exhausted. Top up to keep writing.
> [Top Up Credits] [Later]

Triggered from:
- [extension/src/panels/ChatPanel.ts:1041-1042](../../../extension/src/panels/ChatPanel.ts) — chat 402
- [extension/src/illustration/image-generator.ts:133](../../../extension/src/illustration/image-generator.ts) — image gen 402

This works but only fires *after* an API call fails. We want proactive
gating before the call goes out.

---

## What's left to build

### 🔵 Low-credit warning toast at ≤50 credits

**Goal**: one-shot toast notification when user crosses below 50 credits,
with a "Top up" CTA. Doesn't fire repeatedly — uses a globalState
"warned at this threshold" flag so it shows once per crossing.

**Trigger**: every `creditUpdate` from backend; if new balance ≤ 50 and
the warning hasn't been shown for the current "burn cycle" (last
threshold we saw the user above).

**Design**:
```
[VS Code notification toast]
You have 47 Storyline credits left. Top up to keep using AI features
without interruption.
[Top up] [Dismiss]
```

**State key**: `storyline.lowCreditWarnedBelow` — number tracking the
last threshold we warned at. Reset to 100+ when the user tops up so
the next dip below 50 triggers again.

**Implementation locations**:
- New helper in [extension/src/onboarding/licence-prompt.ts](../../../extension/src/onboarding/licence-prompt.ts):
  `maybeWarnLowCredits(context, balance)`
- Call from wherever `creditUpdate` is dispatched server-side or
  parsed client-side — most direct path is in [extension/src/panels/ChatPanel.ts](../../../extension/src/panels/ChatPanel.ts)
  where we already get the new balance from the chat stream

### 🔵 Status bar credit display

**Goal**: persistent credit indicator in the bottom status bar, always
visible whenever a Storyline workspace is open. Click → triggers
`storyline.topUpCredits`.

**Design**:
- Format: `$(zap) 247` — minimal, doesn't crowd
- Tooltip: `Storyline: 247 credits remaining. Click to top up.`
- Color states:
  - Default text when balance > 50
  - Warning yellow (using `statusBarItem.backgroundColor = 'statusBarItem.warningBackground'`) at 1-50
  - Error red (`'statusBarItem.errorBackground'`) at 0

**Implementation**:
- New file `extension/src/status-bar/credit-status-bar.ts` exposing
  a `CreditStatusBar` class that owns the StatusBarItem + an
  `updateBalance(balance: number)` method
- Constructed alongside the existing status bar items in
  [extension/src/extension.ts:208-219](../../../extension/src/extension.ts) (planning / preview /
  research / compile / notes)
- Updated from:
  - Initial validate in `activate` (already returns `creditBalance`)
  - Every `creditUpdate` from chat panel
  - After every successful image gen
  - After Stripe top-up flow ([extension/src/panels/PurchasesPanel.ts:119](../../../extension/src/panels/PurchasesPanel.ts))

### 🔵 AI feature gating when balance == 0

**Goal**: when balance is zero, AI calls are blocked at the **client**
side with a friendly modal — don't even fire the request to backend
just to get a 402 back.

Writing, compile, preview, notes, research panel — all unaffected.

**Specifically gate**:
- Chat send button → if balance == 0, intercept submit, show modal,
  don't post message
- "Generate" buttons in IllustrationsPanel and CoverPanel → same
- Critique runs → check before invoking

**Modal behaviour**: same `promptOnCreditsExhausted` modal we already
have, just triggered proactively instead of from a 402.

**Implementation locations**:
- [extension/webview/src/planning/components/InputBox.tsx](../../../extension/webview/src/planning/components/InputBox.tsx)
  — gate submit on `creditInfo.balance === 0`, show inline message
- [extension/webview/src/illustrations/App.tsx](../../../extension/webview/src/illustrations/App.tsx)
  — gate generate button
- [extension/webview/src/cover/App.tsx](../../../extension/webview/src/cover/App.tsx)
  — same
- All three panels already receive `creditCost` and balance — wiring
  is small

---

## Sequencing

Recommend shipping in this order, each ~½ day:

1. **Status bar item** — independent, observable everywhere, immediate
   user-facing improvement. Ship first.
2. **Low-credit warning toast** — depends on having balance updates
   plumbed; piggybacks on the status bar's update path.
3. **AI feature gating** — depends on balance being authoritative
   client-side; safest to ship after the visible plumbing is solid.

Total: ~1.5 days end-to-end.

---

## Open: balance authority

Right now the extension trusts the **last server response** as
authoritative for the balance. That works for chat (every turn returns
fresh balance) but for image gen and critique, balance can drift
between calls.

Two options:
- **Trust local state**, refresh from `/validate` on workspace open and
  after every API call. Simple, occasionally stale by one call.
- **Round-trip every action** to confirm balance before firing. Slower,
  always accurate.

Current code uses the first model. Worth flagging but not changing
right now — drift is at most one call's worth, which is bounded.
