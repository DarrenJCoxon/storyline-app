# Free tier tuning

The free starter plan is the single most consequential conversion lever
in the funnel. This doc records what we set, why, and the data we want
before tuning further.

---

## Current setting — ✅ shipped (v0.1.59)

**150 credits per new free user.**

Source of truth: [backend/src/free-plan.ts:FREE_PLAN_CREDITS](../../../backend/src/free-plan.ts).

User-facing copy that mentions the number:
- [extension/src/onboarding/licence-prompt.ts](../../../extension/src/onboarding/licence-prompt.ts) — info modal
- [extension/src/onboarding/project-scaffold.ts](../../../extension/src/onboarding/project-scaffold.ts) `WELCOME_DOC` — first-run welcome
- [docs/TERMS.md](../../TERMS.md) — legal terms (regenerated into
  `backend/src/legal-content.ts` by `backend/scripts/build-legal.mjs`)

Worker needs `cd backend && npx wrangler deploy` for the new ceiling
to apply to fresh `/free-plan/issue` calls. Existing free keys keep
whatever balance they already have.

---

## Why 150

A typical 14-stage book plan runs **70-140 chat turns** at 1 credit
each. So 150 credits maps to "**finish one complete plan and feel the
value**, but not enough left over to start a second free book."

This is the conversion sweet spot — the trigger fires at the natural
"I want to start my next book" moment, when the user has just
experienced the product working end-to-end and is most motivated to pay.

### Why not 250 (the previous setting)

250 let users finish one plan **and** start a second one before hitting
the wall. That dampened conversion pressure: by the time they ran out,
they'd already extracted the value of two book plans for free, and
were less likely to feel an immediate need to top up.

### Why not 100 or below

100 credits risks users hitting the wall **mid-stage** in their first
book — frustrated, with nothing usable to take away, before they've
formed a positive impression of the product. Worst-case for both
conversion AND word-of-mouth.

---

## Cost per free user

At ~$0.002/turn average chat cost (DeepSeek Flash), 150 credits fully
consumed = **~$0.30 of compute**. Range:

| Usage profile          | Avg cost/turn | 150 credits cost |
|-----------------------|---------------|------------------|
| Light (early stages)  | $0.001        | $0.15            |
| Mid (most users)      | $0.002        | $0.30            |
| Heavy (research-loaded)| $0.004       | $0.60            |

Realistic expected cost per signup, applying ~40% utilisation rate
(typical free-tier behaviour where many sign up and bounce): **~$0.12
per signup**. Per 1,000 free signups: ~$120 expected sunk cost.

A single £9.99 → 1,000-credit pack nets ~£7.65 after Stripe → covers
~63 free signups at $0.12 each. **Break-even at 1.6% free→paid
conversion.** Industry norm for AI dev tools is 3-7%, so the free tier
should run net-positive.

---

## Data we want before tuning further

Before changing 150 again, we want to see:

1. **Funnel shape**: how many free credits each user actually consumes
   before either (a) buying, (b) abandoning, (c) hitting zero and not
   buying. Bucket distribution: 0-25, 25-50, 50-100, 100-150 credits.
2. **Time-to-zero distribution**: how long between issuing the free
   key and the user hitting zero balance. Tells us whether 150 is
   "too few credits, hit too fast" or "right amount, hit at the
   natural moment."
3. **Conversion rate at zero**: of users who hit zero balance, what %
   buy a credit pack within 7 / 14 / 30 days?
4. **Mid-stage abandonment rate**: do users who run out *mid-stage*
   (vs at the natural end of a planning cycle) churn at a higher rate?
   Strong signal for "we're cutting them off too aggressively."

These metrics need backend instrumentation. **Open**: see
[roadmap/README.md](../README.md) "Marketing site `/download` analytics"
open question — same instrumentation gap.

---

## Tuning protocol

Once we have ~100 free signups of usage data, A/B test 150 vs alternatives:

- **120**: tighter, sees if a stricter wall converts better
- **180**: looser, sees if "buffer for second-book exploration" wins on
  retention even if conversion at 150 is higher

Run the test for 4 weeks minimum to capture full conversion curve
(some users buy days after hitting zero, not immediately).

**Don't change 150 without data.** Generosity-bias is correct at
launch — small downward tweak is risk-free, but over-tightening
without measurement is a conversion own-goal.

---

## Related: free plan limits

Beyond the credit cap itself, the free plan is **gated against image
generation** ([backend/src/illustrate.ts:37-42](../../../backend/src/illustrate.ts)):
free users get a 402 if they try to generate covers or illustrations.
This forces image-generation users into the paid track regardless of
how light their chat usage was — a separate conversion lever from
credit ceiling.

Critique uses the same credit pool ([backend/src/critique.ts:441-449](../../../backend/src/critique.ts)),
variable cost. Heavy critique users dent the per-user cost more than
chat alone, but it draws from the same 150 credits, so the cap holds.
