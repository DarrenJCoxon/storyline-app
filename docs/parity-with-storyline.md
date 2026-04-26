# Storyline-app Parity Plan

**Goal:** bring the entire storyline experience from `/storyline` (Claude Code + CLI) into `/storyline-app/extension` (VS Code extension + Cloudflare Worker backend), adapted for our OpenRouter / OpenAI stack instead of Claude. **Nothing else proceeds until this is done.**

**Adaptation principle:** every Claude-Code-specific mechanism (subagents, bash hooks, slash commands, `npx storyline-vsc <cmd>` calls) is REPLACED by an in-extension equivalent. The *semantics* are preserved verbatim — the *transport* is what changes.

---

## 0. Today's status (honest assessment)

What's already wired and working in `/storyline-app/extension`:

- ✅ TipTap rich editor + auto-route for `manuscript/` and `docs/` markdown
- ✅ Live preview (paperback / iPad / Kindle / print 6×9)
- ✅ Cover Generator with library + KDP wraparound + bleed
- ✅ Illustrations panel + Style Bible + character/style refs
- ✅ Research panel + capture/link/rebuild
- ✅ Compile pipeline (EPUB / print PDF) using `lib/compile/*` via dynamic import
- ✅ Onboarding wizard with returning-user detection
- ✅ Backend: chat (deepseek), illustrate (gpt-image-2), validate, stripe webhook, dev seed
- ✅ Stage guides ported to `packages/core` — fiction (15) + NF DNA (12) + NF pipelines A/B/C (32)
- ✅ ChatPanel uses harness skill + injects per-stage brief (today's last fix)

What is **incomplete or absent** is the rest of this document.

---

## 1. Adaptation strategy

| Original (`/storyline`) | New app (`/storyline-app/extension`) |
|---|---|
| Claude Code skill (`/storyline` slash command) | System prompt assembled in `extension/src/conversation/system-prompt.ts`, injected into every chat turn |
| Claude subagents (`agents/storyline-critic-{haiku,sonnet,opus,draft}.md`) | **Backend `/critique` endpoint** that routes to deepseek (haiku-tier), deepseek-v4-flash (sonnet-tier), or a higher-cost model (opus-tier) per stage. Subagent system prompt = the `agents/*.md` body, adapted. |
| `npx storyline-vsc <cmd>` CLI calls | In-extension TS equivalents called directly by `ChatPanel`, `CompilePanel`, etc. |
| Claude Code `PreToolUse` hooks (save-then-compose enforcement) | Doesn't apply — chat panel doesn't write to disk. Replaced by the JSON-save-block protocol. |
| Stage-info / next / status from CLI | Already wired via `deriveCurrentStage` + `buildStageBrief` in the system prompt |
| Memory: `lib/memory/odd-flow-push.js` (writes to odd-flow MCP) | Local memory only for now — we keep `.storyline/memory/*.jsonl` files and surface them in the system prompt's "Current state" block. odd-flow integration parked. |
| Codex / OpenCode plugin installers (`scripts/install-*.js`) | Not applicable — we own the chat surface. |

**Model mapping (two models only, no exceptions):**

| Use | Model |
|---|---|
| All text (chat, critique, planning — every tier) | `deepseek/deepseek-v4-flash` |
| All images (cover generation, illustrations) | `openai/gpt-image-2` |

No other models. The haiku/sonnet/opus tier naming in the original code is preserved as an internal routing concept (controls prompt complexity and token budget), but all tiers resolve to `deepseek/deepseek-v4-flash` at runtime. There is no model escalation — escalation logic is a no-op.

We expose `CHAT_MODEL` and `IMAGE_MODEL` in `backend/wrangler.toml` so the operator can swap models without code changes, but the default is always the two above.

---

## 2. Skills layer

### 2.1 Main fiction harness (`skill/`)

| File | `/storyline` | New app | Action |
|---|---|---|---|
| `SKILL.md` (594 lines, fiction Save the Cat) | ✓ | ✓ in `skill-content/storyline-fiction.md` | Keep, untouched. |
| `docs/planning/beat-guide.md` (324 lines) | ✓ | ✓ as of today | Side-loaded into system prompt at `beatSheet`/`sceneOutline` stages. |
| `docs/routing/confidence-check.md` | ✓ | **MISSING** | Port → `skill-content/confidence-check.md`, side-load when AI invokes critique. |
| `docs/routing/stage-model-map.md` | ✓ | **MISSING** | Port → `skill-content/stage-model-map.md`. Used by backend `/critique` endpoint to route, AND surfaced to AI so it knows which tier is running. |
| `docs/startup/startup-protocol.md` | ✓ | **MISSING** | Port → `skill-content/startup-protocol.md`, side-load on `mode` and first non-mode stage. |

### 2.2 NF harness (`skill-nf/`)

| File | `/storyline` | New app | Action |
|---|---|---|---|
| `SKILL.md` (NF root) | ✓ | ✓ in `skill-content/storyline-nonfiction.md` | Keep. |
| Any NF-specific docs | check the original for additional `skill-nf/docs/` files | TBD | Mirror whatever exists in `/storyline/skill-nf/docs/` into `skill-content/nf/`. |

### 2.3 Critique skill (`skill-critique/`)

| File | `/storyline` | New app | Action |
|---|---|---|---|
| `SKILL.md` | ✓ | **MISSING** | Port → `skill-content/critique.md`. Loaded by backend `/critique` endpoint as the critic system prompt. |
| `docs/faithfulness-rubric.md` | ✓ | **MISSING** | Port → `skill-content/critique-faithfulness-rubric.md`. Side-load when running draft critic. |

### 2.4 Follow-up skill (`skill-follow-up/`)

| File | `/storyline` | New app | Action |
|---|---|---|---|
| `SKILL.md` (extracts `{{bracketed TBDs}}` from prose, runs research) | ✓ | **MISSING** | Port → `skill-content/follow-up.md`. Used by a new `/follow-up` extension command which finds inline `{{...}}` notes in chapter files and turns them into research items. |

---

## 3. Subagents (`agents/`)

Original has 4 critic agents — Markdown files with frontmatter declaring `model` and a system prompt body. Adapted form: a backend endpoint that routes to the right OpenRouter model and uses the agent's prompt as the system message.

| Agent | `/storyline` | New app | Action |
|---|---|---|---|
| `storyline-critic-haiku.md` | ✓ | **MISSING** | Port body to `backend/critique-prompts/haiku.md` (or inline). Backend `/critique` endpoint, when called with tier `haiku`, uses this system prompt + deepseek-v4-flash. |
| `storyline-critic-sonnet.md` | ✓ | **MISSING** | Same → `sonnet.md`, sonnet-tier model. |
| `storyline-critic-opus.md` | ✓ | **MISSING** | Same → `opus.md`, opus-tier model. |
| `storyline-critic-draft.md` | ✓ | **MISSING** | Same → `draft.md`, draft-tier model. Uses `lib/critique/brief-builder.js` output as input. |

---

## 4. `lib/ai/` — the planning intelligence layer

| Module | Status | Action |
|---|---|---|
| `coaching-personas.js` | Ported to `packages/core`, NEVER injected | Inject `getPersonaForStage(stageId)` into the system prompt's stage brief block. |
| `critique-api.js` | Ported, NEVER called | Wire to backend `/critique` endpoint. Frontend invokes it at every stage gate. |
| `model-router.js` | NOT PORTED | Port → `packages/core/src/ai/model-router.ts`. Backend `/critique` calls it to pick the model+system-prompt for a given stage. |
| `narrative-voice.js` (fiction critique rules) | NOT PORTED | Port → `packages/core/src/ai/narrative-voice.ts`. Used by fiction `/critique`. |
| `narrative-voice-nf.js` | Ported, never called | Wire to backend `/critique` endpoint when mode = nonfiction. |
| `series-detector.js` | NOT PORTED | Port + wire: after `premise` saves, run detector; if multi-book signals fire, surface a card in the chat ("Looks like this could be a series — want to plan beyond book 1?"). |
| `stage-guides.js` (fiction) | ✓ ported, ✓ wired | Done. |
| `stage-guides-nf-dna.js` | ✓ ported, ✓ wired | Done. |
| `stage-guides-nf-pipeline-{a,b,c}.js` | ✓ ported, ✓ wired | Done. |
| `story-traps.js` | Ported, NEVER called | Wire: in `ChatPanel.applyEmittedPatches`, after a save, run `runStoryTraps(state)`. If any trap fires with severity `error` or `warning`, surface it as a chat card BEFORE advancing to the next stage. |

---

## 5. `lib/state/` — the state engine

| Module | Status | Action |
|---|---|---|
| `project-state.js` | ✓ ported with NF-aware additions | Done. |
| `transitions.js` (incl. `getDownstreamImpacts`) | ✓ ported partially | Wire `getDownstreamImpacts` — when a writer changes a saved field via the chat, surface "this affects: chapter outline, beat sheet, ..." as a card. |
| `store.js` | Replaced by `LocalStore` in `extension/src/state/local-store.ts` | Add UPSTREAM_DRIFT detection: when `stage-info` would have detected a doc on disk without matching state, flag and offer reseed. |

---

## 6. `lib/manuscript/` — drafting workflow (entirely missing)

| Module | `/storyline` | New app | Action |
|---|---|---|---|
| `notes.js` (parses `{{TBDs}}`) | ✓ | **MISSING** | Port → `extension/src/manuscript/notes.ts`. Add a "Notes" panel that shows every `{{...}}` in the manuscript, grouped by chapter, with "convert to research item" + "mark resolved". |
| `snapshot.js` (writes a draft snapshot to `.storyline/snapshots/`) | ✓ | **MISSING** | Port. Add a status-bar item or command "Storyline: Snapshot Draft". |
| `compare.js` (diff between snapshots, drift between plan and prose) | ✓ | **MISSING** | Port. Wire to a "Storyline: Compare to Plan" command — flags chapter content diverging from `state.chapterOutline`. |

---

## 7. `lib/memory/` — durable memory

| Module | Status | Action |
|---|---|---|
| `stage-memory.js` (fiction) | ✓ ported, partial wiring | Already called by `pushToMemory` in ChatPanel. Verify writes happen + add a "Memory" panel showing what's been recorded. |
| `nf-stage-memory.js` | ✓ ported, partial | Same as above for NF. |
| `sync.js` | ✓ ported, NEVER called | Wire: at every stage save, run sync. |
| `odd-flow-push.js` | ✓ ported, NEVER called | Park — odd-flow MCP integration is a Claude Code feature, not relevant here. Replace with a no-op stub in the new app. Document. |

---

## 8. `lib/output/` — generated artefacts (mostly missing)

These produce the markdown files that compile reads. **Without them, "compile" works on whatever's in `manuscript/` and `state.json` but never benefits from the structured stage docs the original writes.**

| Module | `/storyline` | New app | Action |
|---|---|---|---|
| `master-doc.js` (fiction master planning doc) | ✓ | **NOT WIRED** | Port file already in `packages/core/src/output/master-doc.ts` (or port if missing). Add a `Storyline: Generate Master Document` command + a status check that detects when state is "complete" and offers to generate. |
| `chapter-doc.js` (per-chapter planning card) | ✓ | **NOT WIRED** | Already partially via `chapter-cards.ts`; verify parity, replace if needed. |
| `stage-doc.js` (writes `docs/<NN>-<stage>.md` after every stage closes) | ✓ | **NOT WIRED** | Port + wire to `applyEmittedPatches` so every save → writes a stage doc. This is the visible artefact the writer can read between sessions. |
| `book-dna-doc.js` (NF Book DNA consolidation doc) | ✓ | **NOT WIRED** | Wire to `dna-consolidate` stage save. |
| `nf-stage-doc.js` (NF per-stage doc writer) | Ported (`packages/core/src/output/nf-stage-doc.ts`?) | **NOT WIRED** | Wire to NF stage saves. |
| `pipeline-{a,b,c}-master.js` | Ported under `packages/core/src/stages-nf/pipeline-{a,b,c}/` | **NOT WIRED** | Wire to `pa-master`/`pb-master`/`pc-master` stage save → generates the pipeline-specific master doc. |

---

## 9. `lib/compile/` — compile pipeline

| Module | Status | Action |
|---|---|---|
| `assembler.js`, `epub.js`, `print-pdf.js`, `markdown-to-html.js`, `theme.js`, `preflight.js`, `pipeline.js` | Used by extension via dynamic import from `/lib/compile` | Verify the import paths still work after the move. Long-term: port to `packages/core/src/compile/`. |
| `framework-card/` (NF framework card SVG generator) | NOT PORTED | Port → ensures NF Pipeline A's framework card renders in the compiled output. |
| `nf-extras.js` (NF compile extensions) | NOT PORTED | Port + wire — adds NF endnotes, framework cards, sourcing register to NF compile output. |
| `skill-tree-svg.js` (Pipeline C skill tree visualisation) | NOT PORTED | Port + wire — Pipeline C compile draws the skill ladder. |
| `timeline-svg.js` (Pipeline B timeline visualisation) | NOT PORTED | Port + wire — Pipeline B compile draws the timeline. |
| `index.js` | NOT PORTED | Port. |

---

## 10. `lib/doctor.js` + `lib/engine.js`

| Module | `/storyline` | New app | Action |
|---|---|---|---|
| `doctor.js` (drift detection: docs on disk without matching state) | ✓ | **MISSING** | Port → `extension/src/doctor.ts`. New command `Storyline: Doctor` runs the check + offers reseed. Integrated with `deriveCurrentStage` so an UPSTREAM_DRIFT result halts the next stage. |
| `engine.js` (top-level planning engine — orchestrates everything) | ✓ | **MISSING** | Decide whether we need it. The new app's `ChatPanel` already does most of what engine does (orchestrates state + AI). Audit `engine.js` and pull anything missing into ChatPanel + the new command set. |

---

## 11. `lib/critique/brief-builder.js` (chapter-level critique brief)

| Module | `/storyline` | New app | Action |
|---|---|---|---|
| `brief-builder.js` | ✓ | **MISSING** | Port → `extension/src/critique/brief-builder.ts`. New command `Storyline: Critique Active Chapter` runs `buildBrief(chapterUri, state)` → POSTs to backend `/critique` with tier `draft` → renders findings as a side panel. |

---

## 12. `lib/stages-nf/` — NF pipeline-specific logic

| Module | Status | Action |
|---|---|---|
| `book-dna/index.js` | Ported, NOT wired | Wire to `dna-*` stage saves — runs validators + writes the DNA doc. |
| `pipeline-a/index.js` | Ported, NOT wired | Wire — calls master doc writer at `pa-master`. |
| `pipeline-b/{index,timeline,sourcing-register}.js` | Ported, NOT wired | Wire — `pb-timeline` writes timeline, `pb-sourcing` writes register. |
| `pipeline-c/{index,skill-tree}.js` | Ported, NOT wired | Wire — `pc-decompose` writes the skill tree. |

---

## 13. `lib/telemetry/nf-telemetry.js`

| Module | `/storyline` | New app | Action |
|---|---|---|---|
| `nf-telemetry.js` | ✓ | **MISSING** | Port → `packages/core/src/telemetry/nf-telemetry.ts`. Hooked from NF stage saves to record harness usage stats locally (no remote telemetry). |

---

## 14. CLI (`bin/storyline.js` + commands)

Each CLI subcommand maps to an internal extension equivalent (no actual CLI binary exists in the new app). Status of each:

| CLI | Used by harness? | New-app equivalent | Status |
|---|---|---|---|
| `init` | ✓ | `OnboardingPanel.scaffoldProject` | ✓ done |
| `next` / `status` / `stages` | ✓ | `deriveCurrentStage` + `stageOrderFor` + state read | ✓ done |
| `stage-info <id>` | ✓ | `buildStageBrief` in system prompt | ✓ as of today |
| `save <id>` | ✓ | JSON save block protocol | ✓ done |
| `traps` | ✓ | `runStoryTraps(state)` after save | ❌ NOT WIRED |
| `checklist` | ✓ | `runQualityChecklist` from `coaching-personas` | ❌ NOT WIRED |
| `critique <stageId>` | ✓ | Backend `/critique` endpoint + chat-panel display | ❌ NOT BUILT |
| `verify-stage <id>` | ✓ | `verifyStage` runs critic + traps + missing-fields check | ❌ NOT BUILT |
| `reseed <id>` | ✓ | After `doctor` detects drift, reseed walks the writer through re-saving the orphan stage | ❌ NOT BUILT |
| `doctor` | ✓ | `Storyline: Doctor` command | ❌ NOT BUILT |
| `route <id>` | ✓ | Backend `/critique` does it internally | ❌ NOT BUILT (lives inside critique endpoint) |
| `record-model <id> <model>` | ✓ | Track which model ran for each stage in state metadata | ❌ NOT BUILT |
| `research add/link/etc.` | ✓ | Research panel | ✓ done |
| `nf <subcmd>` | ✓ | NF stages render correctly via guides; pipeline writers need wiring | partial |
| `compile` | ✓ | `CompilePanel` + `compile-runner.ts` | ✓ done |
| `generate` (master doc) | ✓ | `Storyline: Generate Master Document` command | ❌ NOT BUILT |
| `hook-handler` (Claude Code bash hooks) | ✓ in original | n/a — chat panel has no bash | skip |
| `upgrade` | n/a | n/a | skip |
| `config get/set` (`ai.quality`) | ✓ | Workspace setting `storyline.aiQuality` (`economy` / `balanced` / `premium`) | ❌ NOT BUILT |

---

## 15. VS Code extension features (`vscode-extension/src/`)

| File | Original | New app | Action |
|---|---|---|---|
| `extension.ts` | activation + command registration | ✓ ported, expanded | mostly done — see remaining commands above |
| `storyline-editor-provider.ts` | rich editor (TipTap) | ✓ as `EditorPanel` | done |
| `live-preview-command.ts` | live device preview | ✓ ported | done |
| `preview-command.ts` | print preview | ✓ ported | done |
| `compile-command.ts` / `compile-panel.ts` | EPUB/PDF wizard | ✓ as `CompilePanel` | done |
| `research-panel.ts` | research UI | ✓ ported + extended | done |
| `webview-panel.ts` | shared webview helpers | inline in new panels | done |
| `status-bar.ts` | word count + Storyline shortcuts | ✓ + extended (Preview/Research items) | done |
| `word-count.ts` | counter | ✓ ported | done |
| `manuscript-path.ts` | resolves manuscript role | ✓ ported | done |
| `active-file-tracker.ts` (writes `.storyline/active-file.txt`) | ✓ | partial — internal only | Port the breadcrumb file too — `/follow-up` and `Notes` panel both depend on it. |
| `book-info-command.ts` (edit Title / Author / ISBN) | ✓ | **MISSING** | Port → `Storyline: Edit Book Info` command + a small panel. |
| `backup-service.ts` + `backup-settings.ts` (snapshots project to external folder on chapter close) | ✓ | **MISSING** | Port — adds resilience for writers' work. |
| `github/` (full subsystem — 9 files: api / auth / commands / config / connect-flow / git / gitignore / status-bar / sync) | ✓ | **ENTIRELY MISSING** in `/storyline-app/extension/`. See Section 15.1 below. |

### 15.1 GitHub auto-sync subsystem (`vscode-extension/src/github/` — full port required)

A whole project-backup subsystem was built in `/storyline` (by another Claude Code instance) and is **not** in `/storyline-app/extension`. It lets writers connect a project to a private GitHub repo for off-machine backup, version history, and sharing — no terminal, no system git required.

| File | Purpose | Port destination |
|---|---|---|
| `auth.ts` | OAuth Device Flow against GitHub. Token in VS Code SecretStorage. OAuth `client_id` `Ov23limhPrrBGriiDxC2` ("Storyline VSCode" OAuth App, Device Flow enabled). | `extension/src/github/auth.ts` |
| `api.ts` | GitHub REST helpers (create repo, invite collaborator, etc.) | `extension/src/github/api.ts` |
| `git.ts` | `isomorphic-git` wrapper (pure JS git, bundled — no system git dependency) | `extension/src/github/git.ts` — add `isomorphic-git` to `extension/package.json` deps |
| `config.ts` | Per-project `.storyline/git.json` read/write (remote, owner, repo, branch, visibility, autoSync, lastPush, lastError) | `extension/src/github/config.ts` |
| `gitignore.ts` | Writes a fenced **managed block** in `.gitignore` excluding `output/`, `*.epub`, `*.pdf`, `.env*`, secrets, OS cruft. `.storyline/state.json` IS pushed so cloned projects resume with full memory. | `extension/src/github/gitignore.ts` |
| `connect-flow.ts` | First-time wizard — auto-suggests repo name, picks visibility, optional collaborators, default branch | `extension/src/github/connect-flow.ts` |
| `sync.ts` | Debounced 30s on save; fast-forward pull → commit → push; exponential-backoff retry. **Silent fast-forward only — conflict UI is v2.** | `extension/src/github/sync.ts` |
| `status-bar.ts` | Always-visible right-side status-bar item. Click → quick-pick (sync now, pause/resume, manage collaborators, change visibility, open in browser, disconnect). | `extension/src/github/status-bar.ts` — integrate alongside the existing storyline status-bar items |
| `commands.ts` | All `storyline.github.*` commands (palette-discoverable). Includes `Storyline: Open Project from GitHub…` (lists user's repos and clones into a chosen folder). | `extension/src/github/commands.ts` |

**Wiring:**
- `extension/src/extension.ts` `activate()` registers the subsystem: instantiate `GitHubAuth`, then `GitHubSyncService`, then `GitHubSyncStatusBar`, then `registerGitHubCommands(...)`. On first open of an unconnected project, run `maybeOfferConnect(...)` (silent if user has previously dismissed).
- New `package.json` dep: `isomorphic-git` (pure JS, bundled by esbuild — keeps the extension self-contained, no system `git` required).
- New `package.json` contributes:
  - All `storyline.github.*` commands.
  - A status-bar item declaration (or programmatic — `vscode-extension/src/extension.ts` does it programmatically).

**Adaptation notes:**
- The original works inside the old `vscode-extension/`. Port verbatim into the new `extension/`. No model/AI changes — this subsystem is pure git/HTTPS/UX, not AI-driven.
- Verify `isomorphic-git` packages cleanly with our existing `vsce package` flow + `.vscodeignore`. It's pure JS, no native bindings, so should be uncomplicated unlike `sharp`.

**Already mentioned in Section 18 (Phase H, step 31)**, but elevated here because the user pointed out it's an entire subsystem rather than a single file.

---

## 16. Per-stage runtime flow (THE missing intelligence)

This is the gap the user noticed in the chat. The original has a defined sequence at every stage; we have step 1 only.

| Step | What it does | Original implementation | New-app status |
|---|---|---|---|
| 1. Load stage brief | Fetch persona, questions, hints, sections | `npx storyline-vsc stage-info` | ✓ as of today (in system prompt) |
| 2. Run conversation | Conversational coaching toward filling required fields | The skill body | ✓ |
| 3. Save | Persist to state | `npx storyline-vsc save` | ✓ (JSON save block) |
| 4. Run story traps | Detect Save the Cat anti-patterns (flat protagonist, mirror want/need, etc.) | `runStoryTraps(state)` after save | ❌ — `story-traps.js` is ported but never called |
| 5. Run critique | Tier-routed critic agent reviews the saved fields | `agents/storyline-critic-{haiku,sonnet,opus}.md` via subagent | ❌ — agents not ported, no `/critique` endpoint |
| 6. Surface findings | Show traps + critique to the writer; block if blocking | Skill displays in chat | ❌ — nowhere to surface |
| 7. Write stage doc | Markdown summary of the stage at `docs/<NN>-<stage>.md` | `lib/output/stage-doc.js` | ❌ — module exists but never called |
| 8. Push to memory | `lib/memory/stage-memory.js` writes `.storyline/memory/<stage>.jsonl` | Called from CLI | partial — `pushToMemory` runs but only for some saves |
| 9. Run series detector (after premise) | `series-detector.js` checks for multi-book signals | called inline | ❌ — module not ported |
| 10. Advance | `deriveCurrentStage` returns next | ✓ | ✓ |
| 11. Fire next stage opening | New system prompt + new brief | ✓ | ✓ |

**Steps 4–9 are entirely missing in the new app.** This is the bulk of "the experience".

---

## 17. Backend changes required

To support the new flow:

### 17.1 `/critique` endpoint (new)

```
POST /critique
{
  licenceKey,
  stageId,
  state,         // current ProjectState
  tier?,         // 'haiku' | 'sonnet' | 'opus' | 'draft' — defaults from model-router
  qualityMode?,  // 'economy' | 'balanced' | 'premium'
  brief?,        // optional pre-built critique brief (for chapter-level draft critic)
}
→ { findings: [...], modelUsed: '...', tokensUsed: ... }
```

Internally:
1. Validate licence + check credits (charge at correct tier)
2. Resolve `(tier, model)` from `model-router.ts`
3. Load the matching agent system prompt from `backend/critique-prompts/<tier>.md`
4. Call OpenRouter with that model + the prompt + the state/brief
5. Return structured findings

Credit cost matches existing tiering: haiku ≈ 1, sonnet ≈ 3, opus ≈ 8, draft ≈ 5 per call.

### 17.2 `wrangler.toml` config

Two model vars only:

```toml
[vars]
CHAT_MODEL = "deepseek/deepseek-v4-flash"
IMAGE_MODEL = "openai/gpt-image-2"
```

All critique tiers (haiku / sonnet / opus / draft) resolve to `CHAT_MODEL`. No per-tier model vars.

### 17.3 New endpoints summary

- `POST /critique` (new) — described above
- All other endpoints unchanged

---

## 18. Execution order

Land in this order — each chunk is independently testable, builds on prior:

### Phase A — Critique infrastructure
1. Backend: add `/critique` endpoint with model-router integration (steps 17.1–17.3 above).
2. Port `lib/ai/model-router.js` → `packages/core/src/ai/model-router.ts`.
3. Port `agents/storyline-critic-{haiku,sonnet,opus,draft}.md` → `backend/critique-prompts/*.md`.
4. Port `lib/critique/brief-builder.js` → `extension/src/critique/brief-builder.ts`.
5. Port `lib/ai/narrative-voice.js` (fiction critique rules) → `packages/core/src/ai/narrative-voice.ts`.

### Phase B — Per-stage runtime flow
6. Wire `runStoryTraps(state)` in `ChatPanel.applyEmittedPatches` — step 4.
7. Wire `narrative-voice` (fiction) + `narrative-voice-nf` (NF) critique calls — step 5.
8. Build "Findings" UI: a chat card showing traps + critique findings, with "Continue anyway" / "Address these first" — step 6.
9. Wire `lib/output/stage-doc.js` to write `docs/<NN>-<stage>.md` after every save — step 7.
10. Verify `pushToMemory` runs for every save — step 8.
11. Port + wire `series-detector.js` — step 9.

### Phase C — Skills + docs
12. Port `skill-critique/SKILL.md` + `docs/faithfulness-rubric.md` to `skill-content/` — used by backend `/critique`.
13. Port `skill-follow-up/SKILL.md` to `skill-content/`.
14. Port `skill/docs/routing/{confidence-check,stage-model-map}.md` + `docs/startup/startup-protocol.md` to `skill-content/` and side-load where the harness mentions them.
15. Audit `/storyline/skill-nf/docs/` and mirror.

### Phase D — Manuscript workflow
16. Port `lib/manuscript/notes.js` + add Notes panel.
17. Port `lib/manuscript/snapshot.js` + add `Storyline: Snapshot Draft` command.
18. Port `lib/manuscript/compare.js` + add `Storyline: Compare to Plan` command (drift detection).
19. Port `vscode-extension/src/active-file-tracker.ts` — write `.storyline/active-file.txt` so notes/follow-up know the active chapter.

### Phase E — Output writers
20. Port + wire `lib/output/master-doc.js` + add `Storyline: Generate Master Document`.
21. Port + wire `lib/output/stage-doc.js` (if not done in Phase B step 9).
22. Port + wire `lib/output/book-dna-doc.js`, `nf-stage-doc.js`, `pipeline-{a,b,c}-master.js` — NF artefact generation.

### Phase F — Doctor + drift recovery
23. Port `lib/doctor.js` → `Storyline: Doctor` command.
24. Add `verifyStage` (port `bin/commands/verify-stage.js`) → button in the Findings UI.
25. Add `reseed` (port `bin/commands/reseed.js`) → wizard surfaced by Doctor when drift detected.

### Phase G — Compile extras
26. Port `lib/compile/framework-card/` → NF Pipeline A framework card in compile output.
27. Port `lib/compile/nf-extras.js` → NF endnotes, sourcing register, etc. in compile output.
28. Port `lib/compile/timeline-svg.js` (Pipeline B) + `skill-tree-svg.js` (Pipeline C).

### Phase H — Extension polish
29. Port `vscode-extension/src/book-info-command.ts` → `Storyline: Edit Book Info`.
30. Port `vscode-extension/src/backup-service.ts` + `backup-settings.ts` → external-folder backups on chapter close.
31. Port `vscode-extension/src/github/` → optional GitHub sync for off-machine backup.
32. Port `lib/telemetry/nf-telemetry.js` → local-only telemetry.

### Phase I — Quality config
33. Add workspace setting `storyline.aiQuality` (`economy`/`balanced`/`premium`) and wire it through to `model-router`.
34. Add `record-model` equivalent — every critique call writes `state._meta.modelHistory[stageId] = {tier, model, ts}` so the writer can audit which model ran each stage.

### Phase J — Cleanup
35. Remove the now-unnecessary `EXTENSION_OVERRIDE` simplification — the harness body still has CLI translation needs but most of them now have real internal targets, so the override can shrink.
36. Tighten `@ts-nocheck` on the ported `.ts` files where types are now stable.
37. End-to-end test: fresh project → mode → genre → premise → ... → masterDoc → compile EPUB → verify all artefacts present.

---

## 19. Definition of done

The new app reaches parity when, on a fresh project:

- Mode gate fires, saves cleanly, advances.
- Each fiction stage in turn:
  - Loads the right brief (persona, questions, hints, sections, repeatable, beat guide where applicable)
  - Conducts a rich conversational session
  - Saves via JSON block
  - Runs story traps + tier-routed critique
  - Surfaces findings as cards
  - Writes `docs/<NN>-<stage>.md`
  - Pushes to memory
  - Advances
- `series-detector` fires after `premise`.
- `masterDoc` stage runs the master generator and writes `output/master-document.md`.
- Compile EPUB / print PDF includes endnotes, bibliography, and any pipeline-specific artefacts.
- Doctor command catches drift and offers reseed.
- Notes panel shows `{{TBDs}}` from the manuscript.
- Snapshot + Compare commands work.
- All four critic tiers (haiku/sonnet/opus/draft) callable; each writes its model+tokens to state metadata.

The same end-to-end works for a non-fiction project through DNA + a chosen pipeline.

---

## 20. Estimate

- Phase A (critique infrastructure): ~1 day of focused work
- Phase B (per-stage runtime): ~1 day
- Phase C (skills/docs): ~half day
- Phase D (manuscript workflow): ~1 day
- Phase E (output writers): ~1 day
- Phase F (doctor + drift): ~half day
- Phase G (compile extras): ~1 day
- Phase H (extension polish): ~1 day
- Phase I (quality config): ~half day
- Phase J (cleanup + e2e): ~half day

**Total: ~7–8 focused days.** This is real work — no more piecemeal fixes.
