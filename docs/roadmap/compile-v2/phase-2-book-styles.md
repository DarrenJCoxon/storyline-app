# Compile v2 — Phase 2: Book Styles v1

*Status: **PLANNING**Parent: ./README.mdRelated: ./phase-1-typography-foundation.md, ../milestone-06-theme-expansion.mdLast updated: 2026-04-29*

## Outcome

Storyline ships **twelve hand-tuned Book Styles** (six in v1, six in v2) where every typographic element — body face, display face, drop cap, scene break, chapter ornament, running head, first-paragraph treatment, ToC styling, copyright-page block, callout, pull quote — is *paired* by a designer to form a cohesive visual identity. A writer picks a Book Style the way they'd pick a wine pairing for the meal they've already cooked: the choice signals genre and tone, and every page in the resulting book reinforces it.

This phase replaces the current "build from parts" model (theme + opener + override block) with **opinionated identities**. The override system stays — writers can still tweak body font or scene break ornament — but the default is "pick a Book Style and trust it."

## Why this phase exists

Today, Storyline writers face a build-from-parts decision tree:

1. Pick one of three themes (Classic Serif / Heritage / Modern Sans).
2. Pick one of four chapter openers (Meridian / Cinder / Edgewood / Hawthorn).
3. Optionally tweak `themeOverrides`: body font, scene-break ornament, paragraph style.

That's 3 × 4 × N permutations. Most permutations look fine but very few look *intentional*. A drop-cap drop cap with the Modern Sans theme and the Edgewood opener and a fleuron scene break is technically valid and looks like a committee designed it.

Vellum solved this by shipping ~8 named "Book Styles" where every element is curated together. The writer's choice becomes "what kind of book is this?" not "which 12 knobs do I want to set?". We need the same model, but we can ship more styles and tune them harder.

## Prove-it gate

All four must be true:

1. **Twelve Book Styles, each shipped with a specimen PDF.** Open the specimen for each — the cover-style shot, ToC, chapter opener, two body pages, scene break, end-of-chapter — and the style is *recognisably itself*. A reader handed the twelve specimens out of order can group them by design intent (literary / commercial / academic / illustrated / etc.) without reading the names.
2. **Each style works at every shipped trim.** A writer using Atticus at 6×9 trade and at 8.5×8.5 picture-book square sees the style adapt — type sizes scale, margins adjust, chapter ornaments resize — but the *identity* is preserved.
3. **No build-from-parts is required for a publishable book.** A writer can compile Atticus straight, with no `themeOverrides`, no chapter-opener override, and the result is publishable. Override knobs remain available for advanced users but never necessary.
4. **The existing three themes still exist as Book Styles.** Classic Serif, Heritage, Modern Sans become Book Styles with the same names; no one's existing book changes identity. The Phase-1 typography lift makes them *better*, not different.

## The twelve Book Styles

### v1 (Phase 2 first six)

| Book Style | Genre target | Body | Display | Identity in one sentence |
|---|---|---|---|---|
| **Atticus** | Literary fiction | Crimson Pro | Crimson Pro Display | Refined, generous leading, fleuron ornament, four-line drop cap with small-caps continuation. |
| **Gallant** | Historical / Regency | EB Garamond | EB Garamond | Classical proportions, ornamental chapter rule, swash caps, wider running head. |
| **Strand** | Thriller / commercial | Source Serif | Plus Jakarta Sans | Tight justification, bold left-aligned numerals on chapter pages, no drop cap, three-asterisk scene break. |
| **Riverside** | Contemporary literary | Source Serif | Source Serif | Minimalist; lined chapter heads (rule + numeral + title), modern small-caps continuation, hairline scene rule. |
| **Ledger** | Non-fiction prescriptive | Newsreader | Inter | Sidebars, pull quotes, key-takeaway boxes; clear hierarchy; figures with captions. |
| **Quarto** | Picture book / illustrated | Plus Jakarta Sans | Plus Jakarta Sans | Square-trim-aware, full-bleed image support, oversized chapter numerals, illustration-first layout. |

### v2 (later in Phase 2 or follow-up)

| Book Style | Genre target | Body | Display | Identity in one sentence |
|---|---|---|---|---|
| **Periodical** | Non-fiction narrative | Newsreader | Newsreader | Magazine-style first paragraph, byline-style chapter heads, running-feature pull quotes. |
| **Codex** | Academic | Crimson Pro | Inter | Footnote-grade text, theorem / proof environments, marginalia, semantic numbering. |
| **Folio** | Illustrated novel | Crimson Pro | EB Garamond | Full-page illustrations, illustrated drop caps, plate sections with their own page architecture. |
| **Memoir** | First-person literary | EB Garamond | Crimson Pro | Italic chapter epigraphs, photographic plate support, conversational typographic colour. |
| **Verse** | Poetry | Source Serif | Source Serif | Line-numbered, hanging punctuation, no justification, generous gutter for breath. |
| **Bookwyrm** | Middle-grade / children's | Atkinson Hyperlegible | Plus Jakarta Sans | Larger leading, decorative chapter ornaments, accessible-by-design type, no drop cap. |

## Architecture

### Book Style as single source of truth

Replace the current `themes/<theme-id>/` + `chapter-openers/<opener-id>/` two-axis model with `book-styles/<style-id>/`:

```
lib/compile/book-styles/atticus/
├── style.json              metadata (id, name, target genre, fonts, dropCapStyle, ornaments)
├── style.css               base stylesheet (used in EPUB and HTML preview)
├── style-print-pdf.css     print layer (running heads, page architecture)
├── style-epub.css          EPUB layer (reader-specific tweaks)
├── opener.css              chapter-opener treatment (no longer a separate folder)
├── ornaments/              SVG / WOFF2 ornament glyphs
│   ├── scene-break.svg
│   ├── chapter-rule.svg
│   └── chapter-numeral-frame.svg
├── front-matter/           per-style front-matter templates
│   ├── title-page.html
│   ├── copyright.html
│   └── dedication.html
├── specimen.pdf            pre-rendered specimen used by the picker
└── README.md               designer's notes — what's intentional, what's not
```

The chapter-opener axis collapses into the Book Style. (Mixing openers across styles produced more bad combinations than good ones; folding opener into style is the design choice that lets us tune each style harder.)

### Migration of existing themes

| Today | Phase 2 |
|---|---|
| `themes/classic-serif/` | `book-styles/classic-serif/` (kept as named alias, redirects to Atticus or stays as a distinct minimalist option — decide during story 2.1) |
| `themes/heritage/` | `book-styles/heritage/` (becomes a v2 Book Style — superseded by Gallant for new books, kept for back-compat) |
| `themes/modern-sans/` | `book-styles/modern-sans/` (kept; closest match for Strand/Riverside but with system fonts) |
| `chapter-openers/*/` | absorbed into per-style opener.css |

`compile.config.json` adds `bookStyle: "atticus"` as the new field. The existing `theme: "classic-serif"` field still works (compatibility shim that routes to the matching Book Style).

### Specimen generation

Every Book Style ships a `specimen.pdf` generated by a build-time script:

```
scripts/generate-specimens.js
  for each book-styles/* directory:
    compile lib/compile/specimens/sample-manuscript/ in this style
    write specimen.pdf into the style folder
```

The specimen renders a fixed sample manuscript (front matter + 2 chapters + scene break + pull quote + epigraph + end matter) so every style's specimen is comparable.

### Picker UX

The Compile panel's Theme dropdown becomes a **Book Style picker**:

- Grid of cards, each showing the style's specimen first-page + name + one-line genre hint.
- Hover / tap shows the second-page spread.
- "Compare" button generates a single PDF with the writer's actual first chapter rendered in all twelve styles.

The grid is the single biggest UX upgrade over Vellum, which shows styles as 80×120 thumbnails. Real specimens at real size.

### Per-Book-Style ornaments

Each style declares its scene-break ornament and chapter ornament in `style.json`:

```json
{
  "id": "atticus",
  "name": "Atticus",
  "ornaments": {
    "sceneBreak": { "type": "fleuron", "asset": "ornaments/fleuron.svg", "size": "1.4em" },
    "chapterRule": { "type": "svg", "asset": "ornaments/chapter-rule.svg", "width": "40%" },
    "dropCap": { "style": "traditional", "lines": 4, "smallCapsContinuation": 5 }
  }
}
```

The compile pipeline reads this and injects the right CSS / asset paths. SVG ornaments scale at any trim and embed cleanly in EPUB.

## Stories

### Story 2.1 — Book Style schema and loader

- Define `style.json` schema (Zod or JSON Schema).
- New loader `lib/compile/book-style.js` that supersedes `theme.js`. The old loader stays for one release as a deprecation shim.
- `compile.config.json` `bookStyle` field; `theme` field becomes deprecated alias.

### Story 2.2 — Migrate existing three themes to Book Styles

- Move `themes/classic-serif/` to `book-styles/classic-serif/`.
- Same for Heritage and Modern Sans.
- Folding the chapter-opener axis: each migrated style picks one canonical opener as built-in; the other openers stop existing as separate IDs.

### Story 2.3 — Design and ship Atticus

- Designer + dev collaboration. Atticus is the flagship literary Book Style.
- Crimson Pro body, fleuron ornament, four-line drop cap with five-word small-caps continuation.
- Front matter templates: half-title (italic), title (centred with rule), copyright (right-aligned attribution).
- Ship specimen.pdf.

### Story 2.4 — Design and ship Gallant

- EB Garamond, classical proportions, ornamental chapter rule.
- Decorative drop cap with swash variant. Fleuron variant 2.

### Story 2.5 — Design and ship Strand

- Source Serif body, Plus Jakarta Sans display.
- Chapter-page numeral block (large bold number top-left, title below).
- Tight justification, no drop cap, three-asterisk scene break.

### Story 2.6 — Design and ship Riverside

- Source Serif throughout.
- Lined chapter head: hairline rule + numeral + title.
- Modern small-caps first-line continuation.

### Story 2.7 — Design and ship Ledger

- Newsreader body, Inter display.
- Sidebars (boxed, tinted), pull quotes (large italic, with decorative quote mark), key-takeaway box.
- Figure / caption pairs with proper print-vs-EPUB handling.

### Story 2.8 — Design and ship Quarto

- Square-trim-aware (8.5×8.5 default but adapts).
- Plus Jakarta Sans throughout. Oversized chapter numerals.
- Full-bleed image support (requires bleed-aware print profile from Phase 5).

### Story 2.9 — Specimen-PDF build script

- `scripts/generate-specimens.js` runs on `npm run build`.
- Compiles a fixed sample manuscript through every Book Style.
- CI checks that every Book Style has a valid specimen.

### Story 2.10 — Book Style picker UX

- Compile panel: replace the Theme dropdown with a grid of Book Style cards.
- Each card shows its specimen first-page render at ~200×300px.
- Click expands to a 2-up specimen spread.
- "Compare" button generates writer's first chapter across all styles.

### Story 2.11 — v2 Book Styles (Periodical, Codex, Folio, Memoir, Verse, Bookwyrm)

- Six more designs. Can ship one per release after v1.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Designing twelve cohesive styles is months of designer time. | Start with v1 six. Two of those (Classic Serif, Modern Sans) are migrations of existing themes. So three new designs to ship the first wave. |
| Migration breaks existing books — a writer rebuilds tomorrow and the chapter ornament has changed. | `theme: "classic-serif"` stays compatible. The Phase-1 typography lift is the only change for migration; no Book Style identity shift unless the writer opts in. |
| Picker grid is overwhelming with twelve styles. | Group by genre filter (Fiction / Non-fiction / Illustrated / Special). Default view shows the four most relevant to the writer's project mode. |
| Each Book Style needs careful trim adaptation. | Phase 5 trim profiles handle the page geometry; Book Style only needs to declare type-scale rules per trim (sizes, leading). Tested in story 2.9's specimen pass at every trim. |
| Per-style front-matter templates duplicate logic across twelve folders. | Templates compose from a shared base (`lib/compile/front-matter/_base/*.html`) with style-specific overrides. Keeps each style's folder small. |

## Open questions

- Do we let writers create custom Book Styles by forking? Yes, eventually. Out of scope for Phase 2; document the folder structure so power users can fork manually.
- Per-chapter Book Style override (one chapter in a different style)? No. That's parts/sections territory; handle in Phase 3's part-opener primitive.
- Do we charge for premium Book Styles? Out of scope for engineering; product call. Architecture supports it (style.json `tier: "premium"` flag could gate at compile time).

## Dependencies

- **Phase 1** must land first. Every Book Style is designed against the Phase-1 typography baseline.
- **Phase 5 trim profiles** are useful but not blocking — Book Styles can ship with fixed type-scales at 6×9 and add per-trim adaptation in a follow-up.
