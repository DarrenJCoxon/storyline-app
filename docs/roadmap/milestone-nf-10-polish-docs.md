# Milestone NF-10 — Polish, dogfooding, docs

*Status: **DONE***
*Parent: [../storyline-nf-scope.md](../storyline-nf-scope.md)*
*Last updated: 2026-04-23*

## Outcome

A new writer can go from `/storyline-nf` to a compiled non-fiction book without hitting a rough edge that blocks them, using only the in-product guidance and docs. One real book per pipeline has been planned end-to-end during this milestone, rough edges logged and triaged, the top issues fixed, and writer-facing documentation exists at `docs/storyline-nf/` with a quickstart per pipeline.

## Why this milestone exists

The nine prior milestones produce a tool that works. This one produces a tool someone can use without the person who built it sitting next to them. Dogfood exposes the gap between "functionally complete" and "commercially shippable" — which is usually the gap between knowing where to click and knowing what to think.

## Prove-it gate

All three must be true:

1. **Three real books planned end-to-end.** One Pipeline A, one Pipeline B, one Pipeline C. All produced a usable master document and pipeline-specific artifacts.
2. **The top-20 rough edges are fixed.** Friction logs from the three dogfoods are triaged. The top 20 by impact are fixed. Remainder are explicitly deferred with issues filed.
3. **A new writer can complete Book DNA unassisted.** A writer with no prior harness exposure, given only `docs/storyline-nf/quickstart.md` and the in-product guidance, completes all 12 Book DNA stages without the builder's help.

## Stories

- **NF-10.1 — Dogfood Pipeline A.** Plan a real self-help or business book end-to-end. Detailed friction log. *(3–5 days)*
- **NF-10.2 — Dogfood Pipeline B.** Plan a real narrative non-fiction book end-to-end. Detailed friction log. *(3–5 days)*
- **NF-10.3 — Dogfood Pipeline C.** Plan a real how-to book end-to-end. Detailed friction log. *(3–5 days)*
- **NF-10.4 — Triage friction logs.** Sort items into must-fix / nice-to-have / won't-fix. Cap must-fix at 20. *(1 day)*
- **NF-10.5 — Fix must-fix items.** One sub-story per item; each under two days. *(Variable — up to 2 weeks)*
- **NF-10.6 — Quickstart docs.** `docs/storyline-nf/quickstart.md` plus one per pipeline (`pipeline-a.md`, `pipeline-b.md`, `pipeline-c.md`). Writer-facing; assume no harness knowledge. *(2 days)*
- **NF-10.7 — Book DNA guide.** `docs/storyline-nf/book-dna-guide.md` — explains why each of the 12 stages matters, with examples pulled from the dogfood books. *(1–2 days)*
- **NF-10.8 — Research workflow guide.** `docs/storyline-nf/research-workflow.md` — capture, link, retrieve, verify. *(1 day)*
- **NF-10.9 — Example projects.** `examples/storyline-nf/` — one minimal completed project per pipeline. Usable as reference. *(1 day)*
- **NF-10.10 — In-product help.** `storyline-nf help`, `storyline-nf help <stage>`. Surfaces quickstart and per-stage hints. *(1 day)*
- **NF-10.11 — Telemetry (opt-in).** Stage completion times, critique severity counts. Off by default, helpful for future routing tweaks. *(1 day)*
- **NF-10.12 — Blind writer test.** Recruit one writer with no prior harness exposure. Watch them complete Book DNA. Fix anything they stumble on. *(2–3 days)*
- **NF-10.13 — Gate check and launch.** Apply the three prove-it criteria. If all pass, non-fiction harness is shippable. *(Half day)*

## Risks

- **Dogfood bias.** The builder planning books with the tool they built may not hit the rough edges a new writer hits. Mitigation: the blind writer test in NF-10.12 is explicitly non-negotiable for the gate.
- **Unbounded friction fixing.** Every dogfood surfaces issues; fixing all of them is infinite. Mitigation: cap at 20 must-fix and discipline around deferrals.
- **Doc rot.** Docs written at polish time will be out of date by the next milestone. Mitigation: writer-facing docs reference concepts, not code paths; internal docs live next to code.

## Out of scope for this milestone

- Marketing site, landing pages, external launch materials — separate workstream.
- Non-English localisation — future.
- Integration with distribution platforms (Amazon KDP direct publish) — future.

## Closure

With NF-10 closed, `/storyline-nf` is a shipped parallel product to `/storyline` covering ~8 of the top 10 Amazon non-fiction categories (memoir via novel harness, prescriptive via Pipeline A, narrative non-fiction via Pipeline B, how-to via Pipeline C). The research subsystem serves both harnesses. Writers can go from idea to compiled book, with planning, research, critique, and compile all handled in-product.
