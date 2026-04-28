import type { ProjectState } from '../state/project-state.js'

export const GENRE_VARIANTS: Record<string, { name: string; description: string }> = {
  standard:       { name: 'Standard',        description: 'Most stories — protagonist vs external conflict, internal growth' },
  puppyLove:      { name: 'Puppy Love',      description: 'Romance-driven — connection is the transformation' },
  buddyLove:      { name: 'Buddy Love',      description: 'Two leads — relationship between them IS the story' },
  whydunit:       { name: 'Whydunit',        description: 'Investigation — puzzle, revelation, justice' },
  foolAgain:      { name: 'Fool Again',      description: 'Comedic — protagonist keeps making the same mistake' },
  outOfTheBox:    { name: 'Out of the Box',  description: 'Idea vs system — innovation, creativity, disruption' },
  traps:          { name: 'Traps',           description: 'Escape — protagonist caught in a web of their own making' },
  goldenFleece:   { name: 'Golden Fleece',   description: 'Journey — road trip, quest, the prize changes them' },
  institutionalized: { name: 'Institutionalized', description: 'Fighting a system — family, company, organisation' },
  superhero:      { name: 'Superhero',       description: 'Power with a flaw — gift that isolates them' },
}

export interface StageQuestion {
  key: string
  label: string
  hint?: string
  required?: boolean
  type?: string
  validate?: string
  crossCheck?: { with: string; message: string }
}

export interface StageSection {
  title: string
  intro?: string
  questions: StageQuestion[]
}

export interface RepeatableConfig {
  max: number
  itemLabel: string
  fields: StageQuestion[]
  nested?: {
    key: string
    itemLabel: string
    max: number
    fields: StageQuestion[]
  }
}

export interface BeatEntry {
  id: string
  name: string
  position: string
  purpose: string
  questions: StageQuestion[]
  contrastNote?: string
  required?: boolean
}

export interface StageGuide {
  id: string
  name: string
  persona: string
  opening: string
  questions?: StageQuestion[]
  sections?: StageSection[]
  repeatable?: RepeatableConfig
  beats?: BeatEntry[]
  skippable?: boolean
  seriesDetection?: boolean
  twoPass?: boolean
  transition?: string
  researchTip?: string
}

export const STAGE_GUIDES: Record<string, StageGuide> = {
  genre: {
    id: 'genre',
    name: 'Genre & Foundations',
    persona: 'strategist',
    opening: `Let's talk about your story.\n\nI'm going to ask you a few simple questions. Answer in any way that feels natural — we'll dig deeper as we go.`,
    questions: [
      { key: 'primaryGenre', label: 'What genre is your novel?', hint: 'Just tell me in your own words — Thriller, Fantasy, Romance, or whatever fits', required: true },
      { key: 'subGenre', label: 'Any sub-genre or specific flavor?', hint: 'e.g. "Psychological thriller", "cozy fantasy" — or skip if unsure', required: false },
      { key: 'audience', label: 'Who is this for? Who will want to read it?', hint: '"Adults who love thrillers", "YA readers", "people who want a fun beach read"', required: true },
      { key: 'tone', label: "What's the mood? What should a reader expect from the experience?", hint: '"dark and tense", "uplifting with humor", "contemplative and literary"', required: true },
      { key: 'targetWordCount', label: 'How long do you want this novel to be?', hint: '"around 80k", "short and tight", "epic at 120k" — rough idea is fine', type: 'number', required: true },
      {
        key: 'genreVariant',
        label: 'Save the Cat has story types — does one fit your story?',
        hint: Object.entries(GENRE_VARIANTS).map(([, v]) => `${v.name}: ${v.description}`).join(' | '),
        type: 'variant',
        required: true,
      },
    ],
    transition: 'Ready to talk about your story seed?',
    researchTip: 'If this novel is set in a specific time period or location, capture worldbuilding research now.',
  },

  premise: {
    id: 'premise',
    name: 'Story Seed & Premise',
    persona: 'strategist',
    opening: `Tell me about the story burning in your head. No structure yet — just the raw material.\n\nWhat excites you? What made you think "this is a story I have to write"?`,
    questions: [
      { key: 'rawLogline', label: 'Describe your story in your own words — anything that comes to mind', hint: 'Free-form brainstorm. No wrong answers.', type: 'multiline', required: true },
      { key: 'conceptHook', label: 'What is the ONE thing that makes this story compelling?', hint: 'If you had to pitch this to someone in 30 seconds, what would you say?', required: true },
    ],
    seriesDetection: true,
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
        title: 'The Inner Engine',
        intro: `In Save the Cat, the character's inner life is the primary engine. We work from the inside out: wound → lie → flaw → want → need.`,
        questions: [
          { key: 'ghost', label: 'GHOST / WOUND — What happened before the story starts that broke something in them?', hint: 'The single most important question. Usually a loss, betrayal, or moment of shame.', required: true },
          { key: 'coreLie', label: 'CORE LIE — What did the wound teach them to believe?', hint: '"I\'m not enough." "Love leaves." "I have to do it alone." — the lie the ending dismantles.', required: true },
          { key: 'flaw', label: 'FLAW — How does the lie show up in their behaviour?', hint: 'Lie = "I\'m not worthy of love" → Flaw = "I push people away when they get close."', required: true },
          { key: 'want', label: 'WANT — What does your protagonist think they want? (external, conscious, often wrong)', hint: 'The TANGIBLE thing they\'d tell you if you asked.', required: true },
          { key: 'need', label: 'NEED — What must they actually learn or accept to be whole? (internal, true, they don\'t know it yet)', hint: 'The INTANGIBLE thing. The flip side of the flaw.', required: true, crossCheck: { with: 'want', message: 'WANT and NEED seem very similar. Want = external goal; Need = internal truth.' } },
        ],
      },
      {
        title: 'Ordinary World',
        intro: `Now that we know the wound, show us the wound in action.`,
        questions: [
          { key: 'dailyLife', label: 'Show me their ordinary world — a day that dramatises the wound and the flaw.', type: 'multiline', required: false },
        ],
      },
      {
        title: 'Arc & Voice',
        questions: [
          { key: 'arcDirection', label: 'How does your protagonist change across the story?', hint: '"Cold and closed → open and trusting" / "Insecure → self-validating"', required: true },
          { key: 'voice', label: 'Describe their voice or speech patterns', required: false },
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
        { key: 'role', label: 'What is their role?', hint: 'Antagonist, Love Interest, Mentor, Buddy, Skeptic', required: true },
        { key: 'want', label: 'What do they WANT? (external goal)', required: false },
        { key: 'need', label: 'What do they NEED? (internal/emotional)', required: false },
        { key: 'flaw', label: 'What is their FLAW? (self-deception)', required: false },
        { key: 'ghost', label: 'What is their GHOST? (past wound — optional)', required: false },
        { key: 'relationshipToProtagonist', label: 'How do they relate to the protagonist?', required: false },
        { key: 'arcSummary', label: 'How do THEY change across the story? (one line)', required: false },
        { key: 'meetsProtagonistAt', label: 'When do they enter the story?', hint: 'e.g. "Beat 3 - Catalyst"', required: false },
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
        { key: 'connection', label: 'How are they connected?', hint: 'Relationship type + nature.', required: true },
        { key: 'conflict', label: 'What is the tension between them?', required: false },
        { key: 'whatTheyWantFromEachOther', label: 'What do they want FROM each other?', required: false },
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
      { key: 'resolutionHint', label: 'Resolution hint — how might it end?', required: false },
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
      { id: 'beat01OpeningImage', name: 'Beat 1: Opening Image', position: 'Act 1 / Setup', purpose: "A snapshot of the protagonist's world BEFORE disruption. Sets tone, mood, and the 'before' state.", questions: [{ key: 'image', label: "Describe the opening image (specific, visual, shows character in their 'before' state)" }, { key: 'scene', label: 'Where/when does it take place?' }, { key: 'notes', label: 'Any notes?' }] },
      { id: 'beat02Setup', name: 'Beat 2: Setup', position: 'Act 1 / Setup', purpose: 'Introduce everyday world. Establish flaw in action. Theme is "hidden" here.', questions: [{ key: 'themeStated', label: 'How is the theme visible (but not stated) in their ordinary world?' }, { key: 'scene', label: 'Key details about their ordinary world' }] },
      { id: 'beat03Catalyst', name: 'Beat 3: Catalyst', position: 'Act 1 / Setup', purpose: 'The moment that disrupts everything. Forces the protagonist to make a decision.', questions: [{ key: 'scene', label: 'What is the catalyst? (Be specific — this changes everything)' }, { key: 'notes', label: 'When does it happen?' }] },
      { id: 'beat04Debate', name: 'Beat 4: Debate', position: 'Act 1 / Setup', purpose: 'Protagonist asks "Should I go? Should I act?" Shows their flaw through hesitation.', questions: [{ key: 'debateQuestion', label: "What is the protagonist debating?" }, { key: 'scene', label: 'How does the flaw show up in this debate?' }] },
      { id: 'beat05BreakIntoTwo', name: 'Beat 5: Break Into Two', position: 'Transition to Act 2', purpose: 'Protagonist COMMITS. They cross the threshold. This is a real CHOICE.', questions: [{ key: 'scene', label: 'Describe the break' }, { key: 'threshold', label: 'What is the CHOICE they make?' }, { key: 'falseReality', label: "What is the 'false reality' — what do they think the new world will be like?" }] },
      { id: 'beat06BStory', name: 'Beat 6: B Story', position: 'Act 2 / Response', purpose: 'Often a love story, mentor, or buddy dynamic. This carries the THEME.', questions: [{ key: 'scene', label: 'Who is the B story character and how are they introduced?' }, { key: 'bStoryIntro', label: 'What is the B story about?' }, { key: 'themeConnection', label: 'What is the THEME STATEMENT, often voiced by the B story character?' }] },
      { id: 'beat07FunAndGames', name: 'Beat 7: Fun and Games', position: 'Act 2 / Response', purpose: 'This is the PROMISE OF THE PREMISE. The story you were sold.', questions: [{ key: 'promiseOfPremise', label: 'What is the promise of your premise?' }, { key: 'scene', label: 'Key Fun and Games scenes? (List 2-3 major moments)' }] },
      { id: 'beat08Midpoint', name: 'Beat 8: Midpoint', position: 'Act 2 / Response → Confrontation', purpose: 'FALSE VICTORY or FALSE DEFEAT. Stakes raised. Protagonist moves from reactive to proactive.', questions: [{ key: 'midpointType', label: 'What type of midpoint?', hint: '"False Victory" or "False Defeat"' }, { key: 'scene', label: 'Describe the midpoint scene' }, { key: 'flipOrReveal', label: 'What new problem or crucial realisation comes?' }, { key: 'stakesRaise', label: "How do the stakes escalate?" }], required: true },
      { id: 'beat09BadGuysCloseIn', name: 'Beat 9: Bad Guys Close In', position: 'Act 2 / Confrontation', purpose: 'External pressures mount. Internal doubt grows. Everything that can go wrong does.', questions: [{ key: 'pressures', label: 'What pressures mount?' }, { key: 'scene', label: 'Key scene' }] },
      { id: 'beat10AllIsLost', name: 'Beat 10: All Is Lost', position: 'Transition', purpose: "Right before the lowest point. The 'whiff of death' — something precious is lost.", questions: [{ key: 'whiffOfDeath', label: "What is the 'whiff of death'?" }, { key: 'scene', label: 'Describe the All Is Lost moment' }, { key: 'darkNightOfSoul', label: 'What is the Dark Night of the Soul?' }] },
      { id: 'beat11BlackMoment', name: 'Beat 11: Black Moment', position: 'Act 3 / Confrontation', purpose: 'The protagonist has hit bottom. Everything looks darkest. Almost ready to quit.', questions: [{ key: 'scene', label: 'Describe the Black Moment' }, { key: 'whatMakesThemTry', label: 'What gives them one last reason to try?' }] },
      { id: 'beat12Beat13', name: 'Beat 12: Break Into Three', position: 'Transition to Act 3', purpose: "The 'second doorway' — protagonist finds the solution through what they've LEARNED.", questions: [{ key: 'secondDoorway', label: 'What is the second doorway?' }, { key: 'forcedReexamination', label: 'How does this force them to confront their flaw?' }, { key: 'scene', label: 'Describe the Break Into Three' }] },
      { id: 'beat13Finale', name: 'Beat 13: Finale', position: 'Act 3 / Confrontation', purpose: "Protagonist proves they've changed. External battle + internal revelation happen together.", questions: [{ key: 'scene', label: 'Describe the finale' }, { key: 'selfRevelation', label: 'What self-revelation occurs?' }, { key: 'newEquilibrium', label: 'What is the new equilibrium?' }] },
      { id: 'beat14FinalImage', name: 'Beat 14: Final Image', position: 'End', purpose: 'Mirror or inversion of Opening Image. Proof the protagonist (and world) has changed.', questions: [{ key: 'scene', label: "Describe the final image (shows 'after' state)" }, { key: 'contrastToOpening', label: 'How does this contrast with the opening image?' }] },
      { id: 'beat15EndCredits', name: 'Beat 15: End Credits', position: 'After', purpose: '"And then they lived." Shows the new equilibrium. Brief, satisfying.', questions: [{ key: 'scene', label: 'What is the final beat?' }] },
    ],
    transition: 'Ready to map the B story in detail?',
  },

  bStory: {
    id: 'bStory', name: 'B Story', persona: 'weaver',
    opening: `The B story isn't a subplot — it's the THESIS of your novel. It carries the theme.`,
    questions: [
      { key: 'character', label: 'Who is the B story character?', required: true },
      { key: 'premise', label: 'What is the B story about?', required: true },
      { key: 'themeConnection', label: "How does the B story connect to the A story's theme?", required: false },
      { key: 'resolution', label: 'How does the B story resolve?', required: false },
    ],
    transition: 'Ready to add subplots?',
  },

  subplots: {
    id: 'subplots', name: 'Subplots', persona: 'weaver', skippable: true,
    opening: `C and D stories — their own mini-arcs that enrich the main narrative.`,
    repeatable: {
      max: 6, itemLabel: 'Subplot',
      fields: [
        { key: 'name', label: 'Subplot name', required: true },
        { key: 'character', label: 'Which character drives this subplot?', required: true },
        { key: 'premise', label: 'What is this subplot about?', required: true },
        { key: 'resolution', label: 'How does it resolve?', required: false },
      ],
    },
    transition: 'Ready for the high-level scene outline?',
  },

  sceneOutline: {
    id: 'sceneOutline', name: 'Scene Outline', persona: 'director', twoPass: true,
    opening: `A scene that doesn't change anything is a scene that doesn't need to exist.\n\nTwo-pass approach: first we map the major story movements at a high level, then we flesh out chapter-by-chapter.`,
    transition: 'Ready to track plot threads?',
  },

  plotThreads: {
    id: 'plotThreads', name: 'Plot Thread Registry', persona: 'director', skippable: true,
    opening: `Every open thread is a promise to the reader. Every promise needs a resolution plan. No loose ends when the reader closes the book.`,
    repeatable: {
      max: 20, itemLabel: 'Plot Thread',
      fields: [
        { key: 'id', label: 'Thread ID', hint: 'e.g. "t1"', required: true },
        { key: 'threadType', label: 'Type', hint: 'mystery, romance, character-arc, world-building, prophecy, subplot', required: true },
        { key: 'name', label: 'Thread name', required: true },
        { key: 'introducedAt', label: 'When is it introduced?', hint: 'Chapter number or beat name', required: false },
        { key: 'status', label: 'Status', hint: 'open, resolved, abandoned', required: false },
        { key: 'resolutionPlan', label: 'How will it be resolved?', required: false },
        // FIC-C.2 dossier fields
        { key: 'introducedScene', label: 'Introduction scene', hint: 'Chapter and scene where the thread first appears (e.g. "Ch 2, Sc 1")', required: false },
        { key: 'developedScenes', label: 'Development scenes', hint: 'Comma-separated list of chapter/scenes where the thread advances', required: false },
        { key: 'plannedResolutionScene', label: 'Planned resolution scene', hint: 'Where will this thread be closed? (e.g. "Ch 18, Sc 2")', required: false },
        { key: 'payoffScene', label: 'Actual payoff scene', hint: 'Fill in once the thread is resolved in the draft', required: false },
        { key: 'unresolvedRisk', label: 'High unresolved risk?', hint: 'true / false — flag if this thread has no clear resolution path yet', required: false },
        { key: 'linkedPromises', label: 'Linked promise IDs', hint: 'Comma-separated IDs of related promise entries', required: false },
      ],
    },
    transition: 'Ready for chapter flesh-out?',
  },

  chapterOutline: {
    id: 'chapterOutline', name: 'Chapter Flesh-Out', persona: 'director',
    opening: `Now we flesh out each chapter scene by scene. Every scene must justify its existence — advance plot, reveal character, or raise stakes (ideally two of three).`,
    repeatable: {
      max: 50, itemLabel: 'Chapter',
      fields: [
        { key: 'chapterNumber', label: 'Chapter number', type: 'number', required: true },
        { key: 'chapterTitle', label: 'Chapter title (optional)', required: false },
        { key: 'beat', label: 'Which Save the Cat beat does this chapter primarily serve?', required: false },
        { key: 'estimatedWords', label: 'Estimated word count', type: 'number', required: false },
      ],
      nested: {
        key: 'scenes', itemLabel: 'Scene', max: 8,
        fields: [
          { key: 'sceneNumber', label: 'Scene number', type: 'number', required: true },
          { key: 'pov', label: 'POV character', required: true },
          { key: 'location', label: 'Location', required: false },
          { key: 'timeOfDay', label: 'Time of day', hint: 'morning / afternoon / evening / night — or a specific time like "3am"', required: false },
          { key: 'summary', label: 'One-sentence summary', required: true },
          { key: 'purpose', label: 'What does this scene do for the story?', hint: 'Advance plot? Reveal character? Raise stakes? Ideally two of three.', required: false },
          { key: 'conflict', label: 'What is the central conflict?', required: true },
          { key: 'whatChanges', label: 'What changes by the end of this scene?', required: true },
          { key: 'beats', label: 'Which Save the Cat beat(s) does this scene serve?', hint: 'e.g. "beat03Catalyst" or "beat08Midpoint, beat06BStory"', required: false },
          { key: 'estimatedWords', label: 'Estimated word count', type: 'number', required: false },
          { key: 'notes', label: 'Any notes', required: false },
          // FIC-B scene contract fields — goal/obstacle/stakes/storyTurn are required
          // for the contract; the rest are optional enrichment. Only 4 required to avoid
          // field fatigue; the optional fields capture craft vocabulary when writers know it.
          { key: 'goal', label: 'Scene goal', hint: 'What does the POV character actively want to achieve in this scene?', required: true },
          { key: 'obstacle', label: 'Obstacle', hint: 'What stops them getting it?', required: true },
          { key: 'stakes', label: 'Stakes', hint: 'What does the POV character lose if they fail?', required: true },
          { key: 'storyTurn', label: 'Story turn', hint: 'What reverses, reveals, or shifts at the end of this scene?', required: true },
          { key: 'conflictSource', label: 'Conflict source', hint: 'Who or what provides the opposition? (person, nature, society, self)', required: false },
          { key: 'valueShiftStart', label: 'Value at scene start', hint: 'One emotion word — e.g. "hopeful", "fearful", "certain"', required: false },
          { key: 'valueShiftEnd', label: 'Value at scene end', hint: 'One emotion word — should differ from the start value', required: false },
          { key: 'beatFunction', label: 'Beat function', hint: 'Which Save the Cat beat does this scene primarily serve?', required: false },
          { key: 'arcFunction', label: 'Character arc movement', hint: "How does this scene advance the protagonist's arc?", required: false },
          { key: 'threadMovement', label: 'Plot thread movement', hint: 'Which plot thread(s) does this scene advance?', required: false },
          { key: 'draftStatus', label: 'Draft status', hint: 'not-started / drafting / complete', required: false },
        ],
      },
    },
    transition: 'Ready for consistency and critique?',
  },

  critique: {
    id: 'critique', name: 'Consistency & Critique', persona: 'strategist', skippable: true,
    opening: `Let's check the whole story for consistency, pacing, and character arc integrity.`,
    transition: 'Ready to generate the master document?',
  },

  masterDoc: {
    id: 'masterDoc', name: 'Master Document', persona: 'strategist', skippable: true,
    opening: `Final step — generating your complete planning document. All 14 stages compiled into one reference.`,
  },
}

export function getStageGuide(stageId: string): StageGuide | null {
  return STAGE_GUIDES[stageId] ?? null
}

export function buildSystemPrompt(stageId: string, state: ProjectState): string {
  const guide = getStageGuide(stageId)
  if (!guide) return ''

  const stateSnapshot = JSON.stringify(state, null, 2)
  return [
    `You are the Storyline planning assistant, guiding a writer through Save the Cat story structure.`,
    `Current stage: ${guide.name} (${stageId})`,
    ``,
    `Stage opening: ${guide.opening}`,
    ``,
    `Current project state:`,
    '```json',
    stateSnapshot,
    '```',
    ``,
    `Instructions:`,
    `- Guide the writer conversationally through this stage`,
    `- When the writer says "save" or you detect they want to save, output a JSON block wrapped in \`\`\`json ... \`\`\` with the stage data to merge into state.json`,
    `- Never write prose for the writer — help them plan only`,
    `- Flag story traps when detected`,
  ].join('\n')
}
