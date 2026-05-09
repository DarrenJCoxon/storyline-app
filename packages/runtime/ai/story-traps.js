// Story Traps — the fiction equivalent of Trellis's "Four Traps" for outcomes
// Each trap has detection criteria, Save the Cat reasoning, and a fix protocol.
// Run at every gate to catch the most common story-breaking patterns.

// ─────────────────────────────────────────────────────────────
// THE FOUR STORY TRAPS
// ─────────────────────────────────────────────────────────────

export const STORY_TRAPS = {
  flatProtagonist: {
    id: 'flatProtagonist',
    name: 'Flat Protagonist',
    severity: 'error',
    description: 'Want and Need are identical — no internal contradiction',
    stcReasoning: `Save the Cat requires the protagonist to want something external but need something internal. If they're the same thing, there's no internal conflict — and without internal conflict, the character arc is a flat line. The want is what they chase; the need is what they'd discover if they stopped chasing. The tension between these two IS the story.`,
    detection: (state) => {
      const p = state.protagonist;
      if (!p?.want || !p?.need) return false; // Can't detect without both
      const wantWords = p.want.toLowerCase().split(/\s+/);
      const needWords = p.need.toLowerCase().split(/\s+/);
      // Check for high overlap
      const overlap = wantWords.filter(w => needWords.includes(w) && w.length > 3);
      const overlapRatio = overlap.length / Math.max(wantWords.length, needWords.length);
      // Also check if they're nearly identical strings
      const identical = p.want.toLowerCase().trim() === p.need.toLowerCase().trim();
      return identical || overlapRatio > 0.6;
    },
    fixProtocol: [
      '1. Separate want from need: the want is what they\'re CHASING (external, tangible), the need is what they\'d discover if they STOPPED chasing (internal, emotional)',
      '2. Make them contradictory: "I want the promotion" vs "I need to accept I\'m enough without it"',
      '3. The flaw should block the need but drive the want — they chase the want BECAUSE of the flaw, and the need is what heals it',
      '4. Test it: can they achieve the want without meeting the need? If no, they\'re too close.',
    ],
  },

  structuralGap: {
    id: 'structuralGap',
    name: 'Structural Gap',
    severity: 'error',
    description: 'Beats exist but don\'t connect — a chain with broken links',
    stcReasoning: `Each beat must CAUSE the next beat. The catalyst forces the debate. The debate ends with Break Into Two. The new world creates Fun and Games. If a beat could be removed without changing what comes after it, it's not connected. Stories with structural gaps feel like "stuff happening" instead of "one thing leading to another."`,
    detection: (state) => {
      const beats = state.beatSheet?.beats;
      if (!beats) return false;

      const gaps = [];

      // Catalyst should force the debate
      if (beats.beat03Catalyst?.scene && beats.beat04Debate?.scene) {
        // They should share thematic DNA — the catalyst creates the question the debate explores
        // Can't do deep semantic analysis, but we can check if they're both present
        if (!beats.beat04Debate.debateQuestion) {
          gaps.push('Debate has no question — the catalyst should force a question the protagonist must answer');
        }
      }

      // Break Into Two should resolve the debate
      if (beats.beat04Debate?.debateQuestion && beats.beat05BreakIntoTwo?.choice) {
        // The choice should answer the debate question
        // Check that both exist
      } else if (beats.beat04Debate?.scene && !beats.beat05BreakIntoTwo?.choice) {
        gaps.push('Break Into Two has no choice — the debate should end with a COMMITMENT');
      }

      // Midpoint should flip from the Fun and Games trajectory
      if (beats.beat07FunAndGames?.scene && beats.beat08Midpoint?.scene) {
        if (!beats.beat08Midpoint.midpointType) {
          gaps.push('Midpoint has no type — Fun and Games must lead to a reversal (False Victory or False Defeat)');
        }
      }

      // All Is Lost should follow from Bad Guys Close In
      if (beats.beat09BadGuysCloseIn?.scene && beats.beat10AllIsLost?.scene) {
        if (!beats.beat10AllIsLost.whiffOfDeath) {
          gaps.push('All Is Lost has no whiff of death — the pressures from Bad Guys Close In must culminate in a genuine loss');
        }
      }

      // Break Into Three should be earned through the Black Moment
      if (beats.beat11BlackMoment?.scene && beats.beat12Beat13?.scene) {
        if (!beats.beat12Beat13.secondDoorway) {
          gaps.push('Break Into Three has no second doorway — the Black Moment should force a revelation that opens this door');
        }
      }

      return gaps.length > 0 ? gaps : false;
    },
    fixProtocol: [
      '1. Walk through your beats in order. For each beat, ask: "Does the PREVIOUS beat CAUSE this one?"',
      '2. If you find a beat that doesn\'t follow from the one before it, you have a structural gap',
      '3. The fix is to make the earlier beat CREATE the later one: the catalyst forces the question, the debate ends with a choice, the choice creates the new world, etc.',
      '4. Test it: if you removed any beat, would the story still make sense? If yes, that beat isn\'t doing its job.',
    ],
  },

  themeFreePlot: {
    id: 'themeFreePlot',
    name: 'Theme-Free Plot',
    severity: 'warning',
    description: 'B Story doesn\'t echo the A Story\'s theme — the plot has no meaning',
    stcReasoning: `In Save the Cat, the B story carries the theme. It's not just a romantic subplot — it's the argument the novel is making about how humans should live. If the B story doesn't connect to the A story's theme, the novel is just events. Readers finish it and think "well, things happened" instead of "that changed how I think about X."`,
    detection: (state) => {
      const bStory = state.bStory;
      const beats = state.beatSheet?.beats;

      // Need both B story and beat sheet to detect this
      if (!bStory?.character || !bStory?.premise) return false;

      // If there's no theme connection declared, that's a warning
      if (!bStory.themeConnection) return true;

      // If the B Story theme statement doesn't appear in the beat sheet at all
      if (beats?.beat06BStory?.themeStatement) {
        // Theme statement exists — check it's meaningful
        const ts = beats.beat06BStory.themeStatement.toLowerCase();
        if (ts.length < 10) return true; // Too short to be a real theme
      }

      return false;
    },
    fixProtocol: [
      '1. State your theme in one sentence: "You can\'t protect people by controlling them" — not "love" or "sacrifice"',
      '2. The B story character should EXPRESS this theme to the protagonist — and the protagonist should ignore it',
      '3. The B story should RESOLVE the theme by the end: the protagonist finally understands what the B story character was saying all along',
      '4. Test it: remove the B story. Does the A story still have meaning? If no, the B story is carrying the theme. If yes, the B story isn\'t connected.',
    ],
  },

  staticWorld: {
    id: 'staticWorld',
    name: 'Static World',
    severity: 'warning',
    description: 'The opening image and final image are essentially the same — no visible transformation',
    stcReasoning: `Save the Cat demands that the Opening Image and Final Image be a mirror or inversion. The opening shows the "before" state; the final shows the "after." If they're the same, nothing transformed. The reader closes the book thinking "well, that was a journey... to the same place." The contrast is proof that the story mattered.`,
    detection: (state) => {
      const beats = state.beatSheet?.beats;
      if (!beats?.beat01OpeningImage?.image || !beats?.beat14FinalImage?.scene) return false;

      const opening = beats.beat01OpeningImage.image.toLowerCase().trim();
      const final_ = beats.beat14FinalImage.scene.toLowerCase().trim();

      // Exact match
      if (opening === final_) return true;

      // Check if contrast is declared
      if (beats.beat01OpeningImage.contrastToFinalImage || beats.beat14FinalImage.contrastToOpening) {
        return false; // Intentional contrast exists
      }

      // High word overlap suggests same image
      const openWords = new Set(opening.split(/\s+/).filter(w => w.length > 3));
      const finalWords = new Set(final_.split(/\s+/).filter(w => w.length > 3));
      const overlap = [...openWords].filter(w => finalWords.has(w));
      const overlapRatio = overlap.length / Math.max(openWords.size, finalWords.size, 1);

      return overlapRatio > 0.7;
    },
    fixProtocol: [
      '1. Go back to the Opening Image. What SPECIFIC visual did you create? A person, a place, a feeling?',
      '2. Now invert it. If they were alone, they\'re connected. If they were in control, they\'ve surrendered. If they were in the dark, there\'s light.',
      '3. The Final Image should contain the THEME. Not just "things are better now" but "here is the specific way the world changed because this person grew."',
      '4. Test it: describe both images to someone who hasn\'t read the book. Can they tell which is before and which is after?',
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// Run all trap checks against the current state
// ─────────────────────────────────────────────────────────────

export function runStoryTraps(state) {
  const results = [];

  for (const [key, trap] of Object.entries(STORY_TRAPS)) {
    const detected = trap.detection(state);
    if (detected) {
      results.push({
        id: trap.id,
        name: trap.name,
        severity: trap.severity,
        description: trap.description,
        stcReasoning: trap.stcReasoning,
        details: Array.isArray(detected) ? detected : null,
        fixProtocol: trap.fixProtocol,
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// Format trap results for display
// ─────────────────────────────────────────────────────────────

export function formatTrapResults(results) {
  if (results.length === 0) {
    return 'No story traps detected — looking solid.';
  }

  let output = '';
  for (const result of results) {
    const icon = result.severity === 'error' ? '🔴' : '🟡';
    output += `\n${icon} ${result.name}: ${result.description}\n`;
    output += `   Why: ${result.stcReasoning}\n`;
    if (result.details) {
      for (const detail of result.details) {
        output += `   → ${detail}\n`;
      }
    }
    output += `   Fix:\n`;
    for (const step of result.fixProtocol) {
      output += `   ${step}\n`;
    }
  }

  return output;
}