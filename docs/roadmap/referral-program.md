# Referral program

Gamma-style click-to-share viral loop. Each user gets a referral link;
when a new user signs up via that link, both parties get bonus credits.
Storyline is unusually well-suited for this — writers know other writers,
the artefact (planned book) is shareable proof, and credits map directly
to the unit users already understand.

**Status**: 🔵 planned, 4 waves, ~3 days build total.

---

## The deal

| Party | Reward |
|-------|--------|
| Referrer | **25 credits per successful referral**, max **20 referrals = 500 credits / £5 cap** |
| New user | **50 credits bonus** on top of the 150-credit free starter (200 total) |

**Asymmetry rationale**: 50 to the new user makes the link feel
generous when shared ("you'll get 50 credits"). 25 to the referrer
is meaningful but not so much it triggers obvious incentive-farming.

**Cost per successful referral**:
- New user side: 50 credits × ~$0.002/turn = **~$0.10** if fully used
- Referrer side (paid user): 25 credits = ~£0.20 of deferred paid
  revenue (FIFO drain comes off the bonus first)
- **Worst-case combined: ~£0.30 per referral**

**Conversion break-even**: a £9.99 pack nets ~£7.65 → covers ~25
referrals. Need **1 in 25 referred users to convert** = **~4%**.
Industry referral conversion runs 5-15%; the maths is comfortable.

---

## Anti-abuse without email

Three independent layers. An abuser has to defeat all three.

### Layer 1: IP rate limit (existing)

[backend/src/free-plan.ts](../../backend/src/free-plan.ts) — 30 free
plans per IP per day. Already lives. Generous enough for legitimate
household NATs / school networks but blocks rapid-fire scripted
attacks.

### Layer 2: machineId per-device lock (NEW — Wave 1)

VS Code exposes `vscode.env.machineId` — a stable UUID per VS Code
install. Survives extension uninstall + reinstall. Only resets if
user reinstalls VS Code itself OR runs as a different OS user.

**Implementation**:
- Extension sends `machineId` with every `/free-plan/issue` call
- Backend stores `machineId → first-issued-key` mapping in KV
- Repeat call with same `machineId` returns the **existing** key
  (no new credits) instead of minting fresh
- Same for `?ref=X` — referral bonus only awards if the new
  `machineId` has never claimed before
- Self-referral block: refuse if referrer's `machineId` ==
  new user's `machineId`

**Worth shipping standalone before referrals.** Protects the 150-credit
drop regardless of when referrals land.

### Layer 3: per-code referral cap (NEW — Wave 2)

Each referral code (one per active user) is capped at **20 successful
awards**. After 20, the code keeps working as an invite but no more
credits are issued to the referrer. New users still get their 50
bonus.

### Held in reserve: Cloudflare Turnstile

If abuse becomes measurable despite the three layers, add invisible
Turnstile captcha to `/free-plan/issue` — zero friction for legit
users, hard wall for scripted abuse. **Don't ship pre-emptively.**

### Held in reserve: optional email verification

Soft "verify email for 25 bonus credits" prompt is the gentlest layer
to add if abuse keeps happening. Doesn't make email mandatory; just
incentivises users who provide it.

---

## The four waves

### Wave 1: machineId abuse guard (~½ day)

**Backend**:
- Extend KV schema or add a `MACHINE_IDS` namespace mapping
  `machineId → licenceKey`
- Modify [backend/src/free-plan.ts](../../backend/src/free-plan.ts)
  `handleFreePlanIssue` to:
  - Read `machineId` from request body
  - If machineId already mapped, return that key (no new mint)
  - Else, mint new key + write mapping atomically
- Migration: existing free keys have no machineId — first /validate
  call after upgrade can backfill

**Extension**:
- [extension/src/auth/free-plan-issue.ts](../../extension/src/auth/free-plan-issue.ts)
  sends `machineId: vscode.env.machineId` in the POST body

**Ship as**: standalone version bump; safe alongside or before referrals.

### Wave 2: referral backend (~1 day)

**Backend**:
- New helper: derive a stable 8-char referral code from licence key
  (hash + base32). E.g. `SL-FREE-E9ED-A46C-890D` → `R7NBPK4Q`
- Extend `/free-plan/issue` to accept `?ref=<code>` query param
- KV: `REFERRAL_CODES` mapping `code → licenceKey` (lookup);
  `REFERRAL_AWARDS` mapping `code → { count, awardedKeys[] }`
- Award flow when `?ref=X` present and new user passes anti-abuse:
  - Look up referrer key from code
  - If referrer not found / disabled / cap hit → mint new user without
    bonus, no error to user
  - Else → atomically: add 50 credits to new user via credit batch
    helper; add 25 credits to referrer; bump referral count
- New endpoint: `GET /referral/stats?key=X` returns
  `{ code, referralCount, creditsEarned }`

**Caps**:
- `count >= 20` → no more credits awarded (still acts as invite)
- Self-referral check: reject if `machineId` already on referrer's
  awarded list

### Wave 3: extension share modal (~1 day)

**The interaction (Gamma pattern)**:

1. User clicks the credit pill in the chat header
2. Modal opens with their referral link prominent
3. **Big "Copy link" button** (primary) — single click, sets clipboard,
   toast "Copied — paste anywhere"
4. **Row of one-click share buttons** — each opens the platform's
   pre-filled compose URL in the user's browser via `vscode.env.openExternal`:
   - X / Twitter
   - LinkedIn
   - WhatsApp (huge for international writers)
   - Email (`mailto:` prefilled)
   - Reddit
5. **Running tally below**: "You've referred 3 friends · earned 75 credits"

**Two clicks max from chat to shared link** — same friction floor as Gamma.

**Implementation locations**:
- New webview modal component (e.g.
  `extension/webview/src/planning/components/ShareModal.tsx`)
- Existing credit pill in [extension/webview/src/planning/components/Header.tsx](../../extension/webview/src/planning/components/Header.tsx)
  — add `onClick={openShareModal}` and a hover state
- New `referralStats` postMessage from extension to webview, fetched
  from `GET /referral/stats?key=...` on modal open
- New `openExternal` postMessage from webview → extension to open
  social-platform compose URLs

**Pre-filled copy templates** (warm, not transactional):

> *X*: "I've been using Storyline to plan my next book — Save the Cat
> structure, AI gives notes after every stage. Genuinely changed how
> I think about story structure. Free trial: storyline.my/r/ABCDEF"

> *Email subject*: "Thought of you"
> *Email body*: "Hey — found a tool I think you'd like. Storyline plans
> novels and non-fiction with you, AI critique at every stage, exports
> to EPUB. Free trial here: storyline.my/r/ABCDEF"

> *WhatsApp*: "Quick one — found a really good writing tool. Free trial:
> storyline.my/r/ABCDEF"

> *Reddit title*: "Storyline — AI book planner with Save the Cat
> structure, free trial"

### Wave 4: marketing site `/r/<code>` redirect (~½ day)

**Site changes** at [site/](../../site/):
- New route `app/r/[code]/page.tsx` that:
  - Stores ref code in localStorage (`storyline-ref-code`)
  - Redirects to `/?ref=<code>` (preserves URL semantics)
- Hero on the home page reads localStorage; if a ref code is present,
  shows a "You were invited! Sign up to claim 50 bonus credits" banner
- Download buttons unchanged — but the marketing page also surfaces a
  small "Already have Storyline? Click here to claim your bonus" link
  that fires `vscode://darrenjcoxon.storyline-extension/activate?ref=<code>`

**Carry-through to install**:
- Tauri installer doesn't currently know about the ref code. Two options:
  - **a)** Tauri reads from a clipboard / browser bookmark prompt
    (clunky)
  - **b)** First-run extension reads localStorage from the marketing
    site domain — *not possible cross-origin*
  - **c) RECOMMENDED**: the existing post-Stripe `vscode://...activate`
    URI handler is extended to support ref codes (`?ref=<code>`)
    even when no licence key is present. User who clicks the
    download button gets a "Once installed, click here to claim your
    bonus" link that fires the URI. Extension URI handler sees
    `?ref=` only → calls `/free-plan/issue?ref=<code>` from the
    extension instead of the website.

Option (c) is cleanest because it reuses the existing URI-handler
plumbing in [extension/src/extension.ts:147-178](../../extension/src/extension.ts).

---

## Sequencing & ship plan

Wave 1 first, standalone. Then waves 2 + 3 + 4 in one coordinated drop
so the loop is complete (a half-shipped referral system is worse than
none at all — a click that doesn't actually award credits will burn user
trust and your share rate will never recover).

**Suggested timing**:
1. **Now → 2 weeks**: ship Wave 1, watch the new 150-credit baseline
   conversion shape settle.
2. **Week 3-4**: build waves 2 + 3 + 4 in parallel branches; coordinated
   release.
3. **Week 5+**: monitor share rate, conversion, abuse signals.

**Success metrics**:
- **Share rate**: % of active free users who click the credit pill at
  least once. Target ≥ 15% in month 1.
- **Send rate**: % who click a copy/share button after opening the
  modal. Target ≥ 60%.
- **Referral conversion**: % of `/r/<code>` clicks that complete
  `/free-plan/issue`. Target ≥ 10%.
- **Free→paid lift**: difference in conversion rate between users
  arriving via referral vs cold. Target +50% lift (referred users
  warmer = should convert better).

**Triggers to revisit numbers**:
- If share rate < 10%, the placement or copy needs work
- If referral count per user > 20 medians, raise the cap
- If abuse signals appear (free signups without conversions spiking
  abnormally), tighten with Turnstile

---

## Tracking & instrumentation needed

To run this properly, the backend needs:
- Per-code: total invites generated, total awards issued, credits
  earned, last-used timestamp
- Per-key: how the user arrived (cold / referred / Stripe)
- Daily aggregates of referral funnel: invites issued → links clicked
  → free plans issued via ref → first chat turn → conversion to paid

Same instrumentation gap flagged in [free-tier-tuning.md](./free-tier-tuning.md)
"Data we want before tuning further" — worth solving once for both.
