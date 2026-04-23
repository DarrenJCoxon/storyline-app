import { describe, it, expect } from 'vitest';
import { routeStage, shouldEscalate } from '../lib/ai/model-router.js';

describe('routeStage — balanced (default) quality', () => {
  it('routes capture stages to Haiku', () => {
    expect(routeStage('genre').model).toBe('haiku');
    expect(routeStage('premise').model).toBe('haiku');
    expect(routeStage('characters').model).toBe('haiku');
    expect(routeStage('plotThreads').model).toBe('haiku');
  });

  it('routes mid-reasoning stages to Sonnet', () => {
    expect(routeStage('protagonist').model).toBe('sonnet');
    expect(routeStage('relationships').model).toBe('sonnet');
    expect(routeStage('logline').model).toBe('sonnet');
    expect(routeStage('bStory').model).toBe('sonnet');
    expect(routeStage('subplots').model).toBe('sonnet');
    expect(routeStage('sceneOutline').model).toBe('sonnet');
    expect(routeStage('chapterOutline').model).toBe('sonnet');
  });

  it('routes whole-book critique stages to Opus', () => {
    expect(routeStage('critique').model).toBe('opus');
    expect(routeStage('masterDoc').model).toBe('opus');
  });

  it('flags the two escalation stages', () => {
    expect(routeStage('beatSheet').escalateOn).toBe('opus');
    expect(routeStage('sceneOutline:critique').escalateOn).toBe('opus');
  });

  it('returns null escalateOn on stages without a retry path', () => {
    expect(routeStage('genre').escalateOn).toBeNull();
    expect(routeStage('critique').escalateOn).toBeNull();
  });

  it('falls back to Sonnet for unknown stages without crashing', () => {
    const r = routeStage('nonExistentStage');
    expect(r.model).toBe('sonnet');
    expect(r.escalateOn).toBeNull();
  });

  it('exposes the named subagent type for each tier', () => {
    expect(routeStage('genre').subagentType).toBe('storyline-critic-haiku');
    expect(routeStage('protagonist').subagentType).toBe('storyline-critic-sonnet');
    expect(routeStage('critique').subagentType).toBe('storyline-critic-opus');
  });

  it('exposes the escalation subagent type on escalation stages (and null otherwise)', () => {
    expect(routeStage('beatSheet').escalateSubagentType).toBe('storyline-critic-opus');
    expect(routeStage('sceneOutline:critique').escalateSubagentType).toBe('storyline-critic-opus');
    expect(routeStage('genre').escalateSubagentType).toBeNull();
    expect(routeStage('critique').escalateSubagentType).toBeNull();
  });
});

describe('routeStage — economy quality', () => {
  it('shifts every tier down one step, keeping Haiku at the floor', () => {
    expect(routeStage('genre', 'economy').model).toBe('haiku');          // floor
    expect(routeStage('protagonist', 'economy').model).toBe('haiku');     // Sonnet → Haiku
    expect(routeStage('critique', 'economy').model).toBe('sonnet');       // Opus → Sonnet
    expect(routeStage('masterDoc', 'economy').model).toBe('sonnet');      // Opus → Sonnet
  });

  it('drops escalation — economy does not pay for Opus retries', () => {
    expect(routeStage('beatSheet', 'economy').escalateOn).toBeNull();
    expect(routeStage('sceneOutline:critique', 'economy').escalateOn).toBeNull();
  });
});

describe('routeStage — premium quality', () => {
  it('promotes Sonnet stages to Opus', () => {
    expect(routeStage('protagonist', 'premium').model).toBe('opus');
    expect(routeStage('beatSheet', 'premium').model).toBe('opus');
    expect(routeStage('chapterOutline', 'premium').model).toBe('opus');
  });

  it('keeps Haiku capture stages on Haiku (schema-shaping does not benefit from Opus)', () => {
    expect(routeStage('genre', 'premium').model).toBe('haiku');
    expect(routeStage('plotThreads', 'premium').model).toBe('haiku');
  });

  it('keeps Opus stages on Opus', () => {
    expect(routeStage('critique', 'premium').model).toBe('opus');
    expect(routeStage('masterDoc', 'premium').model).toBe('opus');
  });
});

describe('routeStage — draftCritique (M10 named specialist)', () => {
  it('routes to the named storyline-critic-draft subagent at Sonnet', () => {
    const r = routeStage('draftCritique');
    expect(r.model).toBe('sonnet');
    expect(r.subagentType).toBe('storyline-critic-draft');
  });

  it('has no escalation target in the first ship', () => {
    const r = routeStage('draftCritique');
    expect(r.escalateOn).toBeNull();
    expect(r.escalateSubagentType).toBeNull();
  });

  it('ignores quality modes — a named specialist is not tier-shiftable', () => {
    // economy would normally downshift Sonnet → Haiku; premium would
    // promote Sonnet → Opus. Neither is valid for a named critic whose
    // prompt is pinned to a specific model.
    expect(routeStage('draftCritique', 'economy').subagentType).toBe('storyline-critic-draft');
    expect(routeStage('draftCritique', 'economy').model).toBe('sonnet');
    expect(routeStage('draftCritique', 'premium').subagentType).toBe('storyline-critic-draft');
    expect(routeStage('draftCritique', 'premium').model).toBe('sonnet');
  });
});

describe('shouldEscalate — confidence check', () => {
  it('escalates trivially short output', () => {
    expect(shouldEscalate('too short', 'beatSheet')).toBe(true);
    expect(shouldEscalate('', 'beatSheet')).toBe(true);
    expect(shouldEscalate(null, 'beatSheet')).toBe(true);
  });

  it('escalates output with no structural specificity', () => {
    const vague = 'The overall story seems reasonable. You might want to tighten a few things. Consider some revisions as you go.';
    expect(shouldEscalate(vague, 'beatSheet')).toBe(true);
  });

  it('does not escalate output that cites specific beats and is substantive', () => {
    const specific = 'Beat 8 (Midpoint) is doing the right job — the false victory reveals the protagonist has been chasing the wrong goal and the B-story confirms the theme. However, Beat 10 (All Is Lost) still lacks a whiff of death. Consider introducing the mentor figure earlier so their later betrayal lands harder.';
    expect(shouldEscalate(specific, 'beatSheet')).toBe(false);
  });

  it('does not escalate output that references named beats (midpoint, catalyst, etc)', () => {
    const named = 'The midpoint flip works well but the catalyst feels muted. The protagonist needs a clearer external force pushing them into the debate beat. Break Into Two currently reads as a drift rather than a commitment — they need to actively choose the new world.';
    expect(shouldEscalate(named, 'beatSheet')).toBe(false);
  });
});
