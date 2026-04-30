# Compile v2 — Phase 5: Multi-Target Export

*Status: **PLANNING**Parent: ./README.mdRelated: ./phase-2-book-styles.md, ../milestone-04-compile-print-pdf.mdLast updated: 2026-04-29*

## Outcome

A writer presses Compile and gets **a folder of files ready to upload to every store they care about** — Apple Books, Kobo, Google Play Books, Amazon Kindle (KFX-ready EPUB), KDP Paperback (with bleed if needed), KDP Hardcover, IngramSpark Paperback (different bleed + ISBN handling), IngramSpark Hardcover with dust jacket. Each output is tuned to its target's quirks: Kindle gets the CSS subset that doesn't get stripped; IngramSpark gets the full-cover PDF (front + spine + back) with spine width auto-calculated from page count and paper weight; Apple gets the metadata block their submission tool expects.

Plus: **specimen sheets** that compile the same first chapter in all twelve Book Styles into one comparison PDF, so writers can decide before committing.

## Why this phase exists

Today's compile produces one EPUB and one print PDF at a single trim. To publish on Apple, Kobo, Kindle, and KDP Paperback the writer has to:

1. Compile EPUB.
2. Manually fix Kindle-specific issues (margins, font handling, drop caps that Amazon's reflow breaks).
3. Compile print PDF.
4. Realise IngramSpark needs bleed and KDP doesn't and reconcile.
5. Build a separate full-cover PDF in another tool because Storyline doesn't.
6. Write the spine manually because no one calculates spine width.
7. Re-upload three times when each store rejects something.

Vellum solves this with one-click "Generate for Apple Books / Kindle / Kobo / etc." Each generates a slightly different file. We need that, but we also need to handle **print** properly, which Vellum does badly — its full-cover support is afterthought and IngramSpark hardcover with dust jacket is unsupported.

## Prove-it gate

All four must be true:

1. **Single Compile produces the full distribution bundle.** Output folder contains: `<book>-apple.epub`, `<book>-kindle.epub`, `<book>-kobo.epub`, `<book>-kdp-paperback-6x9.pdf`, `<book>-kdp-paperback-cover.pdf`, `<book>-ingramspark-paperback-6x9.pdf`, `<book>-ingramspark-cover.pdf`. Plus a `manifest.json` describing which file goes to which platform.
2. **Each store accepts its file without warnings.** Real submission tests: Apple Books submission tool accepts the `*-apple.epub`. KDP accepts the `*-kdp-paperback-*.pdf` and the cover. IngramSpark's PDF preflight passes the *-ingramspark-* files. Kindle Previewer 3 renders the `*-kindle.epub` correctly.
3. **Spine math is right.** A 304-page book on 50# white paper has a spine width of 0.6685" — Storyline calculates this and the cover PDF reflects it. The writer doesn't think about it. Different paper stocks (50#, 60# white, 60# cream) produce different spines and the calculation is per-paper.
4. **Specimen comparison sheet.** A writer triggers "Compare Book Styles" and gets a single PDF where their first chapter is rendered in all twelve styles, side-by-side, ready to print or screen-compare.

## Per-store EPUB profiles

Each profile is a thin layer on top of the base EPUB compile that tweaks CSS, metadata, and packaging:

| Profile | What it does |
|---|---|
| **apple** | Default. Full CSS, embedded fonts, SVG support, `epub:type` semantics. Apple Books submission metadata block in OPF. |
| **kobo** | Same as Apple but slightly tighter line-height (Kobo readers default to looser leading and we want to compensate). |
| **google** | Apple-equivalent. Google Play Books accepts mostly anything but expects `dc:identifier` to be a valid URN. |
| **kindle** | Strip CSS that Amazon's KFX converter mangles (specifically: variable fonts, some pseudo-elements, hanging punctuation). Embed only static-instance font cuts. Use `media-overlay` only when audio is present. Test with Kindle Previewer 3 in CI. |
| **nook** | Barnes & Noble — generally compatible with Apple profile. Lower priority. |
| **draft2digital** | D2D distributes to many stores from one upload. Use Apple profile but include their metadata fields. |

The profile is selected via `compile.config.json.distribution.targets[]`:

```json
"distribution": {
  "targets": ["apple", "kobo", "kindle", "kdp-paperback", "ingramspark-paperback"]
}
```

Default targets when not configured: `["apple", "kindle", "kdp-paperback"]`.

## Per-store print profiles

Print is harder than EPUB because printing services have hard physical requirements:

| Profile | Trim | Bleed | Cover | Notes |
|---|---|---|---|---|
| **kdp-paperback** | configurable (6×9 default) | None for interior; 0.125" for full-bleed images on cover | Separate front-only cover PDF (KDP combines front + spine + back from your upload but accepts a flat front file) | KDP rejects PDFs with crop marks. No font subsetting issues. |
| **kdp-hardcover** | 6×9 most common | 0.125" interior + cover | Full-cover PDF (front + spine + back + flaps) | Spine math accounts for board thickness. |
| **ingramspark-paperback** | configurable | 0.125" interior + cover | Full-cover PDF (front + spine + back) | Stricter PDF preflight than KDP. PDF/X-1a:2001 compliance recommended. Crop marks accepted but not required. |
| **ingramspark-hardcover** | configurable | 0.125" interior + cover with dust jacket | Two cover files: case (cloth/board) + dust jacket (front + spine + back + flaps) | Most complex. |
| **digital-pdf** | 6×9 or A5 | None | None | No bleed, no crop marks, fonts embedded — for ARCs, beta readers. |

### Spine width calculation

Spine width depends on page count and paper stock:

```
spine_width_inches = page_count × paper_thickness_inches
```

Common stocks (KDP):

| Stock | Thickness per page (inches) |
|---|---|
| 50# white | 0.0022 |
| 50# cream | 0.0025 |
| 60# white | 0.0028 |
| 60# cream | 0.0028 |
| Hardcover (case-laminate) | 0.0025 + board (0.072) + endpapers |

For a 320-page novel on 50# cream:

```
320 × 0.0025 = 0.8" spine
```

The compile pipeline calculates this and feeds it to the cover-PDF generator.

### Full-cover PDF generator

Inputs:

- Front cover (image file from `metadata.coverImage`).
- Back cover blurb (from `metadata.description` + `metadata.author` + barcode placeholder).
- Spine width (calculated).
- Trim size.
- Bleed (0.125" by default for IngramSpark, 0 for KDP cover).
- ISBN (for barcode).

Outputs a single PDF with the front + spine + back composited at the right physical dimensions, with the spine text rendered in the Book Style's display face, the title and author centred on the spine, and a barcode on the back if ISBN is provided.

This is a significant new module: `lib/compile/cover-generator.js`. Uses sharp + svg-to-pdf or Chromium-rendered HTML for the layout.

### PDF/X-1a compliance for IngramSpark

IngramSpark's preflight is strict. Requirements:

- Single-file PDF (no externally-referenced anything).
- Fonts fully embedded (already handled by Phase 1).
- All images CMYK or grayscale (no RGB) for print colour fidelity.
- No transparency.
- No layers.
- TrimBox and BleedBox set correctly.

Chromium / Paged.js produces RGB by default. Phase 5 needs a post-processor: `ghostscript` with the `pdfwrite` device and a PDFX colour profile. Or `pdfcpu` for box manipulation. Pick during story 5.4.

## Specimen comparison sheet

```
"Compare Book Styles" command:
  for each book-styles/<style>:
    compile manuscript chapter 1 in <style> at 6x9
    crop to first 2 pages
  composite all pages into one big PDF
  open it
```

Output: `output/<book>-style-comparison.pdf` — a 24-page PDF (12 styles × 2 pages each) that lets the writer decide.

## Architecture

### Compile-pipeline branching

Today the compile is single-output: one EPUB or one PDF, one trim, one Book Style. Phase 5 turns it into a fan-out:

```
compile()
├── assembly
├── theme + book style
├── HTML
├── for each target in config.distribution.targets:
│   ├── apply profile (CSS / metadata / asset overrides)
│   ├── render (EPUB or PDF)
│   └── post-process (Kindle CSS strip, PDF/X-1a, etc.)
└── manifest.json describing every output
```

The existing pipeline phases (assembly, HTML, theme, packaging) stay intact. New phase: **profile application** between theme and packaging. New phase: **post-processing** after packaging.

### Cover generator

New module structure:

```
lib/compile/cover-generator/
├── index.js                          orchestrator
├── spine-calculator.js               page-count → spine-width per stock
├── back-cover-composer.js            blurb + author bio + barcode + ISBN
├── full-cover-renderer.js            composes front + spine + back into one PDF
└── templates/
    ├── ingramspark-paperback.html    HTML template rendered to PDF
    ├── ingramspark-hardcover.html
    └── kdp-hardcover.html
```

Cover templates use the Book Style's typography for spine text and back-cover blurb. (Designer-friendly: the spine font matches the chapter-title font.)

### Distribution manifest

Output bundle includes `output/manifest.json`:

```json
{
  "book": { "title": "…", "author": "…", "isbn": "…" },
  "compiledAt": "2026-04-29T18:42:00Z",
  "bookStyle": "atticus",
  "outputs": [
    { "target": "apple", "file": "book-apple.epub", "size": 824000, "warnings": [] },
    { "target": "kindle", "file": "book-kindle.epub", "size": 812000, "warnings": ["dropped 4 dlig features"] },
    { "target": "kdp-paperback", "files": ["book-kdp-paperback.pdf", "book-kdp-paperback-cover.pdf"], "trim": "6x9", "spineWidth": 0.83, "size": 4200000, "warnings": [] },
    { "target": "ingramspark-paperback", "files": ["book-ingramspark.pdf", "book-ingramspark-cover.pdf"], "trim": "6x9", "spineWidth": 0.83, "size": 4400000, "warnings": [] }
  ]
}
```

The manifest is the single source of truth for the compile result. The Compile panel reads it to show output cards with "Open" / "Reveal" / "Upload to KDP" buttons.

### Upload helpers (out of scope but signposted)

Manifest enables future "one-click upload to KDP" via KDP's API or a guided handoff to their web uploader. Out of scope for Phase 5 but the architecture supports it.

## Stories

### Story 5.1 — Distribution config schema

- `compile.config.json.distribution` block.
- `targets[]`, per-target overrides (e.g. `targets.kdp.paperStock: "50-cream"`).

### Story 5.2 — Per-store EPUB profile system

- New phase between theme and packaging.
- Profile = function `(html, css, metadata) → (html, css, metadata)`.
- Apple, Kindle, Kobo, Google profiles.

### Story 5.3 — Kindle-specific CSS pruning + Previewer integration

- Strip features Kindle's KFX converter breaks.
- CI runs Kindle Previewer 3 (headless if available, or smoke test only).

### Story 5.4 — Print profile system + PDF post-processing

- KDP and IngramSpark profiles.
- Bleed handling (0 vs 0.125").
- TrimBox / BleedBox manipulation via `pdfcpu`.
- Optional PDF/X-1a conversion via Ghostscript for IngramSpark.

### Story 5.5 — Spine width calculator

- Per-stock thickness table.
- Page count → spine width function.
- Surfaced in compile output.

### Story 5.6 — Full-cover PDF generator (paperback)

- HTML template + Chromium render → PDF.
- Front cover + spine + back cover layout.
- Per-Book-Style spine typography.

### Story 5.7 — Hardcover with dust jacket

- Extended template with flaps.
- Board-thickness math for spine.

### Story 5.8 — Back cover composition

- Blurb + author bio + ISBN barcode.
- Bookland EAN-13 barcode generator (or `bwip-js` library).

### Story 5.9 — Distribution manifest

- `output/manifest.json` written every compile.
- Compile panel reads it and shows per-output result cards.

### Story 5.10 — Specimen comparison sheet

- "Compare Book Styles" command in the Compile panel.
- Renders chapter 1 in every Book Style, composites into one PDF.

### Story 5.11 — Per-target validation

- Each profile runs its own validator (epubcheck for EPUB, pdfx-validator for IngramSpark).
- Validation results in the manifest under `warnings`.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Kindle Previewer 3 is Mac/Windows only and can't run in CI. | Bundle the rules its converter applies as a static CSS-stripping ruleset and validate that. Manual Previewer test before each release. |
| PDF/X-1a conversion via Ghostscript fails on edge cases (transparency in cover images). | Pre-flatten transparency in cover images via sharp before composition. Fall back to PDF/X-3 (allows transparency) where IngramSpark accepts it. |
| Spine math off by a hair → cover misaligned at print. | Be conservative — round spine width up to nearest 0.005". Surface the calculation in the manifest so writers can verify. |
| RGB → CMYK conversion shifts cover image colour noticeably. | Use a perceptual ICC profile (e.g. GRACoL2013_CRPC6 for IngramSpark). Surface a warning in the manifest if cover image is sRGB and target is print: "Cover may shift; verify with proof." |
| One Compile producing 6+ outputs is slow. | Parallelise per-target rendering (each is independent). Background-queue option in the Compile panel. |
| Writer disables a target then re-enables — old output files stale. | Write outputs into `output/<target>/` subdirs; clean per-target dir on each compile. |

## Open questions

- Do we ship Kindle Previewer integration or rely on writers running it manually? Manual for v1; integration if the Mac sandbox lets us spawn it.
- Audiobook export — out of scope but worth signposting. Same compile pipeline could chunk by chapter, run TTS via OpenAI / ElevenLabs, output MP3 + transcript markers. Not in v2.
- Library distribution (OverDrive, Hoopla)? Compatible with the `apple` EPUB profile usually. Add a `library` target if writers ask.
- Vendor-specific metadata (BISAC codes, age ranges, content warnings)? Already partial in compile.config.json; expand with each target's specific fields.

## Dependencies

- **Phase 1** font embedding (target profiles need to know what fonts to embed / strip).
- **Phase 2** Book Styles (cover generator uses Book Style typography for spine).
- **Phase 4** front matter (different targets render the copyright / ToC slightly differently).
- Independent of Phase 3 and Phase 6.
