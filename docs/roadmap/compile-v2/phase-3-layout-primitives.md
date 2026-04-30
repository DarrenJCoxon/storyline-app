# Compile v2 — Phase 3: Layout Primitives

*Status: **PLANNING**Parent: ./README.mdRelated: ./phase-2-book-styles.md, ../milestone-04-compile-print-pdf.mdLast updated: 2026-04-29*

## Outcome

Writers have **a vocabulary of book-design primitives** beyond "chapter, paragraph, scene break." Epigraphs, pull quotes, sidebars, true footnotes, plate inserts, verse blocks, letter / journal blocks, marginalia, drop-cap toggles, ornamental section breaks, illustrated figures with captions and attribution. Each primitive is a TipTap node in the editor, a markdown round-trip, and a styled element rendered correctly in every Book Style.

This is the phase that opens up *non-fiction* and *illustrated* publishing as first-class. Vellum has none of this — its primitive set is "paragraph, blockquote, scene break, image" and that's why every Vellum non-fiction book looks like a Vellum novel with subheadings.

## Why this phase exists

The single most common reason a writer leaves Vellum and pays a designer is "I need a sidebar." Or a pull quote. Or footnotes that aren't endnotes. Or a poem in the middle of the novel that doesn't get auto-justified into nonsense. Or a figure with a caption that doesn't break to the next page when the caption could have stayed with it.

These are not advanced typography. They are *baseline* book-design primitives that anyone publishing non-fiction, memoir, illustrated novels, or poetry needs. Storyline's compile pipeline today treats markdown's standard primitives (paragraph, heading, blockquote, list, hr, image) as the universe of things a book contains. That's a fiction-only worldview.

Phase 3 adds the missing primitives, gives each a TipTap UI in the editor, defines a markdown serialisation that round-trips, and lets every Book Style style them coherently. After Phase 3, Storyline can publish a non-fiction book that looks like a non-fiction book, not a novel with extra paragraphs.

## Prove-it gate

All four must be true:

1. **Round-trip integrity.** A writer adds a pull quote, sidebar, footnote, and verse block in the editor. Save the file. Close. Reopen. Every primitive renders identically — no lost styling, no markdown that says "this used to be a sidebar."
2. **Cross-Book-Style coherence.** The same chapter rendered in Atticus, Strand, Ledger, and Quarto: every primitive looks intentional in each style. A pull quote in Atticus is large italic with decorative quotes; in Strand it's bold-rule-bracketed; in Ledger it's tinted-box left-aligned; in Quarto it's full-page. Same source markdown, four different valid outputs.
3. **Print PDF page architecture handles the primitives.** Footnotes appear at the bottom of the page they reference (real footnotes, not endnotes). Plates don't get split across pages. Sidebars float-or-block depending on remaining page space. Marginalia sit in the outer margin and don't collide with running heads.
4. **Non-fiction sample books look like non-fiction.** Compile a real non-fiction project (the storyline-nf test bundle) and the result is visibly a non-fiction book — sidebars, pull quotes, figures with proper captions, real footnotes. Hand it to a designer and they don't immediately point at a fix.

## The primitive set

### Inline primitives

| Primitive | TipTap node | Markdown | Renders as |
|---|---|---|---|
| Footnote | `footnote` (inline mark) | `[^1]` + `[^1]: text` | Print: bottom-of-page footnote with rule. EPUB: pop-up note + endnote section. |
| Small caps | `smallCaps` (inline mark) | `<span class="sc">text</span>` | True OpenType `smcp` (Phase 1). |
| Time-of-day / date span | `dateline` | `<time>1923-04-12</time>` | Old-style figures, optional small caps in some Book Styles. |

### Block primitives

| Primitive | TipTap node | Markdown | Renders as |
|---|---|---|---|
| **Epigraph** | `epigraph` | `> > Quote\n> — Author` (double blockquote convention) | Right of centre, italic body, attribution in small caps below. |
| **Pull quote** | `pullQuote` | `<aside class="pull-quote">…</aside>` | Per-Book-Style. Atticus: large italic with decorative quotes. Strand: bold rule top + bottom. Ledger: tinted box. |
| **Sidebar / Aside** | `sidebar` | `<aside class="sidebar">…</aside>` | Boxed (Ledger), ruled (Riverside), bracketed (Codex). Float or block depending on page space. |
| **Callout** | `callout` (✅ shipped) | `<aside class="callout">…</aside>` | Pale neutral box with rule. Already in M5. |
| **Key takeaway** | `takeaway` | `<aside class="takeaway">…</aside>` | Non-fiction Book Styles only (Ledger, Codex, Periodical). Tinted with icon glyph. |
| **Exercise / Try this** | `exercise` | `<aside class="exercise">…</aside>` | Numbered automatically. Non-fiction Book Styles. |
| **Pull quote with attribution** | `pullQuoteAttribution` | `<aside class="pull-quote">…<cite>—Name</cite></aside>` | Cite styled per Book Style. |
| **Verse / Poetry** | `verse` | <code>```verse\n…\n```</code> | No justification, hanging punctuation, optional line numbers, indentation preserved. |
| **Letter / Journal entry** | `letter` | `<aside class="letter">…</aside>` | Different font (italic in Atticus, monospace in Codex), indented, optional dated header. |
| **Plate (full-page illustration)** | `plate` | `![alt](url){.plate}` | Print: forced break-before, full bleed if image is bleed-sized, separate page architecture. EPUB: full-width image + caption page. |
| **Figure with caption** | `figure` | `<figure>![alt](url)<figcaption>…</figcaption></figure>` | Caption typography per Book Style. `break-inside: avoid` so caption stays with image. |
| **Marginalia** | `marginalia` | `<aside class="margin">…</aside>` | Print only: outer margin, smaller type, hairline rule. EPUB: inline aside with subtle styling. |
| **Ornamental break** | `ornamentalBreak` | `***` with `{.ornamental}` class | Per-Book-Style decorative rule, larger than scene break. Use between major sections within a chapter. |
| **Part / Section divider** | `partDivider` | `# Part One` at top level | Full-page or half-title page. Restarts chapter numbering scope. |
| **Drop cap toggle** | YAML frontmatter | `--- dropCap: false ---` per chapter | Suppresses drop cap on this chapter only. |
| **Chapter epigraph** | YAML frontmatter | `--- epigraph: "…" — Author ---` per chapter | Renders below chapter title, above chapter body. |
| **Chapter subtitle** | YAML frontmatter | `--- subtitle: "…" ---` per chapter | Renders below chapter title in the opener style. |

### Page-architecture primitives

| Primitive | Where declared | Effect |
|---|---|---|
| **Force recto / verso** | YAML frontmatter | `--- start: recto ---` forces this chapter to start on a right page. |
| **Allow widow** | YAML frontmatter | `--- widow: allow ---` per chapter, escapes hatch for tight copy-fit. |
| **Plate insert section** | manuscript folder | `manuscript/_plates/01-photograph.md` is a section of plate-only pages, inserted between chapters. |

## Architecture

### TipTap node definitions

Each primitive is a TipTap node in `extension/webview/src/editor/nodes/`. The pattern from the existing `callout` node generalises: every node declares its name, schema, command, slash-menu entry, markdown round-trip, and CSS class.

```
extension/webview/src/editor/nodes/
├── callout.ts        (existing)
├── epigraph.ts
├── pull-quote.ts
├── sidebar.ts
├── takeaway.ts
├── exercise.ts
├── verse.ts
├── letter.ts
├── plate.ts
├── figure.ts
├── marginalia.ts
├── ornamental-break.ts
└── part-divider.ts
```

Each exports a TipTap `Node` and a markdown serializer / parser pair. The slash-menu lists them under categories: "Block elements," "Non-fiction," "Illustrated," "Page architecture."

### Markdown round-trip

Most primitives serialise as raw HTML inside markdown (markdown-it `html: true` is already enabled). This is fine for round-trip but ugly to author by hand. Some get nicer markdown shorthands:

- Epigraph: `> > Quote\n> — Author` (custom parser plugin recognises double-blockquote-with-attribution).
- Verse: triple-backtick with `verse` info string.
- Plate: standard image with `{.plate}` class attribute (markdown-it-attrs).

Everything else uses raw HTML. The TipTap editor hides the HTML behind a structured node so writers never see the angle brackets.

### Per-Book-Style CSS

Each Book Style has a `primitives.css` (or extends `style.css`) with rules for every primitive. Default styles live in `lib/compile/primitives/_base.css` so a Book Style only overrides what it wants to change.

```
lib/compile/primitives/
├── _base.css                        default rendering for every primitive
├── atticus-primitives.css           Atticus's overrides (pull quote large italic, etc.)
├── strand-primitives.css            Strand's overrides
└── …
```

The compile pipeline loads `_base.css` first, then the Book Style's `primitives.css`, so styles cascade correctly.

### Footnote architecture

The hardest primitive. Real per-page footnotes need:

- **Print PDF**: Paged.js supports `@bottom-block` and footnote areas with the `running()` and `element()` functions. Footnote markers (`[^1]`) compile to `<a class="footnote-ref" href="#fn1"><sup>1</sup></a>` and the body to `<aside class="footnote" id="fn1">…</aside>`. Paged.js with the `paged-js-footnotes` extension (or a custom polyfill) collects them per page.
- **EPUB**: Markers become pop-up notes (`<a epub:type="noteref">`) and the bodies appear in a single "Notes" section at the end. Most readers (Apple Books, Kobo, Kindle) render the marker as a tap-to-pop overlay.

Numbering can be per-chapter (resets each chapter) or running (book-wide). Per-chapter is the default; the writer can switch in `compile.config.json`.

### Plate architecture

A plate is a full-page illustration that doesn't flow with prose. Plates can appear:

- **Inline in a chapter** (`![alt](path){.plate}` in the chapter markdown) — forces a `break-before: page` and gets its own page architecture (no running head, no page number, or page number suppressed depending on Book Style).
- **As a plate section** (`manuscript/_plates/`) — a sequence of plate pages inserted between chapters or at the end. Each plate-section page has its own front-matter-style page name (`@page plate-page`).

Plate images need to handle bleed for print (Phase 5 territory). The Book Style declares whether plates bleed by default.

### YAML frontmatter on chapter files

Currently chapter files are pure markdown. Phase 3 introduces optional YAML frontmatter at the top of any `manuscript/*.md`:

```yaml
---
subtitle: A Short Reckoning
epigraph: "The past is never dead. It's not even past." — Faulkner
dropCap: false
start: recto
---

# Chapter Title

Body text here.
```

The assembler parses frontmatter, strips it from the body, and adds the values to the chapter's metadata object. The compile pipeline reads the metadata when generating the chapter opener.

### Editor slash menu

The slash menu groups primitives by category and shows a one-line preview:

```
/  Search…

  ─ Block elements
  /epigraph    Epigraph         Italic block, attribution below
  /pull        Pull quote       Large italic, indented
  /sidebar     Sidebar          Boxed aside, can float
  /callout     Callout          Tinted note box (existing)
  /verse       Verse            Poetry, no justify
  /letter      Letter           Italic / different face

  ─ Non-fiction
  /takeaway    Key takeaway     Tinted with glyph
  /exercise    Exercise         Auto-numbered

  ─ Illustrated
  /figure      Figure           Image + caption
  /plate       Plate            Full-page image
  /margin      Marginalia       Outer-margin note

  ─ Page
  /ornament    Ornamental rule  Decorative break
  /part        Part divider     New part / section
```

## Stories

### Story 3.1 — TipTap node base infrastructure

- Generic `defineBlockAside(name, attrs)` helper that produces a TipTap node + markdown serializer + parser.
- Existing `callout` node migrated to use it.
- Slash-menu category support.

### Story 3.2 — Epigraph primitive

- TipTap node + markdown round-trip (double-blockquote-with-attribution parser).
- `_base.css` rule + Atticus override.

### Story 3.3 — Pull quote, sidebar, takeaway, exercise

- All four use the block-aside infrastructure.
- Per-Book-Style CSS for Atticus, Strand, Ledger.

### Story 3.4 — Verse / Poetry primitive

- Triple-backtick `verse` block parser.
- Hanging punctuation, optional line numbers (frontmatter switch).
- Tested across all Book Styles — Verse style especially.

### Story 3.5 — Letter / Journal primitive

- Block aside with optional dated header.
- Italic in Atticus, monospace in Codex, plain in Strand.

### Story 3.6 — Figure with caption

- `<figure>` element, `break-inside: avoid`.
- Caption typography per Book Style.
- Image path resolution mirrors existing illustration pipeline.

### Story 3.7 — Plate primitive

- Full-page image with forced break-before.
- Plate-section folder support (`manuscript/_plates/`).
- Bleed handling deferred to Phase 5.

### Story 3.8 — Marginalia

- Print only: outer-margin block.
- EPUB: subtle inline aside.
- Print page architecture must reserve outer margin space when present.

### Story 3.9 — Footnotes

- Inline marker + body parser.
- Print: per-page footnote area (Paged.js extension or polyfill).
- EPUB: pop-up notes via `epub:type="noteref"`.
- Per-chapter or book-wide numbering (config flag).

### Story 3.10 — Ornamental break

- Decorative rule between sections.
- Per-Book-Style ornament asset.

### Story 3.11 — Part divider

- `# Part One` at top level produces a part-opener page.
- Restarts chapter numbering scope.
- Adjusts running-head behaviour for the next chapter.

### Story 3.12 — YAML frontmatter on chapter files

- Frontmatter parser in the assembler.
- Strip from body, attach to chapter metadata.
- Honour `subtitle`, `epigraph`, `dropCap`, `start`, `widow`.

### Story 3.13 — Slash-menu UI for primitives

- Categorised slash menu in the TipTap editor.
- Search filter.
- Keyboard navigation.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Real footnotes are notoriously hard in Paged.js. | Use the `pagedjs-footnotes` extension if it works for our pagination model. If not, render footnotes as endnotes with chapter-anchored links and iterate later. Either way, EPUB pop-up notes work fine. |
| Pull quotes and sidebars in print can collide with running heads or page numbers. | `break-inside: avoid` + tight margin rules. Test in Paged.js with worst-case copy. Sidebars as floats only when remaining page space exceeds the sidebar height. |
| Verse blocks lose indentation through markdown normalisers. | Use a fenced verse block (`` ```verse ``) so indentation is preserved as code-fence content. |
| Twelve nodes × twelve Book Styles = 144 CSS pairs to design. | `_base.css` provides default rendering; styles override only what they want different. Most styles touch four or five primitives. Realistic surface ~30–40 designed pairings. |
| Markdown round-trip for raw HTML is fragile (TipTap loses attributes, or markdown-it strips them). | Test round-trip in CI for every primitive. Snapshot tests on serialise → parse → re-serialise equality. |
| Frontmatter YAML conflicts with existing markdown content (some chapters might begin with `---` thematic breaks). | Strict parser: frontmatter must be the first three characters of the file and close with another `---` before the first non-frontmatter content. Otherwise treat as content. |

## Open questions

- Do illustrated figures get auto-numbered ("Figure 1.1") with auto-references in the text? Yes for Ledger and Codex Book Styles; off by default elsewhere. Driven by `style.json` `autoFigureNumbering: true`.
- Marginalia in EPUB — keep them as inline asides or hide them? Most EPUB readers can't do margins. Recommendation: render as inline aside with a small decorative mark indicating "this was a margin note in print."
- Do exercises and key-takeaways need a separate folder (`manuscript/_exercises/`) for projects that aggregate them? Probably yes for Codex / academic use; out of scope for v2.

## Dependencies

- **Phase 1** typography baseline.
- **Phase 2** Book Styles — primitives are designed against the v1 Book Styles; later styles inherit reasonable defaults.
- **Phase 4 ToC** depends on part dividers from this phase.
- **Phase 5 print profiles** unblock plate bleed and marginalia margin-reservation.
