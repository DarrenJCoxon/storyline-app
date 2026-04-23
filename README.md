# Storyline

**A planning and writing environment for novelists.**

Storyline combines a conversational Save-the-Cat planning harness (powered by Claude) with a distraction-free VS Code writing surface and a one-command compile pipeline to EPUB and print-ready PDF. You plan your book end-to-end, draft the prose in the same environment, and export a shop-ready file when you're done.

It does not write your novel for you. It helps you plan it, structure it, and draft it.

* * *

## Who this is for

- Novelists who want a single, coherent environment rather than Scrivener + a separate AI tool + a separate compile tool.
- Writers comfortable running two commands in a terminal once, to install.
- Anyone who has tried to plan a book with ChatGPT and watched the conversation drift, lose the beat sheet, or forget the character names three prompts later.

If you don't have a terminal open right now and the word "npx" doesn't mean anything to you, don't panic. This guide walks you through everything assuming zero prior knowledge.

* * *

## What you'll need

Three free pieces of software. You install each one once; Storyline then coordinates them.

### 1. VS Code — the writing environment

VS Code is a free editor made by Microsoft. Normally it's used for code, but Storyline configures it to behave like a dedicated writing app: three columns (file tree, manuscript, supporting docs), a clean writing surface, no developer chrome in your face.

Download: https://code.visualstudio.com/

Install it like any Mac or Windows app (drag to Applications on Mac, run the installer on Windows).

### 2. Node.js — the engine that runs Storyline

Node.js is a background program that lets you run JavaScript tools on your computer. Storyline uses it. You don't interact with it directly — you just need it installed.

Download the **LTS (Long-Term Support)** version from https://nodejs.org/

Install it. On Mac, this adds a command called `node` to your terminal. On Windows, the installer does this automatically.

### 3. An AI coding agent — your planning collaborator

Storyline works with three different AI coding agents. Pick whichever you already use or prefer:

- **Claude Code** (recommended for best results) — Anthropic's CLI. Download: https://claude.com/product/claude-code. Needs an Anthropic Pro account.
- **OpenCode** — open-source terminal AI agent, bring your own model provider. Works well with cloud-hosted frontier models (Anthropic, OpenAI, DeepSeek, Qwen, etc.). https://opencode.ai/
- **Codex** — OpenAI's CLI. https://openai.com/codex/. Needs an OpenAI account.

You can use more than one, and Storyline will configure all of them at install time. If you have no preference, Claude Code is the path of least resistance.

* * *

## Install Storyline

The simplest path — which avoids the usual "`code` command not found" trap on fresh Macs — is to do the whole thing from *inside* VS Code, using its built-in terminal.

### 1. Create an empty folder for your novel

Using Finder (Mac) or File Explorer (Windows), create a new empty folder wherever you keep your projects. Call it whatever you want your novel to be called — for example `my-novel`.

### 2. Open that folder in VS Code

Launch VS Code. Then choose **File → Open Folder…** and select the empty folder you just created. VS Code will open with an empty file tree on the left. Or you can choose **File** **→ New Window and drag the empty folder into the main window in VS Code.**

### 3. Open VS Code's integrated terminal

From the menu bar, choose **View → Terminal** **→ New Terminal** (or press `` Ctrl+` `` — that's the backtick key, above Tab). A terminal panel appears at the bottom of VS Code, already sitting inside your new folder.

### 4. Run the init command

In that terminal, type (or copy-paste) the following and press Enter:

```bash
npx storyline-cli init
```

This downloads Storyline and sets up the current folder as a novel project. It takes 20-30 seconds the first time as npm fetches the package.

During setup, Storyline will:

- Create the project scaffolding (`manuscript/`, `docs/`, `.storyline/`, etc.)
- Detect which AI coding agents you have installed (Claude Code, OpenCode, Codex) and configure each one that's present
- Install the Storyline VS Code extension (the rich editor, compile commands, live preview)
- Register the `odd-flow` MCP server for durable memory across sessions

Because you're running this from VS Code's own terminal, the `code` CLI is always available here — so the extension installs cleanly without any PATH fiddling.

**To force a specific agent** (instead of auto-detect), pass `--agent`:

```bash
npx storyline-cli init --agent claude-code   # Claude Code only
npx storyline-cli init --agent opencode      # OpenCode only
npx storyline-cli init --agent codex         # Codex only
npx storyline-cli init --agent all           # all three
```

### 5. Reload the VS Code window

Once `init` finishes, press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows), type **"Reload Window"**, and press Enter. This activates the newly installed Storyline extension.

When the window comes back, you should see the welcome document in the middle column and a "Storyline" indicator in the bottom-right of VS Code. You're ready to plan.

### If you see an extension-install warning

Storyline comes with a VS Code extension that provides the rich-text writing surface, the compile commands, and the three-column layout. The `init` command tries to install this extension automatically. If it can't (VS Code CLI not on PATH yet), you'll see a yellow message with fallback instructions. Follow them — it's a one-time step.

* * *

## Your first five minutes

### Open the welcome document

With the `my-novel/` folder open in VS Code, click `docs/welcome.md` in the file tree on the left. It opens in the middle of the screen — this is the Storyline rich-text editor.

It looks like a normal writing surface: no code, no syntax highlighting, just prose. You can start typing.

### Open a chapter to the side

Right-click `manuscript/chapter-01.md` in the file tree. From the menu, choose **"Storyline: Open to the Side"**. The chapter opens in a second column on the right, next to your welcome document.

You now have three columns visible at once:

- **Left**: file tree
- **Middle**: welcome document
- **Right**: chapter one

(Shortcut: select a `.md` file in the tree and press `Cmd+Enter` on Mac / `Ctrl+Enter` on Windows — same effect.)

### Start planning with `/storyline`

Open your AI coding agent, then start a planning session. How you do this depends on which agent you use:

**In Claude Code:** type `/storyline` in the chat box and press Enter.

**In OpenCode:** type `/storyline` (same slash-command, different agent).

**In Codex:** type `$storyline`, or just say `use storyline` / `start storyline` / `plan my novel` — Codex recognises these phrases because `AGENTS.md` in your project primes it.

The first time you do this, your agent will ask you to approve the **odd-flow** MCP server — approve it. Storyline uses it for durable memory across sessions.

Then the agent reads your project, notices it's a fresh novel, and starts the planning conversation. The first thing it asks about is your genre — because different genres (thriller, romance, fantasy) have different structural expectations.

Answer naturally. There's no form to fill in. The harness adapts to what you say, saves progress automatically, and flags issues the way a thoughtful editor would.

At any point you can switch to VS Code and write prose in the chapter you have open. Storyline auto-saves every 1.5 seconds; you'll never lose work.

**Resolving research notes:** while drafting, wrap research questions in double curly braces — e.g. `{{check British Museum opening times}}`. When you're ready, type `/follow-up` (Claude Code / OpenCode) or `$follow-up` (Codex) and your agent will scan the manuscript for every `{{…}}`, research each one, and show you proposed replacements for your approval.

**Critiquing a drafted chapter:** once you've drafted a chapter and want to check it against the plan you made for it, type `/critique 3` (or `/critique ch03`) in your agent. Storyline reads the prose alongside that chapter's beat-sheet entry, scene outline, and protagonist arc, and returns structured findings on whether the scene delivered its planned beat function — without rewriting your prose. See `/critique` below for the full description.

* * *

## How Storyline is organised

Your project folder looks like this:

```
my-novel/
├── .storyline/                   # Storyline's state (planning progress, never edit by hand)
├── .claude/skills/storyline/     # /storyline skill — Claude Code (if installed)
├── .opencode/commands/           # /storyline + /follow-up commands — OpenCode (if installed)
├── plugins/storyline/            # Codex plugin with the same skill bodies (if installed)
├── manuscript/                   # Your prose. One .md file per chapter.
│   ├── chapter-01.md
│   └── chapter-02.md
├── docs/                         # Planning notes, character sheets, research
│   └── welcome.md
├── output/                       # Compiled EPUB / PDF / planning documents land here
├── .mcp.json                     # odd-flow MCP config (Claude Code)
├── opencode.json                 # odd-flow MCP config (OpenCode, if installed)
├── CLAUDE.md                     # Project-level instructions for Claude
├── AGENTS.md                     # Vendor-neutral agent primer (Codex, etc. — if installed)
└── compile.config.json           # Book metadata (title, author, cover)
```

Only the directories for AI agents you actually installed will be present — a Claude-Code-only install doesn't get `.opencode/` or `plugins/storyline/`.

You work primarily in `manuscript/` (prose) and `docs/` (supporting material). Storyline handles the rest.

* * *

## The 14 planning stages

Storyline walks you through a full Save-the-Cat planning arc. You can go at any pace — one stage an evening, three stages in a weekend, or one stage every few months.

 1. **Genre & Foundations** — what kind of book is this?
 2. **Story Seed & Premise** — the one-sentence hook
 3. **Protagonist Deep Dive** — their want, need, flaw, and arc
 4. **Supporting Cast** — the people around them
 5. **Relationship Web** — who affects whom, and how
 6. **Logline Refinement** — the elevator pitch
 7. **Beat Sheet** — the 15 Save-the-Cat beats
 8. **B Story** — the subplot that carries the theme
 9. **Subplots** — secondary threads
10. **Scene Outline** — the shape of the whole book, at a chapter level
11. **Plot Thread Registry** — tracking every thread so nothing gets dropped
12. **Chapter Flesh-Out** — one pass per chapter, filling in detail
13. **Consistency & Critique** — an AI pass flagging structural issues
14. **Master Document** — a single document capturing everything

You don't write prose in the harness. You plan in the harness, then write prose in the VS Code editor. The two stay in sync — the harness knows which chapter you're on; the editor shows you the relevant planning context.

* * *

## Writing prose

Once you've planned a beat (say, the Opening Image), you can go write it. Open the relevant chapter file, and type. The editor:

- Indents paragraphs in novel style (first-line indent, no blank-line gap between paragraphs).
- Renders `* * *` as a centred scene break.
- Shows your word count in the status bar (bottom of the window).
- Has a typewriter-mode toggle that keeps the line you're writing vertically centred on screen.
- Auto-saves as you type.

The file on disk is plain Markdown. You own it. If you ever want to export your manuscript out of Storyline and edit it in Word, Scrivener, or anything else, it's just `.md` files in a folder.

* * *

## Leaving research notes as you write — `/follow-up`

When you hit something you need to research but don't want to break flow, wrap it in **double curly braces**:

```
She opened the laptop — {{what specs would a 2019 MacBook Pro have?}} — and typed.

They met outside the museum. {{check British Museum opening times}} The doors were locked.
```

Keep writing. Later — at the end of a session, or whenever you're ready — type `/follow-up` in Claude Code. Storyline will:

1. Find the chapter you most recently had open in VS Code.
2. Scan it for every `{{…}}` marker.
3. Classify each one (research question, plot-consistency check, or decision for you) and resolve the research ones via web search.
4. Show you each finding with a proposed replacement.
5. On your approval, edit the manuscript file in place.
6. Log what was researched, so next session can look up "what did we find out about the British Museum?" directly.

The point: you never have to break flow to research. Leave the `{{question}}`, keep writing, handle research in a dedicated pass.

* * *

## Checking your draft against the plan — `/critique`

You planned chapter 12 as the midpoint with a false-victory flip — the protagonist gets the bag of money and only realises later it's counterfeit. Six weeks later you've drafted the chapter. Did the scene actually deliver that flip, or did you write a different scene altogether?

That's what `/critique` is for.

In your AI agent, with a chapter drafted under `manuscript/`, type:

```
/critique 3
```

(or `/critique ch03` — both work.)

Storyline will:

1. Read the chapter's prose from `manuscript/`.
2. Pull the matching slice of your plan from `.storyline/state.json` — the chapter outline entry, the parent beat (with its midpoint type, whiff of death, etc.), and your protagonist's want / need / flaw / core lie.
3. Hand the bundle to a dedicated draft critic that reads both at once and returns structured findings against the planned beat function, POV, conflict, and what-changes.

The findings come back with severity markers:

- 🔴 **ERROR** — a planned beat function that didn't land (e.g. midpoint where the flip never happens)
- 🟡 **WARNING** — partial delivery (the conflict is implied but not on the page)
- 💡 **SUGGESTION** — specific revision direction
- ✅ **Faithful to the plan** — when the chapter does what the plan said it would

The critic never rewrites your prose. It tells you where the prose drifted from the plan and lets *you* decide which is right — sometimes the plan was wrong and the prose is the better version. Updating the plan to match the prose is just as valid as steering the prose back to the plan.

If you haven't planned the chapter yet (no Stage 12 entry for it), `/critique` will tell you so cleanly rather than producing a fake critique. The plan is the anchor; without it, faithfulness is meaningless.

**This is faithfulness-only on first ship.** Prose-craft critique (POV slips, dialogue, sentence-level pacing) and whole-manuscript continuity passes are planned for follow-on releases.

* * *

## Compiling to EPUB or PDF

When your manuscript is ready, open the Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows) and type:

- **"Storyline: Compile to EPUB"** — produces a shop-ready EPUB you can upload to Kindle, Apple Books, or Kobo.
- **"Storyline: Compile to Print PDF"** — produces a print-ready PDF at the right trim size for KDP Paperback, IngramSpark, etc.

Output lands in `output/`. Book metadata (title, author, cover) lives in `compile.config.json` — you edit that via **"Storyline: Edit Book Info"**.

* * *

## Live preview

While you're writing, you can see how the book will render in its final form:

- **"Storyline: Open Live Chapter Preview"** — shows the current chapter rendered in a device frame (Kindle, Apple Books, paperback page). Updates as you type.

Useful for catching formatting issues early — for example, a scene break that sits awkwardly at the bottom of a page, or a chapter heading that clashes with the theme.

The toolbar at the top of the preview pins in place when you scroll, so you can flip between Print 6×9 / iPad / Kindle, swap the theme, or change the chapter-opener style without losing your scroll position. **Print 6×9** mode loads the same CSS layer the compile pipeline uses for the PDF (chapter-title margins, font sizes, drop-cap dimensions), so what you see in that preview is what comes out of the printer.

* * *

## Compose mode

When you want a distraction-free writing surface — no tabs, no sidebars, no toolbars — press **`Cmd+Shift+Enter`** (mac) / **`Ctrl+Shift+Enter`** (Windows / Linux) inside any chapter, or run **"Storyline: Toggle Compose Mode"** from the Command Palette.

You get a Scrivener-style centred "paper" surface on warm-dark gutters, with VS Code's chrome (activity bar, side bar, panel, tabs) collapsed via Zen Mode. A slim floating bar at the bottom of the screen shows just the controls a writer needs in flow:

- **Exit** (or press `Esc`)
- **Typewriter** toggle — keep the active line near the vertical middle of the viewport
- The current filename
- Live word count
- Save status

Press the same shortcut again — or `Esc` — to return to the normal layout.

* * *

## Troubleshooting

**"npx: command not found**"You haven't installed Node.js, or the install didn't update your PATH. Re-install Node from https://nodejs.org/ and restart your terminal.

**"code: command not found**"You've tried to run `code .` from a system terminal before enabling VS Code's shell command. You don't need to — follow the install instructions above, which run `npx storyline-cli init` from VS Code's own integrated terminal instead. That path always works.

**Claude Code doesn't recognise** `/storyline`**,** `/follow-up`**, or** `/critique`The skills weren't installed correctly. Check that `.claude/skills/storyline/`, `.claude/skills/follow-up/`, and `.claude/skills/critique/` exist inside your project folder. If one is missing, run `npx storyline-cli@latest init .` again from inside that folder to repair it, then reload the Claude Code window.

**`/critique` says** `STATE_DOC_DRIFT` **or** `/storyline` **says** `UPSTREAM_DRIFT`Your planning conversation produced long-form docs in `docs/` (e.g. `13-chapter-flesh-out.md`) but the structured data never reached `.storyline/state.json`. This is the bug the v1.6 enforcement layer is designed to detect. To recover:

1. Run `npx storyline-cli doctor --recover` — lists every stage that needs reseeding, with the exact next command for each.
2. For each stage in the list, run `npx storyline-cli reseed <stageId>` — prints the required-fields schema, points at the source doc to extract from, and shows the exact `save` command to run.
3. Extract the structured data from the doc (you can ask your AI in a separate chat to read the doc and output JSON matching the schema).
4. Run the `save` command shown by reseed.
5. Run `npx storyline-cli verify-stage <stageId>` — must exit 0.
6. Repeat for each orphan stage, then re-run `/critique` or `/storyline`.

This recovery class is automatically prevented for new projects by the PreToolUse hook installed by `init` — it refuses any write to `docs/<NN>-*.md` before the matching `save` has committed.

**The VS Code extension isn't active**Look at the bottom-right of VS Code. If you don't see a "Storyline" indicator, the extension didn't install. From the Command Palette, run **"Extensions: Install from VSIX…"** and pick the file in your project at `node_modules/storyline/vscode-extension/storyline-vscode-0.32.0.vsix`.

**`.md` files won't open in non-Storyline projects, or "Storyline" still appears in right-click menus there**Fully fixed in v1.8.0 / extension 0.32.0. Earlier versions registered Storyline as a `.md` editor system-wide via a `customEditors` package contribution, which leaked into every VS Code workspace — even those with no Storyline project. As of 0.32.0 the extension contributes nothing globally: the rich editor is registered programmatically and only when the extension activates (which only happens in a workspace containing `.storyline/state.json`). Every command, menu item and keybinding is gated behind a `storyline.active` context key set on activation, so non-Storyline workspaces see zero Storyline entries in any menu. **If you're still seeing the old behaviour, update the extension**: run `npx storyline-cli@latest init .` from inside any Storyline project (it will install the new 0.32.0 VSIX and reload), or install it manually via "Extensions: Install from VSIX…".

**Autosave isn't working**Storyline uses its own autosave (every 1.5 seconds after you stop typing). VS Code's separate auto-save feature should be OFF to avoid fighting with it. Check **Code → Preferences → Settings**, search "auto save", and set "Files: Auto Save" to `off`.

**The three-column layout has collapsed to one column**Drag a tab to the right edge of the editor area — VS Code will create a second column. Then use **"Storyline: Open to the Side"** or `Cmd+Enter` / `Ctrl+Enter` on a file to re-establish the pattern.

**Something else went wrong**File an issue at https://github.com/DarrenJCoxon/storyline/issues with:

- What you tried to do
- What happened instead
- What you see in the bottom-right of VS Code
- Your OS and VS Code version

* * *

## Feedback

Storyline is in free beta. If you use it to plan or draft a novel — even one chapter — I want to hear what worked, what didn't, and where you got stuck. The more specific the feedback, the better the product gets for the next writer.

Email: via the issue tracker above, or through the contact form on the project page.

* * *

## Licence

MIT — see LICENCE in this repository. Free for personal and commercial use. No warranty, no guarantees — this is beta software.

* * *

## Roadmap

Storyline's direction of travel is captured in two short docs:

- docs/distribution-phase-0.md — the current free beta (what you're using)
- docs/distribution-phase-1.md — the paid v1 DMG, planned for late 2026

The core product (editor + harness + compile + preview) is feature-complete for the beta. Future work is on packaging, polish, and audience reach.