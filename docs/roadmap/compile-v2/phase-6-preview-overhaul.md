# Compile v2 — Phase 6: Preview Overhaul

*Status: **PLANNING**Parent: ./README.mdRelated: ../milestone-05-preview.md, ./phase-2-book-styles.mdLast updated: 2026-04-29*

## Outcome

The live preview is **the experience** of writing in Storyline. It shows the writer their book — three devices simultaneously (Kindle Paperwhite, iPad Apple Books, paperback at chosen trim), with real device frames, real two-page-spread layout for print, and instant Book-Style hot-swap. Hover any character and the typography inspector tells you the font, size, kerning, and which OpenType features are active.

This is the killer feature. Vellum's live preview was its killer feature; ours has to be visibly better — not just "we have one too" but "Storyline shows me my book in three devices at once and I can swap Book Styles in 200ms."

## Why this phase exists

Today's live preview is fixed at 6×9 print, single-page, no device frame. It's serviceable but unmagical. A writer at the editor can't tell:

- What this looks like on a Kindle Paperwhite vs an iPad — the type sizes, contrast, leading all differ.
- What it looks like as a two-page spread — the verso/recto rhythm, where chapters break, how the spread balances visually.
- What a different Book Style would do — they'd have to recompile to see.

Vellum nails the third bullet (instant Book Style swap with live preview) and partially the first (Kindle / iPad / paperback options, but one at a time and small). It misses the second entirely. We can win all three.

The bigger reason: writers who feel their book *as an artefact* while writing produce better books. The preview isn't a debug surface; it's the artefact-feedback loop. Phase 6 invests in that loop.

## Prove-it gate

All four must be true:

1. **Three devices, simultaneously.** A writer types in the editor and sees their current chapter rendered side-by-side in three preview panes: Kindle Paperwhite (greyscale, e-ink rendering, smaller type by default), iPad Apple Books (colour, system rendering, paginated), and Print at chosen trim (two-page spread, real margins). All three update on every keystroke without lag.
2. **Two-page spread for print.** Print preview shows verso (left) + recto (right) with the centre gutter visible, page numbers in the right corners, chapter breaks visible mid-spread when they happen. This is what the printed book actually looks like.
3. **Book Style hot-swap.** Click any Book Style in the picker, all three previews swap in <300ms (CSS-only swap, no rebuild). Writer can compare Atticus vs Strand by alt-tabbing the picker.
4. **Typography inspector.** Writer hovers a character → tooltip shows font, size, leading, current OpenType features. Click locks the inspection. Educational and a flex.

## Architecture

### Three preview panes

Today's preview is a single iframe rendering the active chapter. Phase 6 splits it:

```
PreviewPanel
├── DeviceFrame (Kindle Paperwhite SVG)
│   └── iframe (Kindle profile rendering)
├── DeviceFrame (iPad mini SVG)
│   └── iframe (Apple Books profile rendering)
└── PrintSpread
    ├── iframe (verso, Paged.js with current trim)
    └── iframe (recto, Paged.js with current trim)
```

Each iframe loads the same chapter content but with a different per-store profile from Phase 5. The Kindle iframe applies the Kindle CSS-strip layer; the Apple iframe is full-CSS; the print iframes run Paged.js with two pages laid out.

### Layout

VS Code panel constraints — webview can be docked side, bottom, or full panel. Recommended layout:

- **Side panel** (default): three previews stacked vertically, scaled to fit width. Kindle ≈ 250px wide, iPad ≈ 300px, Print spread ≈ full width.
- **Full panel**: three previews horizontal, larger. Print spread takes 50% width, Kindle + iPad share the other 50%.
- **Single-device mode**: writer toggles to focus one device at full size. Right-click > "Focus on Kindle".

Layout state persists in the workspace.

### Device frames

SVG device frames around each iframe — visual chrome that makes the preview feel like a real device. SVG so they scale at any DPI. Bundled assets:

```
extension/resources/device-frames/
├── kindle-paperwhite.svg          (greyscale e-reader chrome)
├── ipad-mini.svg                   (modern Apple frame)
└── paperback-spread-shadow.svg     (drop shadow + paper texture for print)
```

### Hot-swap

Today's preview reloads the full HTML on Book Style change. Hot-swap requires:

1. Render once with all Book Style CSS as separate stylesheets.
2. On swap, replace the active stylesheet's `disabled` attribute. CSS recalculates in ~50ms.
3. For features that need DOM changes (e.g. opener.css adds `<div class="chapter-number">`), pre-inject all opener variants and use CSS `display: none` to hide inactive ones. Bigger DOM, instant swap.

Practical: pre-load the three or four most-likely Book Styles' CSS on preview start; lazy-load the rest on first hover.

### Two-page spread for print

Paged.js can render to a paginated DOM with `[data-page-number]` attributes. The spread view selects the verso/recto pair around the writer's cursor position:

```
writer cursor in chapter 3, paragraph 4 → maps to page 47 (verso)
spread shows page 46 (recto-of-spread-2) + page 47 (verso-of-spread-2)
```

When the cursor moves, the spread shifts. When the writer scrolls in the preview, the cursor doesn't move (decouple cursor-tracking from manual scroll). Mode toggle: "Follow cursor" vs "Free scroll."

### Typography inspector

On hover (with shift held, to avoid noise):

```
[t] Crimson Pro Regular 11pt / 16.5pt leading
    OpenType: liga, kern, onum
    Word-spacing: -0.02em  Letter-spacing: 0
```

Implementation: inject a tiny overlay div on shift-hover; use `getComputedStyle` + `document.fonts` API to read the current font face. Click to lock; second click unlocks. ESC dismisses.

For the locked state, also show:

- Em-square box around the character (visualises actual size).
- Kerning pair indicator if hovering on an `AV`-type pair.
- Optical-size axis value if the font has one.

Educational and useful for designers reviewing books. Off by default; toggle in preview toolbar.

### Performance budget

Three iframes + Paged.js running in two of them is heavy. Budget:

- **Initial load**: <1.5s from preview-open to first paint.
- **Keystroke → preview update**: <250ms for plain text edits, <600ms for structural edits (new heading, new aside).
- **Book Style swap**: <300ms for CSS-only, <800ms if structural changes needed.

Optimisations:

- Debounce keystroke updates to ~150ms.
- Diff the chapter HTML and patch the iframe DOM rather than reloading.
- Run Paged.js incrementally — only re-paginate the affected page range.
- Cache rendered pages by content hash; reuse across Book Styles where layout is identical.

## Stories

### Story 6.1 — Three-iframe preview infrastructure

- New `PreviewPanel` with three iframe slots.
- Each iframe gets its profile-specific CSS injected.
- Keystroke → all three update.

### Story 6.2 — Device-frame SVG chrome

- Bundle Kindle + iPad SVGs.
- CSS-position iframes inside SVG cutouts.
- Drop shadow + paper texture for print spread.

### Story 6.3 — Print two-page spread

- Render Paged.js once, extract pages by `[data-page-number]`.
- Show verso + recto pair around cursor position.
- "Follow cursor" toggle in preview toolbar.

### Story 6.4 — Book Style hot-swap

- Pre-inject all candidate Book Style stylesheets disabled.
- Toggle `disabled` on swap.
- Pre-render structural variants where needed (chapter-number divs).

### Story 6.5 — Typography inspector

- Shift-hover overlay reading `getComputedStyle` + `document.fonts`.
- Click-lock with em-square visualisation.
- Toolbar toggle.

### Story 6.6 — Layout modes

- Side / full / single-device modes.
- Persisted in workspace state.
- Smooth transitions between modes.

### Story 6.7 — Device fidelity polish

- Kindle iframe applies grayscale filter + e-ink-style font swap.
- iPad iframe uses Apple Books's actual default reading line-height.
- Test against real devices and tune.

### Story 6.8 — Performance pass

- Debounce keystrokes.
- Incremental Paged.js re-pagination.
- Page cache by content hash.
- Profiling and budget enforcement.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Three iframes + Paged.js exhaust webview memory on older Macs. | Profile early. Provide a "lite" mode that shows one device + a static print spread (no live re-pagination). |
| Hot-swap stylesheets with `@font-face` rules cause font flash. | Preload all candidate fonts on preview open. CSS swap doesn't trigger font load. |
| Kindle's actual rendering differs from our greyscale-filtered iframe. | Document that the Kindle preview is approximate. Real rendering test = Kindle Previewer 3 in Phase 5. The preview's job is "fast feedback while writing," not pixel-perfect Kindle simulation. |
| Two-page spread breaks at chapter boundaries (next chapter starts on a recto, leaving a blank verso between). | Show the blank verso explicitly. That's what the book does. |
| Typography inspector misleads writers about kerning that EPUB readers will override. | Inspector explicitly labels "as rendered here; reader may override on device." |

## Open questions

- Should the preview show the full book or just the active chapter? Active chapter for performance; "scroll past chapter end" loads the next. Book-wide preview only on demand (Cmd+Shift+P → "Preview entire book").
- Audio preview (TTS playback)? Out of scope; future audiobook work.
- Mobile preview app (preview your book on your actual phone)? Out of scope; would need a companion app.
- Preview integration with the Book Style picker — preview should auto-update when the picker hovers a style? Yes; hover-preview without committing the choice.

## Dependencies

- **Phase 2** Book Styles — hot-swap needs the multi-style CSS structure.
- **Phase 5** per-store profiles — each preview iframe applies its target's profile.
- Independent of Phase 3 and Phase 4.
