# Roadmap

_Outcome-led milestones with "prove it" gates. Not a feature backlog._
_Last updated: 2026-04-20_

## How this roadmap works

**Milestones, not sprints.** Each milestone is a visible writer outcome that can be demonstrated. Ship when the outcome is proven, not on a calendar.

**Prove-it gates, not done-definitions.** Before a milestone is marked complete, a real user (usually you, as the founder) must actually use what's been built and confirm the outcome. No shipping on "the code works."

**Stories emerge from the current milestone, not upfront.** Only the current milestone gets detailed stories. Future milestones stay as outcomes until their turn comes. This prevents the "designed three versions ahead, shipped zero" failure mode.

**No story points, no sprint cadence, no velocity tracking.** Solo founder + AI work doesn't benefit from those. The cadence is: finish a story, ship it, move to the next. Done when done.

## The milestones

### Milestone 1 — Storyline harness proves itself on a real book
**Pre-flight build work complete** (Stories 1.1-1.4: drift fixes, smoke tests, master-doc generation verified). **Gate open** — awaiting real-book planning (Story 1.5), which is writer work done outside build sessions. Reactive fixes (1.6-1.7) happen when the friction log surfaces something. Detail: [roadmap/milestone-01-harness-proves-itself.md](roadmap/milestone-01-harness-proves-itself.md)

### Milestone 2 — VS Code extension MVP: rich-text writing feels right
**Build complete** (Stories 2.1-2.6 shipped: scaffold, TipTap webview, markdown round-trip, scene break node, custom editor registration, word count status bar; + the manuscript/ convention). **Gate open** — awaiting the real-chapter prove-it (Story 2.8, writer work). Reactive fixes land as friction surfaces. Detail: [roadmap/milestone-02-vscode-extension-mvp.md](roadmap/milestone-02-vscode-extension-mvp.md)

### Milestone 3 — Compile to EPUB replaces the "upload and pray" step
**Build complete** (Stories 3.1-3.7 shipped: scaffold, assembly, markdown→HTML with typography, Classic Serif theme, EPUB packaging, preflight, VS Code command; plus auto-config and the Book Info form). **Gate open** — awaiting real-manuscript validation (Story 3.8, writer work: compile a real book, open in Apple Books + Kindle Previewer). Detail: [roadmap/milestone-03-compile-epub.md](roadmap/milestone-03-compile-epub.md)

### Milestone 4 — Compile to Print PDF
**Build complete** (Stories 4.1-4.6 shipped: scaffold, print theme, Paged.js HTML, Puppeteer→PDF, print-specific preflight, VS Code command + 0.8.1 running-header fix). **Gate open** — awaiting KDP Paperback interior-checker upload validation (Story 4.7, writer work). Detail: [roadmap/milestone-04-compile-print-pdf.md](roadmap/milestone-04-compile-print-pdf.md)

### Milestone 5 — Preview panel (full-book + live chapter)
**Build complete** (Stories 5.1-5.4 shipped: full-book preview, live chapter preview, device frames, theme + paragraph-style switcher). **Gate open** — awaiting preview-on-real-book validation (Story 5.5, writer work). Detail: [roadmap/milestone-05-preview.md](roadmap/milestone-05-preview.md)

### ▶ Milestone 6 — Theme expansion and refinement
**Current milestone** (build work). Second and third themes (Modern Sans, Heritage) plus a small, curated override system in `compile.config.json` for body font, scene break ornament, chapter heading style. Live preview theme dropdown becomes functional.
**Prove-it gate:** Writer picks a theme for their real book because one *looks right for it*, not because the others are broken. Detail: [roadmap/milestone-06-theme-expansion.md](roadmap/milestone-06-theme-expansion.md)

### Milestone 7 — Multi-engine refactor
**Outcome:** Platform extracted from Storyline. Engine API formalised. Second engine (Non-Fiction Writer) built as proof that the abstraction works.
**Prove-it gate:** Plan an actual non-fiction book using the second engine. The extension must host both engines cleanly; Storyline work must not regress.
**Status:** Deferred until at least Milestone 4 is shipped. Do not start early. See `engine-platform.md` for the warning on premature generalisation.

## Meta-rules for milestones

1. **One milestone at a time for build work.** If you feel pulled to start the next one before the current's build stories are complete, that's a signal the current milestone's scope is weak, not that it's done. **Exception:** when a milestone's prove-it gate requires user-validation (planning a real novel, writing a real chapter), build work on the next milestone can proceed in parallel — the gate closes independently whenever the writer does that work.
2. **The prove-it gate must be observable.** "I think it works" is not a gate. "I used it on a real book and found it useful" is.
3. **Cut lists matter as much as story lists.** Each milestone's detail file should state explicitly what it is NOT doing. Scope creep is the default; cut lists are the defence.
4. **Deferred milestones stay as outcomes only.** If you find yourself writing stories for milestone 5 while milestone 2 is current, stop. The stories are probably wrong anyway — you'll learn things in milestones 2-4 that will change them.

## Current work

**Build:** Milestone 6 — Theme expansion and refinement. See [milestone-06-theme-expansion.md](roadmap/milestone-06-theme-expansion.md).

**Pending user validation (gates open, running in parallel with build):**
- Milestone 1 — plan a real novel using the harness
- Milestone 2 — write a real 1,500-word chapter in the rich editor
- Milestone 3 — compile a real manuscript to EPUB, verify in Apple Books + Kindle Previewer
- Milestone 4 — upload a compiled PDF to KDP Paperback interior checker
- Milestone 5 — use preview on the real book, catch a formatting issue before compile

All five close whenever you do the writer work.
