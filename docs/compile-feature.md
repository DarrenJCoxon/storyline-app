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
- Scene break ornaments (`⁂` or custom SVG) with consistent spacing
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

## Architecture, concretely

**New VS Code extension commands:**

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
    "chapterHeading.fontFamily": "Playfair Display",
    "sceneBreak.ornament": "⁂"
  }
}
```

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
