# Compile — From Manuscript to Publishable Output

_Status: design sketch. Not yet built._
_Depends on: [vscode-extension.md](vscode-extension.md)._
_Last updated: 2026-04-19_

## Why this matters

Every indie author who self-publishes uses *some* compile tool. It's a mandatory step between "I finished writing" and "my book is on Amazon." Most use:

- **Vellum** — $200, Mac-only, genuinely lovely output, the market leader. The Mac-only part is a real pain: Windows authors can't use it at all.
- **Atticus** — web-based, cross-platform, cheaper. Quality is okay, not great.
- **Reedsy Studio** — free, browser-based, limited customisation.
- **Word templates** — for the desperate.

The opportunity isn't that we'd build a better Vellum — it's that we'd eliminate the separate tool entirely. Writer plans in VS Code, writes in VS Code, compiles in VS Code. Three tools become one workflow. The file format stays markdown the whole way through, so the writer owns their content forever.

## What Vellum actually does

Worth being honest about the moat:

1. **EPUB generation** — assembles chapters, wraps in HTML/CSS, zips as `.epub`. Solved problem technically.
2. **Print-PDF generation** — same content, different CSS, press-ready PDF. Also a solved problem.
3. **Curated themes** — 12 or so book designs handling drop caps, scene breaks, running headers, chapter ornaments, typography. **This is where the real value is, and it's design work, not engineering.**
4. **Kindle-specific CSS hacks** — years of battle-testing against Kindle's quirky rendering. This one is hard to replicate quickly.

The first two are commodity tech. The third is labour we can do over time. The fourth is learned pain we'll accumulate the same way Vellum did — one writer's file at a time.

## The pipeline

```
chapter files (.md)
  │
  │  1. Assembly
  │     - Read chapters in order from .novel-writer/state.json
  │     - Concatenate with front matter (title page, copyright, dedication)
  │     - Concatenate back matter (acknowledgements, about the author)
  │     - Generate TOC from chapter titles
  ▼
merged HTML document
  │
  │  2. Theme application
  │     - Apply chosen theme CSS
  │     - Resolve scene break ornaments, drop caps, chapter headings
  │
  ├──▶  3a. EPUB output
  │      - @lesjoursfr/html-to-epub (or similar)
  │      - Metadata (ISBN, author, cover image)
  │      - Validate against EPUBCheck
  │      - Output: output/compiled/manuscript.epub
  │
  └──▶  3b. Print PDF output
         - Paged.js renders CSS Paged Media (running headers, page numbers,
           drop caps, widow/orphan control, bleed)
         - Puppeteer prints Paged.js output to PDF
         - Output: output/compiled/manuscript-print-6x9.pdf
```

Nothing exotic. EPUB generation and Paged.js are both mature open-source tech.

## Output formats (engine-aware, see engine-platform.md)

The compile pipeline is engine-agnostic. Each engine defines what outputs make sense for its form:

| Engine | Typical outputs |
|--------|-----------------|
| Novel Writer | EPUB, print PDF (5x8, 5.5x8.5, 6x9, large print), Word docx (for agents/editors) |
| Essay Writer | Word docx (academic submission), PDF (print), APA/MLA formatted variants |
| Non-Fiction Writer | EPUB, print PDF, companion-materials PDF (workbooks, exercises), web HTML |
| Screenplay Writer | PDF in industry format (Courier 12pt, 55 lines/page), Final Draft `.fdx` |
| Short Story Writer | Shunn manuscript format (submission standard), EPUB (for collections) |

The core pipeline — assemble, theme, render — stays the same. Engines plug in their front/back matter conventions, their theme sets, and their format-specific output modules.

## Typography deep dive

The difference between "technically valid EPUB" and "professional book" is typography. Here's what each format needs.

### EPUB specifics

- Smart quotes, em-dashes, ellipses (preserve from markdown, don't mangle)
- Scene break ornaments (`* * *` or custom SVG) with consistent spacing
- Chapter numbering (Arabic / Roman / word-form, configurable)
- Proper TOC with navPoints so readers can jump chapters
- Metadata: ISBN, title, author, publisher, cover, language
- CSS that degrades gracefully on Kindle (which strips many properties)
- Reflowable text that respects user font size preferences

### Print PDF specifics (via Paged.js + CSS Paged Media)

- Running headers (book title on verso / chapter title on recto)
- Page numbering (roman numerals for front matter, Arabic from chapter 1)
- Drop caps at chapter openings (CSS `:first-letter` with per-font tuning)
- Widow/orphan control (CSS `widows: 3; orphans: 3`)
- Hanging punctuation at line starts
- Proper trim sizes: 5x8, 5.5x8.5, 6x9 (most common for trade paperback)
- Bleed (typically 0.125" on outside edges if cover wraps)
- Margin asymmetry (inside margin wider than outside for binding)
- Blank pages where needed (chapters conventionally start recto)

All of this is achievable with well-written CSS. None of it is achievable with naive markdown-to-PDF conversion.

## Themes as curation

Themes are the main deliverable for writer-facing quality. Rough plan:

**Tier 1 (launch):**
- Classic Serif (Garamond-style, literary fiction default)
- Modern Sans (thriller/contemporary)
- Heritage (historical fiction, ornamental breaks)

**Tier 2 (expand):**
- Middle Grade / YA (more generous line-height, friendlier chapter heads)
- Romance (script-style chapter numbers, flourishes)
- Literary (minimal, generous margins, hanging punctuation)
- Non-fiction (numbered sections, sidebars, callout boxes)

Themes are directories of CSS + SVG (for ornamental breaks) + font files. Writers pick one per compile; advanced writers can override specific rules in a project-level `compile.config.json`.

Every theme must pass:
- EPUBCheck validation for EPUB output
- KDP cover/interior checker for print PDF
- IngramSpark file-format requirements for premium distribution

## Pre-flight validation

One of the hardest parts of self-publishing is the "will KDP reject this file?" anxiety. Indie authors upload, wait an hour, get an error about bleed or font embedding, fix it, upload again. It's miserable.

A pre-flight step before actually generating the file:

```
✓ Chapter count: 24 (within KDP limits)
✓ Total page count: 342 (valid for 6x9 paperback)
✓ Trim size: 6x9 (KDP supported)
✓ Bleed: 0.125" applied on outside edges
✓ Fonts embedded: Garamond, Garamond Italic, Garamond Bold
✓ Image DPI: N/A (no images)
⚠ Front matter: no copyright page detected — most published books include one
✗ ISBN: not set — required for IngramSpark (optional for KDP)
```

Green checkmarks for everything valid, warnings for unusual omissions, errors for blockers. Fix errors before compile runs.

This feature alone would be a meaningful reason to use the tool.

## Preview — see the book before compiling

One of Vellum's most-loved features is live preview: flip through the book as it'll look on Kindle, iPad, Kobo, or in print, before committing to a final compile. It kills the miserable "compile → upload → see it looks wrong → fix → recompile" cycle.

Our architecture makes this easier than Vellum's does, because everything is CSS-based. Previews are nearly free once the compile pipeline exists — we're just rendering the same output to a webview instead of a file.

### Three preview modes

**1. Live chapter preview (while writing)**

A side panel next to the TipTap editor showing the current chapter rendered in the selected theme on the selected device frame. Updates as you type, debounced to 500ms. Answers the moment-to-moment question "what does my prose actually look like when published?"

**2. Full-book browser (before compile)**

A dedicated preview panel that flips through the entire manuscript page-by-page in whichever format is being checked:

- Print PDF layout — actual page breaks, running headers, page numbers, drop caps
- EPUB on iPad / iPhone / Kindle Paperwhite / Kobo / Nook frames
- Large-print edition
- Web HTML (for non-fiction engines outputting to web)

Writers use this to sanity-check the whole book before hitting compile.

**3. Side-by-side comparison**

Two frames showing the same content in different themes or different devices. The theme-picker UX: "Classic Serif vs Modern Sans on iPad, which looks right for my book?"

### Where the previews come from architecturally

- **Print preview is essentially free.** Paged.js renders paginated HTML as scrollable pages in a browser viewport — that IS the preview. The "generate PDF" step is just `page.pdf()` in Puppeteer over the same Paged.js output. Zero additional rendering work.
- **EPUB preview is straightforward.** An EPUB is HTML+CSS in a zip. We render the same HTML+CSS in a webview iframe — no zip, no device download, just the rendered pages.
- **Device frames are CSS.** An "iPad preview" is the same HTML inside a styled frame sized 820×1180px with Apple Books rendering quirks applied. A "Kindle Paperwhite preview" is the same content inside a frame sized 1264×1680px with Kindle's quirks approximated. We curate frame presets; writers pick one.
- **Theme switching is instant.** Change the theme dropdown → the preview re-renders with new CSS. No compile step needed.

### The Kindle fidelity limit

Amazon's rendering engine is proprietary, quirky, and differs across devices (Paperwhite, Oasis, Fire, iOS Kindle app all render CSS differently). We can approximate Kindle via a curated CSS ruleset — good enough to catch obvious problems like broken drop caps or scene breaks swallowed by page transitions — but not pixel-accurate.

For final Kindle verification, Amazon ships a free tool called **Kindle Previewer** that renders exactly as real Kindle devices would. We can't embed it, but we can add a "Open in Kindle Previewer" button that exports the current EPUB to a temp file and launches the tool. That's the accuracy escape hatch.

Vellum does the same thing. Their Kindle preview is also an approximation, and serious indie authors always do a final pass through Kindle Previewer before uploading. We're matching a realistic bar, not a perfect one.

### Performance notes

Rendering 300 pages of Paged.js output on every keystroke would be slow. Solutions are standard:

- Debounce preview updates (500ms after last edit)
- Default to current-chapter-only live preview (instant, no full-book rendering during writing)
- Full-book browser is an explicit user action (click "preview full manuscript" and wait 5-10 seconds)
- Cache theme CSS and device frames — they rarely change

### Why this matters

Preview is fundamentally part of the compile story, not a separate feature. But it's what makes the tool *feel* complete to a writer. The compile → upload → check → fix cycle is what makes self-publishing anxious. If preview is continuous and the compiled file matches what was previewed, that anxiety disappears.

## Architecture, concretely

**New VS Code extension commands:**

Preview (non-destructive, opens a panel):
- `Novel Writer: Preview → Current Chapter (live)`
- `Novel Writer: Preview → Full Manuscript (print PDF layout)`
- `Novel Writer: Preview → Full Manuscript (EPUB on [device])`
- `Novel Writer: Preview → Compare Themes`
- `Novel Writer: Open in Kindle Previewer` (exports temp EPUB, launches external tool)

Compile (writes files to `output/compiled/`):
- `Novel Writer: Compile → EPUB`
- `Novel Writer: Compile → Print PDF (6x9)`
- `Novel Writer: Compile → Print PDF (5x8)`
- `Novel Writer: Compile → Word docx (for agents)`
- `Novel Writer: Compile → All (everything at once)`
- `Novel Writer: Compile → Pre-flight check`

**Project configuration: `compile.config.json`**

```json
{
  "theme": "classic-serif",
  "paragraphStyle": "indented",
  "trimSize": "6x9",
  "frontMatter": ["title-page", "copyright", "dedication"],
  "backMatter": ["acknowledgements", "about-the-author"],
  "metadata": {
    "title": "The Waking Tide",
    "author": "Jane Smith",
    "isbn": "978-1-234567-89-0",
    "publisher": "Independent",
    "copyrightYear": 2026
  },
  "themeOverrides": {
    "bodyFont": "Palatino, Georgia, serif",
    "sceneBreakOrnament": "❦",
    "chapterHeadingStyle": "small-caps"
  }
}
```

**Theme overrides (Story 6.3).** A small, curated set. Anything beyond these requires forking the theme directory under `lib/compile/themes/`.

| Key | Type | Effect | Supported by |
|---|---|---|---|
| `bodyFont` | CSS `font-family` stack | Sets the body + chapter font family. Writers supply a full stack so readers without the first face fall through gracefully. | Classic Serif, Modern Sans, Heritage |
| `sceneBreakOrnament` | string | Becomes the `content:` value of `hr.scene-break::before`. Any single glyph or short phrase. Common values: `"* * *"`, `"· · ·"`, `"❦"`, `"§"`. | Classic Serif, Modern Sans, Heritage |
| `chapterHeadingStyle` | preset name | Flips chapter `h1` to one of: `italic-centred`, `bold-left`, `small-caps`, `uppercase`. Each preset sets a coordinated group of `font-weight` / `font-style` / `font-variant` / `letter-spacing` / `text-align` / `text-transform` values. | Classic Serif, Modern Sans (Heritage declines — drop-cap treatment is tightly coupled to its heading) |

Each theme's `theme.json` declares which keys it honours via `overridable[]`. Overrides that the active theme doesn't honour surface as warnings at compile time (the compile still proceeds, they just don't apply). Typos and unknown keys also warn.

**Output directory: `output/compiled/`**

- `manuscript.epub` — ebook
- `manuscript-print-6x9.pdf` — paperback interior
- `manuscript-cover-template-6x9.pdf` — cover size template (writer supplies art)
- `manuscript-agent.docx` — for querying agents (different formatting convention)
- `compile-report.md` — log of what was generated, with pre-flight results

Everything goes in `output/compiled/` which is already gitignored at root level.

## Phasing, honestly

This is a multi-month feature, not weekend work. The smallest valuable first slice:

**Phase 1: EPUB with one theme**
- Assembly pipeline from `.novel-writer/state.json` chapter order
- One theme (Classic Serif)
- Metadata from a project config file
- Output valid `.epub` that opens in Apple Books and Kindle Previewer
- Pre-flight check: chapter count, metadata completeness

This is enough to test end-to-end. Ship it to 3-5 indie authors, watch them use it, note the gaps.

**Phase 2: Print PDF with Paged.js**
- Integrate Paged.js + Puppeteer
- Single trim size (6x9, most common)
- Running headers, page numbers, drop caps
- Test with actual KDP upload
- Expand pre-flight to check print-specific requirements

**Phase 3: Theme expansion**
- Second and third themes
- Theme override system (project-level CSS rules)
- Scene break ornament customisation

**Phase 4: Multi-format + engine extensibility**
- Word docx output (for agent submissions)
- Screenplay compile (if we add the screenplay engine)
- Essay compile (academic formatting)
- Submission format (Shunn for short stories)

**Phase 5: Polish**
- Kindle-specific CSS tuning (years of iteration territory)
- IngramSpark premium distribution compliance
- Large-print editions
- Cover-template generation that matches trim size exactly

## Risks & open questions

**Typography quality is iterative, not one-shot.** The gap between "technically valid EPUB" and "looks professional" is closed by hundreds of small CSS decisions. Every writer finds a new edge case. Plan for this being a continuous refinement, not a ship-and-forget feature.

**Font licensing.** We can't redistribute commercial fonts. Either use open-source fonts (Crimson, EB Garamond, Source Serif — genuinely excellent) or let writers supply their own. The Google Fonts catalogue is rich enough for most needs.

**Cover generation is out of scope.** We output *interior* PDF and a *cover template* (correct size for the trim + page count), but not the cover artwork itself. Writers use Canva, hire a designer, or use KDP's cover wizard. This is a deliberate scoping decision — cover design is its own deep well.

**Vellum's Kindle-specific CSS took years.** We'll ship bugs. Kindle renders EPUBs weirdly. Every writer who opens the output on a Paperwhite and sees a broken drop cap teaches us something. Build the feedback loop early.

**Paged.js browser dependency.** Paged.js runs in a headless browser (Puppeteer). That's a ~300MB dependency to ship with the extension. Alternatives: ship as optional download on first compile, or accept the weight.

**PDF generation is slow.** A 300-page book takes 30-60 seconds to render via Paged.js + Puppeteer. That's fine for a compile step (runs once per release), not fine for live preview. Don't promise live PDF preview.

## Strategic framing

Eliminating Vellum from the self-publishing workflow is a bigger wedge than it sounds:

- Windows authors can't use Vellum *at all* — they currently struggle with Atticus or broken Word templates. Meeting them cross-platform is valuable.
- Vellum is $200 one-time. Our bundle (writing + planning + compile) can be free open-source or a modest subscription. The value prop is "one tool, one workflow, your content stays in markdown forever."
- The compile step is where indie authors feel least confident. "Will KDP accept this?" is a real anxiety. A tool that runs KDP's validation rules locally before upload is genuinely useful.
- Multi-engine means this compile pipeline serves novelists, essayists, non-fiction authors, screenwriters — not just one market.

## Next steps

1. Build the Phase 1 EPUB pipeline (probably 2-3 weeks of focused work)
2. Get 3-5 real indie authors to compile a real manuscript with it
3. Read their output on Kindle, Apple Books, Kobo — note what breaks
4. Iterate on the first theme until the output is indistinguishable from Vellum at a glance
5. Only then start Phase 2 (print PDF)

Don't try to match Vellum feature-for-feature in one go. The goal is "good enough that a writer would actually use it, and writer trusts the file will upload cleanly to KDP." Everything beyond that is refinement.
