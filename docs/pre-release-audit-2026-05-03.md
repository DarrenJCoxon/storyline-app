# Pre-Release Forensic Audit — 2026-05-03

**Repo:** storyline-app
**Auditor:** Claude (forensic pass over backend, extension, site, skills, repo hygiene)
**Scope:** route optimisation, AI-backend overload protection, debug/test cruft, security hygiene
**Verdict:** Not ship-blocked, but **3 must-fix items** before release and ~12 medium-severity items worth clearing in one cleanup pass.

---

## Executive summary

The codebase is in good shape architecturally. Optimistic credit deduction, machineId abuse-guards, Stripe-signature verification, Turnstile on the resend-key form, hashed-key error logs, and hardware-RNG'd licence keys are all in place and correct.

The **single largest pre-release risk is the absence of IP-level rate limiting on the four AI endpoints** (`/chat`, `/critique`, `/illustrate`, `/transcribe`). Today they are gated only by per-licence credit balance. A user with a 1000-credit pack could fire 1000 chat calls in seconds; a free-tier user can fire ~150 calls before hitting zero. There is no per-IP, per-key, or per-minute ceiling — so a leaked key, a buggy client, or simple scripted abuse can spike OpenRouter / OpenAI spend faster than the credit balance can drain. Add a thin per-key rate limit (the same primitive `validate.ts` and `free-plan.ts` already use) and this risk collapses.

Two user-visible debug-cruft strings ship in the extension today — "DEBUG: fireOpeningPrompt…" and "Is wrangler dev running?" — both in production code paths. Trivial to fix, but they will be seen by real users on first error.

The legacy `/vscode-extension/` directory is shadowing the active `/extension/` build. Confirm which ships and delete the other before tagging a release.

Everything else (root-level PNGs, missing `.mcp.json` gitignore line, oversized lib files, log volume) is cleanup, not safety.

---

## Findings — by severity

### CRITICAL — fix before release

| ID | Area | Finding | Evidence |
|----|------|---------|----------|
| C-1 | **Backend / AI overload** | No IP- or key-level rate limit on `/chat`, `/critique`, `/illustrate`, `/transcribe`. Only credit-balance gating. A leaked or compromised key can burn its full credit pool against OpenRouter/OpenAI in seconds — and free-tier keys grant 150 free calls per machineId before any throttle kicks in. | `backend/src/chat.ts` (no `checkRateLimit` call), `backend/src/critique.ts:407`, `backend/src/illustrate.ts:29`, `backend/src/transcribe.ts:17` |
| C-2 | **Extension UX** | User-visible "DEBUG: fireOpeningPrompt — provider null at stage X" string in production code path. | `extension/src/panels/ChatPanel.ts:161,162,192,1013` |
| C-3 | **Extension UX** | User-visible error string "Cannot reach backend at … Is wrangler dev running?" — production users have no wrangler. | `extension/src/illustration/image-generator.ts:137` |

### HIGH — fix before release if possible

| ID | Area | Finding | Evidence |
|----|------|---------|----------|
| H-1 | **Repo / build** | Two extension directories: `vscode-extension/` (v0.33.1, the npm-shipped build) and `extension/` (v0.1.69, the active feature rewrite). Both receive parallel fixes (confirmed same commit `bfd8e1c` touched both on 2026-04-29). No security risk. Left as-is pending a future decision on which becomes the single canonical build. **Future cleanup:** when `extension/` is ready to replace `vscode-extension/` as the distributed build, update root `package.json` `files` array and `prepublishOnly` script to point to `extension/`, then delete `vscode-extension/`. | `vscode-extension/package.json` vs `extension/package.json`, root `package.json:50` |
| H-2 | **Backend / overload** | `/critique`, `/illustrate`, `/transcribe` have **no retry/backoff** on upstream 429s. Only `/chat` retries. A burst of OpenRouter/OpenAI rate-limit responses fails the request immediately and refunds credits — fine for the user, but it means a transient upstream blip propagates straight to the writer mid-session. | `backend/src/critique.ts:466`, `backend/src/illustrate.ts:116-191`, `backend/src/transcribe.ts:76` |
| H-3 | **Backend / abuse** | No request body size limit on `/illustrate` (base64 reference images), `/transcribe` (base64 audio), or `/chat` (message array). Workers caps at 100 MB but no per-route ceiling — a single expensive call could already cost more than the credit charge before we notice. | `backend/src/illustrate.ts:30`, `backend/src/transcribe.ts:23`, `backend/src/chat.ts:17` |
| H-4 | **Backend / security** | Self-XSS in `/resend-key` success page — submitted email is interpolated into HTML without escaping. Reflected only to the submitter, low blast radius, but trivially fixable. | `backend/src/resend-key.ts:154` |

### MEDIUM — clean up in next pass

| ID | Area | Finding | Evidence |
|----|------|---------|----------|
| M-1 | **Repo hygiene** | Two ~700 KB marketing PNGs committed at repo root with no in-tree references. | `storyline-page-desktop.png`, `storyline-with-hero-shot.png` |
| M-2 | **Repo hygiene** | `reset-storyline.sh` lives at repo root; it's a dev-only cleanup script that uninstalls the extension and clears keychain entries. Not in `package.json` "files" so it doesn't ship to npm, but root is the wrong home. | `reset-storyline.sh` |
| M-3 | **Repo hygiene** | `.mcp.json` is committed at root, not gitignored. Currently no secrets, but it's dev-only MCP server config with no runtime relevance to the app. | `.mcp.json`, `.gitignore` |
| M-4 | **Extension / logs** | 28+ `console.log` calls prefixed `[Storyline]` across `ChatPanel.ts`, `OnboardingPanel.ts`, `image-generator.ts`. Verbose enough that DevTools-open users will see a flood per action. Migrate to a single logger with a dev-only flag. | `extension/src/panels/ChatPanel.ts` (189, 659, 672, 698, 712, 717…), `extension/src/panels/OnboardingPanel.ts:142–221`, `extension/src/illustration/image-generator.ts:107,140,146` |
| M-5 | **Backend / observability** | `/admin/stats` falls back to `OPENROUTER_API_KEY` as the admin bearer when `ADMIN_KEY` is unset. Means anyone with the OpenRouter key (i.e. you) can read stats — fine — but in prod we should set an explicit `ADMIN_KEY` so stats access is independent of the upstream key. | `backend/src/chat.ts:244` |
| M-6 | **Backend / observability** | `/success` route makes a synchronous `fetch` to `api.github.com/releases/latest` on every visit (post-purchase page, post-Stripe redirect). If GitHub is rate-limiting or down, the success page degrades to "Download All Releases" link. Cache the release lookup in KV for 5–10 minutes. | `backend/src/success.ts:9-19,42` |
| M-7 | **Lib** | Two files exceed the 500-line CLAUDE.md rule: `lib/ai/narrative-voice-nf.js` (884) and `lib/ai/critique-api.js` (732). Pure rule-engine logic, no runtime risk — flag for splitting in the next refactor pass. | (file paths above) |
| M-8 | **Backend / referral** | `findMachineIdForLicenceKey` does a paginated KV `list` (up to 5×1000 keys) on every referral attempt to detect self-referrals. Currently safe at small scale, but linear in active-user count. Add a reverse `key:<licence>:mid` index now while the dataset is still small. | `backend/src/referral.ts:195-214` |

### LOW — note only

| ID | Area | Finding |
|----|------|---------|
| L-1 | Dev-mode `/dev/seed-licence` route — verified gated by `env.DEV_MODE !== 'true'`, prod wrangler.toml sets `"false"`. Confirmed safe. |
| L-2 | `SL-DEV-LOCAL-TEST-KEY` (`backend/src/dev-bypass.ts:3`, `extension/src/auth/licence.ts:14`) — verified gated to localhost / `DEV_MODE=true` only. Never sent to backend in production paths. |
| L-3 | Backend `__tests__/*.ts` — verified all use mocked KV + literal "test-key" strings; CI cannot burn money. |
| L-4 | `.DS_Store` — already in `.gitignore`. Worth a one-time `git rm --cached **/.DS_Store` if any slipped in historically. |
| L-5 | Tauri `installer/src-tauri/target/` — already gitignored. Build output is local-only. |
| L-6 | Site (`site/app/`) — clean. No hardcoded backend URLs, no `console.log`, no `NEXT_PUBLIC_*` envs leaking keys, `/r/[code]` referral route correctly implemented. |
| L-7 | Skill packages (`skill/`, `skill-critique/`, `skill-follow-up/`, `skill-nf/`) — clean. No secrets, no hardcoded user paths, ship-safe. |
| L-8 | No committed `.env` file; no Stripe / OpenRouter / OpenAI / Postmark key patterns found in tracked files. |

---

## Remediation backlog

Sequenced for one cleanup PR. Time estimates are rough.

### PR 1 — Ship-blockers (≈90 min)

1. **[C-1] Add per-key rate limiting to AI routes.** Use the existing `checkRateLimit` from `backend/src/rate-limit.ts`. Suggested ceilings:
   - `/chat` — 60 req / licenceKey / minute (a fast typer + critique loop never exceeds ~10/min in practice; 60 gives 6× headroom)
   - `/critique` — 20 req / licenceKey / minute
   - `/illustrate` — 10 req / licenceKey / minute (image gen is slow upstream anyway)
   - `/transcribe` — 30 req / licenceKey / minute
   Use `licenceKey` as the prefix instead of IP, since the same writer behind a school NAT shouldn't share the limit. Add IP as a *secondary* limit (200/min/IP) to cover the case where a leaked key is being scripted from one machine. Cost: two extra KV reads per AI call (~5ms).
2. **[C-2] Strip "DEBUG:" prefixes** from `extension/src/panels/ChatPanel.ts:161,162,192,1013`. Either delete the messages or rephrase as user-readable copy.
3. **[C-3] Replace "Is wrangler dev running?"** in `extension/src/illustration/image-generator.ts:137` with "Backend unavailable — check your internet connection and try again."

### PR 2 — High-severity cleanup (≈2 h)

4. **[H-1] Decide canonical extension build** and delete the other directory. Confirm `package.json` `files` array's reference to `vscode-extension/storyline-vscode-*.vsix` matches reality.
5. **[H-2] Add retry-with-backoff to `/critique`, `/illustrate`, `/transcribe`** mirroring `/chat`'s pattern (3 attempts, 500 ms delay, no fallback model needed).
6. **[H-3] Cap request body size** at handler entry — 256 KB for `/chat` and `/critique`, 8 MB for `/illustrate` (multi-image refs), 25 MB for `/transcribe` (audio). Reject with 413.
7. **[H-4] HTML-escape `email`** before interpolating into the resend-key success page.

### PR 3 — Cruft cleanup (≈45 min)

8. **[M-1]** Delete the two root-level PNGs (or move to `site/public/` if they're being used for marketing).
9. **[M-2]** Move `reset-storyline.sh` → `scripts/reset-dev-extension.sh` and add a one-line note to `AGENTS.md` or `CLAUDE.md`.
10. **[M-3]** Add `.mcp.json` to `.gitignore` and `git rm --cached .mcp.json`.
11. **[M-4]** Replace `console.log("[Storyline] …")` calls with a `logger.debug()` facade gated by a `storyline.debugLogging` setting (default off). Routes the same content via `vscode.window.createOutputChannel('Storyline')` when enabled.
12. **[L-4]** `git rm --cached '**/.DS_Store'` and commit, just to clean history going forward.

### PR 4 — Observability & scale (≈1.5 h, can defer)

13. **[M-5]** Set explicit `ADMIN_KEY` secret via `wrangler secret put` in production, decoupling stats access from `OPENROUTER_API_KEY`.
14. **[M-6]** Cache `/success`'s GitHub release lookup in KV with `expirationTtl: 600` (10 min). Removes a 200-500 ms blocking fetch from every post-purchase page view.
15. **[M-7]** Split `lib/ai/narrative-voice-nf.js` and `lib/ai/critique-api.js` along their natural sub-domain boundaries.
16. **[M-8]** Add `key:<licenceKey>:mid` reverse index when minting a free key and lookup it directly in `findMachineIdForLicenceKey` instead of paginating `mid:` prefix.

---

## Notes on what we deliberately did *not* find

- **No committed secrets** anywhere in the tree. `.env.example` is the only `.env*` file in git. Wrangler secrets (`OPENROUTER_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, `POSTMARK_API_KEY`, `TURNSTILE_SECRET_KEY`) are correctly set via `wrangler secret put`, not in code.
- **No fire-on-keystroke AI calls** in the extension. `onDidChangeTextDocument` listeners drive only word-count and preview refresh; AI calls are gated to explicit save / submit / "Generate" actions.
- **No real-API tests** in `backend/src/__tests__/` — all use mocked KV + literal "test-key" strings.
- **No `debugger;` statements**, no `*.bak` / `*.old` / `*.tmp` files, no large commented-out blocks.
- **Optimistic credit deduction** is correctly implemented across `/chat`, `/critique`, `/illustrate`, `/transcribe` with restore-on-failure.
- **Stripe webhook signature** verified via SubtleCrypto HMAC-SHA256, idempotency-keyed refunds, payment-intent indexing — all sound.

---

## Closing call

Ship-blocker count is low (3 items, all <2 hours). The rate-limit gap (C-1) is the only finding with material money / abuse risk; everything else is hygiene. Land PR 1 + PR 2, defer PR 3 + PR 4 to a tidy-up window, and the codebase is release-grade.
