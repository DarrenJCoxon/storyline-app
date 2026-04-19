# Milestone 1 — Novel Writer harness proves itself on a real book

_Status: **CURRENT**_
_Parent: [../roadmap.md](../roadmap.md)_
_Last updated: 2026-04-19_

## Outcome

The `/novel` harness (CLI + skill) is used to plan an actual novel from genre through to chapter flesh-out, and the resulting plan is useful enough that someone could write the book from it without re-planning anything structural.

## Why this milestone exists

The harness mostly works on paper. It has the right stages, the right questions, AI critique, memory sync, per-stage markdown outputs. But it has never been used end-to-end on a real novel — only smoke tests and fragments. Until it's proven under real use, every downstream milestone (VS Code extension, compile, preview) risks being built on top of a tool that doesn't actually do its job.

This is the pattern-check milestone. Everything past this point assumes the harness produces good plans. We need to verify that before we build on it.

## Prove-it gate

All three must be true:

1. **A complete novel plan exists.** All 14 stages from Genre to Master Document are filled in for a real novel you intend to write (not a throwaway test). `output/master-document.md` has been generated and contains substantive content at each section.
2. **The plan is usable.** Reading the master document end-to-end, you can answer "what happens in each chapter" and "why does this character do this" without having to re-plan anything. No structural gaps that require going back to an earlier stage.
3. **The harness didn't frustrate you into quitting halfway.** If at any point you abandoned it and planned the rest in a notebook or a different tool, that's a failure of the gate regardless of whether code-level bugs blocked you.

## Stories

Pre-flight (before planning the real book):

- **1.1 Baseline quality pass on all 14 stage guides** — Read each stage's conversation guide in `lib/ai/stage-guides.js`. Check question order is sensible, hints are accurate, validation messages make sense. Fix anything obviously wrong. _(Half day)_
- **1.2 End-to-end smoke test** — Seed a synthetic novel state with minimal data, run through every stage via `nw save`, verify every output file generates correctly: stage docs, memory entries, master document. Confirm no schema mismatches like the Chinese-key bug we just fixed. _(Half day)_
- **1.3 Memory sync round-trip verified in a real Claude session** — Start a new `/novel` session, plan a few stages, end the session, start another session, confirm the previous session's memory is recalled correctly by the skill. _(Half day)_
- **1.4 Master document generation produces a readable artefact** — Run `nw generate` on a filled state. Read the output. If sections are confusing or out of order, fix the renderer in `lib/output/master-doc.js`. _(Half day)_

The actual test (this is the milestone):

- **1.5 Plan a real novel end-to-end using the harness** — You, not me. Use the tool on a novel you genuinely want to write. Keep a friction log as you go: any question that felt awkward, any output that was useless, any moment you wanted to quit and write in a notebook instead. _(Variable — days to weeks depending on your pace)_

Reactive work (informed by the friction log):

- **1.6 Triage the friction log** — Review the log at end of planning. Sort items into: must-fix before another writer uses this, nice-to-have, won't-fix. _(Half day after Story 1.5)_
- **1.7 Fix must-fix items** — One story per item, added here as they're identified. Each under two days. _(Variable)_
- **1.8 Gate check and milestone closure** — Re-read the completed master document. Apply the three prove-it criteria. If all three pass, mark milestone complete and move to Milestone 2. _(Half day)_

## Risks

**Risk: You start planning your real book but abandon the tool halfway.**
Mitigation: Stories 1.1-1.4 reduce the chance of early friction. If you still abandon it, that's valuable signal — the friction log becomes the input to a more fundamental redesign before moving on. Don't force completion of a broken tool.

**Risk: The plan completes but feels generic or wrong.**
Mitigation: The prove-it gate's second criterion ("the plan is usable") catches this. If the plan exists but isn't usable, the critique heuristics or question sequencing are wrong and need work before Milestone 2.

**Risk: Memory sync fails silently in a real session.**
Mitigation: Story 1.3 explicitly tests this round-trip. Also, the durable jsonl log means no memory is ever actually lost even if sync fails — pending entries catch up on next session. Sync failure degrades experience, it doesn't destroy data.

**Risk: You hit AI critique bugs (OpenRouter errors, rate limits, weird output).**
Mitigation: The fallback to rule-based critique is already in place. If critiques are consistently unhelpful rather than failing, that's feedback for Milestone 1.7 rather than a blocker.

**Risk: The harness works fine for fiction but you realise you want to plan non-fiction first.**
Mitigation: That becomes Milestone 7 input. Do not let it pull us into building the multi-engine platform before Milestone 1 is shipped. One engine working end-to-end beats two engines half-built.

## Cut list (explicitly NOT in this milestone)

- **Any VS Code extension work.** That's Milestone 2.
- **Any compile-to-EPUB or compile-to-PDF work.** Milestones 3-4.
- **Rich-text editing or TipTap integration.** Milestone 2.
- **New planning stages or new story structures beyond Save the Cat.** The tool is Save the Cat-flavoured; changing that is a separate decision.
- **A web interface, a mobile app, cloud sync of state files.** Scope explosion.
- **Non-fiction support, essay support, screenplay support.** Milestone 7.
- **Prose writing assistance (suggesting sentences, rewriting paragraphs).** This is a planning tool, not a prose tool.
- **Integration with Obsidian, Scrivener, Word, Google Docs.** The markdown on disk already works with all of them; no code needed.
- **Improvements to the installation / onboarding experience.** Can be added if Story 1.5 reveals onboarding friction, but not proactively.

## Definition of done

This milestone is closed when:

- All three prove-it criteria are met (complete plan, usable plan, didn't quit)
- The friction log is triaged and must-fix items are resolved
- A short lessons-learned note is captured at the bottom of this file, to inform Milestone 2 scoping

## Lessons learned

_To be filled in at milestone closure. What surprised you? What do you now believe about the harness that you didn't at the start? What should Milestone 2 know?_
