# M4 — Three-Column Layout + Editor

## Goal

The full three-column environment works as a coherent whole. A writer can plan
in the right pane and draft prose in the centre without switching contexts.

## Layout

```
┌─────────┬──────────────────────┬────────────────────┐
│  Files  │   Writing Pane       │   Planning Chat    │
│         │   (TipTap editor)    │   (secondary bar)  │
└─────────┴──────────────────────┴────────────────────┘
```

- **Left:** VS Code's native file explorer (no change needed)
- **Centre:** `EditorPanel` — TipTap rich-text editor (ported from `storyline-vsc`)
- **Right:** `ChatPanel` — planning conversation (M2), registered as secondary sidebar

This is the default layout on first open. Writers can rearrange using VS Code's
own panel drag system — we don't fight it.

## Deliverables

### EditorPanel (ported from storyline-vsc)

The TipTap webview from `storyline-vsc`'s VS Code extension, ported to the new
extension with the toolbar and font toggle added. Key behaviours:

- Opens when a `.md` file in `manuscript/` is clicked in the file tree
- Auto-save every 1.5 seconds after last keystroke
- Word count streamed to VS Code status bar (this file / total manuscript/)
- Scene break (`* * *` on its own line) renders as a centred rule
- Markdown source editable via "Open Source" context menu item

### Editor toolbar

Compact toolbar above the writing surface. Left to right:

```
[ MANUSCRIPT ]  B  I  |  H1  H2  |  "  ***  [ Serif | Sans ]  ☑ Typewriter
```

- **MANUSCRIPT tag** — amber-tinted label, confirms the file context
- **B / I** — bold / italic. `I` renders in the currently active font
- **H1 / H2** — chapter title and scene heading styles
- **`"`** — smart quote insert
- **`***`** — scene break (renders as centred `* * *`)
- **Serif / Sans toggle** — switches manuscript font between Lora (serif,
  default) and Inter (sans). Stored in `globalState`, applied immediately.
  Serif is the default — warm, traditional, suits long-form fiction.
- **Typewriter** — centres the active line vertically; dims surrounding text

The toolbar is intentionally minimal. No colour pickers, no font size
selectors, no paragraph menus. Writers format prose, not documents.

### Layout initialisation

On first open (after onboarding):
1. Open `manuscript/chapter-01.md` in the EditorPanel (centre)
2. Open ChatPanel in the secondary sidebar (right)
3. Show a one-time layout tip: "Your chapters are in the centre. Your planning
   coach is on the right. →"

VS Code workspace settings written to `.vscode/settings.json`:
```json
{
  "workbench.secondarySideBar.visible": true,
  "workbench.activityBar.location": "top"
}
```

### Chapter cards

On each stage save in ChatPanel, `writeAllChapterCards(state, projectDir)` is
called (ported from `storyline-vsc`). One card per chapter in `docs/chapters/`,
named `01-slug.md`. The writer sees their chapter plan appear in the file tree
as planning progresses — the plan materialises alongside the prose.

### Status bar

- Left segment: word count for the current open file
- Right segment: total manuscript word count (all `.md` in `manuscript/`)
- Updates on every auto-save, not on every keystroke

### Commands

Available from ⌘⇧P:
- `Storyline: Open Planning Chat` — focuses the secondary sidebar ChatPanel
- `Storyline: Open Editor` — opens the manuscript folder in the file tree
- `Storyline: New Chapter` — creates `manuscript/chapter-NN.md`, opens it
- `Storyline: Compile to EPUB` (M5)
- `Storyline: Compile to PDF` (M5)

Context menu on any `.md` in `manuscript/`:
- `Storyline: Open in Editor` — opens in TipTap EditorPanel

### "Open to the side" default

Clicking a manuscript `.md` file in the file tree opens it in the EditorPanel
(centre column) rather than VS Code's default text editor. This requires
registering a custom editor for `.md` files scoped to the `manuscript/` path.
A right-click "Open as text" option preserves raw markdown access.

## Technical tasks

- [ ] Port TipTap EditorPanel webview from `storyline-vsc`
- [ ] Register EditorPanel as custom editor for `manuscript/**/*.md`
- [ ] Implement auto-save (1.5s debounce after keystroke)
- [ ] Implement word count — per file and total manuscript
- [ ] Register word count in VS Code status bar (left and right segments)
- [ ] Write `.vscode/settings.json` on first open
- [ ] Open default layout on first post-onboarding activation
- [ ] Show one-time layout tip (stored in `globalState`, shown once)
- [ ] Port `writeAllChapterCards` from `storyline-vsc` into extension save flow
- [ ] Build editor toolbar (MANUSCRIPT tag, B, I, H1, H2, scene break, Serif/Sans, Typewriter)
- [ ] Implement Serif/Sans font toggle — store in `globalState`, apply to prose only
- [ ] Load Lora (serif) and Inter (sans) — Lora as default
- [ ] Apply dark/light editor colours from design tokens (not VS Code theme colours)
- [ ] Register all commands in `package.json` contributes.commands
- [ ] Implement `New Chapter` command with sequential numbering
- [ ] Implement `Open to the side` file tree context menu item

## Dependencies

M2 (ChatPanel), M3 (Onboarding — layout opens post-onboarding).

## Success criteria

- Three-column layout opens correctly after onboarding completes
- Clicking a manuscript file opens TipTap, not VS Code's text editor
- Word count in status bar is accurate and updates within 2 seconds of typing
- Chapter cards appear in `docs/chapters/` after a stage save
- `⌘⇧P → Storyline: Open Planning Chat` focuses the right pane
- Auto-save fires within 1.5s and never loses a keystroke
