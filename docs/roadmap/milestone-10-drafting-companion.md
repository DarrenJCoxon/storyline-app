# Milestone 10 — Drafting Companion

*Status: **EXPLORATORY** — logged for a future phase, not started.Parent: ../roadmap.mdLast updated: 2026-04-22*

## Outcome

A writer drafting prose inside Storyline can invoke `/critique` and get expert feedback on **what they actually wrote**, measured primarily against **the plan they made**. The harness reads the open chapter (or the whole manuscript), pulls the matching slice of `.storyline/state.json`, and returns structured critique in two sections: **faithfulness** (did the scene deliver the planned beat function, POV, conflict, and what-changes?) and, optionally, **craft** (POV slips, tense drift, dialogue, pacing).

The differentiator is faithfulness. Every other writing tool on the market can critique prose in the abstract. Storyline is the only one holding the plan object — the beat sheet, the chapter outline, the protagonist's ghost and core lie — which means it is the only one that can say *"your planned midpoint was a false victory with a poisoned reward; the scene as written delivers the reward but not the poisoning."* Craft critique is commoditised; faithfulness critique is not.

## Why this milestone exists

Milestones 1–9 build the planning harness, the writing surface, the compile pipeline, and the cost/ingest ergonomics. At the end of M9, Storyline is a great place to **plan** a novel and a decent place to **write** one. It still does nothing to help the writer check their own work against the plan once the draft is underway.

Today, drafting-phase support is limited to mechanical drift detection — lib/manuscript/snapshot.js and lib/manuscript/compare.js surface word-count drift, scene-count drift, a POV heuristic, and progress-vs-target. That is bookkeeping. It does not read the prose.

The existing critic subagents (agents/storyline-critic-{haiku,sonnet,opus}.md) all read `.storyline/state.json`, never the manuscript. They critique the plan. There is no agent in the system whose job is to read a chapter's prose alongside its plan slice and judge whether the writer delivered what they promised themselves.

M10 closes that gap. Once it ships, a writer finishing chapter 12 can ask "did this land the midpoint?" and get a real answer grounded in both the prose and the Stage 7 beat they wrote six weeks earlier.

## Prove-it gate

All three must be true:

1. **Faithfulness critique on a real chapter surfaces at least one specific issue the writer did not already know about** — something that points at a concrete miss against the plan (missing beat function, POV drift from the plan, a planned what-changes that never lands). Not generic craft notes. Not a restatement of the plan. An actual insight the writer cannot easily get from reading their own chapter alongside their own beat sheet.
2. **Whole-manuscript continuity pass catches a cross-chapter contradiction or arc drift** that neither the drift report nor per-chapter faithfulness would have caught on its own. Candidates: a character arc that plateaus in Act 2, a subplot that never resolves, a promised stake that never pays off, a named object that changes description between chapters.
3. **The writer trusts it enough to re-run it.** Subjective but non-optional. After the first real use, does the writer choose to run `/critique` again on the next chapter — or do they silently stop? Trust is the product.

Note: prose-craft critique (the commoditised lane) is **not** in the prove-it gate. It can ship but it is not what the milestone is measured on.

## Invocation

One skill, four entry points:

```bash
/critique                      # open chapter in the IDE (fallback: last-edited)
/critique ch03                 # explicit target by chapter number
/critique chapter-03.md        # explicit target by filename
/critique all                  # whole-manuscript continuity pass
/critique plan                 # drift report only (fast, no model call)
```

The skill lives at `skill/critique/SKILL.md` and mirrors the routing pattern established by the planning skill — thin prompt logic, heavy lifting in subagents and the Node CLI.

Active-file resolution reuses vscode-extension/src/active-file-tracker.ts; when `/critique` is run outside the IDE, fall through to the most recently modified file under `manuscript/`.

## Flow per chapter

1. **Resolve scope** — skill maps the invocation to one or more files under `manuscript/`.
2. **Build the critique brief** — new CLI verb `storyline-cli critique-brief <chapter>` emits a JSON bundle containing:
   - the chapter's prose (raw markdown)
   - the chapter's plan slice (`state.chapterOutline[n]`, including POV, scenes, conflict, what-changes, parent beat id)
   - the parent beat's slice (`state.beatSheet[beatId]`, including midpointType / whiffOfDeath / selfRevelation / etc. where applicable)
   - relevant drift findings from `manuscript compare` for that chapter
   - the protagonist's want/need/ghost/flaw/coreLie from Stage 3 (faithfulness critique needs the character arc reference)
3. **Delegate to a subagent** — a new `storyline-critic-draft` agent, pinned to Sonnet, via the harness's Task tool. Same pattern as planning critics: first-line `MODEL:` identity, structured output, silent escalation to Opus on weak response per skill/docs/routing/confidence-check.md.
4. **Render** — critique returned in-chat with file:line anchors where the agent can locate the prose it is commenting on. Structured as:
   - **Faithfulness findings** (by default, the whole output)
   - **Craft findings** (only when `--craft` flag is set)
   - **Escalation counter** at end ("1 of 4 points escalated to Opus")

## `/critique all` — whole-manuscript mode

This is the cross-chapter continuity pass and it is a different shape of job.

- **Serial, not parallel.** A fan-out across chapters loses the cross-chapter signal that is the whole point of `all`. Run chapters sequentially with accumulating context.
- **Opus by default.** This is the only mode where Opus is the first-choice tier, not an escalation target. Whole-book reasoning is Stage 13 work and deserves the same model.
- **Cache per-chapter faithfulness critique** so `/critique all` reuses the Sonnet-tier faithfulness output per chapter and focuses Opus cycles on the cross-chapter connective tissue — arc drift, stake payoff, subplot resolution, named-object consistency.
- **Bounded scope on first ship.** Continuity lane only. Craft lane is per-chapter, not whole-manuscript. A craft pass across 90k words is low signal and high cost.

## Architecture

```
skill/
├── SKILL.md                          (existing — /storyline)
└── critique/
    ├── SKILL.md                      (new — /critique entry points + routing)
    └── docs/
        ├── faithfulness-rubric.md    (what the draft critic checks)
        └── continuity-rubric.md      (what the whole-manuscript pass checks)

agents/
└── storyline-critic-draft.md         (new — Sonnet default, Opus escalation)

lib/critique/                         (new — pure Node, no model calls)
├── brief-builder.js                  (state + prose + drift → JSON bundle)
├── chapter-resolver.js               (invocation → file path(s))
└── output-formatter.js               (agent reply → writer-facing markdown)

bin/commands/
└── critique.js                       (storyline-cli critique-brief, -render)
```

### Reuse, don't rebuild

- lib/manuscript/snapshot.js — chapter-level metadata for the brief
- lib/manuscript/compare.js — drift findings feed the brief
- lib/ai/model-router.js — same routing primitive the planning critics use
- Task-tool subagent pattern from skill/SKILL.md:408
- vscode-extension/src/active-file-tracker.ts — active-chapter resolution

### VS Code ergonomics (phase 2 of this milestone)

Once the skill-driven flow is proven, add a command palette entry `Storyline: Critique this chapter` and a right-click context menu item on `.md` files under `manuscript/`. Both shell out to `storyline-cli critique-brief` and invoke the same skill path via the harness. No separate code path, no duplication.

## The `storyline-critic-draft` agent

New agent file, same shape as the existing three planning critics but with a different job.

**Model:** Sonnet by default, Opus on escalation. Sonnet is the right tier for single-chapter faithfulness: needs structural judgement, needs the plan context, doesn't need whole-book reasoning.

**Input:** the JSON brief from `critique-brief`.

**Checks faithfulness first** (always):

- Does the chapter's prose deliver the **planned beat function**? (E.g., if this chapter is the midpoint and the plan says False Victory, does the scene execute the false-victory flip?)
- Does the prose honour the **planned POV**? (A planned third-limited chapter that drifts into omniscient is flagged.)
- Does the prose land the **planned what-changes**? A scene where nothing changes from the established state is the single most common faithfulness failure.
- Does the **conflict named in the plan** show up on the page, or is it glossed?
- Is the **protagonist's flaw/core lie** visible in their behaviour this chapter, where the plan says it should be?

**Checks craft second** (only when `--craft` is set):

- POV slips within a scene
- Tense drift
- Dialogue tags (over-tagging, creative-tag syndrome)
- Show vs. tell on the beats that need to land emotionally
- Pacing within the scene (summary vs. scene imbalance)

**Output format:**

```
MODEL: sonnet

## Faithfulness

- [severity] [finding] — [specific prose reference with quote]
  Plan said: [quote from plan slice]
  On the page: [quote from prose]
  Consider: [specific revision direction, not generic]

## Craft (only if --craft)

...

## Nothing-to-flag

[Short list of what worked — critique without recognition is corrosive.]
```

Severities: 🔴 error (planned beat function missing), 🟡 warning (partial delivery), 🟢 note (worth noticing but not broken).

## Dependencies

- Must land **after M1 proves itself** — critique-the-draft is meaningless against a plan the harness can't produce well yet.
- Must land **after M2 proves itself** — writers need to be actually drafting in the editor for /critique to have real chapters to read.
- Depends on lib/manuscript/compare.js being stable (it is).
- Does **not** depend on M7 (multi-engine refactor) — this is Storyline-specific; other engines get their own critique skill if they want one.
- Depends on M8's routing primitive for the Opus-escalation path. If M8 has not shipped, M10 falls back to always-Sonnet (with a note in provenance) — acceptable but weaker on `/critique all`.

## Risks

**Faithfulness requires the plan to be populated.** If a writer has drafted prose but skipped Stage 7 (Beat Sheet) or Stage 12 (Chapter Flesh-Out), the brief is starved of context and the critic has nothing to compare against. The skill must detect this cleanly and say "no plan slice for this chapter — run `/storyline` Stage 12 first, or run `/critique --craft-only` for prose-only feedback." Don't fail silently into generic craft critique pretending to be faithfulness.

**Cost of** `/critique all` **on a 90k-word book.** Serial Opus on fifteen chapters is a real spend in subscription-quota terms, and a long wall-clock time. Default to chapter-by-chapter; surface `/critique all` as the deliberate deep pass, not the casual one. Escalation counter at end-of-run so the writer knows what it cost.

**The craft lane is a distraction.** ProWritingAid, Sudowrite, and Grammarly all do prose craft critique. We will not beat them on that and should not try. Ship craft as an opt-in `--craft` flag, never as the default. If it starts dominating the output writers read, we are building the wrong product.

**"Faithful to the plan" can become a creative straitjacket.** Writers discover things in drafting that the plan didn't anticipate — and the right move is often to update the plan, not force the prose back. The critic must frame faithfulness findings as **"here is where you drifted from the plan — decide if the plan was right or the prose is right"** and never as "fix the prose to match the plan." Tone matters. The existing drift-report framing in lib/manuscript/compare.js gets this right; the subagent's system prompt must match.

**Hallucinated quotes.** If the agent fabricates prose excerpts or misquotes the plan, trust collapses instantly. The brief must be the single source of truth and the agent must be instructed to quote only from what it was given. Validate in testing with adversarial inputs (prose that says X, plan that says Y, check the critic doesn't attribute Y to the prose).

**Scope creep into line editing.** Writers will ask for "rewrite this paragraph for me." No. Same rule as the planning harness: Storyline plans and critiques; it does not write prose. Enforce in the agent's system prompt. Redirect: "Here is what isn't landing and why — the rewrite is yours."

**Whole-manuscript context windows.** Opus on a 90k-word book is within context but close to the line on some SKUs. If a book runs long, the continuity pass must chunk intelligently (by act, by subplot thread) rather than truncate silently.

**Per-chapter cache invalidation.** If a writer edits chapter 5 after running `/critique all`, the cached Sonnet faithfulness for chapter 5 is stale. Hash the prose; invalidate the cache on change; don't try to diff.

## Cut list (explicitly NOT in this milestone)

- **Prose generation of any kind.** Storyline does not write prose. This has been the rule since M1 and does not change.
- **Line-editing / rewrite suggestions at the sentence level.** The critic identifies what isn't landing; it does not rewrite. "Consider: \[direction\]" is the ceiling, not "try this: \[sentence\]."
- **Grammar, spelling, typo checking.** Writers have tools for this. We are not one of them.
- **Style guides (Chicago, AP, house style).** Out. A novelist's style guide is their voice, not a rulebook.
- **Tracking changes across a session.** The critic reads what's on disk now. Version awareness lives in git, not here.
- **Critique of front matter or back matter.** Manuscript chapters only. Dedications, acknowledgements, author notes — skipped.
- **Real-time / as-you-type critique.** Invocation-driven only. No inline squiggles, no autocomplete, no "AI thinks…" UI noise while the writer is drafting. The whole point is to leave the writer alone while they write.
- **Auto-applying fixes.** The writer decides what to change. Always.
- **Multi-book / series-level critique.** One manuscript at a time. Series-wide arcs are a Storyline-planning-layer concern, not a drafting-layer one.
- **Critique of someone else's manuscript.** The plan slice is what makes this valuable; without it, we are just another prose-feedback tool. No "critique this pasted chapter" mode.
- **A "critique score" or rating.** Numbers are reductive on prose. Findings and severities only.
- **Cross-writer benchmarking.** "Writers at your stage usually…" is a dark pattern. Don't.

## Definition of done (when this milestone eventually runs)

- `/critique` skill works for single-chapter, whole-manuscript, and plan-only modes
- `storyline-critic-draft` agent installed via `storyline init` into `.claude/agents/`
- `storyline-cli critique-brief <chapter>` produces a complete JSON bundle (prose + plan slice + beat slice + drift findings + protagonist arc)
- Faithfulness critique runs Sonnet by default, escalates silently to Opus on weak output (per M8 confidence-check heuristic)
- `/critique all` runs a serial Opus continuity pass with per-chapter Sonnet results cached
- VS Code command palette entry `Storyline: Critique this chapter` shells out to the same skill path (phase 2)
- Agent's system prompt enforces the "quote only from the brief" rule and the "no prose rewriting" rule
- Prove-it gate met: a real chapter, a real finding the writer did not already know, a writer who re-runs it
- `docs/` gains a `drafting-companion.md` page covering what `/critique` reads, what it doesn't, and the "plan or prose — you decide which was right" framing

## Story 0 — How to run the prompt spike

Before any code is written, the writer validates the draft critic's system prompt against two real chapters of an in-flight novel. If the prompt cannot produce a useful finding on a hand-built brief, the milestone is reconsidered before plumbing is built. Budget: \~2 chapters, \~4 prompt iterations, \~1 day.

### What you need before starting

- An in-flight novel project with at least Stage 7 (Beat Sheet), Stage 12 (Chapter Flesh-Out), and Stage 3 (Protagonist) populated in `.storyline/state.json`.
- Two drafted chapters under `manuscript/` whose plan you can recall well enough to know whether the critic's findings are insightful or obvious.
- The draft system prompt at agents/storyline-critic-draft.md — currently in the repo as a draft for this spike, not yet wired into anything.

### The four steps

**1. Hand-build a brief from chapter 1 of the spike.** Open a fresh markdown scratch file. Copy in the following five sections, populated from your own project:

```json
{
  "chapter": {
    "number": <N>,
    "filename": "<ch0N-slug.md>",
    "title": "<chapter title>",
    "wordCount": <integer>,
    "sceneCount": <integer>,
    "pov": "<first-person|third-person|null>"
  },
  "prose": "<paste the full markdown of the chapter here>",
  "chapterPlan": <paste state.chapterOutline.find(c => c.chapterNumber === N)>,
  "beatPlan": <paste state.beatSheet.beats[chapterPlan.beat]>,
  "driftFindings": <paste any findings from `storyline-cli manuscript compare` filtered to chapter N — may be []>,
  "protagonist": <paste state.protagonist>
}
```

You can get most of this directly from `.storyline/state.json` and from the chapter's `.md` file. The `chapter` block (snapshot metadata) you can hand-fill — word counts and POV heuristic don't matter much for the spike.

**2. Open a fresh Sonnet conversation** in your harness. Paste the **entire system prompt** from agents/storyline-critic-draft.md — everything from "You are a Storyline draft critic" to the end. Then paste the JSON brief as a separate user message.

**3. Read the output and judge it against the prove-it bar:**

- Did the critic produce **at least one specific faithfulness finding** that names a real miss against the plan — something you didn't already know?
- Did every quoted line of prose actually appear in the chapter? (Hallucinated quotes = prompt fails this iteration.)
- Did every quoted line of plan actually appear in the brief? (Same.)
- Did the critic refrain from rewriting prose? (Suggestion-direction only, never replacement sentences.)
- Did the framing respect "plan ≠ canon"? (Drift framed as "decide which is right," not "fix the prose to match.")

If yes to all five → repeat with chapter 2. If yes again, Story 0 passes — proceed to Story 1.

**4. If any of the five fails, iterate the prompt** in agents/storyline-critic-draft.md. Common iteration directions:

- Useful-finding bar too low → tighten the "What you do NOT do" rules (e.g., "do not surface findings whose severity is 💡 unless tied to a specific plan field").
- Hallucinated quotes → strengthen the "quote only from the brief" rule with adversarial framing ("if you cannot find the quoted line verbatim in `prose`, you are hallucinating — paraphrase instead").
- Rewriting creep → add a hard rule that any output containing replacement prose is invalid; the agent must redo the response.
- Plan-as-canon framing → add an explicit "the plan is a hypothesis the prose tests" framing in the opening paragraph.

### Kill criteria

If after \~4 iterations across 2 chapters the prompt cannot reliably produce a useful, non-hallucinated, non-rewriting, plan-respecting finding — stop. Report back. The milestone needs redesign before plumbing is built. Possible redesigns:

- Move from Sonnet to Opus as the default tier (cost goes up; quality may follow).
- Restructure the brief (more structure, less prose; or vice versa).
- Reframe faithfulness more narrowly (only the parent beat function, not POV/conflict/what-changes).
- Reconsider whether faithfulness-against-plan is feasible at chapter granularity at all — perhaps it's a scene-level job.

### When Story 0 passes

The system prompt in agents/storyline-critic-draft.md is the validated artefact. Story 1 (brief-builder + CLI verb) and Story 2 (routing + skill registration) can begin. The agent file is already in place; Story 2 just wires it into the install script and the routing table.

## Lessons learned

*To be filled in at milestone closure.*