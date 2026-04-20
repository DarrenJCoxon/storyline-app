# Milestone 5 — Preview panel (full-book + live chapter)

_Status: **CURRENT** (build work)_
_Parent: [../roadmap.md](../roadmap.md)_
_Related design: [../compile-feature.md](../compile-feature.md) (Preview section)_
_Last updated: 2026-04-20_

## Outcome

A writer can see their book as it will appear when published — before running a full compile. Two preview modes:

1. **Full-book print preview** — open the whole manuscript laid out at 6x9 trim with running headers, page numbers, drop caps, scene breaks, in a VS Code panel. Flip through page-by-page. Catches pagination issues, widow/orphan problems, missing running headers, misplaced drop caps.
2. **Live chapter preview** — side panel next to the rich editor that renders the current chapter in the selected theme. Updates as you type (debounced). Answers "what will this paragraph look like when published?" without switching context.

This kills the write → compile → check → fix cycle. Writers see publishable output continuously.

## Why this milestone exists

Vellum's preview is its most-loved feature because it removes the anxiety of the compile-upload-check loop. We already have 90% of the preview capability for free — Paged.js renders the book as paginated HTML in a browser, which IS a preview. Wrapping it in a VS Code webview panel makes it feel native; adding live chapter preview on top of that gives us continuous feedback during writing.

Architecture note: the print compile pipeline already produces `output/compiled/<slug>-print-preview.html` (Story 4.3). Opening that file in a VS Code webview is a small wrapper around existing work. Most of M5 is UX plumbing, not new rendering code.

## Prove-it gate

Both must be true:

1. **Full-book preview used to catch an issue.** Open the preview on a real manuscript, find at least one formatting problem (scene break misplaced, drop cap collision, widow at chapter start, running header cut off, etc.) that you would have otherwise discovered only after running a full compile.
2. **Live chapter preview used while writing.** Write (or edit) at least 200 words of a chapter with the live preview open. Feedback loop (write → see rendered output) is <1 second. No perceptible lag when typing.

## Architecture

```
VS Code extension                      Preview panel (webview)
──────────────                        ───────────────────────

"Novel Writer: Open Preview"  ──→   Loads print-preview.html via
       command                       file:// URL in a webview.
                                     Chromium + Paged.js paginate
                                     as in Story 4.3.

TipTap editor (open chapter.md)      Live panel: React or plain
       │                              webview renders the current
       │ onUpdate (debounced)          chapter's HTML with the same
       ▼                              theme CSS used for compile.
Extension host runs markdown          Updates every 500ms as the
→ HTML → theme on just this           writer types.
chapter; posts HTML to webview.
```

Two preview modes share the same underlying components — theme CSS, HTML rendering, device frame styling. The difference is scope: whole book vs. current chapter, and trigger: manual command vs. auto-updating on edit.

## Stories

### 5.1 — Full-book preview panel (command + webview)

`Novel Writer: Open Preview` command opens a VS Code webview panel. The panel loads the most recent `output/compiled/<slug>-print-preview.html` (produced by any print-pdf compile) via file:// URL. Paged.js auto-runs in the webview, paginating the book.

If no preview HTML exists yet, the command runs a print-pdf compile first (which generates the HTML as a side effect), then loads the result.

Panel features:
- Scroll to flip through pages
- Panel title shows book title + "Print Preview"
- Close button returns to normal editing

**Done when:** From any novel project with at least one chapter, `Open Preview` produces a paginated preview inside VS Code without opening an external browser.

**Estimate:** Half day.

### 5.2 — Live chapter preview

New command `Novel Writer: Open Live Chapter Preview` opens a side panel that:
1. Watches the active chapter file (`manuscript/*.md`)
2. Runs the markdown → HTML → theme pipeline on JUST that file (no assembly, no Paged.js — just rendered prose with theme styling)
3. Updates the preview every 500ms after the writer stops typing

The preview shows a single chapter-as-it-will-appear, without pagination — essentially a "galley proof" view. No running headers or page numbers (those need context only the full compile provides).

Technical: the extension host runs a slim pipeline (chapter content → markdown-it → theme CSS wrapper) and posts the rendered HTML to the webview on each change. No Puppeteer, no file writes — pure in-memory transformation.

**Done when:** With a chapter file open in the rich editor and live preview open in a side panel, typing new text causes the preview to update within 1 second.

**Estimate:** 1 day.

### 5.3 — Device frames for live preview

Live preview currently shows raw rendered content. Device frames wrap the content in a styled container sized/styled like a reading surface:

- **6×9 print** (default for novels) — white page at 6×9 proportions, body text centred with our theme margins
- **iPad (Apple Books)** — 820×1180 frame, softer reading-app colour
- **Kindle Paperwhite** — 1264×1680 e-ink grey-scale approximation

Device picker appears at the top of the live preview panel. Switching devices changes the CSS frame without recompiling content.

**Done when:** User can switch the live preview between 6×9 print, iPad, and Kindle Paperwhite frames with a dropdown. Each frame shows the same chapter content styled appropriately.

**Estimate:** 1 day (mostly CSS work on the frame surrounds).

### 5.4 — Theme + paragraph-style switcher in preview

Writers who want to see their book in different themes (once M6 ships multiple themes) or with block vs. indented paragraphs can toggle in the preview without editing `compile.config.json`:

- Theme dropdown (Classic Serif only for now — M6 adds more)
- Paragraph style radio (Indented / Block)

Changes apply immediately to the live preview via CSS swap. **Does NOT modify compile.config.json** — these are preview-only overrides so the writer can A/B test without committing.

If they like what they see, a "Save as default" button writes the choice to compile.config.json.

**Done when:** Writer can switch paragraph style between Indented and Block in the live preview and see the change in under a second, without recompiling.

**Estimate:** Half day.

### 5.5 — Prove-it: use preview on a real book

You, the writer. Open both preview modes on your real manuscript. Scroll through the full-book preview looking for issues. Write (or edit) at least 200 words of a chapter with the live preview open.

Track:
- At least one formatting issue found via preview (scene break, running header, drop cap, pagination) that would otherwise have required a full compile round-trip
- Live preview responsiveness — does the loop feel fast enough?

**Done when:** Both prove-it criteria met. Friction log populated.

**Estimate:** Variable — your validation work.

## Risks

**Paged.js performance on long books.** The full-book preview runs Paged.js in the VS Code webview. For a 300-page book, initial pagination may take 10-20 seconds. Paged.js isn't optimised for re-pagination either — every content change forces a full re-run. Mitigation: full-book preview is a manual command (not auto-updating); live preview skips Paged.js entirely (single-chapter galley view, no pagination).

**Webview ↔ extension host performance.** Streaming large HTML on every keystroke would kill typing responsiveness. Live preview must debounce aggressively (500ms is fine) and use diff updates rather than full re-renders where possible. If latency becomes visible, we bump debounce or switch to diff-based updates.

**Kindle frame accuracy.** Our Kindle Paperwhite frame is a CSS approximation, not a real Kindle renderer. Writers who need pixel-accurate Kindle previews still need the real Kindle Previewer app (as noted in the EPUB compile flow). We don't promise Kindle-exact; we promise "representative."

**Scope creep into M6.** Theme switching in preview is useful even with only one theme. But the full "try every theme" value only exists when M6 ships more themes. Accept this — 5.4 ships the switcher with Classic Serif as the sole option, and becomes more useful when M6 lands.

**Context switching between live preview and compile.** Writers may get confused about whether they're looking at the live chapter preview (in-memory, single chapter, no headers) or the full-book preview (Paged.js paginated, whole book). Panel titles must be unambiguous.

## Cut list (explicitly NOT in this milestone)

- **Real-time collaborative editing / multiplayer preview** — out of scope
- **Preview-based revision suggestions / AI diff** — separate concern
- **Exporting preview as static HTML for sharing** — writers can already share the EPUB or PDF
- **Custom device frames beyond iPad / Kindle / print** — Nook, Kobo, hardcover trim sizes — later milestones
- **Edit in preview** — preview is read-only; writers edit in the TipTap editor
- **Preview of EPUB-specific layouts** (e.g. Kindle font size adjustments) — the generic device frames approximate; pixel-accurate Kindle needs the real Kindle Previewer
- **Preview on mobile / tablet** — VS Code extensions are desktop-only for now

## Definition of done

- All stories shipped
- Both prove-it criteria met
- Full-book preview opens in <3 seconds for a typical novel
- Live preview update feels instant (no visible lag under 10 wpm typing)
- Lessons learned captured below, informing Milestone 6 (theme expansion)

## Lessons learned

_To be filled in at milestone closure._
