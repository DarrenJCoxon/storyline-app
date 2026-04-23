# Critique confidence check (Sonnet → Opus escalation)

For stages flagged with `escalateOn: "opus"` in the routing map (currently Stage 7 Beat Sheet and Stage 10 Scene-Outline critique), the skill runs the Sonnet subagent's output through a cheap heuristic before presenting it to the writer. If the heuristic flags the output as weak, the skill silently retries on an Opus subagent and uses the stronger result.

## The heuristic (implemented in `lib/ai/model-router.js#shouldEscalate`)

Returns `true` (escalate) when **any** of the following:

1. **Trivially short output.** `< 120` characters — the subagent didn't engage with the brief.
2. **No specificity.** None of the following match:
   - `beat\s*\d+` — cites a specific beat number
   - `midpoint|catalyst|break into (two|three)|all is lost|finale` — cites a named beat
   - `protagonist|antagonist|b[-\s]?story` — names a structural role
3. **Mostly generic.** Contains a tell-tale generic phrase (`"looks good"`, `"consider adding ..."` trailing at end) and the overall response is under 400 characters.

Otherwise → do not escalate.

## Design rules

- **Cheap and predictable.** No model call, no scoring, no regex that can blow up on weird input. String matches only.
- **Bias toward false negatives, not false positives.** A false negative (unnecessary Opus escalation) costs quota. A false positive (weak critique that slips through) costs the writer's trust. The second is strictly worse.
- **Don't train writers to game it.** The heuristic is invisible to the writer — they never see "this was escalated because it mentioned X". Only the stage-end counter surfaces: "2 of 8 critique points escalated to Opus".
- **Re-tune after real use.** This is a first pass. If a given stage escalates ~0% of the time, the heuristic is dead; if it escalates 80%+ of the time on `balanced`, the stage should be promoted to Opus in the table rather than papered over with retries.

## What the skill does with the result

```
crit = subagent(model=sonnet, prompt=...)
if shouldEscalate(crit, stageId):
    crit = subagent(model=opus, prompt=...)
    record provenance with escalated=true
else:
    record provenance with escalated=false
present crit to writer
```

That's it. No user-visible error path.
