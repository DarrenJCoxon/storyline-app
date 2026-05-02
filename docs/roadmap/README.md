# Storyline Roadmap

Living index of upcoming work, design decisions, and the rationale behind
recent changes. Each linked doc covers one cohesive theme — pricing,
referrals, credit-balance UX, etc. Pick the one closest to what you're
building and follow the file:line references inside.

## Status legend

- ✅ **Shipped** — change is in `main`, included in a tagged release
- 🟡 **Partially shipped** — some pieces live, others queued
- 🔵 **Planned** — designed and agreed, not yet built
- ⚪ **Open question** — flagged for later, not actioned

---

## Active themes

### [Pricing & margins](./pricing-and-margins.md)
**Status:** ✅ shipped (image), ✅ shipped (chat — accepted average)
- Image credit costs rebased on 80% gross margin against Pack A net
  revenue (8 / 32 / 100 credits for low / medium / high). Shipped in
  v0.1.57.
- Chat held at 1 credit/turn; analysis shows ~88% blended margin on
  typical projects, dipping to ~75% for heavy-research power users.
  Decision: accept the average and monitor, no per-token billing yet.

### [Free tier tuning](./free-tier-tuning.md)
**Status:** ✅ shipped (drop to 150)
- Free starter dropped from 250 → 150 credits in v0.1.59 to land the
  "finish one full plan, then hit the wall" conversion sweet spot.
- Worker needs `wrangler deploy` from `backend/` for new ceiling to
  apply to fresh `/free-plan/issue` calls.
- Re-evaluate in 4-6 weeks once we have conversion baseline data.

### [Credit balance UX](./credit-balance-ux.md)
**Status:** 🟡 partially shipped
- ✅ Free-trial users see live credit balance in the chat header
  ("Free plan · 247 credits") — shipped in v0.1.58.
- 🔵 Low-credit warning toast at ≤50 with "Top up" CTA — not built.
- 🔵 Out-of-credits modal + AI-feature gating (chat / illustrate /
  critique disabled when balance == 0; writing surface, compile,
  preview unaffected) — not built.
- 🔵 Status bar item showing balance always — not built.

### [Referral program](./referral-program.md)
**Status:** 🔵 planned (4 waves, ~3 days build)
- Gamma-style click-credits-to-share modal in extension webview
- 25 credits to referrer (max 20 referrals = 500 credits / £5 cap)
- 50 credits to new user on top of 150 starter
- machineId-based anti-abuse on `/free-plan/issue`
- `/r/<code>` redirect on storyline.my carries ref through to install

---

## Recently shipped (last ~10 versions)

| Version | Date | Change |
|---------|------|--------|
| v0.1.59 | 2026-05-02 | Free credits 250 → 150 |
| v0.1.58 | 2026-05-02 | Free users see credit balance in chat header |
| v0.1.57 | 2026-05-02 | Image credits 5/15/40 → 8/32/100 (80% margin) |
| v0.1.56 | 2026-05-02 | Removed dollar cost from quality dropdown |
| v0.1.55 | 2026-05-02 | Stage transition perf + carry prior turns into next stage |
| v0.1.54 | 2026-05-02 | Apply explorer-focus retries to Start-Free path |
| v0.1.52 | 2026-05-02 | Create manuscript/ docs/ output/ on installer-launched projects |
| v0.1.51 | 2026-05-02 | Retry explorer-focus to defeat sidebar-grabbing extensions |
| v0.1.50 | 2026-05-02 | nodePaths fix so esbuild resolves transitive workspace deps |
| v0.1.49 | 2026-05-02 | Bundle fs-extra + chalk (was: external + missing from VSIX) |

---

## Open questions

- ⚪ **Token-aware chat billing.** If late-stage power users with
  research/ folders push average chat margin below 75% over a measured
  period, switch from flat 1 credit/turn to a 1-or-2 model based on
  total token count. See [pricing-and-margins.md](./pricing-and-margins.md)
  Option B for the design.
- ⚪ **Email verification path.** Currently no email collection, machineId
  + IP rate-limit + Turnstile (held in reserve) are the abuse stack. If
  abuse becomes measurable, a soft "verify email for 25 bonus credits"
  prompt is the gentlest layer to add.
- ⚪ **Referral conversion baseline.** Need ~1 month of post-launch data
  before deciding whether 25/50 split is right or 50/50 / asymmetric
  variants would convert better.
- ⚪ **Marketing site `/download` analytics.** Funnel from page-view →
  installer-download → first chat turn → conversion. Today the only
  observable signal is `/free-plan/issue` count.

---

## How to add to this roadmap

1. New theme → new `.md` in this directory, link from the **Active themes**
   table above.
2. Single small change → add to the **Recently shipped** table above
   when it lands, no separate file needed.
3. Cross-reference: every code claim in a roadmap doc should have a
   `file_path:line_number` link so future-you doesn't have to re-derive
   what was where.

Keep individual docs under 500 lines per CLAUDE.md. If a theme grows
beyond that, split it.
