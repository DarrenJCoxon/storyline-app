# Compile v2 — Phase 4: Generated Front and Back Matter

*Status: **PLANNING**Parent: ./README.mdRelated: ./phase-2-book-styles.md, ../milestone-03-compile-epub.mdLast updated: 2026-04-29*

## Outcome

Storyline **generates** the half-title, title, copyright, dedication, epigraph, table of contents, list of figures, about-the-author, also-by, and colophon — instead of asking the writer to author them by hand in `manuscript/_front-matter/`. Each page is generated from project metadata + Book Style templates, so the result looks designed rather than typed. Writers can override any generated page with a hand-authored markdown file in `_front-matter/` or `_back-matter/` — generated is the default, manual is the escape hatch.

The Table of Contents is **real**: auto-built from chapter headings, with dotted leaders to page numbers in print and live jump links in EPUB. List of Figures collects every captioned figure. Back-of-book Index collects anchored terms with real page numbers in print and chapter-anchored links in EPUB.

## Why this phase exists

Today, writers face a "build your own front matter" task that most of them don't want and don't enjoy:

- Open `manuscript/_front-matter/`.
- Create `01-title-page.md` and figure out the right markdown to centre the title.
- Create `02-copyright.md` and write a copyright block by hand, including the year, the all-rights-reserved boilerplate, the printing line, the publisher.
- Create `03-dedication.md`.
- Forget the half-title page entirely because no one tells them about it.
- Skip the ToC because they don't know how to generate one.

The result is front matter that varies wildly in quality and consistency across Storyline books. A book without a half-title looks self-published. A copyright page typed by hand misses the printing line that bookstores expect. A book without a real ToC fails Apple Books's submission process.

Vellum auto-generates this. It's one of the three reasons writers pay for Vellum. We need to match it and then go further: generate front and back matter that's *designed by the Book Style*, not generic placeholders.

## Prove-it gate

All four must be true:

1. **Zero-config front matter.** A writer with a chapter file, a metadata block, and nothing else compiles to a book that has half-title, title, copyright, ToC, and chapters in the right order, all rendered in the chosen Book Style. No file in `_front-matter/` required.
2. **Override-as-needed.** A writer adds `manuscript/_front-matter/02a-prologue.md`. The generated copyright page, dedication, etc. still appear; the prologue slots in at the right place. Generated pages can be selectively suppressed via `compile.config.json` (e.g. `frontMatter.dedication: false`).
3. **Real ToC and Index.** Print PDF ToC has dotted leaders to actual page numbers. EPUB ToC has live links. If the writer has marked any term with `<span class="index-term">…</span>`, the back-of-book index has that term with its page numbers (print) or chapter-anchored links (EPUB).
4. **Apple Books and KDP both accept the generated EPUB without warnings.** No "missing ToC" error from Apple's submission. No "no metadata" warning from KDP.

## Generated pages

### Front matter (in canonical order)

| Page | Source | Conditional |
|---|---|---|
| Half-title | `metadata.title` | Always for hardcover and trade paperback (skipped for slim books < 80 pages). |
| Frontispiece | `frontMatter.frontispiece` (path to image) | Only if writer provides one. |
| Title | `metadata.title`, `subtitle`, `author`, `publisher` | Always. |
| Copyright | Generated — see below | Always; can be overridden. |
| Dedication | `frontMatter.dedication` (string) | Only if writer provides one. |
| Epigraph (book-level) | `frontMatter.epigraph` (string + author) | Only if writer provides one. |
| Table of Contents | Auto-generated from chapter / part structure | Always (KDP and Apple require it). |
| List of Illustrations | Auto-generated from `<figure>` elements | Only if any figures exist. |
| List of Tables | Auto-generated from `<table>` elements | Only if 2+ tables exist (single tables don't justify a list). |
| Foreword | `_front-matter/foreword.md` | Manual only (you don't generate someone else's foreword). |
| Preface | `_front-matter/preface.md` | Manual only. |
| Acknowledgements (front) | `_front-matter/acknowledgements.md` | Manual; can also live in back matter. |
| Prologue | `_front-matter/prologue.md` or `manuscript/00-prologue.md` | Manual. |

### Back matter (in canonical order)

| Page | Source | Conditional |
|---|---|---|
| Epilogue | `_back-matter/epilogue.md` or `manuscript/zz-epilogue.md` | Manual. |
| Acknowledgements (back) | `_back-matter/acknowledgements.md` | Manual. |
| About the Author | Generated from `metadata.aboutAuthor` + `metadata.authorPhoto` | Generated; can be overridden with manual file. |
| Also By | Generated from `metadata.alsoBy` array (titles + cover thumbnails) | Generated if `metadata.alsoBy` is non-empty. |
| Mailing-list page | Generated from `metadata.mailingList` (URL + QR code + blurb) | Generated if writer provides URL. |
| Glossary | Generated from `<dfn>` elements in the manuscript | Generated if any `<dfn>` elements exist. |
| Bibliography | Generated by existing nf-extras pipeline | Already exists for non-fiction. |
| Index | Auto-generated from `<span class="index-term" data-key="…">` elements | Generated if any `index-term` elements exist. |
| Notes / Endnotes | From the footnote primitive (Phase 3) | Generated when footnotes set to "endnote" mode in EPUB. |
| Colophon | Generated from Book Style + production metadata | Optional; declarative `frontMatter.colophon: true` opts in. |

## The copyright page

The copyright page is the highest-leverage generated page — most writers get it wrong and most readers never look at it but bookstores do. Generated content:

```
Copyright © {copyrightYear} {author}

All rights reserved. No part of this book may be reproduced, stored in
a retrieval system, or transmitted in any form or by any means without
the prior written permission of the publisher, except by reviewers, who
may quote brief passages in a review.

This is a work of fiction. {fictionDisclaimer if metadata.fiction === true}
{or}
{nonFictionDisclaimer if metadata.fiction === false}

{publisher}
{publisherAddress if metadata.publisherAddress}

ISBN {isbn}                          (if provided)
First {format} edition: {publicationDate}    (if provided)

{printingLine — see below}

Cover design by {metadata.coverDesigner}    (if provided)
Interior typography: {bookStyle.name}
{bookStyle.fontCredits}                       (auto-generated)

10 9 8 7 6 5 4 3 2 1                  (printing line, descending)

{country}                              (printed-in line)
```

The Book Style controls typography (right-aligned in Atticus, centred in Modern Sans, monospace-ish in Codex). The *content* is generated; the *presentation* is per-Book-Style.

Writers can override any field via `compile.config.json` `metadata` block, or replace the entire page by adding `manuscript/_front-matter/copyright.md` (manual override).

## Architecture

### Front-matter generator

New module: `lib/compile/front-matter-generator.js`. Phases:

1. Read project metadata (state.json + compile.config.json + Book Style metadata).
2. Build the canonical front-matter list, marking each item as generated / manual / conditional.
3. For each generated item, render the Book Style's template (`book-styles/<style>/front-matter/<item>.html`) with metadata interpolated.
4. For each manual item (file in `_front-matter/`), pass through as-is.
5. Order according to the canonical sequence + any insertion-order overrides.

The generator outputs a list of `{ id, html, sectionClass, pageStyle }` items the assembler hands to the HTML phase.

### Templates per Book Style

Each Book Style ships templates for the canonical pages:

```
book-styles/atticus/front-matter/
├── half-title.html
├── title.html
├── copyright.html
├── dedication.html
└── epigraph.html

book-styles/atticus/back-matter/
├── about-author.html
├── also-by.html
├── mailing-list.html
└── colophon.html
```

Templates use a small interpolation syntax (Mustache-style or template literals; chosen for simplicity):

```html
<section class="title-page" data-page-style="title-page">
  <h1 class="book-title">{{title}}</h1>
  {{#subtitle}}<p class="book-subtitle">{{subtitle}}</p>{{/subtitle}}
  <p class="book-author">{{author}}</p>
  <hr class="title-rule" />
  <p class="book-publisher">{{publisher}}</p>
</section>
```

### Auto-generated ToC

The HTML phase already produces a chapter list. Extend to:

1. Walk every chapter section and find headings up to depth 2 (chapter `<h1>`, parts, sometimes `<h2>` for major sections).
2. Build a ToC tree.
3. For print PDF: render with dotted leaders to a placeholder page-number element. Paged.js's `target-counter()` resolves the page number after pagination.
4. For EPUB: render with `<a href="#chapter-1">` links and the EPUB nav doc (`nav.xhtml`) with the same structure.

### List of Illustrations / Tables

Walk the rendered HTML for every `<figure>` and `<table>`, extract the caption / first-cell-as-title, build a list with anchor links and (in print) page numbers via `target-counter()`.

### Index

Writers mark index terms inline:

```markdown
The phenomenon of <span class="index-term" data-key="entropy">entropy</span>
governs how systems decay.
```

The index generator collects every `index-term` element, groups by `data-key` (so "entropy", "Entropy," and "entropies" all merge), sorts alphabetically, and outputs:

- Print: term + comma-separated page numbers via `target-counter()`.
- EPUB: term + chapter-anchored links.

Optional `data-sub` for sub-entries:

```html
<span class="index-term" data-key="entropy" data-sub="thermodynamic">…</span>
```

Renders as:

```
entropy
  thermodynamic, 47, 92
  informational, 113
```

### About-the-author

Two inputs:

- `metadata.aboutAuthor` — multi-paragraph biography string.
- `metadata.authorPhoto` — path to author photo (in `assets/`).

Book Style template combines them. Atticus: photo right, bio left. Strand: photo top, bio centred. Ledger: photo top-left, bio with bold first sentence.

### Also-By

`metadata.alsoBy` is an array:

```json
"alsoBy": [
  { "title": "First Book", "year": 2024, "cover": "assets/also-by/first.jpg", "url": "https://…" },
  { "title": "Second Book", "year": 2025, "cover": "assets/also-by/second.jpg" }
]
```

Template lays them out as a grid (book covers + titles) or a centred list (no covers). Writers don't need cover thumbnails — the generator falls back to a styled list if covers are absent.

### Mailing-list page

`metadata.mailingList`:

```json
"mailingList": {
  "url": "https://author.com/mailing-list",
  "blurb": "Get notified when my next book ships.",
  "qrCode": true
}
```

Generator renders a centred page with the blurb, the URL, and (if `qrCode: true`) a generated QR code (using `qrcode` npm package) of the URL. Print-friendly black-on-white. EPUB shows the QR plus a clickable link.

### Colophon

End-of-book typographic credit:

```
This book was set in {bodyFont}, a typeface designed by {bodyFontDesigner}
in {bodyFontYear}. The display face is {displayFont}.

{paperType, if hardcover/paperback}
{printer, if known}

Composed by Storyline. {storylineVersion}.
```

Optional, and a delight to typophiles. Off by default for novels, on by default for academic/Codex Book Style.

## Stories

### Story 4.1 — Front-matter generator infrastructure

- New `lib/compile/front-matter-generator.js`.
- Canonical-order list, generated-vs-manual resolution, template loader.
- Integration with the assembly + HTML phases.

### Story 4.2 — Half-title and title page generators

- Templates in `book-styles/<style>/front-matter/`.
- Default templates in `lib/compile/front-matter/_base/` (each Book Style overrides).

### Story 4.3 — Copyright page generator

- Generate from metadata.
- Per-Book-Style templates.
- Override via `compile.config.json.copyright` block (any field) or full file replacement in `_front-matter/`.

### Story 4.4 — Dedication and epigraph (book-level)

- Simple generators, conditional on metadata fields.

### Story 4.5 — Real Table of Contents (print + EPUB)

- Walk chapter headings, build tree.
- Print: dotted leaders + `target-counter(page)`.
- EPUB: `nav.xhtml` + visible ToC page.
- Per-Book-Style typography.

### Story 4.6 — List of Illustrations / Tables

- Auto-generated when 1+ figures or 2+ tables exist.

### Story 4.7 — About-the-author generator

- Bio + photo template.
- Per-Book-Style layout.

### Story 4.8 — Also-By generator

- Cover-grid or list-only fallback.

### Story 4.9 — Mailing-list page with QR code

- Bundle `qrcode` npm package.
- Generate QR at compile time, embed as PNG.

### Story 4.10 — Index generator

- Inline `index-term` parser.
- Print: page numbers via `target-counter()`.
- EPUB: chapter-anchored links.
- Sub-entry support.

### Story 4.11 — Glossary generator

- Walk `<dfn>` elements (Phase 3 introduces a `/term` slash-menu primitive that produces `<dfn>`).
- Alphabetical list with definitions.

### Story 4.12 — Colophon generator

- Per-Book-Style template.
- Auto-fills body / display font credits from Book Style metadata.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Copyright legal text varies by jurisdiction. | Default to a US/UK boilerplate; let writers override the entire copyright block via `compile.config.json.copyright.text`. We are not lawyers and shouldn't pretend. |
| Auto ToC fails when chapter has no `<h1>` (some writers use raw paragraph titles). | Phase 1 / current pipeline already injects a default `<h1>` if none present. ToC walks `<h1>` only at top level; falls back to filename. |
| Index `target-counter()` doesn't work in some Paged.js versions. | Paged.js 0.4+ supports it. Pin version. CI test renders an indexed sample and asserts page numbers resolve. |
| QR-code page bloats EPUB on Kindle (Kindle compresses badly). | Generate QR at 256×256 PNG; ~4 KB. Acceptable. |
| Generated front matter conflicts with manually-authored files in `_front-matter/`. | Resolution order: manual files override generated of the same name. e.g. `_front-matter/copyright.md` suppresses the generated copyright page entirely. |

## Open questions

- Should we offer a "wizard" to populate front-matter metadata on first compile? Deferred — for now, fall back gracefully when fields are missing.
- Index entries that span multiple pages (e.g. `entropy, 45–52`)? The page-range collapse is a follow-up; v1 lists individual pages.
- Bibliography integration with the existing nf-extras pipeline — same generator or two? Same. Phase 4 absorbs nf-extras's bibliography output as one of its back-matter generators.
- Do we generate a half-title automatically or only on hardcover? Default: include for ≥80-page books, skip for shorter. Configurable.

## Dependencies

- **Phase 2** Book Styles — front-matter templates ship per-style.
- **Phase 3** part dividers and YAML frontmatter — needed for proper ToC nesting.
- **Phase 1** typography — every generated page uses Phase-1 typography by default.
