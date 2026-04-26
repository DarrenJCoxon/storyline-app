# Faithfulness rubric — what `/critique` checks

The `storyline-critic-draft` agent runs through these checks in order when the writer invokes `/critique` on a chapter. Every check is answered against the prose on the page versus the plan in `.storyline/state.json` — not against abstract "good writing."

The authoritative version lives in the agent's system prompt at `agents/storyline-critic-draft.md`. This doc is the reader-facing summary — what a writer would want to know about *what the critic is actually looking at* before they run it.

## 1. Beat function (highest priority)

Every chapter has a parent beat (`chapterPlan.beat`). The critic looks up that beat's specific sub-fields in `beatSheet.beats` and checks whether the prose delivers the named function:

- **Catalyst** — is the inciting incident on the page, as a disruption not a complication?
- **Break Into Two** — is the commitment a *choice*, or is the protagonist dragged?
- **Midpoint** — if the plan says "false-victory," does the prose execute the poisoning? If "false-defeat," is there a crucial lesson in the dark?
- **All Is Lost** — does the whiff of death land? Literal or figurative; absent is a 🔴 ERROR.
- **Black Moment** — does despair actually land on the page, or is it told?
- **Break Into Three** — is the renewed motion earned through growth, not luck or rescue?
- **Finale** — does the protagonist succeed because they've changed, or because they applied skill?

For other beats, the critic reads the beat's named fields and asks the same question: did the planned function happen on the page?

## 2. POV faithfulness

The plan's `chapterPlan.scenes[*].pov` is canonical. The prose's heuristic POV (from the snapshot) is a cross-check. The critic flags:

- POV drift from plan (scene planned third-limited, prose drifts into omniscient or head-hops)
- Multi-POV chapter where prose collapses voices
- Single-POV chapter where prose briefly lifts into another head

## 3. What-changes

Every planned scene has a `whatChanges` field — the state-shift the writer committed to. The critic checks whether that shift lands. Common misses:

- Scene ends in the same emotional/situational state it began in
- Shift is summarised rather than dramatised
- A *different* shift happens (drift — flag it, let the writer decide which is right)

## 4. Conflict visibility

`chapterPlan.scenes[*].conflict` names what's at stake. The critic checks whether the conflict is on the page in dialogue, action, or interiority — versus glossed in narration.

## 5. Protagonist arc visibility

The protagonist's `flaw` and `coreLie` should be visible in their behaviour at arc-relevant beats (Setup, Midpoint, All Is Lost, Black Moment, Finale). A protagonist whose flaw is invisible at a beat where it should drive them is a faithfulness miss.

## 6. Drift findings

The mechanical drift findings from `manuscript compare` (word count, scene count, POV heuristic) are fed into the brief. The critic doesn't restate them — it asks: *does this drift correlate with any faithfulness finding?* A chapter that's 40% short and also misses its planned what-changes is a stronger signal than either alone.

## What the critic does NOT check

- **Prose craft** — sentence rhythm, word choice, dialogue tags, tense drift within a scene. Craft will land as `--craft` in Story 7, opt-in.
- **Grammar, spelling, typos.** Writers have tools for this.
- **Style.** A novelist's style is their voice, not a rulebook.
- **Whole-book coherence** across chapters. That's `/critique all`, Story 5.
- **Prose rewriting.** The critic suggests direction, never replacement sentences.

## The framing

The plan is a hypothesis the prose tests. Drift between the two often means the plan was wrong and the prose is the better version. The critic surfaces the drift as a question for the writer — *here is where you departed from the plan; decide which is right* — never as an instruction to fix the prose.
