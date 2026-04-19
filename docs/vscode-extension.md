# Novel Writer — VS Code Extension Sketch

_Status: design sketch. Not yet built._
_Last updated: 2026-04-19_

## Why

The `/novel` harness plans novels brilliantly but planning is half the job. Writers still need a place to actually write the prose — and that place is currently "open a markdown file and type raw syntax." That's a developer workflow, not a writer workflow.

Scrivener solves the writer side beautifully (rich text, scene-by-scene organisation, composition mode, word count tracking) but has no AI harness. Google Docs has good editing but no structural planning. Nothing combines both.

A VS Code extension gives us the best-of-both without building a desktop app from scratch. Writers already in VS Code (or Cursor) get:

- Scrivener-quality rich-text writing via TipTap
- The `/novel` planning harness in a side panel
- Markdown files on disk (git-friendly, portable, future-proof)
- Word count, scene breaks, and all the small writer-tools they expect

The bet: you can get 90% of Scrivener's writing experience without owning a desktop app, while keeping the harness and git-based workflow we already have.

## User experience walkthrough

Writer opens VS Code in their novel project. They see:

- **Left sidebar:** their novel project — `chapters/`, `notes/`, `.novel-writer/state.json`
- **Centre:** a clean writing surface when they open `chapters/ch01.md`. Bold shows as bold. Italic as italic. Scene breaks render as a centred `⁂`. No raw markdown tags.
- **Right panel:** the `/novel` chat — unchanged, runs exactly as it does today
- **Bottom status bar:** word count for the current chapter, total manuscript, % of target

They write. When they save, the file on disk is clean markdown — nothing proprietary. If they open the same file in Obsidian, GitHub, or any text editor, it reads as normal markdown. They can git-commit, diff, and collaborate with anyone.

If they ask `/novel` a question about structure, the harness reads from `state.json` and the markdown files to answer. Planning and writing share the same source of truth.

## File format philosophy

**On disk: markdown. In the editor: rich text.** This is non-negotiable.

- Markdown is portable. If this extension dies, your manuscript is still readable in any editor.
- Markdown diffs cleanly in git. You can actually see what changed chapter-to-chapter.
- Markdown is what the `/novel` harness already uses for `output/stages/*.md` and `output/master-document.md`.
- Everything else (scene breaks, comments, annotations) is either standard markdown or a convention the extension understands.

The extension never writes proprietary format. If you uninstall it, your work is intact.

## Weekend prototype scope

The smallest thing that proves the concept works:

1. **A VS Code extension** that registers a custom editor for `.md` files inside a novel project (detected by presence of `.novel-writer/state.json`)
2. **TipTap WYSIWYG editor** in the custom editor webview
3. **Markdown ↔ TipTap round-trip** using `tiptap-markdown`
4. **One custom node:** scene break (`* * *` in markdown, rendered as centred `⁂`)
5. **Word count** in status bar (current file + project total)
6. **The `/novel` harness** continues to work unchanged in a side chat panel

That's it. No binder, no composition mode, no comments, no research panel. The goal is to answer: does the writing surface feel right?

If yes, layer on more. If no (TipTap latency on long chapters, formatting drift on save, something we didn't anticipate), we've found out in a weekend instead of a quarter.

## Architecture overview

Three layers:

**1. Webview (runs in a Chromium iframe inside VS Code)**
- React app bundled via esbuild
- TipTap editor with `@tiptap/starter-kit` + `tiptap-markdown` + custom scene-break node
- Sends document changes to the extension host via `postMessage`

**2. Extension host (Node, runs in VS Code's extension process)**
- Registers the custom editor provider for `.md` files
- Reads markdown from disk on file open, sends it to the webview
- Receives TipTap JSON from webview on save, serialises to markdown, writes to disk
- Watches `.novel-writer/state.json` and pushes updates to the webview (for word-count targets, chapter metadata, etc)

**3. Existing `/novel` harness (unchanged)**
- Runs in a Claude Code chat panel as it does today
- Reads/writes `.novel-writer/state.json`, `output/stages/*.md`, `.novel-writer/memory.jsonl`
- Does not need to know about the extension at all — they coexist by sharing the file system

```
┌─────────────────────────────────────────────────┐
│ VS Code                                         │
│                                                 │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ File tree    │  │ TipTap webview (React)   │ │
│  │              │  │  ┌────────────────────┐  │ │
│  │ chapters/    │  │  │ Chapter 1          │  │ │
│  │   ch01.md ───┼──┼─▶│                    │  │ │
│  │   ch02.md    │  │  │ Theo woke to...    │  │ │
│  │              │  │  │  ⁂                 │  │ │
│  └──────────────┘  │  │ At 7:30, chapel... │  │ │
│                    │  └────────────────────┘  │ │
│                    └──────────┬───────────────┘ │
│                               │ postMessage     │
│  ┌─────────────────┐  ┌───────▼────────────────┐│
│  │ /novel chat     │  │ Extension host (Node)  ││
│  │ (Claude Code)   │  │  - custom editor       ││
│  │                 │  │  - md ↔ tiptap JSON    ││
│  └────────┬────────┘  │  - file watcher        ││
│           │           │  - status bar          ││
│           │           └──────────┬─────────────┘│
└───────────┼──────────────────────┼──────────────┘
            │                      │
            ▼                      ▼
   ┌──────────────────────────────────────┐
   │ Disk                                 │
   │  chapters/ch01.md  (plain markdown)  │
   │  .novel-writer/state.json            │
   │  .novel-writer/memory.jsonl          │
   │  output/stages/*.md                  │
   └──────────────────────────────────────┘
```

Nothing clever. The webview never touches disk directly — the extension host mediates. Standard VS Code extension pattern.

## TipTap ↔ markdown mapping

What round-trips cleanly (safe for v1):
- Paragraphs
- Headings (`#`, `##`, `###`)
- Bold (`**`), italic (`_`), strikethrough (`~~`)
- Bullet and numbered lists
- Blockquotes (`>`)
- Code spans and fenced blocks
- Horizontal rules (`---`)

What needs a custom node:
- **Scene breaks** — markdown source `* * *`, rendered as centred `⁂`. Not a default TipTap node. Small custom node to define.

What gets tricky (defer past MVP):
- Footnotes — markdown has them, TipTap doesn't natively. Skip for v1.
- Tables — rare in novels. Skip.
- Images — novels rarely have inline images. Skip unless someone asks.
- Comments/annotations — big topic. Save for phase 2.

What we explicitly *don't* support:
- Arbitrary HTML. If a markdown file has raw HTML, the extension preserves it as a text block but doesn't render it. Writers shouldn't be dropping HTML into chapters anyway.

## Harness panel integration

The `/novel` harness keeps running as a Claude Code chat in the side panel. No integration work needed for v1 — they coexist on the shared file system.

Later (phase 2), we can add extension-side affordances:
- Click a chapter heading in TipTap → `/novel` gets a "you are now in chapter 2" context signal
- Selection in TipTap + right-click → "ask /novel about this passage"
- When `/novel` writes a new stage doc, a toast in VS Code offers to open it

None of that is required for the prototype.

## Phase 2: the binder

Scrivener's real moat isn't the editor — it's the **binder**: a draggable tree of scenes/chapters/research notes, reorderable, viewable at multiple granularities.

VS Code's file tree is flat and alphabetical. To replicate the binder, we build a custom tree view (VS Code's `TreeDataProvider` API) that sits alongside the file explorer. It reads chapter/scene metadata from `.novel-writer/state.json` and presents the manuscript grouped by act → chapter → scene.

Drag-to-reorder in a custom tree view is supported but non-trivial — it means updating chapter metadata in state.json AND renaming/reordering files on disk. This is the real feature work, and it's why I'd prove the editor feels right before investing.

Phase 2 scope (rough):
- Custom tree view grouped by act/chapter/scene
- Drag-to-reorder updates state.json and file positions
- "Show only scenes matching tag X" filtering
- Split-view: open a scene in the editor, see its beat-sheet context in a second panel
- Compile: merge chapter files into a single manuscript export (docx, pdf)

## Risks & open questions

**Performance on long chapters.** TipTap / ProseMirror is fast, but chapters over 10k words can get sluggish depending on extensions enabled. Mitigation: test early with a representative chapter, strip unused TipTap extensions.

**Markdown round-trip fidelity.** `tiptap-markdown` is good but not perfect. Any formatting that can't round-trip losslessly must either be declared unsupported or handled with a custom extension. We'll discover edge cases as we use it.

**Custom editor save semantics.** VS Code's custom editor API has a specific "dirty" / save protocol. If we don't implement it correctly, writers will lose work. This needs care in the prototype, not magical thinking.

**Extension distribution.** To ship publicly, we publish to the VS Code Marketplace (free, open to anyone). That's straightforward. Cursor uses a compatible extension model, so the same `.vsix` should install in both.

**Two cursors (VS Code's text cursor vs TipTap's).** Custom editors replace VS Code's text cursor entirely with whatever the webview provides. Find/replace, go-to-line, and multi-cursor all stop working on that file. For prose, that's fine — writers don't multi-cursor a novel. But it's a thing to know.

**AI harness integration boundary.** The harness currently runs as a Claude Code chat. If we later want an in-editor "ask AI about this paragraph" feature, we need to decide whether the extension calls Claude directly or delegates to the `/novel` harness. Punt until we see what writers actually ask for.

## Next steps

1. Spike the prototype (weekend): TipTap webview + markdown round-trip + scene break node + status bar word count
2. Use it for a real chapter of a real novel. Notice what feels wrong.
3. If the writing surface feels right, plan phase 2 (binder, composition mode, compile)
4. If it doesn't feel right, the fork conversation from the original discussion becomes real — but we'll know what's actually limiting, not guess

The prototype is cheap. Don't plan phase 2 until phase 1 proves itself.
