# Milestone NF-02 — State schema & command surface

*Status: **DONE***
*Parent: [../storyline-nf-scope.md](../storyline-nf-scope.md)*
*Last updated: 2026-04-23*

## Outcome

`/storyline-nf` is a registered command in the skill system. It creates non-fiction projects with a correctly extended state schema, routes through a non-fiction startup protocol, and exposes parity commands (`start`, `status`, `stages`, `generate`). Existing novel projects migrate cleanly to the new schema with `mode: "fiction"` and `pipeline: "novel"` set automatically.

## Why this milestone exists

Small, boring, and it unblocks every pipeline milestone. The command surface and state shape are the contract every subsequent milestone writes against — getting them wrong here means rework later. It is also the only milestone that touches existing novel project data, so it needs to ship early and ship carefully.

## Prove-it gate

All three must be true:

1. **`/storyline-nf start` creates a new non-fiction project.** State file is valid, mode and pipeline fields are set, research index is initialised, and the placeholder stage list renders.
2. **Existing novel projects continue to work.** After migration, a fiction project's `storyline status`, `storyline save`, and `storyline generate` all produce identical output to before the migration. No regressions.
3. **Parity commands behave.** `storyline-nf status`, `stages`, `generate` return sensible output on an empty non-fiction project (placeholder where stages not yet implemented).

## Stories

- **NF-2.1 — State schema extension.** Add `mode`, `pipeline`, `subMode`, `bookDna`, `research` top-level fields to `lib/state/project-state.js`. Preserve existing `stages` shape. *(Half day)*
- **NF-2.2 — Migration script.** `scripts/migrate-state-to-v2.js` — reads old state, writes new state with `mode: "fiction"`, `pipeline: "novel"`, empty `bookDna`, research summary pulled from `.storyline/research/` if present. Backs up old file. *(1 day)*
- **NF-2.3 — Schema validation.** Extend existing state validation so both fiction and non-fiction states pass, mismatched pipeline/mode combinations fail clearly. *(Half day)*
- **NF-2.4 — Register `/storyline-nf` skill.** New skill in `skill/` mirroring `/storyline`. `SKILL.md`, startup protocol in `skill/docs/startup/startup-protocol-nf.md`. *(1 day)*
- **NF-2.5 — Scaffolding `lib/stages-nf/`.** Empty module directories for `book-dna/`, `pipeline-a/`, `pipeline-b/`, `pipeline-c/`. Each with an index that declares the stage list. Stages return "not yet implemented" gracefully. *(Half day)*
- **NF-2.6 — `storyline-nf start`.** CLI entry: asks name, creates directory, writes initial state. Does **not** yet pick a pipeline — that happens during Book DNA Stage 1. *(1 day)*
- **NF-2.7 — `storyline-nf status | stages | generate`.** Parity commands. `stages` reads from scaffolded module lists. `generate` renders whatever is present. *(1 day)*
- **NF-2.8 — Migration dogfood.** Run migration on a real existing novel project. Confirm status, save, generate all work. *(Half day)*
- **NF-2.9 — Gate check.** Apply the three prove-it criteria. Fix blockers. Close milestone. *(Half day)*

## Risks

- **Migration destroying state.** A bad migration could corrupt a writer's in-progress novel. Mitigation: always back up, dry-run mode, refuse to run if target state already exists in new shape.
- **Command namespace confusion.** Writers might run `/storyline` expecting non-fiction or vice versa. Mitigation: startup protocol on both commands detects project mode and warns if the command doesn't match.

## Out of scope for this milestone

- Any actual stage content — lands in NF-03 onward.
- Pipeline selection UX — happens inside Book DNA Stage 1 in NF-03.
