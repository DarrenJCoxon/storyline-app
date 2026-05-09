# Storyline codebase improvement backlog

Source: senior-eng review, 2026-05-09. Tickets are sized for one focused PR each. Pick from the top of each tier.

Status legend: `TODO` `IN-PROGRESS` `DONE` `BLOCKED` `WONTFIX`

* * *

## Tier 1 — structural debt (highest leverage)

### CB-01 · Eliminate the `lib/` → `extension/lib/` shadow copy

**Status:** PARTIAL (v0.2.22 — see CB-01b for the full elimination) · **Effort:** L (1–2 days) · **Risk:** medium

The canonical `lib/` is sync'd into `extension/lib/` by `scripts/sync-extension-lib.mjs`. Every change must be made in two places or the next sync silently clobbers it (this caused the v0.2.10–12 thrash and today's stage-doc bug). The `.vscodeignore` whitelist for `fs-extra`/`chalk`/`markdown-it` exists only because lib runs as dynamic ES modules at runtime instead of being bundled.

**Approach:** publish `lib/` as a workspace package (`@storyline/runtime`) alongside `@storyline/core`. Extension imports it via package.json dep. esbuild bundles it (and its deps) into `dist/extension.js` like any other dep. Move it to `devDependencies` in extension so vsce's `npm list --production` skips it (same trick we used for `@storyline/core`).

**Acceptance:**

- `scripts/sync-extension-lib.mjs` is deleted
- `extension/lib/` no longer exists
- `.vscodeignore` no longer needs whitelist entries for `fs-extra`/`chalk`/`markdown-it`/`graceful-fs`/`jsonfile`/`universalify`/`argparse`/`entities`/`linkify-it`/`mdurl`/`punycode.js`/`uc.micro`
- `unzip -l storyline.vsix | grep node_modules` shows only `sharp`, `@img/*`, `pagedjs`, `markdown-it-attrs`, `odd-flow`, `@noble`, `sql.js` (the actually-required runtime deps)
- All existing functionality still works: live preview, compile, master doc generation, stage saves
- VSIX size drops noticeably

**Files involved:**

- `scripts/sync-extension-lib.mjs` (delete)
- `lib/` (move/refactor)
- `extension/package.json` (deps)
- `extension/.vscodeignore` (simplify)
- `extension/esbuild.config.mjs` (verify externals)

**Depends on:** none. Blocks CB-02.

**Outcome (v0.2.22):**

- Switched the highest-impact dynamic import (`master-doc.js`) from `lib/` to `@storyline/core` in extension.ts. Removed a real concurrency hazard: the old code did `process.chdir(projectDir)` on the extension host to compensate for `lib/output/master-doc.js`'s `process.cwd()` antipattern (CB-02), which interleaves dangerously with any other parallel command.
- `scripts/sync-extension-lib.mjs` now delete-then-copies. Without this, files removed from canonical `lib/` would linger as stale code in `extension/lib/` and ship in the VSIX. This kills the "two copies that diverge" bug class for files that DO get pruned from `lib/`.
- The remaining \~13 dynamic imports of `lib/` files (compile pipeline, doctor, manuscript ops) still work as-is and are tracked under CB-01b. Their full elimination requires extracting `lib/` into a separate published workspace package and converting the dynamic imports into static esbuild-bundled imports.

* * *

### CB-01b · Extract `lib/` into a published workspace package

**Status:** TODO · **Effort:** L (1–2 days) · **Risk:** medium

After CB-01a, the remaining shadow copy ships \~13 lib/ files that the extension dynamic-imports at runtime: the entire compile pipeline (`compile/*.js` — 30 files), `doctor.js`, and `manuscript/{notes,snapshot,compare}.js`. These need to remain as on-disk files because esbuild can't statically resolve dynamic imports across package boundaries.

**Approach:** create `packages/runtime/` as a published workspace package (alongside `@storyline/core`):

1. Move all of `lib/` into `packages/runtime/src/`
2. Convert dynamic imports in `extension.ts` and `compile-runner.ts` to `await import('@storyline/runtime/...')` — esbuild can bundle these AND code-split them into separate chunks (`splitting: true`) so activation cost stays low
3. Delete `extension/lib/`, `scripts/sync-extension-lib.mjs`, and the `.vscodeignore` whitelist for runtime deps that were only there because lib/ ran un-bundled

**Acceptance:**

- `extension/lib/` no longer exists
- `sync-extension-lib.mjs` deleted
- `.vscodeignore` no longer whitelists `fs-extra`, `chalk`, `markdown-it`, etc.
- `bin/storyline.js` (the Claude Code CLI skill) updated to import from `@storyline/runtime` too — single source of truth for both extension and CLI
- VSIX size drops measurably (no duplicated lib/ + esbuild can dedupe shared deps)

**Depends on:** CB-01a (already shipped via v0.2.22).

* * *

### CB-02 · Audit and fix `process.cwd()` antipattern across `lib/`
**Status:** PARTIAL (extension-v0.2.25 — see notes)  ·  **Effort:** M (4–6 hrs)  ·  **Risk:** medium

Survey: of the 33 `process.cwd()` hits flagged in the original review, most turned out to be safe — `(arg = process.cwd())` defaults that callers correctly override. The actual landmines were a small number of inline `resolve(process.cwd(), …)` calls in functions that never accepted `projectDir`. Fixed in two passes:

1. **CB-01a (v0.2.22)** — `lib/output/master-doc.js` (used by `Generate Master Document`). Switched the extension to `@storyline/core`'s parameterised version, removed the `process.chdir` hack.
2. **extension-v0.2.25** — `appendMemoryLog` in `packages/core/src/memory/stage-memory.ts`. Was hardcoded to `process.cwd()`; called from `syncResearchToMemory(projectDir, state)` without threading the project path through. Result: research-to-memory sync writes were going to wherever VS Code was launched from, not the user's project. Fixed by adding `projectDir = process.cwd()` parameter (default keeps CLI usage correct) and threading through the caller. Same fix mirrored to `lib/memory/stage-memory.js` for CLI parity.

Remaining survey results (NOT bugs): `lib/state/store.js`, `lib/engine.js`, and most of the rest are CLI-only entry points where `process.cwd()` IS the project directory. Safe.

The structural fix — porting all of lib/ to TypeScript and making `projectDir` a required compile-time parameter — is folded into CB-01b.

* * *

### CB-03 · Decompose `ChatPanel.ts` (1400 lines)

**Status:** TODO · **Effort:** L (1–2 days) · **Risk:** medium

ChatPanel does webview lifecycle + message routing + state management + AI streaming + command orchestration + file writes + memory pushes + gating + NF/fiction routing in one class. Today's stage-doc bug lived here — the right boundary would have made it obvious.

**Approach:** decompose into focused services with explicit interfaces:

- `ChatPanel` — webview lifecycle only (\~200 lines)
- `MessageRouter` — the giant handleMessage switch (\~250 lines)
- `StagePersistence` — applyEmittedPatches + writeStageDoc + pushToMemory + gating (\~250 lines, the hot zone)
- `AIStreaming` — SSE handling, token counting, cancellation (\~200 lines)
- `ProjectArtefactRegenerator` — chapter cards, master docs, promise-payoff, story bible, character matrix (\~250 lines)

Each gets a unit test.

**Acceptance:**

- No file in `extension/src/panels/` exceeds 400 lines
- ChatPanel's tests don't need to mock the entire planning pipeline to test message routing
- StagePersistence has its own unit test asserting markdown lands in the project (covers CB-04)

**Depends on:** none, but CB-04 piggybacks naturally.

* * *

### CB-04 · End-to-end test for the fiction stage-save flow

**Status:** DONE (v0.2.20) · **Effort:** M (3–4 hrs) · **Risk:** low

The bug we shipped in v0.2.18 (stage docs not landing in project) would have been caught by \~5 lines of test. The product's most critical flow has zero coverage.

**Approach:** integration test that scaffolds a temp project, simulates a stage save by feeding a fake AI JSON patch through `applyEmittedPatches`, asserts:

1. `state.json` updated
2. `planning/stages/<id>.md` exists in the project (not anywhere else)
3. `.storyline/memory.jsonl` contains the patch
4. Stage marker advanced when complete, NOT advanced when gate-blocked

Cover at least 3 fiction stages (`genre`, `protagonist`, `beatSheet`) and 2 NF stages (`dna-promise`, `pa-thesis`). Run in CI.

**Acceptance:**

- New test file `extension/src/__tests__/stage-save-flow.test.ts`
- CI fails if `writeStageDoc` regression hits
- Test runs in &lt;5s

**Depends on:** ideally after CB-03 (StagePersistence is easier to test than ChatPanel monolith), but can be done before with mocks.

**Outcome (v0.2.20):** Test landed at `extension/src/__tests__/stage-save-flow.test.ts` with 8 cases. Caught a real production bug in the process: the `dna-promise` renderer was reading `measurableOutcome` (never emitted by the LLM) instead of `subtitleAlt` (in the stage guide but never surfaced). Fix shipped alongside the test. See CB-04b for the broader audit.

* * *

### CB-04b · Audit NF renderer field-name drift from stage guides

**Status:** DONE (v0.2.23) · **Effort:** M (3–4 hrs) · **Risk:** low

CB-04 found one case (`dna-promise`) where the renderer in `packages/core/src/output/stage-doc.ts` was reading state keys that didn't match the questions defined in `packages/core/src/ai/stage-guides-nf-dna.ts`. The renderer outputs nothing for missing keys, so the markdown body looks half-empty even though the LLM provided every field.

There are \~50 NF stages across DNA + pipelines A/B/C + academic. Each has a guide-questions list and a renderer; they need to stay in lockstep. The fix is mechanical:

1. For each NF stage, list the `key` from each `questions[]` entry in the guide
2. List every `s.<field>` read in the corresponding `nfRenderers[id](state)` body
3. For each mismatch:
   - Field in guide but not in renderer → add an `nfLine`/`nfList` entry
   - Field in renderer but not in guide → remove (or update the guide if it's a real omission)

**Acceptance:**

- Add a single static test that imports both the guides and the renderers, walks every stage, and asserts the field sets agree (or are explicitly whitelisted as renderer-only / guide-only).
- All NF stage docs round-trip the LLM-emitted patches into non-empty markdown bodies.
- Pin via the same test framework as CB-04.

**Depends on:** CB-04 (uses the same test scaffold).

* * *

## Tier 2 — reliability gaps

### CB-05 · Production error reporting

**Status:** DONE (v0.2.21) · **Effort:** S (2–3 hrs) · **Risk:** low

Right now the only way to know something's broken in production is users emailing. We're flying blind on activation hangs, preview failures, transcription errors.

**Approach:** add a single `POST /errors` endpoint to the Worker backend that accepts `{ message, stack, version, platform, command, licenceKeyHash }`. Extension's `logError` wrapper sends to it (sampling at 100% for now; throttle later). Display a digest in `wrangler tail` or pipe to a simple dashboard.

Don't reach for Sentry yet — your Worker can store errors in KV with a TTL, dump to a `/admin/errors` view. Keep it simple until volume justifies more.

**Acceptance:**

- `POST /errors` endpoint with rate-limit (existing infra) and licenceKey hash for de-anonymised aggregation
- Extension-side `reportError(err, context)` helper called from try/catch boundaries that we already have (preview commands, install_storyline, ChatPanel handlers)
- `wrangler tail` or simple admin endpoint shows last 100 errors

**Depends on:** none.

**Outcome (v0.2.21):**

- Backend `/log-error` endpoint already existed (logs structured JSON to Cloudflare Workers Logs, hashes licence keys, 7-day retention). Reused as-is — Logpush → R2 upgrade is a future enhancement when volume justifies.
- Extension's existing `reportError` (AI-call failures only) extended with `reportException(err, context, extra?)` for generic exceptions with stack traces.
- New `safeCommand(commandId, handler)` helper (`extension/src/safe-command.ts`) wraps VS Code command registrations with try/catch + toast + reportException. Single-place catch logic for command callbacks; this also folds in the discoverable-paths slice of CB-10.
- Wired into the four highest-traffic command sites: `openLivePreview`, `openPreview`, `startNew`, `openWelcome`. The bespoke try/catches we shipped in v0.2.9 for the two preview commands are removed (consolidated into safeCommand).
- `activate()`'s outer catch now reports activation failures via lazy-imported `reportException`, so we'll see machines where the extension fails to start before users email.
- Remaining \~32 commands not yet wrapped — completing the migration is CB-10.

* * *

### CB-06 · Defer auto-update check 30s after activation

**Status:** DONE (v0.2.23) · **Effort:** XS (30 min) · **Risk:** very low

Auto-update fires \~500ms after activation on every workspace open. First-action experience is faster if we wait until VS Code is idle.

**Approach:** wrap the existing auto-update kick-off in `setTimeout(..., 30_000)` and skip if the workspace is closed before the timer fires.

**Acceptance:**

- Boot log shows "auto-update: deferred"
- Update check runs after 30s
- Closing VS Code within 30s cancels the timer

**Depends on:** none.

* * *

### CB-07 · Decouple installer + extension versioning

**Status:** DONE (v0.2.24 + extension-v\* scheme) · **Effort:** M (4–6 hrs) · **Risk:** medium

Today, every typo fix in the extension triggers a full DMG+MSI rebuild and forces users to redownload \~110MB. The installer should fetch the latest VSIX dynamically instead of bundling a specific version.

**Approach:**

- Installer no longer bundles `storyline.vsix` as a Tauri resource
- On `install_storyline`, after VS Code is in place, the installer downloads the latest `storyline.vsix` from GitHub Releases (similar pattern to the VS Code download flow)
- Extension repo + extension package.json versioning becomes independent of installer/Tauri/Cargo
- Installer release cadence drops to "actually changed installer code" (rare)

**Acceptance:**

- `extension/package.json` can bump independently of installer
- Pushing a tag matching `extension-v*` triggers a VSIX-only release workflow
- Installer fetches latest VSIX at install time
- Existing users on old installers still work (since VS Code itself updates extensions)

**Depends on:** none, but coordinate with CB-08 (release workflow split).

**Outcome (v0.2.24):** Installer (`installer/src-tauri/src/main.rs`) now has a `download_latest_vsix()` function that walks `/repos/.../releases?per_page=20` via the GitHub API and downloads the first release with a `storyline.vsix` asset. `install_storyline_sync()` prefers this over the bundled VSIX; falls back to the Tauri-resource bundled VSIX on any failure (offline install, GitHub down, rate-limited). The bundled VSIX is now an offline safety net rather than the canonical version — installer DMGs stay valid across many extension releases.

* * *

### CB-08 · Split CI release workflows

**Status:** DONE (v0.2.24) · **Effort:** S (2 hrs) · **Risk:** low

Currently every `v*` tag rebuilds everything. After CB-07 there should be:

- `v*` (e.g. `v0.3.0`) — full installer + extension release
- `extension-v*` (e.g. `extension-v0.2.21`) — VSIX-only release, much faster CI
- `installer-v*` (e.g. `installer-v0.3.0`) — installer-only release

**Acceptance:**

- Three workflow files or one with branched jobs
- Extension-only release in &lt;2min (no Rust compile, no notarisation, no Windows build)

**Depends on:** CB-07.

**Outcome (v0.2.24):** New `.github/workflows/release-extension.yml` triggers on `extension-v*` tags. Builds and publishes a VSIX-only release with `prerelease: true` so it doesn't override the homepage's "latest" pointer (which serves the DMG). Installer's CB-07 download walk picks up the VSIX from prereleases too. Auto-updater in `extension/src/update/auto-updater.ts` updated to walk `/releases?per_page=20` (instead of `/releases/latest`) and find the first release with a `storyline.vsix` asset, so existing users get extension-only releases via auto-update without re-running the installer. `compareVersions` extended to strip both `v` and `extension-v` prefixes.

* * *

## Tier 3 — code quality + UX polish

### CB-09 · Decompose `live-preview-command.ts` (2625 lines)

**Status:** TODO · **Effort:** L (1–2 days) · **Risk:** medium-high

Single file, single function, doing webview lifecycle + theme/opener discovery + CSS loading + markdown rendering + picture-book pipeline + scene-break handling + style picker + paged.js wiring + post-message routing + chapter-change debouncing.

**Approach:** roughly 8 files:

- `live-preview-command.ts` — entry point (\~150 lines)
- `theme-discovery.ts` — discoverThemes / discoverOpeners (\~150 lines)
- `css-loader.ts` — loadAllStylesCss + the compile pipeline plumbing (\~200 lines)
- `webview-html.ts` — buildWebviewHtml (\~250 lines)
- `markdown-renderer.ts` — createRenderer + the picture-book vs prose branches (\~400 lines)
- `chapter-watcher.ts` — file-system watching + active-doc resolution (\~150 lines)
- `style-picker-bridge.ts` — postMessage handlers for the in-preview style picker (\~200 lines)
- `font-loader.ts` — buildPreviewFontCss (\~100 lines)

**Acceptance:**

- No file &gt;400 lines
- Each module has its own unit tests (smaller surface = testable)

**Depends on:** none, but big — schedule when no preview features in flight.

* * *

### CB-10 · Wrap every command callback in try/catch with error toast

**Status:** DONE (v0.2.23) · **Effort:** S (1–2 hrs) · **Risk:** very low

We did this for the two preview commands in v0.2.9 and immediately learned the real bug. There are \~20 other commands in extension.ts; most do `void someAsyncFn()` with no error path.

**Approach:** introduce a `safeCommand(name, fn)` helper that wraps the registration with try/catch + showErrorMessage + reportError (when CB-05 lands). Replace all `vscode.commands.registerCommand(...)` calls with it.

**Acceptance:**

- No bare `void` on an async command callback in extension.ts
- Any command that throws shows a toast with the actual error
- Errors auto-route to CB-05's reporting

**Depends on:** independently useful; pairs with CB-05.

* * *

### CB-11 · Live consistency watcher

**Status:** TODO · **Effort:** L (2–3 days) · **Risk:** medium

The AI never re-reads stage docs after writing them. If user manually edits `planning/stages/protagonist.md` or `planning/stages/beatSheet.md`, those edits never feed back. The infra exists (memory + state + critique-wiring) — the missing piece is a watcher that detects edits, parses them back into state, flags contradictions.

**Approach:**

- File-system watcher on `planning/stages/*.md` and `planning/chapters/*.md`
- On edit, run a "round-trip" parse to reconstruct the patch, diff against state.json
- If non-trivial divergence, queue a critique pass that reads ALL stages and flags any pair that contradicts (e.g., protagonist WANT vs scene N goal)
- Surface contradictions as VS Code diagnostics on the offending line

**Acceptance:**

- Editing a stage MD updates state.json after a debounce
- Cross-stage contradictions show as VS Code "Problems" panel entries
- Doesn't fire on every keystroke (debounce 2s + git-mtime check)

**Depends on:** CB-04 (the test framework helps validate this).

* * *

### CB-12 · Voice-first writing — dictate into chapters

**Status:** DONE (extension-v0.2.26) · **Effort:** M (1 day) · **Risk:** low

Webview MediaRecorder is already in for the planning chat (v0.2.14). Extending it to the chapter editor unlocks "I can write while walking the dog" — a real differentiator.

**Approach:**

- Same MediaRecorder pattern in the editor webview
- Mic button in the editor toolbar
- On stop, transcribe + insert at cursor
- Optional: live partial transcription via Whisper streaming (separate ticket)

**Acceptance:**

- Mic button in editor toolbar
- Hold to record, release to transcribe-and-insert
- Same permission flow as planning chat (uses CB-?? deep-link pattern)

**Depends on:** none.

* * *

### CB-13 · Manuscript versioning via Git, surfaced in writer-language

**Status:** TODO · **Effort:** L (1 week+) · **Risk:** medium

GitHub auto-sync exists. Lean into it as a writer-facing feature: "Save as version 2" creates a branch, "Try a different ending" branches at the climax, "Compare endings" diffs two branches with prose-aware diff.

**Approach:**

- New "Versions" sidebar view (separate from Files)
- "Save as version" command → creates `version/<name>` branch with AI-generated commit message describing the changes since last save
- "Compare versions" → opens a side-by-side prose diff (not unified-diff format — paragraph-aware)

**Acceptance:**

- Writer never sees the word "branch" or "commit"
- Versions discoverable from sidebar without command palette
- AI commit messages explain plot changes, not file changes

**Depends on:** none.

* * *

### CB-14 · Marketplace for templates (themes, openers, prompt packs)

**Status:** TODO · **Effort:** XL (2+ weeks) · **Risk:** medium

Infrastructure exists: `book-styles/`, `chapter-openers/`, planning prompts. Other writers will want to share. Could be a free community thing or charge.

**Approach:** out of scope for this backlog; ticket is a placeholder for product strategy.

**Depends on:** product decision before engineering.

* * *

## Tier 4 — small wins (do when context-switching)

### CB-15 · Free-plan dev reset endpoint

**Status:** DONE (backend deploy + extension-v0.2.25) · **Effort:** XS (30 min) · **Risk:** very low

Already discussed: machineId guard prevents devs (and the user) from getting a fresh 150 credits during testing. Add `/free-plan/reset?token=<dev-token>` that wipes the `mid:<id>` mapping. Wire into `scripts/reset-storyline.sh`.

**Acceptance:**

- Dev token check (env var or hardcoded for dev backend only)
- Reset script calls it after wiping local state

**Outcome:** New `backend/src/free-plan-reset.ts` exposes `POST /free-plan/reset` with `Authorization: Bearer <ADMIN_KEY>` (falls back to `OPENROUTER_API_KEY` if `ADMIN_KEY` isn't set). Body `{ machineId }` deletes the forward map (`mid:<machineId>`), reverse map (`key:<licenceKey>:mid`), and the licence record itself. Idempotent — succeeds even if no mapping exists. Wired into `scripts/reset-storyline.sh` step 10 — only fires when `STORYLINE_ADMIN_KEY` env var is set, so production users never trigger it. 7 unit tests in `backend/src/__tests__/free-plan-reset.test.ts`.

* * *

### CB-16 · Suppress dev-noise log lines

**Status:** DONE (extension-v0.2.26) · **Effort:** XS (15 min) · **Risk:** very low

`ChatPanel.init: stored key prefix = SL-FREE-A397` and similar in DevTools console. Gate behind a `STORYLINE_VERBOSE=1` env var.

**Outcome:** New `logVerbose` helper in `extension/src/diagnostic-log.ts`. Off unless `STORYLINE_VERBOSE=1`. Migrated the chatty per-init lines in OnboardingPanel + ChatPanel from raw `console.log` to `logVerbose`. DevTools console is quiet for users on the production build.

* * *

### CB-17 · Decouple boot log from production builds

**Status:** DONE (extension-v0.2.26) · **Effort:** S (1–2 hrs) · **Risk:** low

The `__storylineBootLog` writes a file every activation. Useful when debugging Windows hangs — overhead the rest of the time. Gate behind a setting (default off in production VSIXs, on in dev).

**Outcome:** Both gates wired up: `extension/src/utils/boot-log.ts` no-ops unless `STORYLINE_BOOT_LOG=1`, AND the synchronous esbuild banner in `extension/esbuild.config.mjs` checks the same env var before installing the module-load tracer. Off-by-default everywhere — re-enable when chasing a new activation issue.

* * *

### CB-18 · Webview shared design system

**Status:** WONTFIX (after survey) · **Effort:** M (4–6 hrs) · **Risk:** low

Each webview has its own `tokens.css` with subtle variants. Lift into a single `extension/webview/src/shared/tokens.css` consumed by all entry points. The `bootstrapStorylineTheme` util we built in v0.2.16 is the natural anchor.

**Outcome:** Survey showed less duplication than the original ticket assumed. Three patterns intentionally coexist: branded panels (planning) with full Storyline tokens + light variant, native VS Code panels (compile/cover/illustrations) using `var(--vscode-*)` directly, and lightweight aliasing (research/manuscript). Total duplication is ~5 lines across two files; consolidating would add an import statement to save 5 lines — net negative. Closing without action.

* * *

### CB-19 · README + ARCHITECTURE.md for human contributors

**Status:** DONE (extension-v0.2.26) · **Effort:** S (1–2 hrs) · **Risk:** very low

CLAUDE.md is good for AI agents. There's no overview for a human dropping into the repo for the first time. 25+ top-level dirs deserve a map.

**Outcome:** New `docs/ARCHITECTURE.md` covers the four-products-in-one-repo overview, top-level directory map, build/release pipeline (including the new extension-v* tag scheme), the stage-save data flow (the canonical path most contributors land on), activation rules, the lib/ shadow-copy explanation with CB-01b roadmap, errors+observability (safeCommand + reportException + logVerbose + boot log), testing setup, and conventions worth knowing before editing.

* * *

## How to use this backlog

- Pick from top of Tier 1 first; work down
- Each ticket is one PR
- Update status inline (TODO → IN-PROGRESS → DONE)
- Add new tickets at the bottom of the relevant tier with the next CB-NN number