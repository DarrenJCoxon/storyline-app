// Narrative voice and Save the Cat knowledge for the novel writer harness
// This is the "brain" — it knows what makes stories work

export const SAVE_THE_CAT_BEATS = {
  beat01OpeningImage: {
    name: 'Opening Image',
    position: 'Act 1 / Setup',
    saveTheCatPurpose: 'A snapshot of your protagonist\'s world BEFORE their life is disrupted. Sets tone, mood, and the "before" state that Act 3 will contrast with.',
    whatToLookFor: 'Visual, specific, sets emotional tone. Is the protagonist in their "normal world" or already in the new one? Should contrast with final image.',
    commonMistakes: 'Starting too early (before the real story), starting too late (past the inciting incident), opening with action that has no emotional grounding.',
    imageRequirement: 'Must show character in a specific state — not just "a city" but "a city viewed from a cramped apartment window at 3am."',
  },
  beat02Setup: {
    name: 'Setup',
    position: 'Act 1 / Setup',
    saveTheCatPurpose: 'Introduce your protagonist\'s everyday world. Establish their flaw, their relationships, what they want. Theme is "hidden" here — not stated outright, but visible in how characters behave.',
    whatToLookFor: 'Who is the protagonist when nothing is happening? What do they believe about themselves and the world? Show the flaw in action, not stated.',
  },
  beat03Catalyst: {
    name: 'Catalyst',
    position: 'Act 1 / Setup',
    saveTheCatPurpose: 'The moment that disrupts the protagonist\'s world. Everything changes — they can\'t go back. Usually around page 12-15 in a 100-page Act 1.',
    whatToLookFor: 'Is this event truly life-changing for THIS protagonist? It should force them to make a decision, not just happen to them. Can be external (bomb goes off) or internal (health diagnosis).',
    commonMistakes: 'Catalyst is too small (they could just ignore it), or too big (they couldn\'t possibly respond). Must create a "hole" in their world they feel compelled to fill.',
  },
  beat04Debate: {
    name: 'Debate',
    position: 'Act 1 / Setup',
    saveTheCatPurpose: 'The protagonist asks "Should I go? Should I act? Can I win?" They hesitate, prepare, doubt. This is where the story question is crystallized — what are they really after?',
    whatToLookFor: 'Does the protagonist show their flaw through their hesitation? Are there multiple possible paths shown? The debate should reveal what they WANT vs. what they NEED.',
    commonMistakes: 'Debate is just planning with no internal conflict. The character already knows what to do — no real doubt means no real stakes.',
  },
  beat05BreakIntoTwo: {
    name: 'Break Into Two',
    position: 'Transition to Act 2',
    saveTheCatPurpose: 'The protagonist COMMITs to the journey. They cross the threshold — "into the new world." This is a conscious choice, not an accident.',
    whatToLookFor: 'Is this a real choice with real consequences? Not just "they get kidnapped" — they must choose to stay or fight. The break should reveal their want (surface goal).',
    genreVariants: {
      standard: 'Physical departure from ordinary world',
      puppyLove: 'First real romantic encounter commits them',
      buddy: 'Buddy assigns mission or they commit together',
      whydunit: 'Protagonist decides to investigate despite danger',
      outOfTheBox: 'New idea/belief system commits them to different path',
    },
    commonMistakes: 'The break is forced on them (no agency), break happens before they\'ve debated (not ready), break doesn\'t reveal what they want.',
  },
  beat06BStory: {
    name: 'B Story',
    position: 'Act 2 / Response',
    saveTheCatPurpose: 'The "thesis" story begins — often a love story, mentorship, or buddy dynamic. This carries the theme. The B story often introduces the theme statement explicitly ("you can\'t help others until you help yourself").',
    whatToLookFor: 'Does B story character have their own want/need that mirrors protagonist\'s? Does the meeting feel organic — not just "here is your mentor"? Does the B story beat appear even when the A plot is quiet?',
    commonMistakes: 'B story is just a subplot with no thematic connection. B story doesn\'t start until late Act 2. B story character has no arc of their own.',
  },
  beat07FunAndGames: {
    name: 'Fun and Games',
    position: 'Act 2 / Response',
    saveTheCatPurpose: 'This is the "promise of the premise" — the movie you were sold. The reason an audience bought a ticket. Every scene here explores what this story is really about.',
    whatToLookFor: 'Are you delivering on the promise of your logline? Each scene should explore a different angle of the central conflict. Vary the tone — not all scenes same intensity.',
    commonMistakes: 'Playing it safe — scenes are all similar intensity. Not exploring the full breadth of what your premise offers. Forgetting the protagonist\'s flaw affects every scene.',
    pacingNote: 'This section should feel like you\'re having fun — the protagonist is achieving their want, but every win reveals the flaw more.',
  },
  beat08Midpoint: {
    name: 'Midpoint',
    position: 'Act 2 / Response → Confrontation',
    saveTheCatPurpose: 'False victory OR false defeat. The story escalates — stakes raised, the antagonist reveals their true power, the protagonist moves from reactive to proactive. This is the story\'s peak before the fall.',
    midpointTypes: {
      falseVictory: 'The protagonist achieves their want but discovers it creates a new, worse problem. They got what they thought they wanted — and it\'s terrible.',
      falseDefeat: 'Things look catastrophic for the protagonist. They\'ve lost everything. But in the darkness they learn something crucial that changes everything.',
    },
    whatToLookFor: 'Does this actually flip the story? Not just "things got harder" — does the midpoint make the original goal look different? Does it force the protagonist to confront their flaw directly?',
    stakesRaise: 'What was the cost before the midpoint? What is the cost after? The gap should be significant.',
    commonMistakes: 'Midpoint is just a complication, not a true inversion. Midpoint happens too early or too late (should be around page 50-55). Protagonist remains reactive — not yet driving.',
  },
  beat09BadGuysCloseIn: {
    name: 'Bad Guys Close In',
    position: 'Act 2 / Confrontation',
    saveTheCatPurpose: 'External pressures mount while the protagonist deals with the fallout of the midpoint. The antagonist gains ground. Internal doubt grows. Everything that can go wrong does.',
    whatToLookFor: 'Are the pressures specific to this story (not generic)? Do external failures mirror internal flaw? Does the protagonist have moments of trying and failing?',
    commonMistakes: 'Pressures are all external with no internal component. The antagonist is the only threat — the protagonist\'s flaw should also be "attacking" them.',
  },
  beat10AllIsLost: {
    name: 'All Is Lost',
    position: 'Transition',
    saveTheCatPurpose: 'The moment right before the protagonist\'s lowest point. Usually involves a death, defeat, or revelation that removes the last hope. The "whiff of death" — something or someone the protagonist loved is taken.',
    whiffOfDeath: 'The symbolic or literal death of something precious — a relationship, an idea, a person, hope. This is the trigger for the Dark Night of the Soul.',
    whatToLookFor: 'Is there a genuine loss? Does it feel earned — connected to the protagonist\'s flaw or the antagonist\'s victory? Does this create the despair needed for the transformation to come?',
    darkNightOfSoul: 'The emotional aftermath of All Is Lost — the protagonist confronts their flaw head-on and despairs. They are at their lowest.',
    commonMistakes: 'All Is Lost is just a setback, not a devastation. The "death" feels cheap. The protagonist bounces back too quickly.',
  },
  beat11BlackMoment: {
    name: 'Black Moment',
    position: 'Act 3 / Confrontation',
    saveTheCatPurpose: 'The protagonist has hit bottom. They have genuinely lost. Everything looks darkest here. The protagonist is almost ready to quit — but something (the B story, a memory, a person) gives them one last reason to try.',
    whatToLookFor: 'Is this truly the lowest point — beyond the midpoint, beyond All Is Lost? Does the protagonist face their core lie directly? Is there a "spark" that prevents this from being purely hopeless?',
    commonMistakes: 'Black moment is less dark than All Is Lost (ordering problem). The protagonist has no reason to continue — the turn feels unearned.',
  },
  beat12Beat13: {
    name: 'Break Into Three',
    position: 'Transition to Act 3',
    saveTheCatPurpose: 'The "second doorway" — the protagonist finds the solution. Not through luck but through what they\'ve learned. They choose to fight not because they have to, but because they\'ve changed.',
    secondDoorway: 'Must be earned through the protagonist\'s own growth. They couldn\'t have taken this door in Act 1 — they\'ve become someone different.',
    forcedReexamination: 'The protagonist must look at their flaw and choose — do they cling to the core lie, or step into the truth?',
    whatToLookFor: 'Is the solution connected to the theme? Does the protagonist\'s transformation make this choice possible? Is this a real commitment, not a lucky break?',
    commonMistakes: 'The second doorway is given to them (deus ex machina). The protagonist hasn\'t actually changed — they\'re the same person who started.',
  },
  beat13Finale: {
    name: 'Finale',
    position: 'Act 3 / Confrontation',
    saveTheCatPurpose: 'The protagonist proves they have changed. The climax tests everything — external battle and internal revelation happen together. The flaw is finally overcome. The need is finally met.',
    climaxTypes: {
      externalBattle: 'Physical confrontation with antagonist — protagonist uses new understanding to win',
      internalRevelation: 'The protagonist chooses correctly because they\'ve grown — this IS the battle',
      bothSimultaneous: 'The external fight IS the internal revelation — winning requires the change',
    },
    selfRevelation: 'The moment the protagonist truly understands what they\'ve learned. Not just "I won" but "I understand what I became."',
    newEquilibrium: 'The "after" image — the world is different now, and the protagonist fits differently in it.',
    whatToLookFor: 'Does the protagonist use their transformation to win (not just their skills)? Is the flaw genuinely overcome — not temporarily managed? Does the ending feel inevitable and earned?',
    commonMistakes: 'Protagonist wins through skill alone, no internal change required. The antagonist is defeated but the protagonist hasn\'t changed. The ending is ambiguous about whether the flaw is resolved.',
  },
  beat14FinalImage: {
    name: 'Final Image',
    position: 'End',
    saveTheCatPurpose: 'A mirror or inversion of the Opening Image. Proof that the protagonist (and their world) has fundamentally changed. The "after" state.',
    whatToLookFor: 'Is the contrast specific and visible? Not just "they\'re in a different city" but "they\'re sitting in that same apartment window, but now with light coming in." Does the image contain the theme?',
    commonMistakes: 'Final image is just "everything is fine now." No visible change from the opening. Forgetting to include the protagonist — they should be the subject.',
  },
  beat15EndCredits: {
    name: 'End Credits / Final Note',
    position: 'After',
    saveTheCatPurpose: 'For novels: a final beat that says "and then they lived." Shows the new equilibrium. For film: credits roll over images of new status quo.',
    whatToLookFor: 'Is the character shown living in their new state? Does this beat confirm the change has stuck? Is it short, satisfying, not over-explained?',
  },
};

export const GENRE_VARIANTS = {
  standard: {
    name: 'Standard',
    description: 'Classic three-act structure with external antagonist and clear victory/defeat',
    keyBeats: 'Standard 15-beat sheet applies',
  },
  puppyLove: {
    name: 'Puppy Love',
    description: 'The love story IS the story. Fun and Games = romantic escalation. All Is Lost = relationship betrayal.',
    keyBeats: 'B story becomes equal to A. Midpoint = romantic commitment or betrayal. Finale = they choose each other.',
    adaptations: {
      beat07: 'Promise of Premise = watching them fall in love, not just fighting the antagonist',
      beat10: 'Whiff of Death = the relationship breaks, not just a physical loss',
    },
  },
  buddy: {
    name: 'Buddy Love',
    description: 'Two characters on a journey together. The relationship change IS the story. B story = A story.',
    keyBeats: 'Protagonist and buddy transform together. Both must change. One cannot complete the journey alone.',
    adaptations: {
      beat06: 'B story IS the A story — the buddy dynamic carries the theme',
      beat12: 'Both characters must choose to fight — not just protagonist',
    },
  },
  whydunit: {
    name: 'Whydunit',
    description: 'Investigation story. The "who" or "why" drives the plot. Fun and Games = gathering clues, eliminating suspects.',
    keyBeats: 'Debate = false solutions, not internal doubt. Midpoint = major revelation (not false victory). All Is Lost = wrong suspect or truth is worse than mystery.',
    adaptations: {
      beat04: 'Protagonist proposes theory, gathers evidence, eliminates false solutions',
      beat08: 'False victory = they think they\'ve solved it, but it\'s wrong / they\'ve made it worse',
      beat10: 'Discovery that the truth is far worse than the mystery — not just "they were wrong"',
    },
  },
  foolAgain: {
    name: 'Fool Again',
    description: 'Comedy where the protagonist keeps making the same mistake. Character-driven humor through repeated flaw.',
    keyBeats: 'All Is Lost = comedic humiliation that forces self-awareness. Dark Night = genuine despair beneath the comedy.',
    adaptations: {
      beat10: 'Whiff of Death = comedic but genuinely painful humiliation — "I can\'t keep doing this"',
      beat11: 'Black Moment = the humor drops away and they confront the real pain beneath',
      beat13: 'Finale = they finally break the pattern, but it\'s both funny and moving',
    },
  },
  outOfTheBox: {
    name: 'Out of the Box',
    description: 'The antagonist is an idea, belief system, or institutional force. Protagonist must change their thinking.',
    keyBeats: 'The world is the antagonist. Debate = examining the belief. Midpoint = the belief is wrong — now what?',
    adaptations: {
      beat01: 'Opening Image should show the belief system in action — protagonist\'s "normal" IS the problem',
      beat12: 'The second doorway = a new way of thinking, not a new plan',
      beat13: 'The climax is won by the protagonist demonstrating the new belief, not defeating a person',
    },
  },
  traps: {
    name: 'Traps',
    description: 'Protagonist is caught in a system or web. False victory at midpoint — things seem won, they are actually deeper.',
    keyBeats: 'Midpoint = they think they\'ve won but they\'ve made it worse. All Is Lost = trapped with no way out.',
    adaptations: {
      beat08: 'False Victory is the classic trap — they get what they want but it\'s a trap',
      beat13: 'Must escape through cleverness, not force — their growth is their weapon',
    },
  },
  goldenFleece: {
    name: 'Golden Fleece',
    description: 'Journey-based story. Protagonist and team go on a quest. Each destination teaches something.',
    keyBeats: 'Each "Fun and Games" scene = a new destination with its own lesson. B story = the real treasure.',
    adaptations: {
      beat07: 'Promise of Premise = the journey itself — each stop teaches something new',
      beat13: 'The true treasure (what they needed) was the growth, not the external goal',
    },
  },
  institutionalized: {
    name: 'Institutionalized',
    description: 'Social system or institution is the antagonist. Protagonist fights to change the system.',
    keyBeats: 'The system is everywhere. Fun and Games = trying to work within it and failing.',
    adaptations: {
      beat01: 'Opening Image shows the institution\'s power over the protagonist',
      beat09: 'The system closes ranks — every victory is met with greater institutional resistance',
      beat13: 'The system is changed — but does it stay changed? Is the victory permanent?',
    },
  },
  superhero: {
    name: 'Superhero',
    description: 'Protagonist has extraordinary abilities. Their power IS their flaw — it enables their core lie.',
    keyBeats: 'The flaw is tied to the power. Fun and Games = using power, but each use deepens the flaw. Midpoint = power fails or costs too much.',
    adaptations: {
      beat01: 'Opening Image shows power as a gift, not yet as a problem',
      beat07: 'Power solves external problems but creates internal ones — the more they use it, the more the flaw takes hold',
      beat13: 'The protagonist must win through restraint or sacrifice, not through greater power',
    },
  },
};

export const CHARACTER_REQUIREMENTS = {
  want: {
    description: 'The EXTERNAL, TANGIBLE goal — what they\'re actively chasing. Must be describable in one specific sentence.',
    examples: '"Get promoted to partner" / "Find my missing daughter" / "Win the championship"',
    redFlag: 'If want can be achieved without the protagonist changing internally, it\'s probably not enough.',
  },
  need: {
    description: 'The INTERNAL, EMOTIONAL truth — what they must learn or accept. The hole in their heart that nothing external can fill.',
    examples: '"Accept that I\'m enough without the title" / "Forgive myself for the accident" / "Choose love over safety"',
    redFlag: 'If the need is just "be happy" or "win" — it\'s not specific enough. Need is always the flip side of the flaw.',
  },
  ghost: {
    description: 'The PAST WOUND — the thing that happened that created the flaw. Usually a person, a loss, a betrayal. The ghost is what they\'re running from.',
    examples: '"His father left and he learned to never trust anyone" / "She was fired for trusting someone once, now she trusts no one"',
    redFlag: 'The ghost must actively influence the present — it\'s not just backstory, it\'s why they can\'t change.',
  },
  flaw: {
    description: 'The SELF-DECEPTION — the false belief they tell themselves that blocks them from getting what they need. The lie that feels true.',
    examples: '"If I\'m perfect, people can\'t leave me" / "I have to do everything myself or it won\'t be right" / "I don\'t deserve good things"',
    redFlag: 'The flaw must actively sabotage the want — every time they\'re close to winning, the flaw makes them self-destruct.',
  },
  coreLie: {
    description: 'The core lie is what they BELIEVE about themselves because of the ghost. The flaw and the core lie are connected: the flaw is the BEHAVIOR that stems from the core lie.',
    examples: '"I\'m not worthy of love" → flaw = pushing people away when they get close',
    examples: '"The world is dangerous and I must control everything" → flaw = micromanaging and isolating',
    redFlag: 'When the protagonist finally confronts the core lie and sees it\'s false, that\'s the transformation. The need is the truth that replaces the lie.',
  },
  arcDirection: {
    description: 'How does the protagonist change? From what to what? This is the emotional journey in one phrase.',
    examples: '"Cold and closed → open and trusting" / "Insecure and seeking approval → secure and self-validating" / "Controlling → surrendering"',
    redFlag: 'The arc direction must be the DIRECT opposite of the flaw — if the flaw is "pushing people away," the arc is "learning to let people in."',
  },
};

export function critiqueBeat(beatId, beatData, protagonist, genreVariant = 'standard') {
  const issues = [];
  const beat = SAVE_THE_CAT_BEATS[beatId];
  if (!beat) return issues;

  if (!beatData?.scene) {
    issues.push({ severity: 'error', message: `${beat.name} is empty — this beat needs a scene.` });
  }

  // Beat-specific validations
  if (beatId === 'beat01OpeningImage') {
    if (beatData?.image && !beatData.image.includes('[')) {
      // Check for specificity — simple noun is not enough
    }
    if (beatData?.scene && protagonist?.flaw && !beatData.scene.toLowerCase().includes(protagonist.name?.toLowerCase())) {
      issues.push({ severity: 'warning', message: 'Opening image doesn\'t hint at the protagonist\'s flaw — consider showing the flaw in action.' });
    }
  }

  if (beatId === 'beat04Debate') {
    if (!beatData?.debateQuestion) {
      issues.push({ severity: 'error', message: 'Debate beat needs a debate question — what is your protagonist actually debating?' });
    }
    if (beatData?.scene && !beatData.scene.toLowerCase().includes('?')) {
      issues.push({ severity: 'warning', message: 'Debate beat should show the protagonist questioning their path — make sure doubt is visible.' });
    }
  }

  if (beatId === 'beat08Midpoint') {
    if (!beatData?.midpointType) {
      issues.push({ severity: 'error', message: 'Midpoint must be marked as False Victory or False Defeat.' });
    }
    if (beatData?.midpointType === 'falseVictory' && !beatData?.flipOrReveal) {
      issues.push({ severity: 'warning', message: 'False Victory midpoint: what new problem does the protagonist create by succeeding?' });
    }
    if (beatData?.midpointType === 'falseDefeat' && !beatData?.stakesRaise) {
      issues.push({ severity: 'warning', message: 'False Defeat midpoint: what crucial information does the protagonist learn in their darkest hour?' });
    }
  }

  if (beatId === 'beat10AllIsLost') {
    if (!beatData?.whiffOfDeath) {
      issues.push({ severity: 'error', message: 'All Is Lost needs a "whiff of death" — what is lost at this moment? (Could be literal death, or a relationship, hope, belief)' });
    }
  }

  return issues;
}

export function critiqueProtagonist(protagonist) {
  const issues = [];

  if (!protagonist?.want) issues.push({ severity: 'error', field: 'want', message: 'Protagonist needs a want — what are they actively chasing?' });
  if (!protagonist?.need) issues.push({ severity: 'error', field: 'need', message: 'Protagonist needs a need — what emotional truth must they learn?' });
  if (!protagonist?.flaw) issues.push({ severity: 'error', field: 'flaw', message: 'Protagonist needs a flaw — what self-deception blocks them?' });
  if (!protagonist?.ghost) issues.push({ severity: 'warning', field: 'ghost', message: 'Protagonist\'s ghost (past wound) is empty — this often makes the arc feel unanchored.' });

  // Check want/need alignment
  if (protagonist?.want && protagonist?.need) {
    const wantWords = protagonist.want.toLowerCase();
    const needWords = protagonist.need.toLowerCase();
    // They should NOT be the same thing
    if (wantWords === needWords || wantWords.includes(needWords)) {
      issues.push({ severity: 'error', field: 'want/need', message: 'Want and Need seem to be the same thing — the protagonist must want something external but need something internal.' });
    }
  }

  // Check flaw/arc alignment
  if (protagonist?.flaw && protagonist?.arcDirection) {
    if (!protagonist.arcDirection.toLowerCase().includes('not') && !protagonist.arcDirection.toLowerCase().includes('open') && !protagonist.arcDirection.toLowerCase().includes('let')) {
      // Basic check — could be improved
    }
  }

  return issues;
}