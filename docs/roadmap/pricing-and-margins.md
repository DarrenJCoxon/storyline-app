# Pricing & margins

The target across the board is **~80% gross margin** on AI features against
Pack A net revenue (£9.99 / 1,000 credits, ≈ £0.0096 / $0.0121 per credit
after Stripe fees of ~1.5% + £0.20). Pack B (£17.99 / 2,200 credits, ~£0.0080
/ $0.0100 per credit net) sits ~10% lower across the board — explicit
volume discount, accepted as a slimmer-but-still-healthy margin.

This doc records what we charge, why, and what the numbers actually mean.

---

## Image generation — ✅ shipped (v0.1.57)

### Cost basis

OpenAI's gpt-image-2 / gpt-image-1 effective per-image cost depends on
**aspect ratio** as well as quality. The app generates at 1024×1536
(portrait, covers) or 1536×1024 (landscape, chapter headers) — never
square — and those non-square aspects cost ~1.5× more than 1024×1024.

| Quality | 1024×1024 (square) | 1024×1536 / 1536×1024 (what we use) |
|---------|--------------------|--------------------------------------|
| Low     | ~$0.011            | **~$0.016**                          |
| Medium  | ~$0.042            | **~$0.063**                          |
| High    | ~$0.167            | **~$0.25**                           |

**Caveat**: OpenAI moved to token-based pricing for gpt-image-2 ($30/M
output tokens). The dollar figures above are the well-documented
historical effective per-image rates. Verify against an actual invoice
before relying on these long-term — token counts can shift between
model versions.

### Credit costs

**Sized for 80% margin against Pack A net revenue ($0.0121/credit).**
Source of truth: [backend/src/illustrate.ts:CREDITS_BY_QUALITY](../../backend/src/illustrate.ts).
Mirrored in [extension/src/illustration/image-generator.ts:CREDITS_LOW/MEDIUM/HIGH](../../extension/src/illustration/image-generator.ts)
and [extension/webview/src/illustrations/App.tsx:CREDITS_BY_QUALITY](../../extension/webview/src/illustrations/App.tsx).

| Quality | Credits | Pack A revenue | Cost  | Margin |
|---------|---------|----------------|-------|--------|
| Low     | 8       | $0.097         | $0.016| **84%**|
| Medium  | 32      | $0.387         | $0.063| **84%**|
| High    | 100     | $1.210         | $0.250| **79%**|

Pack B users land at ~74-75% on these tiers — accepted volume discount.

### Cover doubling

A complete book cover fires **two** `/illustrate` calls (front + back), so
a high-quality cover bills 200 credits ≈ £2 against $0.50 of OpenAI cost.
Same 80% margin per call, twice the absolute envelope per cover. Documented
in the JSDoc on [extension/src/illustration/image-generator.ts](../../extension/src/illustration/image-generator.ts)
quality field.

### Worker deploy

Backend Worker needs `cd backend && npx wrangler deploy` for the new
credit costs to apply server-side. Extension changes are picked up
through the v0.1.57+ release tag.

---

## Chat inference — ✅ shipped (decision: accept the average)

### Cost basis

DeepSeek Flash (CHAT_MODEL in [backend/wrangler.toml:13](../../backend/wrangler.toml)):
- Input: $0.14 / 1M tokens
- Output: $0.28 / 1M tokens

### Per-turn cost ranges

Total input per chat turn = system prompt (skill MD + EXTENSION_OVERRIDE
+ stage-info + state JSON + optional research/) + recent turn history.

| Scenario                     | Input tokens | Output | Raw cost  | Pack A margin |
|------------------------------|--------------|--------|-----------|---------------|
| Early NF stage               | ~6,500       | ~400   | $0.00102  | **92%**       |
| Mid NF stage                 | ~10,000      | ~600   | $0.00157  | **87%**       |
| Late fiction (no research)   | ~18,000      | ~700   | $0.00272  | **78%**       |
| Late fiction + heavy research| ~30,000      | ~1,200 | $0.00454  | **62%**       |

Per-book aggregate (~100 turns) typical: **~88% margin**. Heavy-research
user: **~75%**.

### Decision: stay at 1 credit/turn (Option A)

We accept the average. Implementing per-token billing (Option B) would
guarantee 80% per-turn but introduces variable-cost UX (some chat
turns silently bill 2 credits) and complicates the marketing claim of
"~120 books per £10 pack". The dollar exposure on power users is
small enough not to warrant the engineering and UX cost.

**Revisit if**: monthly margin reports show heavy-user usage pushing
aggregate below 75%, or if model pricing changes materially.

### Option B (held in reserve) — token-aware billing

If we ever need it, the design:
- Charge 1 credit baseline (current behaviour)
- After upstream stream completes, parse usage and bump to 2 credits
  if total tokens > 17,000 (the 80%-margin boundary at $0.0121 revenue)
- Implement in [backend/src/chat.ts](../../backend/src/chat.ts) inside
  `parseAndForwardStream`'s usage-capture handler — ~30 lines

The extension never has to know — the backend just tells it the new
balance via the existing `creditUpdate` flow.

---

## Critique

Critique cost is variable per-call, gated server-side. Prose tier
deducts 5 credits ([backend/src/critique.ts](../../backend/src/critique.ts)).
Not yet rebased against the 80% target — the cost basis depends heavily
on input length (length of the chunk being critiqued) and is harder to
generalise than chat. **Open: rebase critique credit costs once we
have measured per-call cost data from production.**

---

## Free plan vs paid plan margin

Free plan users consume ~$0.20-0.50 of compute over their 150-credit
allowance ([roadmap/free-tier-tuning.md](./free-tier-tuning.md)).
Conversion break-even: a single £9.99 pack (net ~£7.65 after Stripe)
covers ~38 fully-burned free users at $0.20 each. So **free→paid
conversion of ~3% pays for the free tier**. Industry norm for AI dev
tools is 3-7%, so the free tier is likely net-positive.

---

## Where the constants live

If you change pricing, all four of these files must agree:

1. **Backend (source of truth)**: [backend/src/illustrate.ts:CREDITS_BY_QUALITY](../../backend/src/illustrate.ts)
2. **Backend chat charge**: [backend/src/chat.ts](../../backend/src/chat.ts)
   `consumeCredits(record, 1)` line ~55
3. **Extension constants (must match #1)**: [extension/src/illustration/image-generator.ts:CREDITS_LOW/MEDIUM/HIGH](../../extension/src/illustration/image-generator.ts)
4. **Webview dropdown labels**: [extension/webview/src/illustrations/App.tsx](../../extension/webview/src/illustrations/App.tsx)
5. **Type-doc comments referring to dollar-per-image**: [backend/src/types.ts](../../backend/src/types.ts)
6. **Free plan size**: [backend/src/free-plan.ts:FREE_PLAN_CREDITS](../../backend/src/free-plan.ts)
7. **Pack price/credits**: [extension/webview/src/onboarding/screens/BuyCredits.tsx:PACKS](../../extension/webview/src/onboarding/screens/BuyCredits.tsx)

After any change, **redeploy the Worker** (`cd backend && npx wrangler deploy`).
Extension changes ship through the next git tag.
