# Storyline architecture

A map for new contributors. CLAUDE.md is the rules-and-conventions doc; this is the *what-lives-where* doc.

## At a glance

Storyline is four products in one repo:

1. **VS Code extension** (`extension/`) — the actual user-facing app. Webview panels for chat, rich-text writing, compile, cover, illustrations, research. Bundled VSIX.
2. **Tauri installer** (`installer/`) — small Rust + React app users download from the marketing site. Downloads VS Code, drops the VSIX into VS Code, opens the user's first project.
3. **Cloudflare Worker backend** (`backend/`) — `api.storyline.my`. Holds Stripe webhooks, licence/credit accounting, OpenAI/OpenRouter proxying, transcription, error logging. Single Worker, KV for state.
4. **Marketing site** (`site/`) — Next.js, deployed on Vercel. Pricing, download links that resolve dynamically from GitHub Releases.

Plus a fifth thing — a Claude Code CLI skill (`bin/storyline.js` + `skill/`, `skill-nf/`, `skill-critique/`, `skill-follow-up/`) — that ships the same planning logic as a `/storyline` command for users running Claude Code in any project. Shares the canonical `lib/` with the extension; CB-01b will collapse the two consumers onto a single workspace package.

## Directory map (top level)

| Path | What it is |
|---|---|
| `extension/` | VS Code extension — the headline product. TypeScript + React webviews. |
| `extension/src/` | Extension host code (runs in Node). `panels/` (webview-backed UI), `state/`, `auth/`, `ai/`, `update/`, `editor/`, `compile/`, `wiki/`, `onboarding/`, `github/`. |
| `extension/webview/src/` | Each subdir is a separate webview with its own Vite entry: `planning/`, `editor/`, `compile/`, `cover/`, `illustrations/`, `research/`, `manuscript/`, `onboarding/`. |
| `extension/lib/` | Synced copy of `lib/` for runtime dynamic-import. CB-01a hardened the sync; CB-01b will eliminate it. |
| `packages/core/` | TypeScript workspace package — pure domain logic (stage guides, state transitions, output renderers, critique, research subsystem). Bundled into the extension by esbuild. |
| `lib/` | Canonical JS source for the compile pipeline + memory + state-store helpers. Used by the CLI directly and by the extension via the synced `extension/lib/` copy. |
| `installer/` | Tauri installer. `src/` is React (welcome → progress → done flow), `src-tauri/src/main.rs` is the Rust that spawns curl, ditto, code-CLI calls. |
| `backend/` | Cloudflare Worker. `src/index.ts` routes; one file per endpoint; `__tests__/` covers credits, refunds, free plan, critique, etc. |
| `site/` | Next.js marketing site. `app/` is the App Router tree. |
| `docs/` | Markdown docs. `docs/backlog/` is the engineering backlog. `docs/roadmap/` is the product side. |
| `bin/storyline.js` + `skill*/` | Claude Code `/storyline` CLI skill bundle. |
| `scripts/` | Dev utilities. `reset-storyline.sh`, `sync-extension-lib.mjs`, etc. |
| `tauri/` | Older Tauri scaffold; mostly historical, kept until installer/ supersedes fully. |
| `tests/` | Top-level tests. Most actual tests live alongside source under `__tests__/`. |
| `agents/`, `examples/`, `templates/`, `vscode-extension/` | Historical scaffolds. Not actively maintained — check git log before touching. |

## Build + release pipeline

### Three release tag schemes

| Tag pattern | Workflow file | What it builds | Time |
|---|---|---|---|
| `v0.x.y` | `release.yml` | Full release: VSIX + macOS DMG (Apple Silicon + Intel, signed + notarised) + Windows MSI | ~7 min |
| `extension-v0.x.y` | `release-extension.yml` | VSIX only — published as `prerelease: true` so it doesn't override the homepage's "latest" pointer | ~2 min |
| (no tag, push to `main`) | `ci.yml` | Typecheck + tests for `packages/core`, `extension`, `backend`, `site`. Gate before any release. |

The Tauri installer (v0.2.24+) fetches the most recent storyline.vsix from GitHub Releases at install time, walking the API for the latest release with that asset (including prereleases). The bundled VSIX inside the DMG is now an offline fallback only.

The auto-updater inside the installed extension (`extension/src/update/auto-updater.ts`) walks the same release list and offers an in-place update toast when a newer VSIX exists.

### Versioning

Four files hold the version, intended for two cadences:

- **Full release (`v0.x.y`)** — bump all four:
  - `installer/package.json`
  - `installer/src-tauri/tauri.conf.json`
  - `installer/src-tauri/Cargo.toml`
  - `extension/package.json`
- **Extension-only release (`extension-v0.x.y`)** — bump just `extension/package.json`. Installer/Tauri/Cargo stay where they are.

The marketing site's download URLs resolve dynamically from the GitHub API ([`site/app/getDownloads.ts`](../site/app/getDownloads.ts)). No site code change needed for new releases.

## How a stage save works (the data flow that mattered)

The chain that drives Storyline's planning UX:

1. User chats in the planning webview ([`extension/webview/src/planning/`](../extension/webview/src/planning/)).
2. Webview posts the message to [`ChatPanel.ts`](../extension/src/panels/ChatPanel.ts).
3. ChatPanel calls the AI (`ManagedProvider` → backend `/chat` → OpenAI/OpenRouter).
4. AI streams back text. ChatPanel parses with `extractJsonBlock` ([`extension/src/state/local-store.ts`](../extension/src/state/local-store.ts)) — the AI emits a fenced ```json block with the patch.
5. `applyEmittedPatches` merges the patch into `state.json` via `LocalStore.merge`, runs `gateStageSave` from `@storyline/core`, and if complete:
   - Marks the stage `completed: true` in `state.json`
   - Calls `writeStageDoc(stageId, state, projectDir)` from `@storyline/core` → writes `planning/stages/<id>.md`
   - Calls `pushToMemory` ([`extension/src/state/memory.ts`](../extension/src/state/memory.ts)) → writes `.storyline/memory.jsonl` AND pushes to odd-flow's SQLite memory
6. Background regeneration tasks defer via `Promise.resolve().then(...)` — chapter cards, master docs, promise-payoff ledger, story bible, etc.

The renderers in `packages/core/src/output/stage-doc.ts` MUST read keys that match the question keys defined in `packages/core/src/ai/stage-guides-nf-*.ts`. CB-04b's static drift test (`extension/src/__tests__/nf-renderer-drift.test.ts`) fails the build if they diverge.

## How activation works (and what NOT to do)

Activation events: `workspaceContains:.storyline/state.json` + `onUri`. The extension stays dormant in workspaces with no `.storyline` folder.

Activity bar icon shows always (declarative — VS Code renders from package.json without activating). When the user clicks the icon in a non-Storyline workspace, VS Code activates the extension, which sees `storyline.hasProject` is false and renders a `viewsWelcome` panel with a "Start New Project" button. Clicking the button activates the full flow.

**Don't add eager activation paths.** Specifically don't:
- Add status bar items in `activate()` that render unconditionally
- Add file system watchers that fire before the user has engaged
- Network calls in `activate()` (auto-update is deferred 30s after activation — CB-06)

## How the canonical `lib/` works (and why)

The compile pipeline (`lib/compile/`) and a few utility modules (doctor, manuscript ops) are still plain JS, dynamic-imported by the extension at runtime. esbuild can't statically resolve dynamic imports across package boundaries, so those .js files ship as actual files inside the .vsix install (via `extension/lib/`).

`scripts/sync-extension-lib.mjs` mirrors `lib/` → `extension/lib/` on every `npm run build:dist`. CB-01a hardened it to delete-then-copy so removed files in `lib/` actually disappear in the synced copy.

CB-01b will collapse this into a published workspace package — when that lands, both extension and CLI (`bin/storyline.js`) import from the same package and the shadow copy goes away. Until then: any file in `lib/` that's also in `packages/core/src/` is duplicated; the canonical version is the TypeScript one in `packages/core` (the extension imports it via `@storyline/core`). Don't edit the duplicates in `lib/` for code that has a TS twin — your edits will have no effect on the extension.

## Errors + observability

Two layers:

1. **Per-command toast** — `safeCommand()` ([`extension/src/safe-command.ts`](../extension/src/safe-command.ts)) wraps every `vscode.commands.registerCommand`. Catches throws, shows a VS Code error toast, calls `reportException`. Extend this for any new top-level error path — never `void someAsyncFn()` an unwrapped command callback.
2. **Production reporting** — `reportException(err, context, extra?)` ([`extension/src/ai/error-reporter.ts`](../extension/src/ai/error-reporter.ts)) fire-and-forget POST to `/log-error` on the Worker. The Worker hashes licence keys and logs structured JSON to Cloudflare Workers Logs (7-day retention). Inspect with `wrangler tail --format=pretty` or the dashboard.

Local-only diagnostics:

- **Output → Storyline** — VS Code's output channel. `logInfo`/`logWarn`/`logError` from [`extension/src/diagnostic-log.ts`](../extension/src/diagnostic-log.ts).
- **`logVerbose`** — opt-in via `STORYLINE_VERBOSE=1`. Used for chatty per-init lines (handler-entered breadcrumbs, raw API responses, prefix dumps). Off by default to keep DevTools console quiet for users.
- **Boot log** — opt-in via `STORYLINE_BOOT_LOG=1`. Synchronous file-based log at `~/.storyline-boot.log` (Mac/Linux) or `%LOCALAPPDATA%\Storyline\boot.log` (Windows). Catches activation hangs that occur before the output channel is registered. Off by default — was indispensable while debugging the Windows DPAPI hang in v0.1.x but redundant on a stable build.

## Testing

| Suite | Where | What it covers |
|---|---|---|
| `packages/core` | (none currently — empty test glob, build only) | TypeScript domain logic. CI runs `npm run typecheck`. |
| `extension` (vitest) | `extension/src/**/__tests__/`, `extension/src/__tests__/` | Provider routing, critique-wiring, wiki injection, credit display, **stage-save end-to-end (CB-04)**, **NF renderer drift (CB-04b)**. Mocks `vscode` where needed. |
| `backend` (vitest) | `backend/src/__tests__/` | Validate, free-plan issue + reset, credit batches, critique, referral. |

`npm test` at each level. CI gates releases on all three.

## Conventions worth knowing before editing

- **Don't introduce `process.cwd()` in `lib/` or `packages/core/`.** It's wrong inside the extension host. Pass `projectDir` explicitly. CB-02 documents the audit trail.
- **Don't `await import('../../lib/foo.js')` for new code.** Either port to `packages/core` or wait for CB-01b. The remaining dynamic-import sites are ones we haven't ported yet, not a pattern to copy.
- **Webview imports `@storyline/core` for everything ported there**, then the runtime resolution comes from esbuild's bundle. Anything still in `lib/` requires the synced shadow copy.
- **All commands go through `safeCommand`.** That's your error toast + report path.
- **Don't write to `process.cwd()` from any code that might run inside the extension host.** That includes lib/-shipped helpers — pass projectDir.
- **Keep single tag scheme per change**: extension-only fix → `extension-v*`. Anything that touches the installer or marketing site → full `v*` release.

## Where to start when you're new

1. Read [`CLAUDE.md`](../CLAUDE.md) (rules + conventions) and [`docs/backlog/codebase-improvements.md`](backlog/codebase-improvements.md) (active engineering backlog).
2. Run `npm install` at the repo root (workspaces hoist), then `npm run typecheck` and `npm test` in each of `packages/core`, `extension`, `backend`.
3. F5 in VS Code with the `extension/` folder open launches the Extension Development Host with your local build.
4. Backend deploy: `cd backend && npx wrangler deploy`.
5. Try a stage save end-to-end from the Extension Development Host — confirm `planning/stages/<id>.md` appears in the project. That's the canonical path most contributors land on.
