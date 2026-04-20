# Milestone 3 — Compile to EPUB replaces the "upload and pray" step

_Status: **CURRENT** (build work)_
_Parent: [../roadmap.md](../roadmap.md)_
_Related design: [../compile-feature.md](../compile-feature.md)_
_Last updated: 2026-04-20_

## Outcome

A writer can run a single command ("Novel Writer: Compile to EPUB" in VS Code, or `nw compile --format epub` in the terminal) and get a valid `.epub` file that:

- Opens correctly in Apple Books (iPad), Kindle Previewer, and Calibre
- Passes EPUBCheck validation
- Uses one curated theme (Classic Serif) with proper typography — drop caps on chapter openings, centred `* * *` for scene breaks, consistent chapter numbering, correct front/back matter
- Is built from the writer's `manuscript/*.md` files with metadata pulled from `.novel-writer/state.json`

## Why this milestone exists

Vellum is $200, Mac-only, and the industry default for indie authors. Replacing it closes one of three legs of our "plan → write → publish" story in-VS Code. Without compile, writers still need an external tool; with it, they don't.

For Milestone 3 we ship EPUB only. Print PDF is Milestone 4. Preview is Milestone 5. Ambitious to do all three at once would be wrong — EPUB is the testable unit: it either opens correctly in Apple Books/Kindle or it doesn't. Print has more moving parts (Paged.js, trim sizes, bleed), better left for the next milestone when we have one round of real-world use under our belt.

## Prove-it gate

All four must be true:

1. **A real manuscript compiles to a valid EPUB.** At least 3 chapter files in `manuscript/` (can be test content; real prose preferred). Running compile produces `output/compiled/manuscript.epub` with no errors.
2. **EPUB opens correctly in Apple Books.** Drag the `.epub` onto Apple Books on macOS or iPad. It opens, chapters are navigable via the TOC, typography looks professional (not default markdown render).
3. **EPUB passes EPUBCheck validation.** `java -jar epubcheck.jar output/compiled/manuscript.epub` reports zero errors.
4. **Kindle Previewer renders it without visible breakage.** Drag into Kindle Previewer. Scene breaks show correctly on both Paperwhite and iOS Kindle simulations.

## Architecture

The compile pipeline lives in `lib/compile/` in the novel-writer CLI and is exposed via:
- `nw compile --format epub` — primary interface, works from any terminal
- `Novel Writer: Compile to EPUB` VS Code command — shells out to `nw compile` and reports back

This matches the engine-platform direction (see [../engine-platform.md](../engine-platform.md)) — compile logic will eventually be extracted as platform code when we add a second engine, but for now it lives in the novel-writer repo.

```
manuscript/*.md
  + .novel-writer/state.json (metadata)
  + compile.config.json (overrides)
        │
        ▼
  1. lib/compile/assembler.js
     - Read chapter files in alphabetical order
     - Prepend front matter (title page, copyright, dedication)
     - Append back matter (acknowledgements, about the author)
     - Return structured manuscript object
        │
        ▼
  2. lib/compile/markdown-to-html.js
     - Each chapter's markdown → HTML via markdown-it
     - Preserves scene breaks, emphasis, headings, lists
     - Adds chapter-level classes for theme targeting
        │
        ▼
  3. lib/compile/themes/classic-serif/
     - Static CSS applied to the HTML
     - Drop caps, scene break ornaments, chapter heading style
        │
        ▼
  4. lib/compile/epub.js
     - Package HTML + CSS + metadata into EPUB 3 zip
     - Use @lesjoursfr/html-to-epub (or equivalent)
     - Write to output/compiled/manuscript.epub
        │
        ▼
  5. lib/compile/preflight.js (runs BEFORE 1 — validation gate)
     - Chapter count >= 1
     - Required metadata present (title, author)
     - Word count warnings if below genre minimum
     - Report errors vs warnings; abort on errors
```

## Stories

### 3.1 — Scaffold `lib/compile/` with orchestrator + CLI command

Create the module boundary. `lib/compile/index.js` exports a single `compile({ format, projectPath })` function that stitches the pipeline. `bin/commands/compile.js` adds the `nw compile` CLI wrapper.

For Story 3.1 the orchestrator is a stub that logs each phase — no real work yet. The goal is proving the CLI wiring: `nw compile --format epub` runs and reports "phase 1: preflight", "phase 2: assembly", etc.

**Done when:** `nw compile --format epub` runs from any novel project's directory without errors, prints the phase sequence, exits cleanly.

**Estimate:** Half day.

### 3.2 — Chapter assembly

`lib/compile/assembler.js` reads all `.md` files from the configured `manuscript/` path in alphabetical order (`ch01.md`, `ch02.md`, etc.). Prepends optional front matter files (`manuscript/_front-matter/title-page.md`, `_front-matter/copyright.md`) if present. Appends `_back-matter/` files the same way.

Returns a structured object:
```javascript
{
  frontMatter: [{ id, title, html }],
  chapters: [{ id, number, title, html }],
  backMatter: [{ id, title, html }],
  metadata: { title, author, language, ... }
}
```

Metadata comes from `.novel-writer/state.json` (title, author derived from `_meta` and `premise`, language defaults to `en`). Overrides from an optional `compile.config.json` at project root.

**Done when:** `nw compile --format epub` on a test project with 3 chapter files produces the assembled object (dump to console for now). Chapter order is correct. Metadata is populated.

**Estimate:** 1 day.

### 3.3 — Markdown → HTML conversion

`lib/compile/markdown-to-html.js` converts each chapter's markdown body to clean HTML using markdown-it (already a dependency via tiptap-markdown). Custom rendering rules:

- `<hr>` becomes `<hr class="scene-break">` (matches our in-editor convention)
- `<h1>` on the first line becomes the chapter title
- Smart quotes, em-dashes, ellipsis (via markdown-it-smartypants or equivalent)
- No raw HTML allowed (strip)

**Done when:** Given a sample chapter with headings, bold/italic, scene breaks, dialogue — HTML output is semantically correct and ready for CSS theming.

**Estimate:** Half day.

### 3.4 — Classic Serif theme

`lib/compile/themes/classic-serif/` contains:
- `theme.css` — typography, margins, chapter headings, drop caps, scene break ornaments
- `theme.json` — declares fonts, default trim size (for later PDF), font licensing
- `fonts/` — optional open-source serif (EB Garamond or Crimson Pro) bundled; Apple Books and most readers supply serif fonts if we reference by family

Key CSS concerns:
- Drop cap on first paragraph of each chapter (`p.first::first-letter`)
- Centred `* * *` for `hr.scene-break`
- Chapter heading style (generous margin-top, smaller than title)
- Correct inheritance through EPUB reader quirks (don't use modern CSS that Kindle chokes on)

**Done when:** A sample compiled EPUB uses the Classic Serif theme visibly — drop caps render, scene breaks are ornamental, headings look intentional.

**Estimate:** 1 day (most of the time is font/CSS tuning).

### 3.5 — EPUB packaging

`lib/compile/epub.js` takes the assembled + themed HTML and produces an EPUB 3 zip. Uses `@lesjoursfr/html-to-epub` (modern fork of the old `epub-gen`, actively maintained as of 2026-04).

Inputs:
- Per-chapter HTML files (title, body, ID)
- Theme CSS
- Metadata (title, author, language, identifier, cover)
- Front/back matter as separate EPUB sections

Output: `output/compiled/manuscript.epub` with proper EPUB 3 structure (OPF, NCX, nav.xhtml).

**Done when:** Running the full pipeline produces an `.epub` file. Opening it in any EPUB reader shows chapters in order, TOC is navigable, metadata is visible in the reader's book info panel.

**Estimate:** 1 day.

### 3.6 — Pre-flight validation

`lib/compile/preflight.js` runs before assembly. Checks:

- At least 1 chapter file exists in `manuscript/`
- `state.json` has `_meta.projectTitle` (or a flag allows "Untitled")
- `state.json` has an author (may come from git config or prompt)
- Word count: warn if less than the genre's minimum (via `genre.targetWordCount` and the stage-guides word count guidance)
- EPUB identifier present (generate a UUID if missing)

Returns `{ errors: [], warnings: [] }`. `nw compile` aborts with non-zero exit if errors. Warnings are printed but don't block.

**Done when:** Running compile on a project missing metadata shows a clear error and refuses to produce the EPUB. Running with warnings-only (e.g. short word count) produces the EPUB but surfaces the warning.

**Estimate:** Half day.

### 3.7 — VS Code command integration

Add `Novel Writer: Compile to EPUB` command to the extension. When invoked:

1. Shell out to `nw compile --format epub` in the workspace root
2. Show a progress toast ("Compiling your novel to EPUB…")
3. On success: status bar message, reveal the output file in the explorer, offer to open it
4. On failure: show the error output in a notification with "View Details" that opens the compile log

The extension does NOT reimplement the compile logic — it wraps the CLI. This keeps the compile pipeline usable from any terminal and testable in isolation.

**Done when:** From VS Code, running "Compile to EPUB" in a novel project produces the `.epub` and shows a completion notification.

**Estimate:** Half day.

### 3.8 — Prove-it: compile a real manuscript, test on Apple Books and Kindle Previewer

You, the writer. Take a manuscript (even with placeholder prose — 3+ chapters is enough), compile it, drag into Apple Books and Kindle Previewer, spot-check:

- Chapters navigable via TOC
- Scene breaks render as `* * *`
- Drop cap appears at chapter starts
- No weird CSS artefacts
- Metadata (title, author) shows in the book info

Keep a friction log as before.

**Done when:** All four prove-it gate criteria are met. Friction log triaged.

**Estimate:** Variable — your validation work.

## Risks

**EPUBCheck validation quirks.** EPUB spec is strict. `html-to-epub` is good but not perfect. First compile may produce warnings. Expect to spend 30-60 minutes fixing reported issues in Story 3.5 before a clean run.

**Kindle rendering is quirky.** Kindle strips properties we didn't know were unsupported. The Classic Serif theme may need per-device CSS variants (media queries targeting Kindle). For Milestone 3 we aim for "looks acceptable on Kindle," not pixel-perfect. Kindle-specific polish is Milestone 6 work.

**Markdown-it rendering edge cases.** Our `.md` files might have TipTap-specific output (e.g. the `* * *` scene breaks) that markdown-it parses slightly differently than TipTap did. Compare outputs early in Story 3.3 to catch drift.

**Font licensing and bundling.** Embedding fonts in EPUB requires proper licensing. EB Garamond and Crimson Pro are both SIL OFL-licensed — safe to bundle. Commercial serif fonts (Sabon, Minion, Caslon) are not. We restrict to open-source fonts or rely on reader-supplied fonts.

**CLI shelling from VS Code cross-platform.** `spawn('nw', ...)` assumes `nw` is on PATH. On macOS with npm link, yes. On Windows with fresh install, may not be. Use `npx nw compile` as the spawn target to route through Node's module resolution. Verify in Story 3.7.

**The compile pipeline is new surface area.** Adding a major feature means maintaining more tests and docs. Keep the pipeline engine-agnostic where possible (see compile-feature.md) so the multi-engine refactor in Milestone 7 is cleaner.

## Cut list (explicitly NOT in this milestone)

- **Print PDF output** — Milestone 4
- **Preview panel** — Milestone 5
- **Additional themes** (Modern Sans, Heritage, Romance, etc.) — Milestone 6
- **Theme customisation** via `compile.config.json` override — Milestone 6
- **Custom front/back matter editors** — writers supply markdown files by convention in `manuscript/_front-matter/` for now
- **Cover image generation or AI covers** — writers supply or use KDP's cover wizard
- **ISBN purchase / validation** — writer provides; we don't check registry
- **KDP / IngramSpark / Apple Books direct upload** — writer uploads manually for now
- **EPUB 2 support** — EPUB 3 only (Amazon and Apple both support 3 fully)
- **Word docx output for agent submissions** — separate output format, later milestone
- **Kindle-specific CSS hacks** — basic support only; polish in Milestone 6

## Definition of done

- All four prove-it criteria met
- `nw compile --format epub` works from any terminal inside a novel project
- VS Code command invokes the CLI and handles success/failure cleanly
- Output EPUB opens in Apple Books and renders correctly
- EPUBCheck reports zero errors
- Lessons learned note captured below, informing Milestone 4 (print PDF) scoping

## Lessons learned

_To be filled in at milestone closure. What surprised you about EPUB? What does Classic Serif need more work on? What should Milestone 4 (Print PDF) know from this experience?_
