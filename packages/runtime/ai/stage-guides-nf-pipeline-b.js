// Stage conversation guides for the 10 Pipeline B stages (Narrative Non-Fiction)
// Used by /storyline-nf skill via `npx storyline-vsc nf stage-info <stageId>`

export const PIPELINE_B_GUIDES = {
  'pb-thesis': {
    id: 'pb-thesis',
    name: 'Central Question / Thesis',
    phase: 'pipeline-b',
    index: 1,
    persona: 'investigative-editor',
    opening: `Narrative non-fiction starts with a question, not a thesis. The question is what drove the research. The thesis is what the research revealed.\n\nGladwell asks "Why do some people succeed and others don't?" Larson asks "How did a serial killer evade detection at the 1893 World's Fair?" Capote asks "What made two ordinary men commit an extraordinary act?"\n\nWhat is your central question?`,
    questions: [
      {
        key: 'centralQuestion',
        label: 'What is the central question this book investigates?',
        hint: 'Should be specific enough to research, broad enough to sustain a book. If a single paragraph answers it, it\'s too narrow.',
        required: true,
      },
      {
        key: 'thesis',
        label: 'What is your thesis — the book\'s answer to the central question?',
        hint: 'The thesis emerges from research, not before it. If you don\'t know yet, say so — that\'s honest.',
        required: true,
      },
      {
        key: 'readerTakeaway',
        label: 'In one sentence: what does the reader believe after finishing this book that they didn\'t before?',
        hint: 'Not just "they know more" — what specific belief or understanding has shifted?',
        required: true,
      },
      {
        key: 'narrativeMode',
        label: 'At a high level, is this more idea-led (Gladwell) or event-led (Larson)?',
        hint: 'Idea-led: a thesis drives the story and examples serve illustration. Event-led: real events drive the story and ideas emerge from them. You\'ll decide definitively in Stage 4.',
        required: false,
      },
    ],
    validation: ['centralQuestion', 'thesis', 'readerTakeaway'],
    summary: [
      { label: 'Central question', key: 'centralQuestion' },
      { label: 'Thesis', key: 'thesis' },
      { label: 'Reader takeaway', key: 'readerTakeaway' },
      { label: 'Narrative mode (initial)', key: 'narrativeMode' },
    ],
    transition: 'Question and thesis set. Now let\'s build the cast of real people at the heart of this story.',
  },

  'pb-cast': {
    id: 'pb-cast',
    name: 'Cast of Real People',
    phase: 'pipeline-b',
    index: 2,
    persona: 'narrative-editor',
    opening: `Narrative non-fiction lives or dies on its cast. Real people need the same depth as fictional protagonists — want, flaw, backstory, stake.\n\nThe difference: you can only use what's documented. Every character detail needs a source. Let's build the dossiers.`,
    questions: [
      {
        key: 'primarySubject',
        label: 'Who is the primary subject — the person (or group) through whose story the book is primarily told?',
        hint: 'Even in idea-led NF, there\'s usually a primary lens. In Becoming, it\'s Michelle Obama. In Educated, it\'s Tara Westover. In The Devil in the White City, it\'s both Holmes and Burnham.',
        required: true,
      },
      {
        key: 'cast',
        label: 'List the key figures in this book (3–8 is ideal)',
        hint: 'For each: name, role in the story, why they matter to the thesis, and your primary source of information about them.',
        type: 'array',
        itemSchema: {
          name: 'Full name',
          role: 'Role in the story (protagonist / antagonist / witness / expert)',
          whyTheyMatter: 'How does this person serve the thesis?',
          primarySource: 'What is your main source of information about them? (memoir, interview, archive, contemporaneous records)',
          sourcingGap: 'What do you not yet know about them that you need to find out?',
        },
        required: true,
      },
      {
        key: 'castChallenge',
        label: 'Is anyone in the cast living? If so, do you have access to them?',
        hint: 'Living subjects can cooperate or not — both have implications. If key figures are deceased, note the archive or record strategy.',
        required: false,
      },
    ],
    validation: ['primarySubject', 'cast'],
    summary: [
      { label: 'Primary subject', key: 'primarySubject' },
      { label: 'Cast', key: 'cast' },
      { label: 'Access challenge', key: 'castChallenge' },
    ],
    transition: 'Cast established. Now let\'s map the timeline — when did everything happen?',
  },

  'pb-timeline': {
    id: 'pb-timeline',
    name: 'Timeline',
    phase: 'pipeline-b',
    index: 3,
    persona: 'fact-checker',
    opening: `The timeline is your scaffolding. Every scene, every chapter, every cause-and-effect chain depends on knowing what happened, when, and in relation to what else.\n\nThis stage generates a \`.storyline/timeline.json\` and \`timeline.md\` that you can reference throughout the rest of the planning and drafting process.`,
    questions: [
      {
        key: 'timelineEvents',
        label: 'List the key events in chronological order',
        hint: 'Be as specific as you can with dates. Include: the event, date (year/month/day as known), which cast member(s) are involved, significance to the central question.',
        type: 'array',
        itemSchema: {
          date: 'Date or period (e.g. "March 1893", "Summer 1968", "1945–1947")',
          event: 'What happened',
          castInvolved: 'Which cast members were present or affected',
          significance: 'Why this matters to the central question',
          sourceNote: 'How do you know this? (primary source note)',
        },
        required: true,
      },
      {
        key: 'timelineSpan',
        label: 'What is the full time span covered by the book?',
        hint: 'e.g. "1965–1972", "a single week in November 1963", "15,000 BCE to present day"',
        required: true,
      },
      {
        key: 'pivotMoment',
        label: 'What is the single most pivotal moment in the timeline — the event everything else turns on?',
        hint: 'In event-led books this is usually the book\'s structural climax. In idea-led books it\'s the event that best crystallises the thesis.',
        required: true,
      },
    ],
    timelineOutput: {
      generates: ['timeline.json', 'timeline.md'],
      note: 'Saved to .storyline/ after this stage. Referenced in scene list and chapter outline.',
    },
    validation: ['timelineEvents', 'timelineSpan', 'pivotMoment'],
    summary: [
      { label: 'Timeline events', key: 'timelineEvents' },
      { label: 'Span', key: 'timelineSpan' },
      { label: 'Pivot moment', key: 'pivotMoment' },
    ],
    transition: 'Timeline built. Now the structural fork — how do you organise what you know?',
  },

  'pb-fork': {
    id: 'pb-fork',
    name: 'Structural Fork',
    phase: 'pipeline-b',
    index: 4,
    persona: 'structural-editor',
    subModeDecision: true,
    opening: `Narrative non-fiction has two structural DNA types. The choice shapes everything downstream.\n\n**Idea-led** (Gladwell, Levitt, Kahneman): The thesis drives the structure. Chapters are organised by ideas or arguments. Events and people serve as illustrations. The book could be read out of order and still make sense.\n\n**Event-led** (Larson, Capote, Krakauer): Events drive the structure. Chapters follow a chronological or causal sequence. The ideas emerge from the narrative. Read out of order, it's confusing.\n\nWhich is yours?`,
    questions: [
      {
        key: 'subMode',
        label: 'Structural fork: idea-led or event-led?',
        hint: 'If your central question is "why?" → idea-led. If it\'s "what happened?" → event-led. Many books are hybrids — pick the dominant mode.',
        type: 'submode',
        options: ['idea-led', 'event-led'],
        required: true,
      },
      {
        key: 'forkRationale',
        label: 'Why this structure for this material?',
        hint: 'The structure should serve the thesis and the reader. Explain why.',
        required: true,
      },
      {
        key: 'structureChallenge',
        label: 'What is the biggest structural challenge given this material and this fork?',
        hint: 'Idea-led risk: readers lose the thread between big ideas. Event-led risk: chapters become a list of events without insight.',
        required: false,
      },
    ],
    validation: ['subMode', 'forkRationale'],
    summary: [
      { label: 'Structure', key: 'subMode' },
      { label: 'Rationale', key: 'forkRationale' },
      { label: 'Challenge', key: 'structureChallenge' },
    ],
    transition: 'Structure decided. Now the scene list — the set pieces that make this book come alive.',
  },

  'pb-scenes': {
    id: 'pb-scenes',
    name: 'Scene List',
    phase: 'pipeline-b',
    index: 5,
    persona: 'narrative-producer',
    opening: `In narrative non-fiction, scenes are the proof. Abstract claims need concrete moments. The scene is where research becomes story.\n\nFor idea-led books: which moments best illustrate each central idea? For event-led books: which scenes carry the chronological momentum? Either way — if you can't scene it, you can't prove it.`,
    questions: [
      {
        key: 'scenes',
        label: 'List the key scenes (the vivid moments that make the book come alive)',
        hint: 'For each: what happens, who is present, what it proves (or illustrates), and what source documents/material you have for it.',
        type: 'array',
        itemSchema: {
          sceneTitle: 'Short scene name (e.g. "The Senate hearing", "The night of the storm")',
          what: 'What happens in this scene',
          who: 'Cast members present',
          proves: 'What thesis claim or idea does this scene support?',
          source: 'Primary source for this scene (archive, interview, contemporaneous record)',
          chapter: 'Which chapter does this scene live in (rough)?',
        },
        required: true,
      },
      {
        key: 'missingScenes',
        label: 'Which part of the book is currently scene-thin (ideas without concrete moments)?',
        hint: 'The answer tells you where your research gaps are',
        required: true,
      },
    ],
    validation: ['scenes', 'missingScenes'],
    summary: [
      { label: 'Key scenes', key: 'scenes' },
      { label: 'Scene gaps', key: 'missingScenes' },
    ],
    transition: 'Scenes mapped. Now the sourcing register — every claim gets a source.',
  },

  'pb-sourcing': {
    id: 'pb-sourcing',
    name: 'Sourcing Register',
    phase: 'pipeline-b',
    index: 6,
    persona: 'research-director',
    opening: `The Sourcing Register is a filtered view of the research subsystem — every item with subtype "sourced-claim" appears here, organised by scene and chapter.\n\nYou add sources via: \`npx storyline-vsc research add --subtype sourced-claim --link scene:<ch>-<s>\`\n\nThis stage captures the high-level sourcing strategy and flags where you're thin.`,
    questions: [
      {
        key: 'sourcingStrategy',
        label: 'What is the overall sourcing strategy for this book?',
        hint: 'Primary research (interviews, archives)? Secondary (published accounts, journalism)? Mix? How will you cite in the finished book?',
        required: true,
      },
      {
        key: 'primaryArchives',
        label: 'What primary archives or record collections have you identified?',
        hint: 'e.g. National Archives, university special collections, private papers, court records, interview recordings',
        required: false,
      },
      {
        key: 'sourcingGaps',
        label: 'Which scenes or chapters have the weakest sourcing right now?',
        hint: 'Reference Stage 5 scene list. For each thin scene: what would the ideal source be, and how will you find it?',
        required: true,
      },
      {
        key: 'factsAtRisk',
        label: 'Are there any facts in your thesis that are contested or difficult to verify?',
        hint: 'Better to name them now than discover them in review. What\'s the plan for each?',
        required: false,
      },
    ],
    researchIntegration: {
      note: 'Sources live in the research subsystem. Use `research add --subtype sourced-claim` to add each source, then run `nf sourcing-register` to render the view.',
      command: 'npx storyline-vsc nf sourcing-register',
    },
    validation: ['sourcingStrategy', 'sourcingGaps'],
    summary: [
      { label: 'Strategy', key: 'sourcingStrategy' },
      { label: 'Archives', key: 'primaryArchives' },
      { label: 'Sourcing gaps', key: 'sourcingGaps' },
      { label: 'At-risk facts', key: 'factsAtRisk' },
    ],
    transition: 'Sourcing register reviewed. Now the thematic through-line — what does this story mean?',
  },

  'pb-theme': {
    id: 'pb-theme',
    name: 'Thematic Through-Line',
    phase: 'pipeline-b',
    index: 7,
    persona: 'literary-editor',
    opening: `The thesis answers "what". The theme answers "so what".\n\nThe best narrative non-fiction is about more than its subject. The Devil in the White City is about the seductive danger of progress. The Big Short is about the systemic blindness of confidence. Educated is about the violence of knowledge gained and innocence lost.\n\nWhat is your book really about?`,
    questions: [
      {
        key: 'primaryTheme',
        label: 'What is the primary theme — the universal idea this specific story illuminates?',
        hint: 'Not the subject ("the 1918 flu"). The theme ("how institutions fail when individual warning is ignored"). Should apply beyond the specific case.',
        required: true,
      },
      {
        key: 'emotionalArc',
        label: 'What is the emotional arc of the book?',
        hint: 'What does the reader feel at the end that they didn\'t at the start? (dread? hope? anger? awe?) Emotion is the through-line readers follow.',
        required: true,
      },
      {
        key: 'themeInClosingChapter',
        label: 'How does the theme land in the closing chapter?',
        hint: 'The closing must earn the theme — not state it. Where and how does it crystallise?',
        required: true,
      },
      {
        key: 'secondaryThemes',
        label: 'Any secondary themes worth tracking across chapters?',
        required: false,
      },
    ],
    validation: ['primaryTheme', 'emotionalArc', 'themeInClosingChapter'],
    summary: [
      { label: 'Primary theme', key: 'primaryTheme' },
      { label: 'Emotional arc', key: 'emotionalArc' },
      { label: 'Theme in closing', key: 'themeInClosingChapter' },
      { label: 'Secondary themes', key: 'secondaryThemes' },
    ],
    transition: 'Theme locked. Now the chapter outline — the full structure, shaped by your fork choice.',
  },

  'pb-chapters': {
    id: 'pb-chapters',
    name: 'Chapter Outline',
    phase: 'pipeline-b',
    index: 8,
    persona: 'structural-editor',
    opening: `The chapter outline differs based on your structural fork.\n\n**Idea-led**: each chapter = one big idea, supported by narrative examples. The chapter order follows the argument, not the calendar.\n\n**Event-led**: each chapter = a period or sequence of events. The chapter order is chronological (or causal). Ideas emerge from events rather than driving them.\n\nEither way, every chapter needs a question it answers and a reason it sits where it does.`,
    questions: [
      {
        key: 'chapters',
        label: 'List each chapter with its question, key content, and role in the overall structure',
        hint: 'For idea-led: what idea does this chapter establish? For event-led: what period/sequence does this chapter cover? For both: what question does it answer and which scenes anchor it?',
        type: 'array',
        itemSchema: {
          number: 'Chapter number',
          title: 'Working chapter title',
          chapterQuestion: 'The question this chapter answers',
          content: 'Key events, scenes, or ideas covered',
          anchorScene: 'The most important scene in this chapter',
          sourcingNote: 'Key source or archive this chapter relies on',
          role: 'idea-led: which argument step? event-led: which period/sequence?',
        },
        required: true,
      },
      {
        key: 'momentumNote',
        label: 'Does the chapter order maintain momentum? Where are the potential energy dips?',
        hint: 'For event-led: is there a quiet chapter between two high-tension ones (good)? A run of low-stakes chapters (problem)? For idea-led: does each chapter raise the stakes of the argument?',
        required: true,
      },
    ],
    validation: ['chapters', 'momentumNote'],
    summary: [
      { label: 'Chapters', key: 'chapters' },
      { label: 'Momentum', key: 'momentumNote' },
    ],
    transition: 'Chapter outline done. Now the structural critique before master document generation.',
  },

  'pb-critique': {
    id: 'pb-critique',
    name: 'Consistency & Critique',
    phase: 'pipeline-b',
    index: 9,
    persona: 'fact-checking-editor',
    opening: `Narrative non-fiction fails in specific ways: unsourced scenes that can be challenged, chapters where momentum dies, themes that get stated rather than shown, and a closing that doesn't deliver on the central question.\n\nWe check all four.`,
    questions: [
      {
        key: 'sourcingCoverageCheck',
        label: 'Are all key scenes in Stage 5 linked to at least one primary source?',
        hint: 'Walk the scene list. Name any scenes that are currently unsourced. What\'s the plan to source them?',
        required: true,
      },
      {
        key: 'momentumCheck',
        label: 'Is there momentum between all chapters? Name any chapter where pacing drops.',
        hint: 'A momentum dip isn\'t automatically a problem — but it must be intentional. Identify and justify any slow chapters.',
        required: true,
      },
      {
        key: 'themeDeliveryCheck',
        label: 'Is the primary theme shown (through scene and character) rather than stated?',
        hint: 'If the theme is only stated in the introduction or conclusion, it\'s an essay, not narrative non-fiction.',
        required: true,
      },
      {
        key: 'centralQuestionAnsweredCheck',
        label: 'Does the closing chapter definitively answer the central question from Stage 1?',
        hint: 'A narrative NF book that doesn\'t answer its own question is a failure regardless of how good the scenes are.',
        required: true,
      },
      {
        key: 'critiqueSummary',
        label: 'What is the single biggest structural risk before drafting?',
        required: true,
      },
    ],
    validation: [
      'sourcingCoverageCheck', 'momentumCheck',
      'themeDeliveryCheck', 'centralQuestionAnsweredCheck', 'critiqueSummary',
    ],
    summary: [
      { label: 'Sourcing coverage', key: 'sourcingCoverageCheck' },
      { label: 'Momentum', key: 'momentumCheck' },
      { label: 'Theme delivery', key: 'themeDeliveryCheck' },
      { label: 'Question answered', key: 'centralQuestionAnsweredCheck' },
      { label: 'Biggest risk', key: 'critiqueSummary' },
    ],
    transition: 'Critique complete. Generating the Pipeline B master document.',
  },

  'pb-master': {
    id: 'pb-master',
    name: 'Master Document',
    phase: 'pipeline-b',
    index: 10,
    persona: 'editorial-director',
    opening: `All 10 Pipeline B stages complete. Run: \`npx storyline-vsc nf generate\` to create the master document including timeline, cast dossiers, scene list, sourcing register summary, and chapter outline.`,
    questions: [],
    generationTarget: 'pipeline-b-master.md',
    validation: [],
    summary: [],
    transition: 'Pipeline B complete. Your narrative non-fiction book is ready to draft.',
  },
};

export function getPipelineBGuide(stageId) {
  return PIPELINE_B_GUIDES[stageId] || null;
}

export const PIPELINE_B_GUIDE_ORDER = Object.values(PIPELINE_B_GUIDES)
  .sort((a, b) => a.index - b.index);
