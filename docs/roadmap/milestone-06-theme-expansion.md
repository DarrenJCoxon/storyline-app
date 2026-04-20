# Milestone 6 — Theme expansion and refinement

_Status: **PLANNED** (next build milestone — M5 build complete, user-validation gate open in parallel)_
_Parent: [../roadmap.md](../roadmap.md)_
_Related design: [../compile-feature.md](../compile-feature.md) (Themes section), [../vscode-extension.md](../vscode-extension.md) (Preview theme dropdown)_
_Last updated: 2026-04-20_

## Outcome

A writer can compile their book in one of three visually distinct themes — Classic Serif (shipping), Modern Sans, Heritage — and get publishable output for each without editing CSS. A small set of overrides in `compile.config.json` let them customise the obvious touch-points (body font, chapter heading style, scene-break ornament) without forking a theme.

The live preview's theme dropdown, currently a single-option placeholder, becomes functional: switching it swaps the rendered theme in real time.

## Why this milestone exists

Classic Serif alone covers the "traditional novel" case well. But a thriller-for-airport-shelf reader expects something tighter and more modern; a historical-fiction or literary reader expects ornament and heritage typography. Shipping one theme forever signals that the tool has one house style — fine for MVP, limiting for anyone who cares about signalling genre through design.

Architecture note: the theme system already supports this cleanly (Story 3.4 landed the theme-loader, format-specific CSS layering, `theme.json` metadata). M6 is mostly new CSS, new fixtures, new tests — not new plumbing. The override system is the one genuinely new piece of architecture.

## Prove-it gate

Both must be true:

1. **All three themes compile clean output** for a real manuscript. Each produces valid EPUB (passes EPUBCheck) and a KDP-acceptable print PDF. Open side-by-side; the three must look **intentionally different**, not just different fonts.
2. **A writer switches between themes in preview and picks one for publication.** The decision is made because one *looks right for the book*, not because the other two are broken. If the only reason to pick Classic Serif is that Modern Sans and Heritage aren't good enough, M6 has failed — each theme must be legitimately choosable.

## Architecture

```
lib/compile/themes/
├── classic-serif/           (shipping)
│   ├── theme.css
│   ├── theme-print-pdf.css
│   └── theme.json
├── modern-sans/             (M6 — Story 6.1)
│   ├── theme.css
│   ├── theme-print-pdf.css
│   └── theme.json
└── heritage/                (M6 — Story 6.2)
    ├── theme.css
    ├── theme-print-pdf.css
    └── theme.json

compile.config.json          (M6 — Story 6.3 extends)
{
  "theme": "heritage",
  "themeOverrides": {         ← new
    "sceneBreakOrnament": "❦",
    "bodyFont": "Palatino, 'Iowan Old Style', serif",
    "chapterHeadingStyle": "small-caps"
  }
}
```

Theme loader (existing) reads `themeOverrides` after loading the base theme CSS and appends a small override stylesheet that sets CSS custom properties consumed by the theme. Themes that want overridable details author against `--nw-body-font`, `--nw-scene-break-ornament`, etc. Non-overridable themes ignore the overrides — graceful degradation, no hard coupling.

Live preview (Story 6.4) fetches the active theme's CSS through a message from the extension host rather than embedding one theme's CSS at webview build time. Swap-on-change is just another message round-trip.

## Stories

### 6.1 — Modern Sans theme

A clean, contemporary sans-serif theme. Target aesthetic: a trade paperback thriller you'd pick up at an airport — generous whitespace, confident hierarchy, no ornament.

Design choices:
- **Body font stack:** Inter, "Helvetica Neue", Arial, sans-serif
- **Chapter headings:** bold, left-aligned, larger than Classic Serif's italic centred style
- **Scene breaks:** three dots on their own line, no bullet ornament (`· · ·`)
- **First-paragraph treatment:** no drop cap; instead small-caps on the first three words (Vellum's "Modern" theme idiom)
- **Print layout:** tighter leading than Classic Serif (1.35 vs 1.4), slightly narrower margins to suit non-serif economy

Files: `lib/compile/themes/modern-sans/{theme.css, theme-print-pdf.css, theme.json}`

**Done when:** Compiling the tiny-book fixture with `theme: "modern-sans"` produces valid EPUB + print PDF; output is visually distinct from Classic Serif; snapshot tests lock the key CSS selectors.

**Estimate:** 1-2 days (CSS work is fiddly; two passes likely).

### 6.2 — Heritage theme

A traditional, ornamental theme evoking older trade editions. Target aesthetic: a literary / historical novel, Penguin Classic / NYRB feel.

Design choices:
- **Body font stack:** "Iowan Old Style", "Palatino Linotype", Palatino, Garamond, serif
- **Chapter headings:** small-caps, centred, slight letter-spacing, chapter number above title in roman numerals (optional via override)
- **Scene breaks:** fleuron (`❦`) or pilcrow variant — single centred glyph
- **First paragraph:** proper drop cap, larger than Classic Serif's (4-line), with the second word in small-caps (traditional trade convention)
- **Print layout:** slightly more generous margins than Classic Serif; roman numeral folios optional via override

Files: `lib/compile/themes/heritage/{theme.css, theme-print-pdf.css, theme.json}`

**Done when:** Same as 6.1 but with Heritage styling. Specifically: the drop cap + small-caps second word renders correctly in both EPUB and print; fleuron ornament doesn't break on reflowable devices (plain-text fallback via `theme.json`'s `sceneBreakOrnament` property).

**Estimate:** 1-2 days. Drop cap + small-caps tuning always takes a second pass.

### 6.3 — Theme override system

Extend `compile.config.json` schema with an optional `themeOverrides` block that lets writers customise the obvious touch-points without forking CSS:

```json
{
  "theme": "heritage",
  "themeOverrides": {
    "bodyFont": "Palatino, Georgia, serif",
    "sceneBreakOrnament": "* * *",
    "chapterHeadingStyle": "small-caps"
  }
}
```

Implementation:
- Theme loader appends an override stylesheet that sets CSS custom properties (`--nw-body-font`, `--nw-scene-break-ornament`, `--nw-chapter-heading-style`).
- Themes that want to be overridable author against those custom properties. Themes that don't (maybe Heritage's drop-cap styling isn't user-tunable — too easy to break typographically) simply don't read them.
- `theme.json` gains an `overridable` array listing which properties the theme supports. The compile pipeline warns if the config specifies an override the current theme doesn't honour.
- Documented set of allowed overrides is small and curated. No CSS passthrough — writers who need deep customisation fork the theme dir.

**Done when:** With `compile.config.json` specifying a `themeOverrides` block, the compiled EPUB and PDF reflect the override (e.g. different scene break character) without the writer editing theme CSS files. Unknown override keys surface as pre-flight warnings.

**Estimate:** 1 day.

### 6.4 — Live preview loads themes dynamically

Wire the preview panel's theme dropdown (stubbed in Story 5.4) to actually swap themes. Currently it persists selection to vscode.setState but the change is a visual no-op.

Implementation:
- Extension host exposes a `load-theme` message: webview posts `{type: 'load-theme', id: 'modern-sans'}`; host reads `resources/themes/<id>/theme.css` and posts back `{type: 'theme-css', css: '...'}`.
- Webview replaces its `<style id="theme-css">` block with the new CSS. No page reload.
- Dropdown lists all themes discovered in `resources/themes/` at extension activation.
- `copy-theme-assets.mjs` script (already present) extended to copy all theme dirs, not just classic-serif.

**Done when:** Writer switches theme in live preview dropdown, chapter visibly re-styles within ~300ms. All three M6 themes selectable. Selection persists across preview reopens via vscode.setState.

**Estimate:** Half day.

### 6.5 — Prove-it: choose a theme for the real book

You, the writer. With *The Voynich Curse* (or whatever real manuscript is current), open the live preview. Switch through Classic Serif, Modern Sans, Heritage. Scroll through a few chapters in each. Compile an EPUB in your preferred theme. Open in Apple Books / Kindle Previewer.

Track:
- Did the three themes feel meaningfully different or cosmetically different?
- Which one actually fits *this* book? (Not "which is best" — which matches the genre/tone intent?)
- Any override you ended up wanting that isn't in the 6.3 override set?

**Done when:**
- You can name the theme you'd publish the book in, and why
- A note in the friction log on any override gap or theme-specific bug

**Estimate:** Variable — your validation work.

## Risks

**Font availability & licensing.** We ship no font files. All three themes must degrade gracefully through web-safe fallback stacks. Heritage's Iowan Old Style isn't on Windows; Modern Sans's Inter isn't on iOS. Test each theme on each target reader's default environment (Apple Books on macOS + iOS, Kindle Previewer on all), and ensure the fallback rendering is still *good*, not just "functional."

**Theme-specific print-pdf pagination.** Paged.js's @page rules are globally cascaded, so per-theme tweaks to running headers, folios, chapter page breaks, etc. sit in `theme-print-pdf.css` (existing pattern). Each theme will need its own print pass — not just swapping fonts in the EPUB theme and hoping the print version follows.

**Override scope creep.** "Let the writer customise X" is infinite — we could be doing overrides forever. The cut list below is the defence. The allowed override set is: body font, scene break ornament, chapter heading style, paragraph style (already shipping). That's it. Anything else → fork the theme dir.

**Drop cap fragility across platforms.** Heritage's 4-line drop cap + small-caps-second-word is beautiful on paper and often broken on Kindle (font-family fallbacks, first-letter CSS support varies). Plan for a spreading test: render the first chapter of each theme in Apple Books, Kindle Previewer, Kobo (if possible), and visually accept degraded-but-not-broken output.

**Preview ≠ compile parity.** The live preview loads theme.css but not theme-print-pdf.css; Paged.js doesn't run. So an override that affects print folios won't be visible in preview. Acknowledge this in UI copy ("Preview shows screen styling; print layout differs — run Compile to Print PDF to verify folios and running headers").

**Theme discoverability.** Writers won't know overrides exist. Story 6.3 must document the override list in `compile.config.json` itself (comment header if we ever move to JSON5, or companion `compile.config.example.json` in `docs/`).

## Cut list (explicitly NOT in this milestone)

- **A fourth theme, or any variant / dark-mode / accessibility theme.** Three is plenty for M6. A writer who wants a custom theme forks a directory.
- **Custom theme creation in-app.** Writers edit CSS files if they want to customise beyond overrides. No visual designer.
- **Per-chapter theme overrides.** Overkill. One theme per book.
- **Colour scheme customisation.** Black text on page. Page colour varies slightly per theme via design, not override.
- **Font bundling / @font-face.** Licensing risk and bloats the EPUB. Web-safe stacks only.
- **Theme marketplace / import / "share this theme" feature.** Way later, if ever.
- **Auto theme recommendation by genre.** Cute but patronising. Writer chooses.
- **Heading level hierarchy beyond H1/H2.** Novels use H1 (chapter), occasionally H2 (part). Deeper hierarchies are an essay / non-fiction concern; park for M7.

## Definition of done

- All four build stories (6.1 – 6.4) shipped
- `npm test` passes including new theme-specific snapshot tests
- Prove-it gate met: you've chosen a theme for the real book for real reasons
- `docs/compile-feature.md` updated with the override list and the "fork the theme dir for deep customisation" escape hatch
- Lessons learned captured below, informing Milestone 7 (multi-engine refactor) — particularly any abstractions that emerged while building three themes that could generalise to Non-Fiction Writer's layouts.

## Lessons learned

_To be filled in at milestone closure._
