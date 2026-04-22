# Milestone 6 — Theme expansion and refinement

*Status: **PLANNED** (next build milestone — M5 build complete, user-validation gate open in parallel)Parent: ../roadmap.mdRelated design: ../compile-feature.md (Themes section), ../vscode-extension.md (Preview theme dropdown)Last updated: 2026-04-22*

## Outcome

A writer can compile their book in one of three visually distinct themes — Classic Serif (shipping), Modern Sans, Heritage — and pick one of four named **chapter opener styles** (Meridian / Cinder / Edgewood / Hawthorn) that control how every chapter's first page looks: chapter label format, title typography, vertical drop from page top to first content, first-section heading treatment, and first-paragraph treatment (drop cap, raised cap, small-caps lead-in, or flush-left no-indent). Publishable output for every theme × opener pairing, no CSS editing required.

A small set of overrides in `compile.config.json` lets writers customise the obvious touch-points (body font, scene-break ornament) without forking a theme.

The live preview's theme dropdown, currently a single-option placeholder, becomes functional: switching theme *or* chapter opener swaps the rendered output in real time, with faithful first-page formatting that matches the compiled EPUB / print PDF.

## Why this milestone exists

Classic Serif alone covers the "traditional novel" case well. But a thriller-for-airport-shelf reader expects something tighter and more modern; a historical-fiction or literary reader expects ornament and heritage typography. Shipping one theme forever signals that the tool has one house style — fine for MVP, limiting for anyone who cares about signalling genre through design.

Equally important, and currently absent: **chapter opener typography.** The first page of a chapter is the single most visible typographic decision a book makes — it's the moment a reader opens any chapter and it's the page every reviewer screenshots. Vellum ships roughly twenty chapter-opener styles because they matter that much. We won't ship twenty, but we will ship four that cover the legitimate range (clean modern / minimalist modern / traditional ornate / classical literary) and we will treat the opener as a proper first-class choice, not an override knob buried in `themeOverrides`. Each theme declares a sensible default opener; writers can pick a different one per book.

Architecture note: the theme system already supports theme-level CSS cleanly (Story 3.4 landed the theme-loader, format-specific CSS layering, `theme.json` metadata). M6's genuinely new architecture pieces are (a) the override system and (b) the chapter-opener library — a second CSS axis that loads alongside the theme and requires the assembler to tag chapter-first-page, first-section, and first-paragraph markers so opener CSS can target them.

## Prove-it gate

All three must be true:

1. **All three themes compile clean output** for a real manuscript, across all four chapter openers. Each pairing produces valid EPUB (passes EPUBCheck) and a KDP-acceptable print PDF. Open side-by-side; the three themes must look **intentionally different**, not just different fonts. The four openers must look **compositionally different** — chapter label, title, drop, and first-paragraph treatment vary meaningfully, not just fonts.
2. **Every chapter's first page formats correctly, and heading voice is consistent book-wide.** Chapter label renders in the chosen opener's style. The vertical drop actually drops the content down the page (not collapsed). First section heading is styled distinctly from later H2s (the decorated variant). Later-in-chapter H2s read as the quieter sibling of the first-section heading — same font family, same caps convention, smaller — not as a random default style from the theme. First paragraph picks up the opener's treatment (drop cap / raised cap / small-caps lead-in / flush-left no-indent), whether the chapter starts with an H2 or directly with a paragraph. Preview matches compile output.
3. **A writer switches between themes and openers in preview and picks a pairing for publication.** The decision is made because the pairing *looks right for the book*, not because others are broken. If the only reason to pick Classic Serif + Meridian is that the alternatives aren't good enough, M6 has failed — each theme and each opener must be legitimately choosable.

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

lib/compile/chapter-openers/ (M6 — Story 6.5, new)
├── meridian/                (bold condensed, centred, small-caps lead-in)
│   ├── opener.css
│   ├── opener-print-pdf.css
│   └── opener.json          (metadata + theme compatibility list)
├── cinder/                  (minimalist, lowercase numeral, left-aligned)
├── edgewood/                (ornate serif, centred, drop cap)
└── hawthorn/                (roman numeral, classical, drop cap + small-caps second word)

compile.config.json          (M6 — Stories 6.3 + 6.5 extend)
{
  "theme": "heritage",
  "chapterOpener": "edgewood",    ← new (Story 6.5; replaces the single-value
                                    chapterHeadingStyle that earlier drafts put
                                    inside themeOverrides)
  "themeOverrides": {
    "sceneBreakOrnament": "❦",
    "bodyFont": "Palatino, 'Iowan Old Style', serif"
  }
}
```

**Theme loader** (existing) reads `themeOverrides` after loading the base theme CSS and appends a small override stylesheet that sets CSS custom properties consumed by the theme. Themes that want overridable details author against `--nw-body-font`, `--nw-scene-break-ornament`, etc. Non-overridable themes ignore the overrides — graceful degradation, no hard coupling.

**Chapter opener loader** (new in Story 6.5) loads opener CSS after theme CSS so opener rules cascade over theme defaults. The opener owns the full typographic family for **all chapter and section headings book-wide** — both the decorated first-page variants (`.chapter-opener h1`, `.first-section`) and the quieter later-in-chapter variants (`h1`, `h2` outside `.chapter-opener` / `.first-section`). The theme owns body paragraphs, scene breaks, and page-level concerns; the opener owns heading voice. This is what makes a book read as coherent: every mid-chapter H2 is a visually quieter sibling of the first-section heading, not something from a different design system. Opener CSS must not restyle body paragraphs, scene breaks, or page margins — that's theme territory. If `chapterOpener` is omitted in config, the active theme's default opener is used (declared in `theme.json`).

**Assembler changes** (Story 6.5) tag the markup so opener CSS can target the right elements:

- Each chapter's first `<h1>` plus its chapter-opener content wrapped in `<section class="chapter-opener">`
- First `<h2>` in each chapter tagged `class="first-section"`
- First `<p>` of chapter body tagged `class="first-paragraph"` (defined as: first `<p>` after `.first-section` if present, else first `<p>` after the chapter H1)

Markup is opener-agnostic — all visual variation lives in CSS. This keeps the assembler from needing to know about specific openers.

Live preview (Story 6.4) fetches the active theme's CSS *and* the active chapter opener's CSS through messages from the extension host rather than embedding one at webview build time. Swap-on-change for either axis is just another message round-trip.

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
    "sceneBreakOrnament": "* * *"
  }
}
```

Implementation:

- Theme loader appends an override stylesheet that sets CSS custom properties (`--nw-body-font`, `--nw-scene-break-ornament`).
- Themes that want to be overridable author against those custom properties. Themes that don't (maybe Heritage's body font isn't user-tunable — too easy to break typographically) simply don't read them.
- `theme.json` gains an `overridable` array listing which properties the theme supports. The compile pipeline warns if the config specifies an override the current theme doesn't honour.
- Documented set of allowed overrides is small and curated: `bodyFont`, `sceneBreakOrnament`. Chapter-heading choices are **not** in this override list — they're a first-class decision made via `chapterOpener` in Story 6.5, not a sub-knob of a theme. No CSS passthrough — writers who need deep customisation fork the theme dir.

**Done when:** With `compile.config.json` specifying a `themeOverrides` block, the compiled EPUB and PDF reflect the override (e.g. different scene break character) without the writer editing theme CSS files. Unknown override keys surface as pre-flight warnings.

**Estimate:** 1 day.

### 6.4 — Live preview loads themes and chapter openers dynamically

Wire the preview panel's theme dropdown (stubbed in Story 5.4) to actually swap themes, and add a second dropdown for chapter opener selection. Currently the theme dropdown persists selection to vscode.setState but the change is a visual no-op; the opener dropdown doesn't exist yet.

Implementation:

- Extension host exposes two messages:
  - `load-theme` — webview posts `{type: 'load-theme', id: 'modern-sans'}`; host reads `resources/themes/<id>/theme.css` and posts back `{type: 'theme-css', css: '...'}`.
  - `load-chapter-opener` — webview posts `{type: 'load-chapter-opener', id: 'edgewood'}`; host reads `resources/chapter-openers/<id>/opener.css` and posts back `{type: 'opener-css', css: '...'}`.
- Webview maintains two replaceable `<style>` blocks (`#theme-css`, `#opener-css`). Theme CSS loads first so opener rules cascade over theme defaults where they overlap. No page reload.
- Theme dropdown lists themes discovered in `resources/themes/` at extension activation. Opener dropdown lists openers from `resources/chapter-openers/`, filtered to those compatible with the currently-selected theme (per `opener.json`'s compatibility list), with a note on any incompatible-but-selectable pairings.
- Opener dropdown label explains what it controls (writers won't know the term): "Chapter first page style".
- `copy-theme-assets.mjs` script (already present) extended to copy all theme dirs and all chapter-opener dirs.

**Done when:** Writer switches theme or chapter opener in live preview dropdowns, chapter visibly re-styles within \~300ms. Switching opener visibly changes chapter label, title position, vertical drop, first-section heading, and first-paragraph treatment. All three M6 themes and four openers selectable. Selection persists across preview reopens via vscode.setState. Incompatible pairings show a subtle warning but remain selectable.

**Estimate:** 1 day (up from half day — second axis, compatibility filtering, and dual-stylesheet cascade).

### 6.5 — Chapter opener style library

The single most important typographic decision a book makes after body font. Ship a named, picker-selectable library of chapter openers, orthogonal to the theme choice, each one a complete composition of:

1. **Chapter label** — format (none / numeral / word / roman), typography, position relative to title
2. **Chapter title** — typography, caps treatment, alignment, weight (controls every H1 book-wide, not just the first chapter)
3. **Vertical drop** — space from page top to first content on opener pages (Vellum drops \~30–40% down the page)
4. **First section heading** — the decorated variant styled distinctly from later H2s (typical: small-caps with ornament)
5. **Later-in-chapter H2 headings** — the quieter typographic sibling of the first-section heading (same font family, same caps convention, smaller and without the first-section ornament). A book feels coherent when all H2s read as a family, not as two different design systems.
6. **First paragraph** — drop cap, raised cap, small-caps lead-in, or flush-left no-indent

Each opener ships CSS for **both** the first-page decorated variants and the mid-chapter quieter variants. This is the core reason openers exist as a separate axis from themes: the opener defines heading voice; the theme defines body voice.

Initial library — ship four, each visually distinct, each genuinely choosable:

**Meridian** — bold condensed sans chapter label ("CHAPTER 1"), bold condensed title below in caps, moderate drop, small-caps lead-in on first paragraph (no drop cap). Clean, contemporary, trade-thriller feel. Pairs well with Modern Sans; works with Classic Serif.

**Cinder** — tiny lowercase numeral ("one") top-left, slab-serif lowercase title left-aligned below, minimal drop, small-caps first-section heading, no drop cap, no chapter-title caps. Minimalist, modern literary. Pairs with Modern Sans.

**Edgewood** — ornate serif "CHAPTER 1 / IT'S ALL ABOUT CLARITY" centred with ornamental rule or flourish, generous drop, drop cap on first paragraph. Traditional trade, Penguin/NYRB feel. Pairs with Classic Serif and Heritage.

**Hawthorn** — large roman numeral centred ("I"), title in small-caps below with letter-spacing, generous drop, drop cap on first paragraph with small-caps second word. Classical, literary, ornate. Pairs with Heritage; works with Classic Serif.

Each theme declares a default opener in `theme.json`:

- Classic Serif → Edgewood (default Vellum-like trade feel)
- Modern Sans → Meridian
- Heritage → Hawthorn

Files per opener: `lib/compile/chapter-openers/<id>/{opener.css, opener-print-pdf.css, opener.json}`

`opener.json` declares:

```json
{
  "id": "edgewood",
  "name": "Edgewood",
  "description": "Ornate serif. Centred. Drop cap. Traditional trade feel.",
  "compatibleThemes": ["classic-serif", "heritage"],
  "features": {
    "dropCap": true,
    "firstParagraphTreatment": "drop-cap",
    "chapterLabelFormat": "Chapter N",
    "verticalDrop": "generous"
  }
}
```

Assembler changes (as described in Architecture): wrap chapter-opener section, tag first-section heading, tag first-paragraph. These are opener-agnostic markup additions that every opener's CSS can rely on.

Paged.js (print PDF) implications:

- Chapter-opener `<section>` gets `page: chapter-opener` so we can scope print-specific rules to only those pages.
- Vertical drop implemented via `padding-top` on `.chapter-opener`, not an empty element or margin hack — Paged.js handles this cleanly.
- Chapter openers continue to start on a recto page (existing `page-break-before: right` on chapter H1). Confirm each opener's large drop doesn't conflict with Paged.js's chapter-break logic.
- Running headers and folios already suppressed on opener pages via existing print-pdf CSS; each opener's print-pdf CSS must preserve that behaviour, not redefine headers.

EPUB implications:

- Drop cap implemented via `.first-paragraph::first-letter` (CSS first-letter pseudo). Known to work in Apple Books, Kindle with some rendering quirks, degrade to regular first letter on older readers. Fallback must be graceful, not broken.
- Chapter-opener vertical drop implemented via margin-top, not an empty `<div>`, so EPUB reflow handles it correctly.
- Small-caps implemented via `font-variant-caps: small-caps` where supported; fallback to CSS text-transform with letter-spacing where not (Kindle variability).

**Done when:**

- Four chapter openers ship. Each compiles to valid EPUB (EPUBCheck passes) and KDP-acceptable PDF across all three themes it's declared compatible with.
- Picker works: `chapterOpener: "hawthorn"` in `compile.config.json` produces Hawthorn output; omitting uses theme default.
- Assembler tags `<section class="chapter-opener">`, `class="first-section"` on first H2, `class="first-paragraph"` on first paragraph — and handles the edge case where a chapter starts directly with a paragraph (no H2). Snapshot tests lock the markup contract.
- Incompatible pairing (e.g. `theme: "modern-sans"` + `chapterOpener: "hawthorn"`) produces a pre-flight warning but still compiles — writer may override our compatibility opinion.
- Drop caps render correctly in Apple Books, Kindle Previewer, and print PDF for the two openers that use them (Edgewood, Hawthorn). Acceptable degraded rendering documented for Kindle edge cases.
- First-paragraph treatment applies when the first paragraph follows an H2 (first-section heading) AND when it follows the chapter H1 directly (no H2). Both cases tested.

**Estimate:** 4–6 days. Chapter opener CSS is the fiddliest part of novel typography — drop caps alone take a day of iteration to render well across EPUB + print. Four openers at publishable quality is real work. This is the largest story in M6.

### 6.6 — Prove-it: choose a theme and chapter opener for the real book

You, the writer. With *The Voynich Curse* (or whatever real manuscript is current), open the live preview. Switch through Classic Serif, Modern Sans, Heritage. For each, try the four chapter openers. Scroll through several chapters to see how the opener reads on different chapter-length / opening-paragraph shapes. Compile an EPUB in your preferred pairing. Open in Apple Books / Kindle Previewer. Compile a print PDF. Open side-by-side with other trade paperbacks.

Track:

- Did the three themes feel meaningfully different or cosmetically different?
- Did the four openers feel compositionally different or just differently-fonted?
- Which theme × opener pairing actually fits *this* book? (Not "which is best" — which matches the genre/tone intent?)
- Did the first page of every chapter render correctly in both preview and compile, with the vertical drop working, first-section heading styled distinctly, and first-paragraph treatment applied?
- Any override you ended up wanting that isn't in the 6.3 override set, or any opener tweak you wished you could make?

**Done when:**

- You can name the theme AND opener pairing you'd publish the book in, and why
- Every chapter's first page looks publishable in both EPUB and print PDF — no broken drop caps, no collapsed drops, no first-paragraph-not-styled glitches
- A note in the friction log on any override gap, opener-specific bug, or composition decision that didn't land

**Estimate:** Variable — your validation work.

## Risks

**Font availability & licensing.** We ship no font files. All three themes must degrade gracefully through web-safe fallback stacks. Heritage's Iowan Old Style isn't on Windows; Modern Sans's Inter isn't on iOS. Test each theme on each target reader's default environment (Apple Books on macOS + iOS, Kindle Previewer on all), and ensure the fallback rendering is still *good*, not just "functional."

**Theme-specific print-pdf pagination.** Paged.js's @page rules are globally cascaded, so per-theme tweaks to running headers, folios, chapter page breaks, etc. sit in `theme-print-pdf.css` (existing pattern). Each theme will need its own print pass — not just swapping fonts in the EPUB theme and hoping the print version follows.

**Override scope creep.** "Let the writer customise X" is infinite — we could be doing overrides forever. The cut list below is the defence. The allowed override set is: body font, scene break ornament, paragraph style (already shipping). Chapter opener is a first-class `chapterOpener` choice, not a `themeOverrides` knob. That's it. Anything else → fork the theme dir.

**Drop cap fragility across platforms.** Edgewood and Hawthorn both use drop caps, and drop caps are notorious on Kindle — font-family fallbacks are unpredictable and `::first-letter` CSS support varies by reader generation. Plan for a spreading test: render the first chapter of each theme × opener combination that uses a drop cap in Apple Books, Kindle Previewer, Kobo (if possible), and visually accept degraded-but-not-broken output. Document which readers give good / acceptable / poor drop caps so writers making platform-specific decisions have reality-based information.

**Chapter opener × theme compatibility is a judgement call.** Hawthorn (classical, roman numeral, drop cap) inside Modern Sans (clean, contemporary) looks wrong — mixed signals. We declare compatibility in `opener.json` but don't enforce it: writers override. The risk is a writer picks an incompatible pairing, doesn't notice it reads weird, ships an oddly-designed book. Mitigation: pre-flight warning on incompatible pairings, preview dropdown visually flags it (opener name grey-italic with tooltip), but never block. Writers win the argument if they insist.

**First-paragraph detection is semantically ambiguous.** "First paragraph of the chapter" could mean first `<p>` after chapter `<h1>`, or first `<p>` after the first `<h2>` (section heading), or both treated the same. We pick: if the chapter has a first-section heading `<h2>`, the first `<p>` after it gets `.first-paragraph`. If not, the first `<p>` after `<h1>` gets it. Writers who've used `<h2>`s throughout chapters (unusual for novels, common for non-fiction) will see the treatment only on the first section. Document this clearly; do not try to detect "real first paragraph" with heuristics.

**Vertical-drop collapses in EPUB reflow.** Generous opener drops work on fixed-size print pages but reflow oddly on small-screen e-readers — on a phone, a 40% drop wastes most of the first screen. Each opener's EPUB CSS uses a proportionally smaller drop (margin-top expressed as `em` or `vh` with a max value) so the effect is there but doesn't overwhelm small screens. Print PDF uses the full drop. Both are scoped in separate stylesheets.

**Preview ≠ compile parity.** The live preview loads theme.css and opener.css but not theme-print-pdf.css / opener-print-pdf.css; Paged.js doesn't run. So an override that affects print folios, or an opener's print-specific large drop, won't be visible in preview exactly as it appears in the final PDF. Acknowledge this in UI copy ("Preview shows screen and EPUB styling; print layout differs — run Compile to Print PDF to verify folios, running headers, and print-specific chapter drops").

**Theme and opener discoverability.** Writers won't know what "chapter opener" means as a category name. The preview dropdown labels it "Chapter first page style" with a tooltip explaining what it affects ("controls the chapter number, title, spacing, and first paragraph on every chapter's opening page"). Story 6.3 and Story 6.5 must document the full catalogue (themes, openers, override list) in a `compile.config.example.json` companion file in `docs/`.

## Cut list (explicitly NOT in this milestone)

- **A fourth theme, or any variant / dark-mode / accessibility theme.** Three is plenty for M6. A writer who wants a custom theme forks a directory.
- **A fifth chapter opener.** Four is the M6 ship list. Meridian / Cinder / Edgewood / Hawthorn cover clean-modern, minimalist-modern, traditional-ornate, and classical-literary. Anything beyond that is a future-phase addition.
- **Custom theme or opener creation in-app.** Writers edit CSS files if they want to customise beyond what the picker + overrides give them. No visual designer.
- **Per-chapter opener overrides.** One opener per book. If a writer wants a Prologue styled differently from Chapter 1, that's a front-matter concern, not an opener variant.
- **Per-chapter theme overrides.** Same. One theme per book.
- **Tuning individual opener properties via override** (e.g. "use Edgewood but with a smaller drop cap"). The opener is a composition; we ship the compositions that work. Writers who need to tune a single property fork the opener dir.
- **Ornamental glyph customisation inside an opener** (e.g. swapping Edgewood's fleuron for a different glyph). Same reasoning — the opener's ornament is part of its identity.
- **Colour scheme customisation.** Black text on page. Page colour varies slightly per theme via design, not override.
- **Font bundling / @font-face.** Licensing risk and bloats the EPUB. Web-safe stacks only. True of both themes and openers.
- **Theme or opener marketplace / import / "share this design" feature.** Way later, if ever.
- **Auto theme or opener recommendation by genre.** Cute but patronising. Writer chooses.
- **Heading level hierarchy beyond H1/H2.** Novels use H1 (chapter), occasionally H2 (part or first-section heading). Deeper hierarchies are an essay / non-fiction concern; park for M7.

## Definition of done

- All five build stories (6.1 – 6.5) shipped
- `npm test` passes including new theme-specific and opener-specific snapshot tests (markup contract + CSS selectors)
- Prove-it gate met: you've chosen a theme AND chapter opener for the real book for real reasons, and every chapter's first page compiles correctly in both EPUB and print PDF
- `docs/compile-feature.md` updated with the theme list, chapter opener list, override list, theme × opener compatibility matrix, and the "fork the theme or opener dir for deep customisation" escape hatch
- `compile.config.example.json` shipped in `docs/` with every option documented inline
- Lessons learned captured below, informing Milestone 7 (multi-engine refactor) — particularly any abstractions that emerged while building three themes × four openers that could generalise to Non-Fiction Writer's layouts (where chapter openers map to section openers or similar).

## Lessons learned

*To be filled in at milestone closure.*