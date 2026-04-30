# Compile v2 — Beating Vellum on Output Quality

*Status: **PLANNING**Parent: ../roadmap.mdSibling docs: phase-1 through phase-6 in this folder.Last updated: 2026-04-29*

## The framing

Vellum's strength is not typography depth — it's **opinionated polish at zero friction.** A writer drops in a manuscript and gets a book that looks "professional" without thinking about kerning, drop caps, or page balance. It wins on:

1. Pre-designed **Book Styles** where every element (chapter heading, drop cap, scene break, ornaments) is artistically *paired*, not just collected.
2. Live **device previews** — Kindle, iPad, paperback at correct trim, side-by-side.
3. **Generated front/back matter** — title, copyright, ToC, "Also By", About the Author.
4. **Ornamental flourishes** — chapter ornaments, drop-cap ornaments, dingbats, custom scene breaks.
5. **Per-chapter overrides** — subtitles, epigraphs, opening flourishes, no-drop-cap toggle.
6. **One-click store packaging** — Kindle, Apple, Kobo, Google, Nook, IngramSpark, KDP.

Where Vellum is *weak* and we can leapfrog:

- Mac-only, locked rendering engine, no real CSS access.
- Decent but unexceptional typography. No real micro-typography (true small caps, optical sizes, OpenType features, hanging punctuation, ligature control).
- No full-bleed, no illustrated layouts. Picture books, photo books, illustrated novels are out of reach.
- No semantic flexibility for non-fiction (sidebars, callouts, exercises, marginalia, footnote-grade typography).
- Copy-fitting is invisible — writers can't see widow / orphan / river control.
- No print colour, no embedded fonts, no custom ornaments, no text-on-path chapter numbers.

**Our differentiator is not "looks like Vellum but in VS Code"** — it's *typography that a small-press designer would ship*, plus the kinds of layouts Vellum can't touch (illustrated, non-fiction, academic, picture book).

## The six phases

Each phase is a standalone milestone with its own prove-it gate and stories.

| # | Phase | What lands | Doc |
|---|---|---|---|
| 1 | Typography foundation | Bundled OFL fonts, OpenType features, real small caps, optical sizes, hyphenation | [phase-1-typography-foundation.md](./phase-1-typography-foundation.md) |
| 2 | Book Styles v1 | Six hand-tuned, opinionated identities replacing the build-from-parts model | [phase-2-book-styles.md](./phase-2-book-styles.md) |
| 3 | Layout primitives | Epigraphs, pull quotes, sidebars, footnotes, plates, verse, letter blocks, marginalia | [phase-3-layout-primitives.md](./phase-3-layout-primitives.md) |
| 4 | Generated front/back matter | Half-title / title / copyright / ToC / dedication / about-the-author / also-by / index | [phase-4-front-back-matter.md](./phase-4-front-back-matter.md) |
| 5 | Multi-target export | Per-store EPUB profiles (Kindle / Apple / Kobo / Google), KDP + IngramSpark print profiles, full-cover PDF, specimen sheets | [phase-5-multi-target-export.md](./phase-5-multi-target-export.md) |
| 6 | Preview overhaul | Three simultaneous device previews, page-flip / spread mode, hot-swap Book Styles, typography inspector | [phase-6-preview-overhaul.md](./phase-6-preview-overhaul.md) |

## Suggested order and the smallest shippable unit

The single biggest perceived-quality jump per hour invested is **Phase 1 + the first three Book Styles in Phase 2**. Bundled fonts with real OpenType features lift every existing theme overnight; three cohesive Book Styles (Atticus, Gallant, Strand) demonstrate the new model without forcing migration.

After that, Phase 3 (layout primitives) and Phase 4 (front/back matter) compound — each new primitive immediately works in every existing Book Style. Phase 5 and Phase 6 are independent of each other and can ship in either order.

## Non-goals for v2

- Browser-based authoring. Compile v2 lives inside the existing extension; the surface is unchanged.
- Replacing Paged.js. Print PDF stays Chromium + Paged.js. The work is CSS, fonts, and pipeline plumbing.
- Custom font upload. Writers pick from the bundled set in v2; user-supplied fonts come later.
- Audiobook export. Mentioned as a future possibility but out of scope for these six phases.
- Re-architecting the theme loader. The existing `theme.css` + `theme-<format>.css` + `opener.css` layering is sound; Book Styles slot into that model.

## The single biggest tradeoff

**Bundling fonts** is the right call but it adds ~2–4 MB to the extension and creates a licensing-management surface. Alternative: download fonts on first compile from a CDN we control. Recommendation: **bundle.** Offline-first, predictable, no network failures, OFL fonts subset to 200–600 KB each, and the extension is already the size where this is rounding error.

## How this relates to existing milestones

- **M5 (Compile pipeline)** is the foundation. Its theme loader, format-specific CSS layering, chapter-opener directory, and `themeOverrides` block are all preserved.
- **M6 (Theme expansion)** shipped three themes + four chapter openers + override system. Compile v2 supersedes the *count* of themes (3 → 12–16 Book Styles) but keeps the loader architecture.
- **M5 trim work** (selectable 6×9 / 7×10 / 8×10 / 8.5×8.5) becomes the foundation for Phase 5's print profiles.
- **M5 callout block** is the first layout primitive; Phase 3 generalises the pattern.

Compile v2 is the next chapter of M5/M6 work, not a replacement.
