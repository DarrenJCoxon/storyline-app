# Roadmap

_Outcome-led milestones with "prove it" gates. Not a feature backlog._
_Last updated: 2026-04-19_

## How this roadmap works

**Milestones, not sprints.** Each milestone is a visible writer outcome that can be demonstrated. Ship when the outcome is proven, not on a calendar.

**Prove-it gates, not done-definitions.** Before a milestone is marked complete, a real user (usually you, as the founder) must actually use what's been built and confirm the outcome. No shipping on "the code works."

**Stories emerge from the current milestone, not upfront.** Only the current milestone gets detailed stories. Future milestones stay as outcomes until their turn comes. This prevents the "designed three versions ahead, shipped zero" failure mode.

**No story points, no sprint cadence, no velocity tracking.** Solo founder + AI work doesn't benefit from those. The cadence is: finish a story, ship it, move to the next. Done when done.

## The milestones

### Milestone 1 — Novel Writer harness proves itself on a real book
**Pre-flight build work complete** (Stories 1.1-1.4: drift fixes, smoke tests, master-doc generation verified). **Gate open** — awaiting real-book planning (Story 1.5), which is writer work done outside build sessions. Reactive fixes (1.6-1.7) happen when the friction log surfaces something. Detail: [roadmap/milestone-01-harness-proves-itself.md](roadmap/milestone-01-harness-proves-itself.md)

### ▶ Milestone 2 — VS Code extension MVP: rich-text writing feels right
**Current milestone** (build work). A writer can open a chapter file in VS Code and write prose with formatting (bold, italic, headings, scene breaks rendered as `⁂`) — saved to disk as plain markdown. Word count in status bar. `/novel` harness runs in a side panel.
**Prove-it gate:** Write a full chapter in the extension. Compare the experience to writing the same chapter in iA Writer. The extension must not feel worse. Detail: [roadmap/milestone-02-vscode-extension-mvp.md](roadmap/milestone-02-vscode-extension-mvp.md)

### Milestone 3 — Compile to EPUB replaces the "upload and pray" step
**Outcome:** A writer can compile their manuscript to a KDP-valid EPUB from inside the extension. One theme (Classic Serif). Basic pre-flight validation catches missing metadata, invalid chapter counts, etc.
**Prove-it gate:** Take a real manuscript, compile it, open the EPUB on Apple Books and Kindle Previewer. It must look publishable without manual CSS tweaks.
**Status:** Deferred. Detail written when current.

### Milestone 4 — Compile to Print PDF
**Outcome:** A writer can compile to a press-ready PDF for KDP paperback (6x9 trim) with running headers, page numbers, drop caps, widow/orphan control, and bleed. Paged.js powers the layout.
**Prove-it gate:** Upload the compiled PDF to KDP's paperback interior checker. Pass on first try.
**Status:** Deferred. Detail written when current.

### Milestone 5 — Preview panel (live + full-book)
**Outcome:** Live chapter preview updates as the writer types, showing current theme on selected device frame. Full-book browser flips through the entire manuscript in compile layout before committing.
**Prove-it gate:** Use preview on a real book and catch at least one formatting issue that would have required a re-compile cycle.
**Status:** Deferred. Detail written when current.

### Milestone 6 — Theme expansion and refinement
**Outcome:** Second and third themes available (Modern Sans, Heritage). Theme override system lets writers customise chapter headings, scene break ornaments, fonts via `compile.config.json`.
**Prove-it gate:** Switch a real book between all three themes in preview. Each must look intentionally designed, not generic.
**Status:** Deferred. Detail written when current.

### Milestone 7 — Multi-engine refactor
**Outcome:** Platform extracted from Novel Writer. Engine API formalised. Second engine (Non-Fiction Writer) built as proof that the abstraction works.
**Prove-it gate:** Plan an actual non-fiction book using the second engine. The extension must host both engines cleanly; Novel Writer work must not regress.
**Status:** Deferred until at least Milestone 4 is shipped. Do not start early. See `engine-platform.md` for the warning on premature generalisation.

## Meta-rules for milestones

1. **One milestone at a time for build work.** If you feel pulled to start the next one before the current's build stories are complete, that's a signal the current milestone's scope is weak, not that it's done. **Exception:** when a milestone's prove-it gate requires user-validation (planning a real novel, writing a real chapter), build work on the next milestone can proceed in parallel — the gate closes independently whenever the writer does that work.
2. **The prove-it gate must be observable.** "I think it works" is not a gate. "I used it on a real book and found it useful" is.
3. **Cut lists matter as much as story lists.** Each milestone's detail file should state explicitly what it is NOT doing. Scope creep is the default; cut lists are the defence.
4. **Deferred milestones stay as outcomes only.** If you find yourself writing stories for milestone 5 while milestone 2 is current, stop. The stories are probably wrong anyway — you'll learn things in milestones 2-4 that will change them.

## Current work

**Build:** Milestone 2 — VS Code extension MVP. See [milestone-02-vscode-extension-mvp.md](roadmap/milestone-02-vscode-extension-mvp.md).

**Pending user validation:** Milestone 1's gate (plan a real novel using the harness). This can happen any time in a dedicated `/novel` session; build work continues in parallel.
