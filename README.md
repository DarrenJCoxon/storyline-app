# Storyline

**A planning and writing environment for novelists.**

Storyline combines a conversational Save-the-Cat planning harness (powered by Claude) with a distraction-free VS Code writing surface and a one-command compile pipeline to EPUB and print-ready PDF. You plan your book end-to-end, draft the prose in the same environment, and export a shop-ready file when you're done.

It does not write your novel for you. It helps you plan it, structure it, and draft it.

---

## Who this is for

- Novelists who want a single, coherent environment rather than Scrivener + a separate AI tool + a separate compile tool.
- Writers comfortable running two commands in a terminal once, to install.
- Anyone who has tried to plan a book with ChatGPT and watched the conversation drift, lose the beat sheet, or forget the character names three prompts later.

If you don't have a terminal open right now and the word "npx" doesn't mean anything to you, don't panic. This guide walks you through everything assuming zero prior knowledge.

---

## What you'll need

Three free pieces of software. You install each one once; Storyline then coordinates them.

### 1. VS Code — the writing environment

VS Code is a free editor made by Microsoft. Normally it's used for code, but Storyline configures it to behave like a dedicated writing app: three columns (file tree, manuscript, supporting docs), a clean writing surface, no developer chrome in your face.

Download: <https://code.visualstudio.com/>

Install it like any Mac or Windows app (drag to Applications on Mac, run the installer on Windows).

### 2. Node.js — the engine that runs Storyline

Node.js is a background program that lets you run JavaScript tools on your computer. Storyline uses it. You don't interact with it directly — you just need it installed.

Download the **LTS (Long-Term Support)** version from <https://nodejs.org/>

Install it. On Mac, this adds a command called `node` to your terminal. On Windows, the installer does this automatically.

### 3. Claude Code — the AI collaborator

Claude Code is Anthropic's AI coding/writing assistant. Storyline's `/storyline` command runs inside Claude Code to guide you through the 14 planning stages.

Download: <https://claude.com/product/claude-code>

Sign in with your Anthropic account (you'll need one — free tier is enough to try Storyline).

---

## Install Storyline

Open your terminal.

- **Mac**: press `Cmd+Space`, type "Terminal", press Enter.
- **Windows**: press `Windows key`, type "PowerShell", press Enter.

You'll see a blinking cursor. Type (or copy-paste) the following, one line at a time, pressing Enter after each:

```bash
npx storyline init my-novel
cd my-novel
code .
```

What each line does:

1. `npx storyline init my-novel` downloads Storyline and creates a new folder called `my-novel/` in your current directory, pre-configured as a novel project. This takes 30–60 seconds the first time as npm fetches the package.
2. `cd my-novel` moves into that folder.
3. `code .` opens VS Code with that folder loaded.

VS Code should now open, with a tree of files on the left (your project) and a welcome document in the middle.

### If `code .` doesn't work

Some Mac users see `command not found: code`. That's because VS Code's terminal command isn't on your PATH yet. To fix it, open VS Code manually, then:

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows).
2. Type "shell command" and choose **"Install 'code' command in PATH"**.
3. Close and reopen your terminal, then try `code .` again.

Alternatively, just skip that step and open VS Code manually, then use **File → Open Folder** and pick your `my-novel` folder.

### If you see an extension-install warning

Storyline comes with a VS Code extension that provides the rich-text writing surface, the compile commands, and the three-column layout. The `init` command tries to install this extension automatically. If it can't (VS Code CLI not on PATH yet), you'll see a yellow message with fallback instructions. Follow them — it's a one-time step.

---

## Your first five minutes

### Open the welcome document

With the `my-novel/` folder open in VS Code, double-click `docs/welcome.md` in the file tree on the left. It opens in the middle of the screen — this is the Storyline rich-text editor.

It looks like a normal writing surface: no code, no syntax highlighting, just prose. You can start typing.

### Open a chapter to the side

Right-click `manuscript/chapter-01.md` in the file tree. From the menu, choose **"Storyline: Open to the Side"**. The chapter opens in a second column on the right, next to your welcome document.

You now have three columns visible at once:

- **Left**: file tree
- **Middle**: welcome document
- **Right**: chapter one

(Shortcut: select a `.md` file in the tree and press `Cmd+Enter` on Mac / `Ctrl+Enter` on Windows — same effect.)

### Start planning with `/storyline`

Open Claude Code. In the chat box, type:

```
/storyline
```

and press Enter.

Claude Code recognises the command, reads your project, notices it's a fresh novel, and starts the planning conversation. The first thing it asks about is your genre — because different genres (thriller, romance, fantasy) have different structural expectations.

Answer naturally. There's no form to fill in. The harness adapts to what you say, saves progress automatically, and flags issues the way a thoughtful editor would.

At any point you can switch to VS Code and write prose in the chapter you have open. Storyline auto-saves every 1.5 seconds; you'll never lose work.

---

## How Storyline is organised

Your project folder looks like this:

```
my-novel/
├── .storyline/               # Storyline's state (planning progress, never edit by hand)
├── .claude/skills/storyline/ # The /storyline skill — powers the planning conversation
├── manuscript/               # Your prose. One .md file per chapter.
│   ├── chapter-01.md
│   └── chapter-02.md
├── docs/                     # Planning notes, character sheets, research
│   └── welcome.md
├── output/                   # Compiled EPUB / PDF / planning documents land here
├── CLAUDE.md                 # Project-level instructions for Claude
└── compile.config.json       # Book metadata (title, author, cover)
```

You work primarily in `manuscript/` (prose) and `docs/` (supporting material). Storyline handles the rest.

---

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

---

## Writing prose

Once you've planned a beat (say, the Opening Image), you can go write it. Open the relevant chapter file, and type. The editor:

- Indents paragraphs in novel style (first-line indent, no blank-line gap between paragraphs).
- Renders `* * *` as a centred scene break.
- Shows your word count in the status bar (bottom of the window).
- Has a typewriter-mode toggle that keeps the line you're writing vertically centred on screen.
- Auto-saves as you type.

The file on disk is plain Markdown. You own it. If you ever want to export your manuscript out of Storyline and edit it in Word, Scrivener, or anything else, it's just `.md` files in a folder.

---

## Compiling to EPUB or PDF

When your manuscript is ready, open the Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows) and type:

- **"Storyline: Compile to EPUB"** — produces a shop-ready EPUB you can upload to Kindle, Apple Books, or Kobo.
- **"Storyline: Compile to Print PDF"** — produces a print-ready PDF at the right trim size for KDP Paperback, IngramSpark, etc.

Output lands in `output/`. Book metadata (title, author, cover) lives in `compile.config.json` — you edit that via **"Storyline: Edit Book Info"**.

---

## Live preview

While you're writing, you can see how the book will render in its final form:

- **"Storyline: Open Live Chapter Preview"** — shows the current chapter rendered in a device frame (Kindle, Apple Books, paperback page). Updates as you type.

Useful for catching formatting issues early — for example, a scene break that sits awkwardly at the bottom of a page, or a chapter heading that clashes with the theme.

---

## Troubleshooting

**"npx: command not found"**
You haven't installed Node.js, or the install didn't update your PATH. Re-install Node from <https://nodejs.org/> and restart your terminal.

**"code: command not found"**
VS Code's terminal command isn't on your PATH. See the "If `code .` doesn't work" section above.

**Claude Code doesn't recognise `/storyline`**
The skill wasn't installed correctly. Check that `.claude/skills/storyline/` exists inside your project folder. If it doesn't, run `npx storyline init .` again from inside that folder to repair it.

**The VS Code extension isn't active**
Look at the bottom-right of VS Code. If you don't see a "Storyline" indicator, the extension didn't install. From the Command Palette, run **"Extensions: Install from VSIX…"** and pick the file in your project at `node_modules/storyline/vscode-extension/storyline-vscode-0.17.0.vsix`.

**Autosave isn't working**
Storyline uses its own autosave (every 1.5 seconds after you stop typing). VS Code's separate auto-save feature should be OFF to avoid fighting with it. Check **Code → Preferences → Settings**, search "auto save", and set "Files: Auto Save" to `off`.

**The three-column layout has collapsed to one column**
Drag a tab to the right edge of the editor area — VS Code will create a second column. Then use **"Storyline: Open to the Side"** or `Cmd+Enter` / `Ctrl+Enter` on a file to re-establish the pattern.

**Something else went wrong**
File an issue at <https://github.com/DarrenJCoxon/storyline/issues> with:

- What you tried to do
- What happened instead
- What you see in the bottom-right of VS Code
- Your OS and VS Code version

---

## Feedback

Storyline is in free beta. If you use it to plan or draft a novel — even one chapter — I want to hear what worked, what didn't, and where you got stuck. The more specific the feedback, the better the product gets for the next writer.

Email: via the issue tracker above, or through the contact form on the project page.

---

## Licence

MIT — see [LICENCE](LICENCE) in this repository. Free for personal and commercial use. No warranty, no guarantees — this is beta software.

---

## Roadmap

Storyline's direction of travel is captured in two short docs:

- [docs/distribution-phase-0.md](docs/distribution-phase-0.md) — the current free beta (what you're using)
- [docs/distribution-phase-1.md](docs/distribution-phase-1.md) — the paid v1 DMG, planned for late 2026

The core product (editor + harness + compile + preview) is feature-complete for the beta. Future work is on packaging, polish, and audience reach.
