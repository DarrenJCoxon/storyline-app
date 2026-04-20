# Milestone 4 — Compile to Print PDF (paperback-ready)

_Status: **CURRENT** (build work)_
_Parent: [../roadmap.md](../roadmap.md)_
_Related design: [../compile-feature.md](../compile-feature.md)_
_Last updated: 2026-04-20_

## Outcome

A writer can run a single command ("Novel Writer: Compile to Print PDF" in VS Code, or `nw compile --format print-pdf` in the terminal) and get a press-ready PDF that:

- Uploads cleanly to KDP's paperback interior checker (passes on first try)
- Uses 6x9 trim (most popular for trade paperback) by default, configurable
- Has running headers (book title on verso / chapter title on recto)
- Has page numbers (roman numerals for front matter, Arabic from chapter 1)
- Has drop caps at chapter openings
- Respects widow/orphan control (no one-line fragments at page boundaries)
- Has correct bleed (0.125" on outside edges if cover wraps)
- Has asymmetric margins (inside wider than outside for binding)
- Is built from the same `manuscript/*.md` files the EPUB compile uses

## Why this milestone exists

EPUB (Milestone 3) handles ebooks. Print PDF handles paperbacks — the other half of how indie authors publish. Writers upload the PDF to KDP Paperback or IngramSpark. Vellum's real moat sits here: print-quality typography is harder than EPUB because there are more layout rules (pagination, bleed, trim size, margins, running headers). Getting this right closes the "no more Vellum" story.

Scope for M4: **6x9 trim only, one theme (Classic Serif print variant)**. Other trim sizes (5x8, 5.5x8.5, large print) and additional themes are Milestone 6.

## Prove-it gate

All four must be true:

1. **A real manuscript compiles to a valid print PDF.** 3+ chapters, 10k+ words. `nw compile --format print-pdf` produces `output/compiled/manuscript-print-6x9.pdf`.
2. **KDP paperback interior checker passes on first upload.** No errors about bleed, margins, fonts, or embedded resources.
3. **Running headers and page numbers appear correctly.** Verso (left) pages show book title; recto (right) pages show chapter title. Front matter uses roman numerals; chapter 1 starts at Arabic page 1.
4. **Drop caps, scene breaks, and chapter openings render as in the EPUB,** but adapted for the fixed trim size (proper line-heights, margins, no overflow).

## Architecture

Builds on the existing compile pipeline. The EPUB pipeline's first three phases (assembly, preflight, markdown-to-html) are reused unchanged. Theme and output phases branch on format:

```
manuscript/*.md
        │
        ▼
  1. assembly      ← shared with EPUB
  2. preflight     ← shared, with print-specific checks added
  3. html          ← shared
        │
        ▼ (branch on format)
        │
  4a. EPUB theme        4b. Print theme (with @page rules)
  5a. EPUB packager     5b. Puppeteer + Paged.js → PDF
```

**Rendering stack for print:**

- **Paged.js** — a JS polyfill for CSS Paged Media. Handles pagination, running headers, page counters, widows/orphans, breaks. Runs in a browser context.
- **Puppeteer** — headless Chrome that loads the Paged.js-rendered HTML and prints it to PDF via Chromium's print engine.
- **CSS Paged Media** — `@page` rules, `@top-left`, `@bottom-center`, etc., in the theme CSS. Paged.js interprets these and paginates accordingly.

**Why Puppeteer over alternatives:**

- WeasyPrint (Python) has better native Paged Media support but requires Python — adds install complexity.
- Prince XML is best-in-class but commercial and expensive.
- `pdf-lib` / `pdfkit` — require rebuilding typography from scratch, huge scope.
- Puppeteer: one `npm install`, works on macOS/Windows/Linux, same engine writers already see in web browsers.

**Tradeoff**: Puppeteer bundles Chromium (~170 MB download on first install). Accepted for MVP. Future: make it optional via `puppeteer-core` + system Chrome.

## Stories

### 4.1 — Scaffold print-pdf format + install dependencies

Wire `nw compile --format print-pdf` as a supported format. Install `puppeteer` and `pagedjs`. Create `lib/compile/print-pdf.js` as a stub that logs "print-pdf phase stub" for now. Update `lib/compile/index.js` and `bin/commands/compile.js` to accept `print-pdf` alongside `epub`.

**Done when:** `nw compile --format print-pdf` runs without error, prints the phase sequence, exits cleanly. Produces no PDF yet — that's 4.4.

**Estimate:** Half day.

### 4.2 — Classic Serif print theme (extend the existing theme with @page rules)

Either (a) create `themes/classic-serif/theme-print.css` that extends the base, or (b) extend `theme.css` with `@media print` blocks and let the print pipeline serve the full stylesheet. Decision in the story itself.

Must cover:
- `@page` sizing (6x9", with 0.125" bleed on outside edges)
- Margins (asymmetric: 0.875" inside, 0.625" outside, 0.75" top/bottom — standard for 6x9)
- Running headers: `@top-left` for verso (book title), `@top-right` for recto (chapter title)
- Page numbers: `@bottom-center` with `counter(page)`; Roman for front matter, Arabic from chapter 1
- Page breaks: `h1 { break-before: right }` so chapters start on a recto (right) page
- Widow/orphan: `widows: 3; orphans: 3`
- Chapter first page: suppress header/page number on first page of each chapter (common convention)

**Done when:** The print theme CSS validates, and paged.js in a browser can render a sample HTML file with the expected pagination, headers, and page numbers.

**Estimate:** 1-1.5 days (most of it is CSS tuning).

### 4.3 — Paged.js HTML scaffold

Build the HTML template that wraps the compiled chapters for paged.js ingestion. Includes:
- `<link rel="stylesheet">` to the print theme CSS
- `<script>` loading paged.js (from `node_modules/pagedjs`)
- `<body>` with all chapters concatenated in order (unlike EPUB which splits per file, print is one document)
- Metadata in `<head>`: title (for `string(title)` running header), author, etc.

**Done when:** Opening the generated HTML in a real browser shows a paginated book preview with correct headers, page numbers, and chapter layout. Inspect visually before PDF output.

**Estimate:** Half day.

### 4.4 — Puppeteer → PDF

`lib/compile/print-pdf.js` uses Puppeteer to:
1. Launch headless Chrome
2. Navigate to the paged.js-rendered HTML (serve it locally or via a file URL)
3. Wait for paged.js to finish rendering (it emits a `done` event)
4. Call `page.pdf({ format: '6x9', printBackground: true, preferCSSPageSize: true })`
5. Save to `output/compiled/manuscript-print-6x9.pdf`

Handle errors: Chromium not installed (first-run download), paged.js timeout, insufficient memory.

**Done when:** `nw compile --format print-pdf` produces a 6x9 PDF with correct pagination. Opens cleanly in Preview / Adobe Reader.

**Estimate:** 1 day.

### 4.5 — Pre-flight adjustments for print

Extend `lib/compile/preflight.js` with print-specific checks:
- Minimum page count (KDP requires 24 pages for paperback)
- Cover-template hint: "Your book will be X pages; generate a cover for this page count at 6x9"
- Embedded font check (not a blocker for system fonts, but future themes may bundle)
- Chapter count reasonableness (KDP doesn't like 500 chapters)

Only runs these when `format === 'print-pdf'`; EPUB preflight stays unchanged.

**Done when:** Running print compile on a too-thin manuscript (<24 pages estimated) produces a clear warning; running on a reasonable book produces no new warnings.

**Estimate:** Half day.

### 4.6 — VS Code "Compile to Print PDF" command

Mirror of the EPUB compile command. Shells out to `nw compile --format print-pdf`, shows progress toast, success notification with [Reveal in Finder] / [Open] actions.

**Done when:** From VS Code command palette, running "Compile to Print PDF" produces the PDF and handing it off to macOS Preview via the Open button works.

**Estimate:** Half day.

### 4.7 — Prove-it: KDP paperback upload

You, the writer. Take a manuscript (3+ chapters, 10k+ words — placeholder content is fine for the first test), compile to print-pdf, upload to KDP Paperback as interior. The KDP checker should pass on first try. If it flags anything, triage: real issue vs. writer-addressable (cover upload, etc.).

**Done when:** KDP interior checker returns green. Friction log populated with any issues.

**Estimate:** Variable — your validation work.

## Risks

**Chromium bundle weight.** First `npm install` pulls 170MB+ of Chromium. On slow connections or in Docker builds this feels awful. Mitigation for M4: accept. Future milestone: offer `puppeteer-core` + system Chrome as a flag.

**Paged.js pagination quirks.** Paged.js is solid but not perfect. Complex layouts (nested tables, long word sequences without spaces, non-Latin scripts) can produce unexpected breaks. For fiction, should be fine. If something weird appears, the fix is usually a targeted CSS rule.

**KDP's checker rejects weird things.** Fonts not embedded, bleed wrong direction, wrong trim size, insufficient margin. Story 4.5's preflight catches the obvious cases; the rest we learn from real uploads in Story 4.7.

**Font embedding.** System fonts (Georgia, Times) aren't embedded in the PDF — Chromium uses them directly. Some print-on-demand providers require all fonts be embedded. For KDP this is okay; for IngramSpark premium distribution it might not be. Mitigation: M6 adds a "bundle EB Garamond" theme option.

**Puppeteer in CI or sandboxed environments.** If anyone runs this without a full user shell (CI, certain Docker images), Chromium may fail to launch. Mitigation: error message points at the `--no-sandbox` flag and/or suggests reinstalling Chromium.

**First-run Chromium download is slow.** No good fix — just make it visible. "Downloading Chromium (~170 MB, one-time)…" message when puppeteer installs.

## Cut list (explicitly NOT in this milestone)

- **Multiple trim sizes** (5x8, 5.5x8.5, 8.5x11 for large print) — Milestone 6
- **Custom cover generation** — out of scope entirely; writer supplies cover to KDP separately
- **Cover template generator** (correct dimensions for the trim + page count) — nice to have, M6
- **IngramSpark premium distribution compliance** (higher bar than KDP) — M6
- **Print-specific preview panel** — Milestone 5
- **Additional themes** — M6
- **Font embedding with bundled open-source fonts** — M6
- **Advanced typography** (hanging punctuation, optical margin alignment, custom small caps) — later milestones as writers request
- **Other output formats during print compile** — print-pdf only; EPUB is a separate compile

## Definition of done

- All four prove-it criteria met
- `nw compile --format print-pdf` works from any terminal inside a novel project
- VS Code command invokes the CLI and handles success/failure cleanly
- Output PDF opens in Preview / Adobe Reader
- KDP paperback interior checker passes
- Lessons learned note captured below

## Lessons learned

_To be filled in at milestone closure. What surprised you about paged.js? What does Classic Serif print need for book 2? What should Milestone 5 (Preview) know from this experience?_
