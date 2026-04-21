// Stage Conversation Guides — structured data for each planning stage
// Used by the /storyline skill to conduct the planning conversation through Claude Code
// No inquirer.js — just data that the skill reads and uses naturally

import { GENRE_VARIANTS } from './narrative-voice.js';

export const STAGE_GUIDES = {
  genre: {
    id: 'genre',
    name: 'Genre & Foundations',
    persona: 'strategist',
    opening: `Let's talk about your story.\n\nI'm going to ask you a few simple questions. Answer in any way that feels natural — we'll dig deeper as we go.`,
    questions: [
      {
        key: 'primaryGenre',
        label: 'What genre is your novel?',
        hint: 'Just tell me in your own words — Thriller, Fantasy, Romance, or whatever fits',
        required: true,
      },
      {
        key: 'subGenre',
        label: 'Any sub-genre or specific flavor?',
        hint: 'e.g. "Psychological thriller", "cozy fantasy", "romantic suspense" — or skip if unsure',
        required: false,
      },
      {
        key: 'audience',
        label: 'Who is this for? Who will want to read it?',
        hint: '"Adults who love thrillers", "YA readers", "people who want a fun beach read"',
        required: true,
      },
      {
        key: 'tone',
        label: "What's the mood? What should a reader expect from the experience?",
        hint: '"dark and tense", "uplifting with humor", "contemplative and literary"',
        required: true,
      },
      {
        key: 'targetWordCount',
        label: 'How long do you want this novel to be?',
        hint: '"around 80k", "short and tight", "epic at 120k" — rough idea is fine',
        type: 'number',
        required: true,
      },
      {
        key: 'genreVariant',
        label: 'Save the Cat has story types — does one fit your story?',
        hint: 'Standard (most stories), Puppy Love (romance-driven), Buddy Love (two leads), Whydunit (investigation), Fool Again (comedic), Out of the Box (idea vs system), Traps (escaping a web), Golden Fleece (journey), Institutionalized (fighting a system), Superhero (power with a flaw)',
        type: 'variant',
        required: true,
        variantOptions: Object.entries(GENRE_VARIANTS).map(([key, v]) => ({
          key,
          name: v.name,
          description: v.description,
        })),
      },
    ],
    wordCountGuidance: {
      thriller: { min: 70000, ideal: 85000, max: 100000 },
      mystery: { min: 65000, ideal: 80000, max: 95000 },
      romance: { min: 55000, ideal: 75000, max: 100000 },
      fantasy: { min: 80000, ideal: 100000, max: 130000 },
      'sci-fi': { min: 70000, ideal: 90000, max: 120000 },
      'science fiction': { min: 70000, ideal: 90000, max: 120000 },
      horror: { min: 60000, ideal: 80000, max: 100000 },
      'literary fiction': { min: 60000, ideal: 80000, max: 110000 },
      'literary': { min: 60000, ideal: 80000, max: 110000 },
      ya: { min: 50000, ideal: 70000, max: 90000 },
      'young adult': { min: 50000, ideal: 70000, max: 90000 },
      'middle grade': { min: 30000, ideal: 45000, max: 60000 },
    },
    summary: [
      { label: 'Primary', key: 'primaryGenre' },
      { label: 'Sub-genre', key: 'subGenre' },
      { label: 'Audience', key: 'audience' },
      { label: 'Tone', key: 'tone' },
      { label: 'Words', key: 'targetWordCount' },
      { label: 'Variant', key: 'genreVariant' },
    ],
    transition: 'Ready to talk about your story seed?',
  },

  premise: {
    id: 'premise',
    name: 'Story Seed & Premise',
    persona: 'strategist',
    opening: `Tell me about the story burning in your head. No structure yet — just the raw material.\n\nWhat excites you? What made you think "this is a story I have to write"?`,
    questions: [
      {
        key: 'rawLogline',
        label: 'Describe your story in your own words — anything that comes to mind',
        hint: 'Free-form brainstorm. No wrong answers.',
        type: 'multiline',
        required: true,
      },
      {
        key: 'conceptHook',
        label: 'What is the ONE thing that makes this story compelling?',
        hint: 'If you had to pitch this to someone in 30 seconds, what would you say?',
        required: true,
      },
    ],
    seriesDetection: true,
    seriesQuestions: [
      { key: 'seriesTitle', label: 'Working title for the series' },
      { key: 'bookCount', label: 'How many books do you envision in total?', type: 'number', default: 3 },
      { key: 'currentBookNumber', label: 'Which book is this project? (Usually 1 — you plan book 1 first)', type: 'number', default: 1 },
      { key: 'overallArc', label: 'What is the overall arc across all books?' },
      { key: 'firstBookFocus', label: 'What is Book 1 specifically about (within the bigger arc)?' },
    ],
    seriesSaveNote: 'Save this data under premise.seriesContext with isSeries: true. Field keys match one-for-one.',
    transition: 'Ready to build your protagonist?',
  },

  protagonist: {
    id: 'protagonist',
    name: 'Protagonist Deep Dive',
    persona: 'architect',
    opening: `Character-first. Always. Characters with needs drive narratives — everything else serves them.\n\nLet's build someone worth following through a 300-page journey.`,
    sections: [
      {
        title: 'Basics',
        questions: [
          { key: 'name', label: "What is your protagonist's name?", required: true },
          { key: 'age', label: 'Age', required: false },
          { key: 'occupation', label: 'Occupation (or role if not working)', required: false },
        ],
      },
      {
        title: 'The Inner Engine (do this FIRST — everything else flows from here)',
        intro: `In Save the Cat, the character's inner life is the primary engine — the plot and the ordinary world exist to dramatise it. Get these right and every external detail writes itself. Get them wrong and you'll retrofit the story later.\n\nWe work from the inside out: wound → lie → flaw → want → need. Start with what happened BEFORE page 1.`,
        questions: [
          {
            key: 'ghost',
            label: 'GHOST / WOUND — What happened before the story starts that broke something in them?',
            hint: 'The single most important question in the whole planning process. Usually a loss, a betrayal, an absent/failed parent, a moment of shame. "His father abandoned the family" / "She was fired for trusting someone" / "His mother died when he was eight."',
            required: true,
            validate: 'We need the wound — what happened to them before page 1?',
          },
          {
            key: 'coreLie',
            label: 'CORE LIE — What did the wound teach them to believe about themselves or the world?',
            hint: 'The line they tell themselves every day without realising it. "I\'m not enough." "Love leaves." "I have to do it alone." "Being different is wrong." The lie is what the ending will dismantle.',
            required: true,
            validate: 'Give me the false belief the wound planted — what do they believe that isn\'t true?',
          },
          {
            key: 'flaw',
            label: 'FLAW — How does the lie show up in their behaviour?',
            hint: 'The self-sabotaging pattern the lie produces. Lie = "I\'m not worthy of love" → Flaw = "I push people away when they get close." Lie = "I have to do it alone" → Flaw = "I refuse help even when drowning."',
            required: true,
            validate: 'Give me the behaviour the lie produces — what do they DO because of the lie?',
          },
          {
            key: 'want',
            label: 'WANT — What does your protagonist think they want? (external, conscious, often wrong)',
            hint: 'The TANGIBLE thing they\'d tell you if you asked. Usually wrong or incomplete — it\'s what they think will fix the wound, but it won\'t. "Get promoted to partner" / "Find her missing daughter" / "Win the championship."',
            required: true,
            validate: 'Must be at least 10 characters — what exactly are they chasing on the surface?',
          },
          {
            key: 'need',
            label: 'NEED — What must they actually learn or accept to be whole? (internal, true, they don\'t know it yet)',
            hint: 'The INTANGIBLE thing. The flip side of the flaw — if the flaw is pushing people away, the need is letting people in. The plot\'s job is to force them to confront this. "Accept that I\'m enough without the title" / "Forgive myself" / "Choose love over safety."',
            required: true,
            validate: 'Must be at least 10 characters — what emotional truth must they learn?',
            crossCheck: { with: 'want', message: 'WANT and NEED seem very similar. The protagonist must want something EXTERNAL but need something INTERNAL — the gap between them is the arc.' },
          },
        ],
      },
      {
        title: 'Ordinary World (now that we know the wound — show us the wound in action)',
        intro: `Now that we know the wound, lie, flaw, want and need, the ordinary day becomes easy. Every detail should dramatise the inner engine we just built — we're not inventing random daily life, we're showing the flaw in motion, the lie operating, the want being chased.`,
        questions: [
          {
            key: 'dailyLife',
            label: 'Show me their ordinary world — a day that dramatises the wound and the flaw.',
            hint: "Not just where they live, but how they live. What small patterns reveal the lie? Where does the flaw show up? What does chasing the want look like, moment to moment, before the story disrupts everything?",
            type: 'multiline',
            required: false,
          },
        ],
      },
      {
        title: 'Arc & Voice',
        questions: [
          {
            key: 'arcDirection',
            label: 'How does your protagonist change across the story?',
            hint: '"Cold and closed → open and trusting" / "Insecure → self-validating" / "Controlling → surrendering"',
            required: true,
            validate: 'Give me the arc — from what to what?',
          },
          {
            key: 'voice',
            label: 'Describe their voice or speech patterns',
            hint: 'Speech patterns, vocabulary, verbal quirks. How do they think?',
            required: false,
          },
        ],
      },
    ],
    transition: 'Ready to build the supporting cast?',
  },

  characters: {
    id: 'characters',
    name: 'Supporting Cast',
    persona: 'architect',
    opening: `Who are the key people in your protagonist's world?\n\nWe'll do up to 6 major characters — each gets their own want/need/flaw mini-arc.`,
    repeatable: {
      max: 6,
      itemLabel: 'Character',
      fields: [
        { key: 'name', label: 'Character name', required: true },
        { key: 'role', label: 'What is their role?', hint: 'Antagonist, Love Interest, Mentor, Buddy, Skeptic — or describe their function', required: true },
        { key: 'want', label: 'What do they WANT? (external goal)', required: false },
        { key: 'need', label: 'What do they NEED? (internal/emotional)', required: false },
        { key: 'flaw', label: 'What is their FLAW? (self-deception)', required: false },
        { key: 'ghost', label: 'What is their GHOST? (past wound — optional)', required: false },
        { key: 'relationshipToProtagonist', label: 'How do they relate to the protagonist?', required: false },
        { key: 'arcSummary', label: 'How do THEY change across the story? (one line)', required: false },
        { key: 'meetsProtagonistAt', label: 'When do they enter the story?', hint: 'e.g. "Beat 3 - Catalyst", "Opening Scene"', required: false },
      ],
    },
    transition: 'Ready to map the relationship web?',
  },

  relationships: {
    id: 'relationships',
    name: 'Relationship Web',
    persona: 'architect',
    opening: `How do these characters connect, conflict, and drive each other?\n\nEvery relationship needs tension — mutual want that clashes, or opposing needs that create drama.`,
    repeatable: {
      max: 20,
      itemLabel: 'Relationship',
      fields: [
        { key: 'characterA', label: 'Character 1', required: true },
        { key: 'characterB', label: 'Character 2', required: true },
        { key: 'connection', label: 'How are they connected?', hint: 'Relationship type + nature. e.g. "mentor and student — he trained her for five years", "estranged siblings", "rivals turned reluctant allies"', required: true },
        { key: 'conflict', label: 'What is the tension between them?', required: false },
        { key: 'whatTheyWantFromEachOther', label: 'What do they want FROM each other? (Mutual desire or opposing pulls)', required: false },
      ],
    },
    transition: 'Ready to refine the logline?',
  },

  logline: {
    id: 'logline',
    name: 'Logline Refinement',
    persona: 'strategist',
    opening: `Now that we know the characters, let's sharpen the logline.\n\nA great logline has four parts: Setup, Inciting Incident, Stakes, and a hint of Resolution.`,
    questions: [
      { key: 'sentence', label: 'The full logline in one sentence', hint: '"When [protagonist] [inciting incident], they must [action] or [stakes]."', required: true },
      { key: 'setup', label: 'Setup — who is the protagonist and what is their world?', required: false },
      { key: 'incitingIncident', label: 'Inciting Incident — what disrupts their world?', required: true },
      { key: 'stakes', label: 'Stakes — what do they stand to lose?', required: true },
      { key: 'resolutionHint', label: 'Resolution hint — how might it end? (not spoiled)', required: false },
      { key: 'antagonistQuestion', label: 'Who or what opposes them?', required: false },
    ],
    transition: 'Ready to build the beat sheet?',
  },

  beatSheet: {
    id: 'beatSheet',
    name: 'Beat Sheet',
    persona: 'structuralist',
    opening: `The beat sheet isn't a template — it's a map of dramatic pressure. Each beat has a JOB, and if it's not doing that job, the story sags.\n\nWe'll go through each beat. Some we'll do in detail, some faster if the story is clear.`,
    beats: [
      {
        id: 'beat01OpeningImage',
        name: 'Beat 1: Opening Image',
        position: 'Act 1 / Setup',
        purpose: 'A snapshot of the protagonist\'s world BEFORE disruption. Sets tone, mood, and the "before" state.',
        questions: [
          { key: 'image', label: 'Describe the opening image (specific, visual, shows character in their "before" state)' },
          { key: 'scene', label: 'Where/when does it take place?' },
          { key: 'notes', label: 'Any notes about what this image must set up for later?' },
        ],
        contrastNote: 'The contrast with the Final Image gets captured on Beat 14. No need to anticipate here.',
      },
      {
        id: 'beat02Setup',
        name: 'Beat 2: Setup',
        position: 'Act 1 / Setup',
        purpose: 'Introduce everyday world. Establish flaw in action. Theme is "hidden" here.',
        questions: [
          { key: 'themeStated', label: 'How is the theme visible (but not stated) in their ordinary world?' },
          { key: 'scene', label: 'Key details about their ordinary world that must be established' },
        ],
      },
      {
        id: 'beat03Catalyst',
        name: 'Beat 3: Catalyst',
        position: 'Act 1 / Setup',
        purpose: 'The moment that disrupts everything. Forces the protagonist to make a decision.',
        questions: [
          { key: 'scene', label: 'What is the catalyst? (Be specific — this changes everything)' },
          { key: 'notes', label: 'When does it happen? (Approximate story position)' },
        ],
      },
      {
        id: 'beat04Debate',
        name: 'Beat 4: Debate',
        position: 'Act 1 / Setup',
        purpose: 'Protagonist asks "Should I go? Should I act?" Shows their flaw through hesitation.',
        questions: [
          { key: 'debateQuestion', label: 'What is the protagonist debating? What\'s the core question?' },
          { key: 'scene', label: 'How does the flaw show up in this debate? (What are they avoiding because of the ghost?)' },
        ],
      },
      {
        id: 'beat05BreakIntoTwo',
        name: 'Beat 5: Break Into Two',
        position: 'Transition to Act 2',
        purpose: 'Protagonist COMMITS. They cross the threshold. This is a real CHOICE.',
        questions: [
          { key: 'scene', label: 'Describe the break — what is the threshold they cross?' },
          { key: 'threshold', label: 'What is the CHOICE they make to cross the threshold? (Not "things happen to them" — they choose)' },
          { key: 'falseReality', label: 'What is the "false reality" — what do they think the new world will be like?' },
        ],
      },
      {
        id: 'beat06BStory',
        name: 'Beat 6: B Story',
        position: 'Act 2 / Response',
        purpose: 'Often a love story, mentor, or buddy dynamic. This carries the THEME.',
        questions: [
          { key: 'scene', label: 'Who is the B story character and how are they introduced?' },
          { key: 'bStoryIntro', label: 'What is the B story about? (What theme does it explore?)' },
          { key: 'themeConnection', label: 'What is the THEME STATEMENT, often voiced by the B story character?' },
        ],
      },
      {
        id: 'beat07FunAndGames',
        name: 'Beat 7: Fun and Games',
        position: 'Act 2 / Response',
        purpose: 'This is the PROMISE OF THE PREMISE. The movie you were sold.',
        questions: [
          { key: 'promiseOfPremise', label: 'What is the promise of your premise?' },
          { key: 'scene', label: 'Key Fun and Games scenes? (List 2-3 major moments)' },
        ],
      },
      {
        id: 'beat08Midpoint',
        name: 'Beat 8: Midpoint',
        position: 'Act 2 / Response → Confrontation',
        purpose: 'FALSE VICTORY or FALSE DEFEAT. Stakes raised. Protagonist moves from reactive to proactive.',
        questions: [
          { key: 'midpointType', label: 'What type of midpoint?', hint: '"False Victory: they get what they want but it makes things worse" or "False Defeat: everything falls apart but they learn something crucial"' },
          { key: 'scene', label: 'Describe the midpoint scene' },
          { key: 'flipOrReveal', label: 'False Victory: what new problem does success create? / False Defeat: what crucial realization comes?' },
          { key: 'stakesRaise', label: 'How do the stakes escalate? What\'s now at risk?' },
        ],
        required: true,
      },
      {
        id: 'beat09BadGuysCloseIn',
        name: 'Beat 9: Bad Guys Close In',
        position: 'Act 2 / Confrontation',
        purpose: 'External pressures mount. Internal doubt grows. Everything that can go wrong does.',
        questions: [
          { key: 'pressures', label: 'What pressures mount? List the major threats/complications' },
          { key: 'scene', label: 'Key "Bad Guys Close In" scene' },
        ],
      },
      {
        id: 'beat10AllIsLost',
        name: 'Beat 10: All Is Lost',
        position: 'Transition',
        purpose: 'Right before the lowest point. The "whiff of death" — something precious is lost.',
        questions: [
          { key: 'whiffOfDeath', label: 'What is the "whiff of death"? (Literal death, or symbolic loss)' },
          { key: 'scene', label: 'Describe the All Is Lost moment' },
          { key: 'darkNightOfSoul', label: 'What is the Dark Night of the Soul? (Where do they almost give up?)' },
        ],
      },
      {
        id: 'beat11BlackMoment',
        name: 'Beat 11: Black Moment',
        position: 'Act 3 / Confrontation',
        purpose: 'The protagonist has hit bottom. Everything looks darkest. Almost ready to quit.',
        questions: [
          { key: 'scene', label: 'Describe the Black Moment' },
          { key: 'whatMakesThemTry', label: 'What gives them one last reason to try? (B story character, memory, person)' },
        ],
      },
      {
        id: 'beat12Beat13',
        name: 'Beat 12: Break Into Three',
        position: 'Transition to Act 3',
        purpose: 'The "second doorway" — protagonist finds the solution through what they\'ve LEARNED.',
        questions: [
          { key: 'secondDoorway', label: 'What is the second doorway? What solution do they find?' },
          { key: 'forcedReexamination', label: 'How does this force them to confront their flaw/core lie?' },
          { key: 'scene', label: 'Describe the Break Into Three' },
        ],
      },
      {
        id: 'beat13Finale',
        name: 'Beat 13: Finale',
        position: 'Act 3 / Confrontation',
        purpose: 'Protagonist proves they\'ve changed. External battle + internal revelation happen together.',
        questions: [
          { key: 'scene', label: 'Describe the finale — how does the protagonist win?' },
          { key: 'selfRevelation', label: 'What self-revelation occurs? (The moment they truly understand)' },
          { key: 'newEquilibrium', label: 'What is the new equilibrium?' },
        ],
      },
      {
        id: 'beat14FinalImage',
        name: 'Beat 14: Final Image',
        position: 'End',
        purpose: 'Mirror or inversion of Opening Image. Proof the protagonist (and world) has changed.',
        questions: [
          { key: 'scene', label: 'Describe the final image (specific, visual — shows "after" state)' },
          { key: 'contrastToOpening', label: 'How does this contrast with the opening image?' },
        ],
      },
      {
        id: 'beat15EndCredits',
        name: 'Beat 15: End Credits',
        position: 'After',
        purpose: '"And then they lived." Shows the new equilibrium. Brief, satisfying.',
        questions: [
          { key: 'scene', label: 'What is the final beat? (Brief — confirm the change has stuck)' },
        ],
      },
    ],
    transition: 'Ready to map the B story in detail?',
  },

  bStory: {
    id: 'bStory',
    name: 'B Story',
    persona: 'weaver',
    opening: `The B story isn't a subplot — it's the THESIS of your novel. It carries the theme. When the A story is loud and fast, the B story is quiet and true.`,
    questions: [
      { key: 'character', label: 'Who is the B story character?', required: true },
      { key: 'premise', label: 'What is the B story about?', required: true },
      { key: 'themeConnection', label: 'How does the B story connect to the A story\'s theme?', required: false },
      { key: 'resolution', label: 'How does the B story resolve?', required: false },
    ],
    transition: 'Ready to add subplots?',
  },

  subplots: {
    id: 'subplots',
    name: 'Subplots',
    persona: 'weaver',
    opening: `C and D stories — their own mini-arcs that enrich the main narrative. Each subplot should serve the theme or complicate the protagonist's journey.`,
    repeatable: {
      max: 6,
      itemLabel: 'Subplot',
      fields: [
        { key: 'name', label: 'Subplot name', required: true },
        { key: 'character', label: 'Which character drives this subplot?', required: true },
        { key: 'purpose', label: 'What PURPOSE does this subplot serve?', hint: 'Deepens theme / complicates protagonist / sets up later reveal / provides contrast / raises stakes', required: false },
        { key: 'premise', label: 'What is this subplot about?', required: true },
        { key: 'resolution', label: 'How does it resolve?', required: false },
      ],
    },
    skippable: true,
    transition: 'Ready for the high-level scene outline?',
  },

  sceneOutline: {
    id: 'sceneOutline',
    name: 'Scene Outline',
    persona: 'director',
    opening: `A scene that doesn't change anything is a scene that doesn't need to exist. Every scene must advance the plot, reveal character, or raise stakes — ideally two of three.\n\nTwo-pass approach: first we map the sequence of major story movements at a high level (this stage), then we flesh out chapter-by-chapter in the next stage.`,
    twoPass: true,
    passOneTitle: 'High-Level Sequence',
    passTwoTitle: 'Chapter Flesh-Out (handled in chapterOutline stage)',
    passOne: {
      opening: 'For each act, walk through the major sequences — the "what happens" at movement level. We\'re not writing scenes yet, just naming what the story does in order. A typical novel has 8-15 sequences.',
      saveTo: 'sceneOutline.highLevel',
      repeatable: {
        max: 30,
        itemLabel: 'Sequence',
        fields: [
          { key: 'act', label: 'Act', hint: '1 (setup), 2A (response), 2B (confrontation), 3 (resolution)', required: true },
          { key: 'sequence', label: 'Sequence number within act', type: 'number', required: true },
          { key: 'highLevelSummary', label: 'What happens in this sequence? (1-2 sentences)', required: true },
          { key: 'servesBeats', label: 'Which Save the Cat beats does this sequence serve?', hint: 'e.g. "Catalyst", "Debate", "Fun and Games"', required: false },
        ],
      },
    },
    approvalGate: {
      label: 'Approve the high-level sequence before moving to chapter flesh-out',
      saveTo: 'sceneOutline.approved',
      type: 'boolean',
    },
    wordCountAllocation: {
      beat01OpeningImage: { pct: 3, label: 'Opening Image' },
      beat02Setup: { pct: 10, label: 'Setup' },
      beat03Catalyst: { pct: 5, label: 'Catalyst' },
      beat04Debate: { pct: 7, label: 'Debate' },
      beat05BreakIntoTwo: { pct: 5, label: 'Break Into Two' },
      beat06BStory: { pct: 5, label: 'B Story' },
      beat07FunAndGames: { pct: 20, label: 'Fun and Games' },
      beat08Midpoint: { pct: 8, label: 'Midpoint' },
      beat09BadGuysCloseIn: { pct: 12, label: 'Bad Guys Close In' },
      beat10AllIsLost: { pct: 8, label: 'All Is Lost' },
      beat11BlackMoment: { pct: 4, label: 'Black Moment' },
      beat12Beat13: { pct: 5, label: 'Break Into Three' },
      beat13Finale: { pct: 6, label: 'Finale' },
      beat14FinalImage: { pct: 2, label: 'Final Image' },
    },
    transition: 'Ready to track plot threads?',
  },

  plotThreads: {
    id: 'plotThreads',
    name: 'Plot Thread Registry',
    persona: 'director',
    opening: `Every open thread needs a resolution plan. No loose ends when the reader closes the book.`,
    repeatable: {
      max: 20,
      itemLabel: 'Plot Thread',
      fields: [
        { key: 'id', label: 'Thread ID', hint: 'e.g. "t1", "t2"', required: true },
        { key: 'threadType', label: 'Type', hint: 'mystery, relationship, world-building, character-arc', required: true },
        { key: 'name', label: 'Thread name', required: true },
        { key: 'introducedAt', label: 'When is it introduced?', required: false },
        { key: 'status', label: 'Status', hint: 'open, resolved, abandoned', required: false },
        { key: 'resolutionPlan', label: 'How will it be resolved?', required: false },
      ],
    },
    skippable: true,
    transition: 'Ready for chapter flesh-out?',
  },

  chapterOutline: {
    id: 'chapterOutline',
    name: 'Chapter Flesh-Out',
    persona: 'director',
    opening: `Now we flesh out each chapter scene by scene. Some chapters are one scene; others have two or three. Every scene must justify its existence — advance plot, reveal character, or raise stakes (ideally two of three).`,
    repeatable: {
      max: 50,
      itemLabel: 'Chapter',
      fields: [
        { key: 'chapterNumber', label: 'Chapter number', type: 'number', required: true },
        { key: 'chapterTitle', label: 'Chapter title (optional)', required: false },
        { key: 'beat', label: 'Which Save the Cat beat does this chapter primarily serve?', hint: 'e.g. "Catalyst", "Fun and Games", "Midpoint"', required: false },
        { key: 'estimatedWords', label: 'Estimated word count for the whole chapter', type: 'number', required: false },
      ],
      nested: {
        key: 'scenes',
        itemLabel: 'Scene',
        max: 8,
        fields: [
          { key: 'sceneNumber', label: 'Scene number within chapter', type: 'number', required: true },
          { key: 'pov', label: 'POV character', required: true },
          { key: 'location', label: 'Location', required: false },
          { key: 'timeOfDay', label: 'Time of day', required: false },
          { key: 'summary', label: 'One-sentence summary of what happens', required: true },
          { key: 'purpose', label: 'What must this scene DO? (advance plot / reveal character / raise stakes)', required: false },
          { key: 'conflict', label: 'What is the central conflict?', required: true },
          { key: 'whatChanges', label: 'What changes by the end of this scene?', required: true },
          { key: 'beats', label: 'Which Save the Cat beats does this scene advance?', required: false },
          { key: 'notes', label: 'Any notes', required: false },
        ],
      },
    },
    transition: 'Ready for consistency and critique?',
  },

  critique: {
    id: 'critique',
    name: 'Consistency & Critique',
    persona: 'strategist',
    opening: `Let's check the whole story for consistency, pacing, and character arc integrity.\n\nThis is the polish pass — catching what slipped through. Walk the writer through each check, flag any issues you spot, and capture their decisions on how (or whether) to resolve each one.`,
    skippable: true,
    checks: [
      'Beat validation — every beat doing its job',
      'Pacing check — act proportions, midpoint position',
      'Character arc consistency — want/need/flaw through every act',
      'Plot thread resolution — every thread closed',
      'Opening/Final image contrast — transformation visible',
    ],
    questions: [
      {
        key: 'flaggedIssues',
        label: 'List any issues flagged during the critique',
        hint: 'Array of { check, message, severity: "error"|"warning"|"note" }',
        type: 'array',
        required: false,
      },
      {
        key: 'resolvedIssues',
        label: 'List issues the writer resolved during this pass',
        hint: 'Array of { check, message, resolution }',
        type: 'array',
        required: false,
      },
      {
        key: 'pacingAnalysis',
        label: 'Overall pacing analysis',
        hint: 'Act proportions, midpoint position, any dragging sections',
        type: 'multiline',
        required: false,
      },
      {
        key: 'characterConsistency',
        label: 'Character arc consistency notes',
        hint: 'Does want/need/flaw thread cleanly across all acts?',
        type: 'multiline',
        required: false,
      },
      {
        key: 'beatSheetValidation',
        label: 'Beat sheet validation notes',
        hint: 'Is every beat doing its job? Any that feel forced or missing?',
        type: 'multiline',
        required: false,
      },
    ],
    transition: 'Ready to generate the master document?',
  },

  masterDoc: {
    id: 'masterDoc',
    name: 'Master Document',
    persona: 'strategist',
    opening: `Final step — generating your complete planning document. All 14 stages compiled into one reference.`,
    skippable: true,
  },
};

// Get guide for a specific stage
export function getStageGuide(stageId) {
  return STAGE_GUIDES[stageId] || null;
}

// Get all stage guides
export function getAllStageGuides() {
  return STAGE_GUIDES;
}