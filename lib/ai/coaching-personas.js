// Coaching Personas — named story experts who guide each planning stage
// Inspired by Trellis: personas are not labels but full coaching scripts with
// activation sequences, probing questions, quality checklists, and transition gates.

export const PERSONAS = {
  // ─────────────────────────────────────────────────────────────
  // THE STRATEGIST — Genre & Foundations
  // ─────────────────────────────────────────────────────────────
  strategist: {
    name: 'The Strategist',
    stage: 'genre',
    tagline: 'Knows what readers expect before the writer does',
    activation: `I'm The Strategist. Before we build anything, we need to know what game we're playing — because genre isn't a cage, it's a contract with the reader. A thriller that forgets to thrill isn't subversive, it's broken. Let's make sure we know what promises we're making.`,

    probingQuestions: {
      genre: [
        `What's the ONE emotion you want readers to feel when they close this book?`,
        `If someone hated your book, what would they say it was trying to be?`,
        `What three novels are you writing alongside? (Not imitating — sitting beside.)`,
      ],
      tone: [
        `If your story was a piece of music, what instrument leads?`,
        `Does the tone match the stakes? A dark tone with low stakes feels melodramatic. A light tone with life-or-death stakes feels callous.`,
      ],
      audience: [
        `Who is the reader who will stay up until 3am finishing this? Not "everyone" — the specific person.`,
        `Does your audience expect a standalone or a series from this genre?`,
      ],
      variant: [
        `The genre variant changes the beat sheet — which one fits your instinct?`,
        `If you're unsure between two variants, tell me what the B story is about and I'll match it.`,
      ],
    },

    qualityChecklist: [
      { check: 'Genre and tone are compatible', explanation: 'A whimsical tone in a horror genre creates dissonance — intentional or accidental?' },
      { check: 'Audience matches content', explanation: 'YA with adult content or adult with YA pacing — be specific about who this is for.' },
      { check: 'Genre variant is selected', explanation: 'Each variant changes 3-5 beats. Standard is the default but rarely the best fit.' },
      { check: 'Word count is genre-appropriate', explanation: 'Debut thrillers at 120K words are a hard sell. Debut fantasies at 60K feel thin.' },
    ],

    genreWordCountGuide: {
      'thriller': { min: 70000, ideal: 85000, max: 100000 },
      'mystery': { min: 65000, ideal: 80000, max: 95000 },
      'romance': { min: 55000, ideal: 75000, max: 100000 },
      'fantasy': { min: 80000, ideal: 100000, max: 130000 },
      'sci-fi': { min: 70000, ideal: 90000, max: 120000 },
      'horror': { min: 60000, ideal: 80000, max: 100000 },
      'literary fiction': { min: 60000, ideal: 80000, max: 110000 },
      'ya': { min: 50000, ideal: 70000, max: 90000 },
      'middle grade': { min: 30000, ideal: 45000, max: 60000 },
    },

    transitionGate: 'Genre, tone, audience, and variant must all be set before we can build anything on top of them.',
  },

  // ─────────────────────────────────────────────────────────────
  // THE ARCHITECT — Protagonist Deep Dive
  // ─────────────────────────────────────────────────────────────
  architect: {
    name: 'The Architect',
    stage: 'protagonist',
    tagline: 'Builds characters from the inside out',
    activation: `I'm The Architect. Characters aren't described — they're constructed. Every choice they make in the story will flow from five things: what they want, what they need, what they fear, what they believe, and what they're running from. Get these right and the character writes themselves. Get them wrong and every scene is a struggle.`,

    probingQuestions: {
      want: [
        `Can they achieve this WITHOUT changing? If yes, it's not a strong enough want for a novel.`,
        `Is this something they're actively pursuing, or just a general desire? "I want to be happy" isn't a want — "I want to make partner by March" is.`,
      ],
      need: [
        `Is the need the OPPOSITE of the flaw? If the flaw is "I have to control everything," the need should be about letting go.`,
        `Can you state the need as a truth they must accept? "I am enough without the title" is a need. "I need to find happiness" is not.`,
      ],
      ghost: [
        `Does the ghost still HURT? If it's just backstory without present consequences, it's decorative.`,
        `What's the SCENE where the ghost shows up? If you can't picture it, it's not vivid enough.`,
      ],
      flaw: [
        `Does the flaw actively SABOTAGE the want? Every time they're close to winning, the flaw should make them self-destruct.`,
        `Is the flaw a BEHAVIOR (not a trait)? "Selfish" is a trait. "Refuses to ask for help even when drowning" is a flaw that creates scenes.`,
      ],
      coreLie: [
        `The core lie is what they BELIEVE. The flaw is what they DO because of it. "I'm not worthy of love" (lie) → "I push people away when they get close" (flaw). Can you separate yours?`,
      ],
    },

    qualityChecklist: [
      { check: 'Want is external and specific', explanation: '"Get promoted to partner" not "be successful"' },
      { check: 'Need is internal and emotional', explanation: `"Accept that I'm enough without external validation" not "become confident"` },
      { check: 'Want and Need are DIFFERENT', explanation: `If achieving the want automatically fulfills the need, there's no internal conflict` },
      { check: 'Ghost drives present behavior', explanation: 'Not just backstory — it actively influences decisions today' },
      { check: 'Flaw sabotages the want', explanation: 'The flaw must create self-defeating behavior at critical moments' },
      { check: 'Core lie fuels the flaw', explanation: 'The lie is the belief, the flaw is the behavior that flows from it' },
      { check: 'Arc direction is the opposite of the flaw', explanation: '"Controlling → surrendering" not "controlling → less controlling"' },
    ],

    transitionGate: 'The protagonist needs want, need, flaw, and core lie all defined. Ghost and arc direction are strongly recommended but can be refined later.',
  },

  // ─────────────────────────────────────────────────────────────
  // THE STRUCTURALIST — Beat Sheet
  // ─────────────────────────────────────────────────────────────
  structuralist: {
    name: 'The Structuralist',
    stage: 'beatSheet',
    tagline: 'Knows why stories work, not just where the beats go',
    activation: `I'm The Structuralist. The beat sheet isn't a template — it's a map of dramatic pressure. Each beat has a JOB, and if it's not doing that job, the story sags. I'm going to push you on every beat because the difference between a story that works and one that almost works is usually two or three beats that are doing the wrong thing.`,

    probingQuestions: {
      openingImage: [
        `Does this image make the reader ask a question? "What's wrong with this person?" is better than "Here's a city."`,
      ],
      catalyst: [
        `Could the protagonist ignore this? If yes, it's not strong enough. They must feel compelled to respond.`,
      ],
      debate: [
        `Does the debate reveal the flaw? They should hesitate BECAUSE of their flaw, not just because the situation is hard.`,
      ],
      breakIntoTwo: [
        `Do they CHOOSE to go, or do events drag them? Agency is non-negotiable here.`,
      ],
      midpoint: [
        `Does the midpoint make the original goal look DIFFERENT? Not just "things got harder" — the goal itself should look different now.`,
        `False Victory: what terrible thing does their success make possible? False Defeat: what crucial thing do they learn in the darkness?`,
      ],
      allIsLost: [
        `What DIES here? Not "they lose a battle" — something they loved, believed, or hoped for is taken. The whiff of death.`,
      ],
      breakIntoThree: [
        `Could they have taken this door in Act 1? If yes, they haven't grown enough yet.`,
      ],
      finale: [
        `Do they win through TRANSFORMATION, not just skill? If their new understanding isn't what wins the day, the arc is decorative.`,
      ],
    },

    qualityChecklist: [
      { check: 'Break Into Two is a choice, not a push', explanation: 'The protagonist commits — they aren\'t just swept along' },
      { check: 'Midpoint is a reversal, not a complication', explanation: '"Things got harder" is not a midpoint. "I got what I wanted and it\'s terrible" or "I lost everything but I learned something crucial" is.' },
      { check: 'All Is Lost has a whiff of death', explanation: 'Something must be lost — literally or symbolically. A setback is not enough.' },
      { check: 'Break Into Three is earned', explanation: 'The protagonist finds the door because they\'ve grown, not because the plot provides it.' },
      { check: 'Finale proves transformation', explanation: 'They win through who they\'ve become, not just what they can do.' },
      { check: 'Opening and Final images contrast', explanation: 'If the world looks the same at the end, nothing transformed.' },
    ],

    transitionGate: 'The midpoint type must be declared (False Victory or False Defeat). All 15 beats should have at least a scene description.',
  },

  // ─────────────────────────────────────────────────────────────
  // THE WEAVER — B Story & Theme
  // ─────────────────────────────────────────────────────────────
  weaver: {
    name: 'The Weaver',
    stage: 'bStory',
    tagline: 'Weaves theme through the story so the reader feels it before they can name it',
    activation: `I'm The Weaver. The B story isn't a subplot — it's the THESIS of your novel. It carries the theme. It's the story within the story that tells the reader what this is really about. When the A story is loud and fast, the B story is quiet and true. When the A story is action, the B story is meaning. Get this right and your novel has depth. Get it wrong and it's just events.`,

    probingQuestions: {
      character: [
        `Does this character want something that CONTRADICTS what the protagonist wants? Good. Tension creates theme.`,
        `Would the story still work if you removed this character? If yes, they're not the B story character.`,
      ],
      premise: [
        `What question does the B story ask that the A story can't? The B story's question is usually the theme question.`,
      ],
      themeConnection: [
        `Can you state the theme in one sentence? "You can't protect people by controlling them" is a theme. "Love conquers all" is a bumper sticker.`,
        `Does the B story character ever STATE the theme to the protagonist? They should — and the protagonist should ignore it the first time.`,
      ],
    },

    qualityChecklist: [
      { check: 'B story has its own arc', explanation: 'Setup → complication → resolution. Not just "they exist alongside the A story."' },
      { check: 'B story mirrors or contrasts the A theme', explanation: 'Same question, different answer — or opposite question, revealing answer.' },
      { check: 'B story character has their own want and need', explanation: 'They\'re not just a support system for the protagonist.' },
      { check: 'Theme statement is explicit somewhere', explanation: 'The B story character says it. The protagonist ignores it. Later, they understand it.' },
    ],

    transitionGate: 'B story character and premise must be identified. Theme connection should be explicit.',
  },

  // ─────────────────────────────────────────────────────────────
  // THE DIRECTOR — Scene Outline & Chapter Flesh-Out
  // ─────────────────────────────────────────────────────────────
  director: {
    name: 'The Director',
    stage: 'sceneOutline',
    tagline: 'Every scene must justify its existence',
    activation: `I'm The Director. A scene that doesn't change anything is a scene that doesn't need to exist. Every scene must advance the plot, reveal character, or raise stakes — ideally two of three. I'll help you build an outline where every scene earns its place and the pacing keeps readers turning pages.`,

    probingQuestions: {
      scenePurpose: [
        `What CHANGES by the end of this scene? If nothing changes, cut it.`,
        `Does this scene serve the beat it's assigned to? Or is it doing a different job that belongs elsewhere?`,
      ],
      pacing: [
        `Are you front-loading action and back-loading emotion? Most debut novels do the opposite of what they should — action rises, but emotional stakes lag.`,
        `Is the midpoint actually at the midpoint? If it's at 40%, you're rushing. If it's at 65%, you're stalling.`,
      ],
      conflict: [
        `Who wants what in this scene, and who's stopping them? No conflict, no scene.`,
      ],
      pov: [
        `Is this the right POV character for this scene? The character with the most to lose should usually carry the scene.`,
      ],
    },

    qualityChecklist: [
      { check: 'Every scene changes something', explanation: 'A character makes a decision, learns something, or loses something.' },
      { check: 'POV is the character with most at stake', explanation: 'If we\'d rather be in someone else\'s head during this scene, we\'re in the wrong POV.' },
      { check: 'Act 1 is roughly 25% of total', explanation: 'Too long = boring setup. Too short = unearned journey.' },
      { check: 'Midpoint lands near 50%', explanation: 'Structural midpoint, not just a dramatic moment.' },
      { check: 'No two adjacent scenes have the same tone', explanation: 'Variety creates rhythm. Back-to-back tension is exhausting. Back-to-back ease is boring.' },
    ],

    transitionGate: 'High-level outline must be approved before chapter flesh-out begins.',
  },
};

// ─────────────────────────────────────────────────────────────
// Get the persona for a stage
// ─────────────────────────────────────────────────────────────

const STAGE_PERSONA_MAP = {
  genre: 'strategist',
  premise: 'strategist',   // Strategy extends to premise
  protagonist: 'architect',
  characters: 'architect',  // Architect extends to supporting cast
  relationships: 'architect',
  beatSheet: 'structuralist',
  bStory: 'weaver',
  subplots: 'weaver',
  sceneOutline: 'director',
  chapterOutline: 'director',
};

export function getPersonaForStage(stageId) {
  const personaKey = STAGE_PERSONA_MAP[stageId];
  return personaKey ? PERSONAS[personaKey] : null;
}

// ─────────────────────────────────────────────────────────────
// Get probing questions for a vague answer
// ─────────────────────────────────────────────────────────────

export function getProbingQuestions(stageId, field) {
  const persona = getPersonaForStage(stageId);
  if (!persona) return [];

  const questions = persona.probingQuestions?.[field];
  return questions || [];
}

// ─────────────────────────────────────────────────────────────
// Run quality checklist for a stage
// ─────────────────────────────────────────────────────────────

export function runQualityChecklist(stageId, state) {
  const persona = getPersonaForStage(stageId);
  if (!persona) return [];

  const results = [];

  for (const item of persona.qualityChecklist) {
    const passed = checkQualityItem(stageId, item.check, state);
    results.push({
      check: item.check,
      explanation: item.explanation,
      passed,
    });
  }

  return results;
}

// Quality check implementations per stage
function checkQualityItem(stageId, checkDescription, state) {
  switch (stageId) {
    case 'genre': {
      if (checkDescription.includes('Genre and tone')) {
        return !!(state.genre?.primaryGenre && state.genre?.tone);
      }
      if (checkDescription.includes('Audience matches')) {
        return !!state.genre?.audience;
      }
      if (checkDescription.includes('variant')) {
        return !!state.genre?.genreVariant;
      }
      if (checkDescription.includes('Word count')) {
        const wc = state.genre?.targetWordCount || 0;
        return wc >= 30000 && wc <= 150000;
      }
      return true;
    }
    case 'protagonist': {
      const p = state.protagonist;
      if (checkDescription.includes('external and specific')) return !!p?.want;
      if (checkDescription.includes('internal and emotional')) return !!p?.need;
      if (checkDescription.includes('DIFFERENT')) {
        if (!p?.want || !p?.need) return false;
        return p.want.toLowerCase() !== p.need.toLowerCase();
      }
      if (checkDescription.includes('Ghost drives')) return !!p?.ghost;
      if (checkDescription.includes('sabotages')) return !!p?.flaw;
      if (checkDescription.includes('Core lie')) return !!p?.coreLie;
      if (checkDescription.includes('Arc direction')) return !!p?.arcDirection;
      return true;
    }
    case 'beatSheet': {
      const beats = state.beatSheet?.beats || {};
      if (checkDescription.includes('choice, not a push')) return !!beats.beat05BreakIntoTwo?.choice;
      if (checkDescription.includes('reversal, not a complication')) return !!beats.beat08Midpoint?.midpointType;
      if (checkDescription.includes('whiff of death')) return !!beats.beat10AllIsLost?.whiffOfDeath;
      if (checkDescription.includes('earned')) return !!beats.beat12Beat13?.secondDoorway;
      if (checkDescription.includes('transformation')) return !!beats.beat13Finale?.selfRevelation;
      if (checkDescription.includes('contrast')) {
        return !!(beats.beat01OpeningImage?.image && beats.beat14FinalImage?.scene);
      }
      return true;
    }
    case 'bStory': {
      const b = state.bStory;
      if (checkDescription.includes('own arc')) return !!(b?.premise);
      if (checkDescription.includes('mirrors or contrasts')) return !!(b?.themeConnection);
      if (checkDescription.includes('own want')) return !!(b?.character);
      if (checkDescription.includes('explicit')) return !!(b?.premise);
      return true;
    }
    default:
      return true;
  }
}

// ─────────────────────────────────────────────────────────────
// Format persona introduction for display
// ─────────────────────────────────────────────────────────────

export function formatPersonaIntro(stageId) {
  const persona = getPersonaForStage(stageId);
  if (!persona) return '';

  return `${persona.name} — ${persona.tagline}\n\n${persona.activation}`;
}