# Milestone 13 — Storyline sidebar: a writer's home in the activity bar

_Status: **PROPOSED** (build work, not started)_
_Parent: [../roadmap.md](../roadmap.md)_
_Related design: [../vscode-extension.md](../vscode-extension.md)_
_Last updated: 2026-05-03_

## Outcome

A writer opening a Storyline project lands in a sidebar that is unmistakably Storyline — not VS Code's Explorer, not Claude Code's chat list, not whatever extension activated last. A single Storyline icon in the activity bar opens a four-view container designed around the writer's actual day:

1. **Planning** — the 14 Save the Cat stages with live status, click-to-resume.
2. **Research** — categorised notes with one-tick "pin to chat" so the AI knows what the writer knows.
3. **Manuscript** — chapters with live word counts, drag-to-reorder, single-click open, current chapter highlighted.
4. **Project** — compile, cover, illustrations, backup, GitHub, settings — operational stuff, kept last.

The order is deliberate: **Plan → Research → Write → Ship.** Top-to-bottom matches the cognitive flow of a writing session.

## Why this milestone exists

Today [extension/src/editor/layout-init.ts](../../extension/src/editor/layout-init.ts) runs a spaced-retry chain (50ms / 500ms / 1.5s / 3.5s / 6s) trying to keep VS Code's built-in Explorer focused in the sidebar. This is an unwinnable race: any extension activating on `onStartupFinished` (Claude Code, GitLens, etc.) can yank the sidebar to its own view container, and can do so again at any later moment when the user interacts with it. The current behaviour is "Storyline appears to win at startup, then loses ten seconds later when the user opens Claude Code chat."

The fix is to stop fighting for someone else's territory and contribute our own. A Storyline-owned activity bar container with views the user explicitly switches to gives the writer a permanent, themed home that no other extension can clobber. It also unlocks UX we cannot deliver through the generic Explorer: word counts on chapters, planning-stage status glyphs, pin-research-to-chat, drag-to-reorder.

This is the visual centre of gravity the extension has been missing. M2 gave us a rich editor; M5 gave us live preview; M6 is giving us themes. M13 gives us the surface that ties them together.

## Prove-it gate

All four must be true:

1. **No more sidebar fight.** The writer opens a Storyline project, opens Claude Code's chat, switches back to Storyline via the activity bar icon, and the sidebar restores instantly with state preserved (last-active view, scroll position, expanded categories). The retry chain is deleted, not paused.
2. **A real chapter is opened from the Manuscript view.** The writer scans the chapter list, sees live word counts, identifies the chapter they want, single-clicks, and the rich editor opens. Not via Cmd+P, not via the file Explorer — via the Storyline view.
3. **A research note is pinned and meaningfully changes a chat response.** Writer ticks a research note (e.g. "Magic system rules"), opens planning chat, asks a question that depends on that note. The AI's response demonstrably uses the pinned content. Untick the note, ask again — response shows the AI no longer has it.
4. **The Project view is used at least once instead of the command palette.** Writer compiles to EPUB, generates a cover, or runs a backup by clicking a Project view item rather than typing `>Storyline:` in the palette. The sidebar earns its keep as a discovery surface.

## Architecture snapshot

### View container

Contributed in [extension/package.json](../../extension/package.json):

```jsonc
"viewsContainers": {
  "activitybar": [{
    "id": "storyline-sidebar",
    "title": "Storyline",
    "icon": "media/icon.svg"
  }]
},
"views": {
  "storyline-sidebar": [
    { "id": "storyline.planning",   "name": "Planning",   "type": "tree"    },
    { "id": "storyline.research",   "name": "Research",   "type": "webview" },
    { "id": "storyline.manuscript", "name": "Manuscript", "type": "webview" },
    { "id": "storyline.actions",    "name": "Project",    "type": "tree"    }
  ]
}
```

### Why two trees and two webviews

| View | Type | Reason |
|------|------|--------|
| Planning | tree | Writers scan; native tree is fast, themed, keyboard-navigable. |
| Research | webview | Custom checkbox-pin UX, search, drag-to-chapter — tree can't express. |
| Manuscript | webview | Live word counts, drag-to-reorder, accent bar on current chapter, brand-consistent type. |
| Project | tree | Just a discoverable home for commands. No bespoke UX needed. |

The two webviews share the same React + CSS foundation as `EditorPanel` and `ChatPanel` so the whole extension reads as one app, not five.

### Pin-to-chat plumbing (the new mechanism)

Research notes live as markdown files under `research/<category>/<note>.md`. Pinning state is per-project, stored in `.storyline/research-pins.json`:

```json
{ "pinned": ["worldbuilding/magic-system.md"], "chapterScoped": { "chapter-03.md": ["plot/heist.md"] } }
```

`ChatPanel`'s context builder reads this file before every send and prepends pinned notes to the system context. The Research view's footer ("📎 2 notes pinned to chat") reads the same file so the writer always knows what the AI sees. Chapter-scoped pins activate only when the corresponding chapter is the active editor.

### Removed code

- `scheduleExplorerFocusRetries` and `ensureExplorerFocus` in [layout-init.ts](../../extension/src/editor/layout-init.ts) — deleted.
- `workbench.activityBar.location: 'top'` in `VSCODE_SETTINGS` — removed; we want the activity bar visible on the side, where our icon lives.
- The dead `workbench.view.extension.storyline-sidebar` reference in [OnboardingPanel.ts:283](../../extension/src/panels/OnboardingPanel.ts#L283) — repointed to the now-real container.

### Reveal once, then trust the user

On activation: `workbench.view.extension.storyline-sidebar` is called exactly once. If the user switches to Claude Code or any other extension afterwards, that's their choice — the Storyline icon stays in the activity bar as a one-click return.

## Stories

### 13.1 — Activity bar container + delete the retry chain

Contribute the `storyline-sidebar` view container. Add a single placeholder view so the container is visible. Delete `scheduleExplorerFocusRetries`, `ensureExplorerFocus`, and the `workbench.activityBar.location: 'top'` setting. Update [OnboardingPanel.ts:283](../../extension/src/panels/OnboardingPanel.ts#L283) reference. Reveal the container once on activation.

**Done when:** Storyline icon appears in the activity bar. Clicking it shows the placeholder view. No retry chain runs. Opening Claude Code's chat and switching back works without race conditions.

**Estimate:** Half day.

### 13.2 — Manuscript view (webview)

React webview rendering chapters from `manuscript/*.md`. Project name + total word count header. Per-chapter row: number, title, word count. Currently-open chapter has a left accent bar in Storyline brand colour. Single-click opens in rich editor. Right-click menu: Rename, Delete, Duplicate, Snapshot, Compare to Plan. "+ New chapter" footer. Live word count updates (debounced) as the user types.

**Done when:** Writer can navigate the manuscript entirely from the Manuscript view, see at-a-glance word counts, and identify the active chapter without looking at editor tabs.

**Estimate:** 2 days.

### 13.3 — Manuscript drag-to-reorder

Drag a chapter row to a new position. Renames `chapter-NN.md` files in sequence, updates compile order, updates state. No data loss on rapid reorders.

**Done when:** Reordering five chapters and running compile produces a book in the new order. Files on disk are renamed correctly.

**Estimate:** 1 day.

### 13.4 — Planning view (tree)

Tree view of the 14 Save the Cat stages. Status glyphs: ✓ complete, ● in progress, ○ not started. Live-updates from `.storyline/state.json`. Click a stage → opens planning chat scrolled to that stage. Footer item: Generate Master Document (enabled only when stage 13 is complete).

**Done when:** Writer can see at a glance how far through planning they are, jump to any stage, and resume planning without using the command palette.

**Estimate:** 1.5 days.

### 13.5 — Research view (webview) — browse and create

React webview rendering `research/<category>/<note>.md` as a categorised list. Search box filters titles + body. `+` button creates a new note (prompts category). Click a title → opens the note in the rich editor (same surface as chapters). No pinning yet.

**Done when:** Writer can capture and find research notes inside the Storyline sidebar without leaving the extension.

**Estimate:** 1.5 days.

### 13.6 — Pin-to-chat plumbing

Add checkbox per note. Ticking writes to `.storyline/research-pins.json`. `ChatPanel` context builder reads pins file and injects pinned notes' content into system context. Footer shows live count: "📎 N notes pinned to chat" with a button surfacing the pinned content (so it's never invisible).

**Done when:** Pinning a note demonstrably changes AI responses. Unpinning reverts. The writer always knows what the AI has been given.

**Estimate:** 2 days.

### 13.7 — Chapter-scoped pinning

Drag a research note onto a chapter in the Manuscript view → chapter-scoped pin (`chapterScoped[chapter] += note`). When that chapter is the active editor, the chapter-scoped notes are also injected. Visual indicator on chapters with attached research.

**Done when:** A note attached to chapter 3 appears in chat context only while chapter 3 is open.

**Estimate:** 1 day.

### 13.8 — Project view (tree)

Tree of grouped commands: Compile (EPUB / PDF / Live preview / Print preview), Cover & illustrations, Backup & sync (with live GitHub status dot), Settings (provider / credits / licence). Pure command surfacing — no new functionality.

**Done when:** Every Storyline command currently in the command palette has a discoverable home in the Project view.

**Estimate:** 1 day.

### 13.9 — Polish: empty states, theming, keyboard nav

Voicey empty states for each view (not template-y). Single Storyline accent colour applied consistently across the four views (active chapter bar, current planning stage, pinned notes count). Keyboard navigation works in all four views. Tab order is sane.

**Done when:** A writer using only the keyboard can navigate Planning → Research → Manuscript → Project, open a chapter, and start writing.

**Estimate:** 1 day.

## Cut list (what this milestone is NOT doing)

- **Replacing the rich editor** — chapters still open in `EditorPanel`. The Manuscript view is navigation, not editing.
- **A custom file watcher** — we use VS Code's existing file watching for `manuscript/` and `research/` changes.
- **AI-suggested research** — the Research view is for the writer's own notes. Suggestions are an M11 (Fiction Book Brain) concern.
- **Per-scene granularity in Manuscript view** — chapters only. Scene-level navigation is a follow-up if writers ask for it.
- **Sidebar resizing logic** — VS Code handles it; we don't try to enforce widths.
- **Pinning planning stages to chat** — only research notes are pinnable. Planning context is loaded by the chat itself based on the active stage.

## Risks and mitigations

- **Webview cost** — two webviews in the sidebar means two React bundles loaded. Mitigation: share the bundle; lazy-instantiate the React tree when each view is first revealed.
- **Pin context bloat** — a writer with 50 pinned notes could blow the chat context window. Mitigation: soft cap of ~8K tokens for pinned content, with a warning in the footer when approaching the cap.
- **Drag-to-reorder data loss** — renaming files mid-reorder is risky. Mitigation: atomic rename with a rollback log; never delete-then-create.
- **The sidebar becomes a second source of truth** — Manuscript view says one thing, the Explorer says another. Mitigation: Manuscript view reads from disk every time, no cache; Explorer remains available for power users who want it.

## Dependencies and ordering

- **Depends on:** M2 (rich editor) — chapters need somewhere to open. M3+ (compile) — Project view surfaces compile commands.
- **Unblocks:** M11 (Fiction Book Brain) — story bible / character matrix / promise-payoff ledger all need a home in the sidebar; M13 establishes the container they'll plug into.
- **Build sequence:** Stories 13.1 → 13.2 ship together as the smallest useful slice (fixes the Claude Code battle and gives writers their manuscript navigation). 13.3-13.9 land incrementally.
