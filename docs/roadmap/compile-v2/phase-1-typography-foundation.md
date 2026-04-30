# Compile v2 — Phase 1: Typography Foundation

*Status: **PLANNING**Parent: ./README.mdRelated: ../../compile-feature.md, ../milestone-06-theme-expansion.mdLast updated: 2026-04-29*

## Outcome

Every theme in Storyline ships with **bundled, embedding-licensed typefaces** and renders with **professional-grade micro-typography** by default. True small caps (not faked via `font-variant`), optical sizes that match the rendered point size, OpenType features (old-style figures, discretionary ligatures, contextual alternates), language-aware hyphenation, hanging punctuation, and tighter justification with stricter word-spacing limits to suppress rivers. The improvements are invisible until you put a current-Storyline output next to a Phase-1 output side by side — then it looks like a different product.

This is the largest perceived-quality jump per hour invested. Most readers can't articulate *why* a Phase-1 page looks better than a Vellum page, but they will pick it in a blind A/B every time.

## Why this phase exists

Storyline's themes today use system fonts (Georgia, Iowan Old Style, Inter). System fonts are *fine* — they render, they fall back gracefully on Kindle, they avoid licensing — but they have three structural problems that cap output quality:

1. **No reliable OpenType features.** `font-variant: small-caps` on a system font in Chromium fakes small caps by scaling capitals down 70%. The result is too thin in the stem and too tall by a hair — every typographer can see it instantly. Real small caps live in the font's `smcp` feature; you can only access them in fonts that ship with the feature, and you can only embed those fonts if the licence allows.
2. **No optical sizes.** A 11pt body and a 24pt chapter title rendered in the same font outline both look "fine" but neither looks *right.* Display cuts have thinner serifs and tighter spacing; text cuts have sturdier serifs and more spacing. Crimson Pro, Source Serif, EB Garamond all ship with proper optical-size axes; using them is free quality.
3. **Inconsistent rendering across devices.** A reader on a Kindle Paperwhite, an iPad, and a paperback should see the *same* typography. With system fonts they see whatever Amazon, Apple, and Chromium happen to substitute. Embedding a font in the EPUB and PDF removes that variability.

Vellum doesn't do any of this either — its fonts are decent but unexceptional and its OpenType use is conservative. Phase 1 is where we leapfrog them on quality before we even get to Book Styles.

## Prove-it gate

All four must be true:

1. **Side-by-side test.** Compile the same 1500-word chapter today and after Phase 1 in identical themes. Open both PDFs in Preview. The Phase-1 version is visibly more refined: small caps match the x-height, drop cap kerns into the next letter, no rivers visible on a justified paragraph, old-style figures in the running header.
2. **Cross-device consistency.** Open the Phase-1 EPUB on Kindle Paperwhite, iPad Apple Books, and Kobo. The font is the bundled embedded face on all three; the layout is identical. Numbers in the chapter heading are old-style on all three.
3. **No licensing exposure.** Every bundled font is OFL or SIL Open Font License, redistributable, and embeddable in commercial work. The licence file ships in `lib/compile/fonts/<font>/LICENSE.txt` and the build script checks the licence on cold start.
4. **Existing themes look better, not different.** Classic Serif still feels like Classic Serif; Heritage still feels like Heritage. The Phase-1 work is a quality lift, not a redesign. Writers who picked a theme yesterday should not feel their book has changed identity.

## Architecture

### Bundled fonts

Add `lib/compile/fonts/<font-family>/` per family. Each folder contains:

```
fonts/crimson-pro/
├── LICENSE.txt          (OFL)
├── crimson-pro-regular.woff2
├── crimson-pro-italic.woff2
├── crimson-pro-bold.woff2
├── crimson-pro-bold-italic.woff2
├── crimson-pro-display.woff2     (optical-size variant for headings)
└── manifest.json                  (subsets, weights, axes)
```

Initial bundled set (chosen for typographic range, file size, and free embedding):

- **Crimson Pro** — refined book serif, full OpenType, optical sizes
- **EB Garamond** — heritage / historical, classical proportions
- **Source Serif 4** — modern serif, excellent on screen
- **Newsreader** — narrative non-fiction, magazine-grade
- **Inter** — sans-serif, neutral, exhaustive OpenType
- **Plus Jakarta Sans** — humanist sans for contemporary commercial fiction

Total budget: ~3 MB after WOFF2 + subsetting. Each face subset to Latin Extended + common punctuation + smart quotes + ligatures + small caps + old-style figures.

### Font-loading pipeline

Two emitters, format-aware:

- **EPUB**: `pipeline.js` writes the subset WOFF2s to `OEBPS/fonts/`, declares `@font-face` rules in the theme stylesheet, and references the embedded family. Subset to characters that actually appear in the manuscript (so a manuscript with no `ﬃ` ligature doesn't ship the glyph). Subsetting tool: `subset-font` (Python via `pyfontools`) or pure-JS equivalent. Cache subsets by manuscript hash.
- **Print PDF**: Paged.js / Chromium loads the WOFF2 from `file://` URI. Embed in the PDF via Chrome's print path (it does this automatically when the font is loaded). Verify embedding with `pdffonts` in CI.

### OpenType feature exposure

Every Book Style declares which features are on. CSS:

```css
body {
  font-feature-settings:
    "liga" 1,    /* standard ligatures */
    "dlig" 1,    /* discretionary ligatures (st, ct in display sizes) */
    "kern" 1,    /* kerning */
    "onum" 1;    /* old-style figures in running text */
}

h1, h2 {
  font-feature-settings:
    "liga" 1,
    "kern" 1,
    "lnum" 1;    /* lining figures in headings */
}

.scene-break + p::first-line,
p.first::first-line {
  font-feature-settings: "smcp" 1, "kern" 1, "liga" 1;
}

.running-header {
  font-feature-settings: "smcp" 1, "onum" 1, "kern" 1;
}
```

For variable fonts with optical-size axes, use `font-variation-settings` to set `opsz` per element:

```css
body { font-variation-settings: "opsz" 11; }
h1   { font-variation-settings: "opsz" 24; }
```

### Hyphenation

Bundle hyphenation dictionaries (Hyphenopoly or `hyphenopoly.js`) for en-GB, en-US, fr, de, es, it. Apply via:

```css
body {
  hyphens: auto;
  -webkit-hyphens: auto;
  hyphenate-limit-chars: 6 3 3;     /* min word, min before, min after */
  hyphenate-limit-lines: 2;          /* max consecutive hyphenated lines */
}
```

EPUB readers honour `hyphens: auto` to varying degrees. For print PDF (Chromium + Paged.js), `hyphens: auto` works once the right `lang` attribute is on `<html>`. Set it from `state.metadata.language` (defaults `en-GB`).

### Justification and rivers

Add `text-wrap: pretty` (Chromium 117+) for body text. For print PDF where Paged.js lays out the page, also set:

```css
p {
  text-align: justify;
  text-justify: inter-word;
  word-spacing: -0.02em;             /* tighten default spacing */
  text-wrap: pretty;
}
```

This is mostly perception work: `text-wrap: pretty` shifts the last few lines around to balance, which dramatically reduces orphans without `widows`/`orphans` rules firing.

### Drop cap polish

Current drop caps use `::first-letter` with magic numbers tuned to the body font. With bundled fonts and known metrics, drop caps become deterministic:

```css
p.first::first-letter {
  font-family: var(--nw-display-font);
  font-size: 4.4em;                 /* 4 lines at 1.1 line-height */
  line-height: 0.85;
  float: left;
  margin: 0.05em 0.08em -0.1em 0;   /* optical alignment with cap-height */
  font-feature-settings: "salt" 1, "ss01" 1;   /* stylistic alternates */
}
```

Add a Book-Style-level `dropCapStyle` in `theme.json`: `traditional | raised | lombardic | ornamental | none`.

## Stories

### Story 1.1 — Bundle and subset OFL fonts

- Add `lib/compile/fonts/` with the six families above.
- LICENSE.txt per family, manifest.json declaring weights / axes / subsets.
- Build-time check that every shipped font has a valid OFL licence file.
- Subsetting script in `scripts/subset-fonts.js` that runs on `npm run build` and produces minimal WOFF2 per family.

### Story 1.2 — EPUB font embedding

- `pipeline.js` collects the active theme's required font families.
- For each, subset to manuscript characters and write to `OEBPS/fonts/`.
- Inject `@font-face` rules into the theme CSS at compile time.
- Update OPF manifest to list the font files with correct media-type.
- Verify with `epubcheck` that fonts embed cleanly and that the .epub validates.

### Story 1.3 — Print PDF font embedding

- Paged.js loads bundled fonts from `file://` URIs (already supported by Chromium's print path).
- CI step uses `pdffonts` to assert every face is embedded as `Type 1C` or `CIDFontType0C` and is marked subset.

### Story 1.4 — OpenType feature settings per element

- Add `--nw-feature-body`, `--nw-feature-display`, `--nw-feature-running-head` CSS custom props.
- Each Book Style sets these in `theme.css`.
- Default values cover the existing three themes without changing their look.

### Story 1.5 — Hyphenation pipeline

- Bundle Hyphenopoly + dictionaries for en-GB, en-US, fr, de, es, it.
- Set `lang` on `<html>` from compile metadata.
- Apply `hyphens: auto` + tuned limits in base CSS.
- EPUB readers ignore Hyphenopoly (they hyphenate themselves); print PDF uses it.

### Story 1.6 — Drop cap polish

- Migrate the three existing themes' drop caps to the deterministic Phase-1 rule set.
- Add `dropCapStyle` to each theme.json.
- Visual regression test: render a known chapter at HEAD vs Phase-1 and assert the drop cap sits within ±2px of the expected baseline.

### Story 1.7 — Side-by-side regression PDF

- New compile output: `output/<book>-typography-comparison.pdf` showing the same chapter rendered in current themes vs Phase-1 themes side-by-side.
- Used in QA to prove the lift is real and that no theme regressed.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Subsetting breaks for non-Latin manuscripts (e.g. accented characters not in subset). | Subset to Latin Extended + manuscript-specific characters. Fail compile loudly if a glyph is missing rather than rendering tofu. |
| Kindle KFX rejects embedded fonts under some configurations. | Test on real Kindle Previewer 3 in CI. If KFX strips fonts, fall back to Bookerly + log a warning. |
| Font-loading race in Paged.js (page lays out before font is ready, drop cap measures wrong). | Paged.js exposes `document.fonts.ready` hook; await it before pagination starts. Already partially handled; needs verification. |
| 3 MB extension size bump causes VS Code to flag the package. | Lazy-load fonts: don't ship in the extension, ship in a `@storyline/fonts` peer package downloaded on first compile. Decide before story 1.1. |
| Variable-font axes (`opsz`) not honoured by older readers. | Provide static-instance fallbacks for each axis. Variable as enhancement only. |

## Open questions

- Do we ship variable fonts (one file, all axes) or static instances (one file per weight)? Variable is smaller for fonts that have many weights but rendering support varies. Recommendation: variable for body where supported, static fallback for headings where consistency matters more.
- Should `themeOverrides.bodyFont` allow picking from the bundled set by name (`"Crimson Pro"`) instead of a CSS stack? Yes — Phase 1 introduces a `bundledFont` override that does the right thing automatically.
- Do we need an `font-display: swap` strategy for EPUB? Probably not — EPUB readers don't render until fonts load. For print PDF, fonts must be loaded before pagination, so swap is moot.

## Dependencies

- None blocking. This phase is independent of the rest of v2 and can ship first.
- Phase 2 (Book Styles) depends on this — every Book Style is designed against the Phase-1 typography baseline.
