// Per-stage model routing for the /storyline skill.
// Pure function: given (stageId, qualityMode) → { model, escalateOn }.
// The skill calls `npx storyline-cli route <stageId>` at stage boundaries
// and delegates critique to a subagent pinned to the returned model.
//
// qualityMode:
//   "economy"  — push one tier lower across the board; no Opus escalation.
//   "balanced" — the table below (default).
//   "premium"  — promote all Sonnet stages to Opus.

const BALANCED = {
  // Stage 1
  genre:          { model: 'haiku' },
  // Stage 2
  premise:        { model: 'haiku' },
  // Stage 3
  protagonist:    { model: 'sonnet' },
  // Stage 4
  characters:     { model: 'haiku' },
  // Stage 5
  relationships:  { model: 'sonnet' },
  // Stage 6
  logline:        { model: 'sonnet' },
  // Stage 7
  beatSheet:      { model: 'sonnet', escalateOn: 'opus' },
  // Stage 8
  bStory:         { model: 'sonnet' },
  // Stage 9
  subplots:       { model: 'sonnet' },
  // Stage 10 — two sub-tasks; skill passes the sub-id
  sceneOutline:        { model: 'sonnet' },
  'sceneOutline:critique': { model: 'sonnet', escalateOn: 'opus' },
  // Stage 11
  plotThreads:    { model: 'haiku' },
  // Stage 12
  chapterOutline: { model: 'sonnet' },
  // Stage 13
  critique:       { model: 'opus' },
  // Stage 14
  masterDoc:      { model: 'opus' },

  // M10 — drafting companion. The /critique skill routes here when the
  // writer asks for prose-vs-plan faithfulness critique on a chapter.
  // Named subagent (`storyline-critic-draft`), not tier-mapped — the
  // critic's prompt is faithfulness-specific and deliberately distinct
  // from the planning-tier critics. No escalation in the first ship:
  // an Opus draft critic would need its own agent file with the same
  // prompt at a higher tier. Track that as a follow-on if Sonnet
  // proves insufficient on real chapters.
  draftCritique:  { model: 'sonnet', subagentType: 'storyline-critic-draft' },
};

const TIER_ORDER = ['haiku', 'sonnet', 'opus'];

function shift(model, delta) {
  const idx = TIER_ORDER.indexOf(model);
  if (idx < 0) return model;
  const next = Math.max(0, Math.min(TIER_ORDER.length - 1, idx + delta));
  return TIER_ORDER[next];
}

// Each tier maps to a named pre-configured subagent installed into
// <project>/.claude/agents/ by `storyline init`. The skill invokes these
// by name via Claude Code's Task tool — that's the pattern that actually
// works, because the parent sees a named specialist in its tool list
// rather than a generic subagent plus a model parameter.
function subagentTypeFor(model) {
  return `storyline-critic-${model}`;
}

// Escalation target is itself a named subagent (always the Opus critic).
function escalateTypeFor(targetModel) {
  return targetModel ? `storyline-critic-${targetModel}` : null;
}

function shape(entry, stageId, qualityMode) {
  return {
    stageId,
    qualityMode,
    model: entry.model,
    // Most stages use the tier-mapped name (`storyline-critic-{model}`);
    // a routing entry can override with an explicit `subagentType` when
    // the stage is handled by a named specialist instead of a tier
    // critic — e.g. M10's `storyline-critic-draft`.
    subagentType: entry.subagentType || subagentTypeFor(entry.model),
    escalateOn: entry.escalateOn || null,
    escalateSubagentType: entry.escalateOn ? escalateTypeFor(entry.escalateOn) : null,
  };
}

export function routeStage(stageId, qualityMode = 'balanced') {
  const entry = BALANCED[stageId];
  if (!entry) {
    // Unknown stage — default to Sonnet, no escalation.
    return shape({ model: 'sonnet' }, stageId, qualityMode);
  }

  // Named-specialist entries (those with an explicit subagentType) opt
  // out of quality-mode tier shifts. A named critic is not a tier
  // critic — its prompt and frontmatter pin it to one model. Until a
  // higher/lower-tier variant of the same specialist exists, we honour
  // the entry as-is regardless of the writer's quality mode.
  if (entry.subagentType) {
    return shape(entry, stageId, qualityMode);
  }

  if (qualityMode === 'balanced') {
    return shape(entry, stageId, qualityMode);
  }

  if (qualityMode === 'economy') {
    // Downshift one tier; drop all escalations (no Opus in economy).
    return shape({ model: shift(entry.model, -1) }, stageId, qualityMode);
  }

  if (qualityMode === 'premium') {
    // Promote Sonnet stages to Opus; keep Haiku on capture stages
    // (Haiku is fine for structured capture even in premium; the
    // point of premium is critique depth, not schema-shaping).
    return shape(
      { model: entry.model === 'sonnet' ? 'opus' : entry.model },
      stageId,
      qualityMode,
    );
  }

  // Unknown mode — treat as balanced.
  return shape(entry, stageId, 'balanced');
}

// Heuristic used on Sonnet critique output to decide whether to
// silently escalate to Opus. Deliberately simple — accept false
// negatives (unnecessary Opus escalation) over false positives
// (weak critique slipping through).
export function shouldEscalate(critiqueText, stageId) {
  if (!critiqueText || typeof critiqueText !== 'string') return true;
  const t = critiqueText.trim();
  if (t.length < 120) return true;

  const specificity = [
    /beat\s*\d+/i,
    /midpoint|catalyst|break into (two|three)|all is lost|finale/i,
    /protagonist|antagonist|b[-\s]?story/i,
  ];
  const hasSpecific = specificity.some(rx => rx.test(t));
  if (!hasSpecific) return true;

  const generic = [
    /looks (good|fine|solid)\b/i,
    /consider (adding|strengthening)\b.{0,40}$/i,
  ];
  const mostlyGeneric = generic.some(rx => rx.test(t)) && t.length < 400;
  return mostlyGeneric;
}
