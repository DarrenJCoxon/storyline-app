# Milestone 2 — VS Code extension MVP: rich-text writing feels right

_Status: **CURRENT** (build work)_
_Parent: [../roadmap.md](../roadmap.md)_
_Related design: [../vscode-extension.md](../vscode-extension.md)_
_Last updated: 2026-04-19_

## Outcome

A writer can open a chapter file (`*.md`) inside a novel project in VS Code and write prose with WYSIWYG formatting (bold, italic, headings, scene breaks rendered as `* * *`) — saved to disk as clean markdown. Word count appears in the status bar. The `/novel` planning harness continues to run in a side panel, unchanged.

## Why this milestone exists

The harness plans novels well. Writers still write in raw markdown syntax, which is a developer workflow, not a writer workflow. This milestone closes that gap — without abandoning markdown-on-disk, which is what keeps the tool portable, git-friendly, and future-proof.

It also sets up the architectural pattern for Milestones 3-6 (compile, preview, themes). Everything from here builds on top of "a VS Code extension that knows how to open a novel project."

## Prove-it gate

All three must be true:

1. **A chapter exists, written in the extension.** At least 1,500 words of real prose (not lorem ipsum) in a `chapters/chXX.md` file, written using the TipTap editor, saved, reopened, and still intact.
2. **The experience is not worse than iA Writer.** Writing the same passage in the extension vs iA Writer — the extension must not feel slower, clunkier, or more error-prone. Formatting (bold/italic/scene breaks) must round-trip to markdown without breaking.
3. **The `/novel` harness still works.** Opening the `/novel` side panel and saving a stage must behave identically to how it does today. No regressions.

## Architecture snapshot

From [vscode-extension.md](../vscode-extension.md):

- **Monorepo structure** — the extension lives in `vscode-extension/` within the existing novel-writer repo. Shared git history, shared docs, minimal ceremony.
- **Extension host** — TypeScript, VS Code Extension API. Registers a custom editor for `.md` files when a `.novel-writer/` directory is detected.
- **Webview** — React + TipTap + `tiptap-markdown`, bundled to a single JS file via esbuild. Runs in a Chromium iframe inside VS Code.
- **Communication** — webview ↔ extension host via `postMessage`. Extension host is the only component that touches disk.
- **File format on disk** — markdown, always. TipTap is a display layer.

## Stories

### 2.1 — Scaffold the VS Code extension

Create `vscode-extension/` with:
- `package.json` declaring the extension (activation events, custom editor contribution, commands placeholder)
- `tsconfig.json` for TypeScript compilation
- `src/extension.ts` stub that activates on folder open
- `.vscodeignore` for packaging
- Build tooling: esbuild for webview bundle, tsc for extension host

**Done when:** `npm run compile` in `vscode-extension/` produces no errors, and loading the extension via VS Code's "Extension Development Host" (F5) shows a "Novel Writer extension activated" message in the Extension Host log.

**Estimate:** Half day.

### 2.2 — Build the TipTap webview

Create `vscode-extension/webview/` as its own React app:
- TipTap with `@tiptap/react`, `@tiptap/starter-kit`
- Bundled to `dist/webview.js` via esbuild
- Minimal styling (system fonts, centred column, generous line-height)
- Accepts initial content via `postMessage` from the host
- Sends content changes back via `postMessage` (debounced 500ms)

**Done when:** Loading the webview shows a blank TipTap editor, typing works, bold/italic buttons work, the webview sends change events to a stub handler in the host.

**Estimate:** 1 day.

### 2.3 — Markdown ↔ TipTap round-trip

Integrate `tiptap-markdown` (or equivalent) so:
- On file open: host reads `.md` from disk → parses to TipTap JSON → sends to webview
- On save: webview sends TipTap JSON to host → serialises to markdown → writes to disk
- Edge cases handled: YAML frontmatter (preserved), code blocks, lists, blockquotes

**Done when:** A markdown file round-trips through the editor without content loss. Specifically: open a test chapter with bold, italic, headings, lists, blockquote, code; write file to disk from TipTap; diff the output vs input — only whitespace changes acceptable.

**Estimate:** 1 day.

### 2.4 — Scene break custom node

The scene break is the first and most important novel-specific TipTap extension:
- Markdown source: `* * *` on its own line (standard) or `* * *` 
- Rendered: centred `* * *` with generous vertical spacing
- Writer inserts via menu, slash command, or typing `***` + Enter
- Persists correctly through round-trip

**Done when:** Inserting a scene break in TipTap, saving, and reopening shows the `* * *` rendered correctly; the file on disk contains `* * *`; committing the file to git shows a clean diff.

**Estimate:** Half day.

### 2.5 — Register as custom editor for .md files in novel projects

The extension should only take over `.md` files when inside a novel project:
- Detect novel projects by presence of `.novel-writer/state.json`
- Register the custom editor only for those projects (so editing a random markdown file elsewhere still uses VS Code's default editor)
- Respect VS Code's "reopen editor with..." command so writers can switch to raw markdown if needed

**Done when:** Opening `chapters/ch01.md` in a novel project opens the TipTap editor; opening `README.md` in a non-novel project opens VS Code's default markdown editor; "View: Reopen Editor With..." offers both options.

**Estimate:** Half day.

### 2.6 — Word count in status bar

A VS Code status bar item shows:
- Current file: `Ch 1 — 2,340 words`
- Project total: `Book — 18,200 / 80,000 (23%)` (reads target from `.novel-writer/state.json` `genre.targetWordCount`)

Clicking the item opens a quick pick showing per-chapter breakdown.

**Done when:** Opening a chapter shows current-file count; switching chapters updates it; the project total is accurate; the percentage against target matches manual math.

**Estimate:** Half day.

### 2.7 — Package as .vsix and install locally

- `vsce package` produces `novel-writer-0.1.0.vsix`
- `code --install-extension ./novel-writer-0.1.0.vsix` installs it cleanly into the real VS Code (not just Extension Host)
- Extension remains installed across VS Code restarts

**Done when:** The extension is usable in the regular VS Code (not Development Host), opens a novel project's markdown files in the TipTap editor, and survives a VS Code restart.

**Estimate:** Half day.

### 2.8 — Prove-it: write a real chapter

You, the writer. Open a real novel project in VS Code with the extension installed. Write at least 1,500 words of chapter prose using the TipTap editor. Include at least one scene break. Save, restart VS Code, reopen, verify the chapter is intact.

**Done when:** All three prove-it gate criteria are met. Friction log updated as you go.

**Estimate:** Variable — this is writer work, not dev work.

## Risks

**Custom editor save semantics.** VS Code's CustomEditorProvider has a specific dirty-state protocol. Getting it wrong = writers lose work. Must be implemented correctly in Story 2.3, tested in Story 2.7.

**Markdown round-trip fidelity.** `tiptap-markdown` is good but not perfect. Any formatting that can't round-trip losslessly must be declared unsupported (not silently mangled). If we discover formatting that breaks, either fix with a custom extension or document the limitation.

**Bundle size and webview startup latency.** TipTap + React + markdown parser can be 500KB+ compressed. Webview cold-start adds visible delay when opening a chapter. Mitigation: aggressive tree-shaking, ship only the TipTap extensions we use, measure startup in Story 2.7.

**The `/novel` harness running alongside.** The harness runs as a Claude Code chat panel. It doesn't touch the extension directly — they coexist on the filesystem. But worth verifying in Story 2.8 that opening a chapter in TipTap and having `/novel` save a stage doc to `output/stages/` doesn't cause file-lock conflicts or stale-read issues.

**esbuild + TypeScript + webview bundling can get fiddly.** The first time setting up a dual-build (extension host code separate from webview code) is where most time gets spent. Budget extra time in Story 2.1 if the scaffold takes longer than expected.

**Testing requires real VS Code.** There's no clean way to automate "open a chapter, type some text, save, reopen, verify." We'll rely on manual testing in Story 2.7 and 2.8. Don't try to build an integration test suite here.

## Cut list (explicitly NOT in this milestone)

- **The binder** (custom tree view grouping chapters by act/scene) — Milestone 7 territory, and only after real multi-engine need emerges
- **Compile to EPUB / PDF** — Milestones 3-4
- **Preview panel** — Milestone 5
- **Theme system** — Milestone 6
- **Additional TipTap custom nodes** beyond scene break — footnotes, comments, annotations, all deferred
- **AI-assisted writing inside TipTap** — selecting text and asking Claude to rewrite. Not this milestone. Keep planning (harness) and writing (extension) separate for now.
- **Publishing to the VS Code Marketplace** — installation is manual .vsix for now. Marketplace comes after the extension is good enough to show anyone.
- **Windows/Linux testing** — develop on macOS first. Other platforms get tested when someone uses them.
- **Multi-cursor, find/replace, command palette integration in the editor** — VS Code's default editor handles these; the custom editor intentionally doesn't. Accept the tradeoff.
- **Typewriter scrolling, focus mode, composition mode** — writer-experience niceties, deferred.
- **Collaboration, track changes, comments** — not this milestone.

## Definition of done

- All three prove-it criteria met (chapter written, not-worse than iA Writer, harness still works)
- `.vsix` installs and runs cleanly on at least one real machine (yours)
- Friction log triaged; any must-fix items addressed
- Lessons learned note captured below, informing Milestone 3 scoping

## Lessons learned

_To be filled in at milestone closure. What surprised you? What do you now believe about the extension that you didn't at the start? What should Milestone 3 (compile) know?_
