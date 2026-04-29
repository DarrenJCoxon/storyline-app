// Stage conversation guides for the 12 Book DNA stages (Phase 0, all NF pipelines)
// Used by /storyline-nf skill via `npx storyline-vsc nf stage-info <stageId>`
// Pattern mirrors stage-guides.ts

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface NfDnaGuide {
  id: string
  name: string
  phase: string
  index: number
  persona: string
  opening: string
  questions?: any[]
  pipelineRouting?: any
  validation?: string[]
  summary?: any[]
  transition?: string
  // Stage-specific extras (e.g. consolidationOutput on the final stage).
  [extra: string]: unknown
}

// Categories and which pipeline they route to
export const CATEGORY_PIPELINE_MAP: Record<string, 'A' | 'B' | 'C' | 'academic'> = {
  // Pipeline A — Prescriptive
  'self-help':            'A',
  'personal development': 'A',
  'business':             'A',
  'entrepreneurship':     'A',
  'leadership':           'A',
  'productivity':         'A',
  'health':               'A',
  'wellness':             'A',
  'fitness':              'A',
  'diet':                 'A',
  'nutrition':            'A',
  'money':                'A',
  'finance':              'A',
  'investing':            'A',
  'relationships':        'A',
  'parenting':            'A',
  'dating':               'A',
  'mindset':              'A',
  'spirituality':         'A',
  'psychology':           'A',
  'motivation':           'A',

  // Pipeline B — Narrative Non-Fiction
  'popular science':      'B',
  'science':              'B',
  'history':              'B',
  'biography':            'B',
  'memoir':               'B',
  'true crime':           'B',
  'journalism':           'B',
  'politics':             'B',
  'economics':            'B',
  'sociology':            'B',
  'anthropology':         'B',
  'nature':               'B',
  'environment':          'B',
  'philosophy':           'B',
  'travel':               'B',

  // Pipeline C — How-To / Skill Ladder
  'how-to':               'C',
  'cooking':              'C',
  'food':                 'C',
  'gardening':            'C',
  'craft':                'C',
  'diy':                  'C',
  'photography':          'C',
  'programming':          'C',
  'technology':           'C',
  'art':                  'C',
  'music':                'C',
  'sport':                'C',
  'language':             'C',
  'education':            'C',
  'career':               'C',

  // Academic pipeline (NF-14) — textbooks and revision guides
  'textbook':             'academic',
  'revision guide':       'academic',
  'revision-guide':       'academic',
  'academic':             'academic',
  'exam revision':        'academic',
  'study guide':          'academic',
  'course book':          'academic',
};

export function inferPipelineFromCategory(category?: string | null): 'A' | 'B' | 'C' | 'academic' | null {
  if (!category) return null;
  const key = category.toLowerCase().trim();
  for (const [cat, pipeline] of Object.entries(CATEGORY_PIPELINE_MAP)) {
    if (key.includes(cat)) return pipeline;
  }
  return null;
}

export const NF_DNA_GUIDES: Record<string, NfDnaGuide> = {
  'dna-category': {
    id: 'dna-category',
    name: 'Category & Market Positioning',
    phase: 'book-dna',
    index: 1,
    persona: 'market-strategist',
    opening: `Before we design a single chapter, we need to know exactly what this book is and where it lives in the market.\n\nFirst: what is the subject? Then we'll nail the category, shelf placement, and competitive landscape.`,
    questions: [
      {
        key: 'subject',
        label: 'What is this book about? Give me the subject in one sentence.',
        hint: 'e.g. "GCSE English Literature for Foundation tier", "A-Level Biology", "Starting a small business", "The history of the Cold War"',
        required: true,
      },
      {
        key: 'bookType',
        label: 'What type of book is it?',
        hint: 'e.g. "revision guide", "textbook", "self-help", "how-to", "memoir" — be specific. For academic books: "textbook" (comprehensive curriculum coverage) or "revision-guide" (compressed exam-prep, quick-checks, practice questions).',
        required: true,
      },
      {
        key: 'primaryCategory',
        label: 'What is the primary Amazon category for this book?',
        hint: 'e.g. "Self-help", "Business & Money", "Popular Science", "True Crime", "Cooking", "Education > Test Prep"',
        required: true,
      },
      {
        key: 'amazonSubcategory',
        label: 'Which sub-category fits best?',
        hint: 'e.g. "Self-Help > Motivational", "Business > Leadership", "Science > Popular Science"',
        required: false,
      },
      {
        key: 'shelfDescription',
        label: 'If someone walked into Waterstones / Barnes & Noble, which shelf is this on?',
        hint: 'Be specific — not "non-fiction" but "the business section, near the management titles"',
        required: true,
      },
      {
        key: 'competitorTitle',
        label: 'Name one book already in this space — the one you most want this to compete with',
        hint: 'Title and author. This is your primary comp and will come back in Stage 7.',
        required: true,
      },
    ],
    pipelineRouting: {
      note: 'Category determines pipeline. Confirm with writer — they can override.',
      A: 'Prescriptive: self-help, business, health, money, relationships',
      B: 'Narrative NF: popular science, history, true crime, journalism',
      C: 'How-To / Skill Ladder: cookbooks, craft, technical skills, practical guides',
      academic: 'Academic: textbooks, revision guides, study guides — structured around learning outcomes and a syllabus',
    },
    validation: ['subject', 'bookType', 'primaryCategory', 'shelfDescription', 'competitorTitle'],
    summary: [
      { label: 'Subject', key: 'subject' },
      { label: 'Book type', key: 'bookType' },
      { label: 'Category', key: 'primaryCategory' },
      { label: 'Sub-category', key: 'amazonSubcategory' },
      { label: 'Shelf', key: 'shelfDescription' },
      { label: 'Primary comp', key: 'competitorTitle' },
      { label: 'Pipeline', key: '_inferredPipeline' },
    ],
    transition: 'Good. Now let\'s define exactly who we\'re writing this for.',
  },

  'dna-reader': {
    id: 'dna-reader',
    name: 'Reader Avatar',
    phase: 'book-dna',
    index: 2,
    persona: 'reader-psychologist',
    opening: `Every great non-fiction book is written for one person. Not a demographic — a specific human being with a specific problem.\n\nLet's build that person. Give them a name. Make them real.`,
    questions: [
      {
        key: 'avatarName',
        label: 'Give your ideal reader a name (first name is enough)',
        hint: 'e.g. "Sarah", "Marcus" — makes the thinking more concrete',
        required: true,
      },
      {
        key: 'demographics',
        label: 'Describe their situation right now — not just age, but what\'s happening in their life',
        hint: 'e.g. "Late 30s, just been passed over for promotion, starting to wonder if they\'re on the wrong track"',
        required: true,
      },
      {
        key: 'alreadyTried',
        label: 'What have they already tried to solve this problem?',
        hint: 'The answer shapes what your book must do differently',
        required: true,
      },
      {
        key: 'biggestFear',
        label: 'What do they fear most about their situation?',
        hint: 'Not the surface fear — the deeper one. "Failing" is too vague. "Proving my parents right that I\'m not good enough" is real.',
        required: true,
      },
      {
        key: 'deepestWish',
        label: 'What do they secretly wish for?',
        hint: 'The outcome they barely dare to want. This is the emotional purchase they\'re really making.',
        required: true,
      },
    ],
    validation: ['avatarName', 'demographics', 'alreadyTried', 'biggestFear', 'deepestWish'],
    summary: [
      { label: 'Reader', key: 'avatarName' },
      { label: 'Situation', key: 'demographics' },
      { label: 'Already tried', key: 'alreadyTried' },
      { label: 'Biggest fear', key: 'biggestFear' },
      { label: 'Deepest wish', key: 'deepestWish' },
    ],
    transition: 'Now let\'s map the transformation — where this reader starts and where your book takes them.',
  },

  'dna-transform': {
    id: 'dna-transform',
    name: 'Reader Transformation',
    phase: 'book-dna',
    index: 3,
    persona: 'results-coach',
    opening: `Non-fiction sells a transformation. The reader buys the before/after — not the information in between.\n\nLet's define that transformation precisely. Vague before/after = vague book.`,
    questions: [
      {
        key: 'beforeState',
        label: 'Describe the reader\'s life BEFORE your book — their exact situation, feeling, capability',
        hint: 'Specific and concrete. Not "struggling with leadership" but "their team ignores their instructions and they don\'t know why"',
        required: true,
      },
      {
        key: 'afterState',
        label: 'Describe their life AFTER reading — what is specifically different?',
        hint: 'Measurable if possible. Not "better leader" but "their team executes plans without being chased, and they have time to think strategically"',
        required: true,
      },
      {
        key: 'transformationSentence',
        label: 'Write the transformation in one sentence: "After reading this book, [reader type] will [specific change]"',
        hint: 'This becomes the invisible spine of the book — every chapter should serve this sentence',
        required: true,
      },
    ],
    validation: ['beforeState', 'afterState', 'transformationSentence'],
    summary: [
      { label: 'Before', key: 'beforeState' },
      { label: 'After', key: 'afterState' },
      { label: 'Transformation', key: 'transformationSentence' },
    ],
    transition: 'Now let\'s identify the one idea that makes this book different from everything else on that shelf.',
  },

  'dna-idea': {
    id: 'dna-idea',
    name: 'The One Big Idea',
    phase: 'book-dna',
    index: 4,
    persona: 'idea-editor',
    opening: `This is the hardest stage. Most non-fiction books don't have a Big Idea — they have a topic.\n\nA topic is "leadership". A Big Idea is "most leaders fail because they optimise for being right rather than being clear — and here's how to flip it."\n\nThe Big Idea is what someone tells a friend the book taught them. It should be transferable in one sentence and feel slightly counterintuitive.`,
    questions: [
      {
        key: 'bigIdea',
        label: 'What is the one idea your reader will take away that they couldn\'t get anywhere else?',
        hint: 'Not a topic. Not a theme. A named, transferable idea. Push until it\'s counterintuitive or at least surprising.',
        required: true,
      },
      {
        key: 'whyDifferent',
        label: 'How is this different from what the primary comp (Stage 1) covers?',
        hint: 'Be specific about the gap. If you can\'t name the gap, the idea isn\'t distinct enough.',
        required: true,
      },
      {
        key: 'ideaSentence',
        label: 'Can you state the idea in one sentence, including a "because" or "therefore"?',
        hint: 'e.g. "Most leaders fail because they optimise for being liked, not respected — and the fix is learning to disappoint people well."',
        required: true,
      },
    ],
    validation: ['bigIdea', 'whyDifferent', 'ideaSentence'],
    summary: [
      { label: 'Big Idea', key: 'bigIdea' },
      { label: 'Different from comp', key: 'whyDifferent' },
      { label: 'In one sentence', key: 'ideaSentence' },
    ],
    transition: 'Good. Now let\'s establish why you — and not someone else — are the right author for this idea.',
  },

  'dna-author': {
    id: 'dna-author',
    name: 'Author Angle & Authority',
    phase: 'book-dna',
    index: 5,
    persona: 'publishing-editor',
    opening: `Every book needs an answer to the reader's silent question: "Why should I trust this person?"\n\nThis isn't just credentials — it's the combination of lived experience, unique access, and personal stake that makes you the only right person to write this book.`,
    questions: [
      {
        key: 'credibilitySource',
        label: 'Why are you the right person to write this book?',
        hint: 'Could be formal credentials, lived experience, professional results, unique access, or some combination',
        required: true,
      },
      {
        key: 'uniqueAccess',
        label: 'What experience, data, access, or perspective do you have that others don\'t?',
        hint: 'What makes your vantage point genuinely different? This is the authority moat.',
        required: true,
      },
      {
        key: 'personalStake',
        label: 'What is your personal connection to this topic?',
        hint: 'Why does this matter to you? Readers trust authors with skin in the game.',
        required: true,
      },
      {
        key: 'potentialWeakness',
        label: 'What might a skeptical reader use to dismiss your authority?',
        hint: 'Naming it means you can address it in the book. Better to know it now.',
        required: false,
      },
    ],
    validation: ['credibilitySource', 'uniqueAccess', 'personalStake'],
    summary: [
      { label: 'Authority', key: 'credibilitySource' },
      { label: 'Unique access', key: 'uniqueAccess' },
      { label: 'Personal stake', key: 'personalStake' },
      { label: 'Potential weakness', key: 'potentialWeakness' },
    ],
    transition: 'Authority established. Now let\'s engineer the promise — what the book actually guarantees the reader.',
  },

  'dna-promise': {
    id: 'dna-promise',
    name: 'Core Promise & Subtitle Engineering',
    phase: 'book-dna',
    index: 6,
    persona: 'copywriter',
    opening: `The subtitle is the most commercially important sentence in the book. It appears on Amazon, in Goodreads search, on the spine, and in every review.\n\nIt has one job: make the right reader say "I need this."`,
    questions: [
      {
        key: 'corePromise',
        label: 'Complete this: "If you read this book, you will [specific, measurable outcome]"',
        hint: 'Specific beats vague every time. "Become a better leader" is vague. "Run 1-to-1s that make your team perform without being chased" is specific.',
        required: true,
      },
      {
        key: 'subtitleDraft',
        label: 'Draft a subtitle that states the promise in 10 words or fewer',
        hint: 'Should answer: What do you get? Who is it for? Often uses "How to...", "The [System/Framework/Secret] for...", or a statement',
        required: true,
      },
      {
        key: 'subtitleAlt',
        label: 'Write one alternative subtitle with a different angle',
        hint: 'Try the opposite approach — if the first was benefit-led, try problem-led (or vice versa)',
        required: false,
      },
    ],
    validation: ['corePromise', 'subtitleDraft'],
    summary: [
      { label: 'Promise', key: 'corePromise' },
      { label: 'Subtitle', key: 'subtitleDraft' },
      { label: 'Alt subtitle', key: 'subtitleAlt' },
    ],
    transition: 'Now let\'s put this book in context with what\'s already out there — the comps deep dive.',
  },

  'dna-comps': {
    id: 'dna-comps',
    name: 'Comps Deep Dive',
    phase: 'book-dna',
    index: 7,
    persona: 'acquisitions-editor',
    opening: `Comparable titles aren't just for agents and publishers. They tell you what readers already believe, what has already been said, and exactly where your gap is.\n\nWe want 3–5 comps. Each should be: published in the last 5 years (ideally), still selling, and genuinely similar in category and audience. Not too famous (Atomic Habits, Sapiens), not too obscure.`,
    questions: [
      {
        key: 'comps',
        label: 'List your 3–5 comparable titles',
        hint: 'For each: title, author, what it got right, what gap your book fills that it doesn\'t. Start with the primary comp from Stage 1.',
        type: 'array',
        itemSchema: {
          title: 'Book title',
          author: 'Author name',
          whatTheyGotRight: 'What this book does well',
          yourGap: 'What gap YOUR book fills that this one leaves',
        },
        required: true,
      },
      {
        key: 'marketGap',
        label: 'In one sentence: what is the gap all of these comps share that your book fills?',
        hint: 'This gap should be evident in your Big Idea (Stage 4). If it\'s not, one of them is off.',
        required: true,
      },
    ],
    validation: ['comps', 'marketGap'],
    summary: [
      { label: 'Comps', key: 'comps' },
      { label: 'Market gap', key: 'marketGap' },
    ],
    transition: 'Good. Now let\'s define the voice — how this book will sound, sentence by sentence.',
  },

  'dna-voice': {
    id: 'dna-voice',
    name: 'Voice & Tone',
    phase: 'book-dna',
    index: 8,
    persona: 'developmental-editor',
    opening: `Voice is the personality of the book — how it sounds when someone reads it aloud. Tone is the emotional register it sustains.\n\nReaders buy voice as much as they buy information. The same ideas in two different voices sell to completely different readers.`,
    questions: [
      {
        key: 'voiceRegister',
        label: 'What is the voice register?',
        hint: 'Expert-to-peer (authority who speaks to you as an equal)? Conversational (like a knowledgeable friend)? Academic (formal, citations-forward)? Inspirational (energetic, high emotion)? Dry/witty?',
        required: true,
      },
      {
        key: 'toneDescriptors',
        label: 'Three words that describe the tone',
        hint: 'e.g. "warm, direct, evidence-based" or "urgent, practical, no-bullshit"',
        required: true,
      },
      {
        key: 'voiceExample',
        label: 'Name a book whose voice is closest to what you\'re going for',
        hint: 'Not necessarily the same topic — just the voice. Can be the comp or something completely different.',
        required: false,
      },
      {
        key: 'voiceNotThis',
        label: 'Name a book whose voice you definitely DON\'T want',
        hint: 'Knowing what to avoid is often clearer than knowing what to aim for',
        required: false,
      },
    ],
    validation: ['voiceRegister', 'toneDescriptors'],
    summary: [
      { label: 'Register', key: 'voiceRegister' },
      { label: 'Tone', key: 'toneDescriptors' },
      { label: 'Voice like', key: 'voiceExample' },
      { label: 'Not like', key: 'voiceNotThis' },
    ],
    transition: 'Voice locked. Now let\'s define how you\'ll back up your claims — the evidence philosophy.',
  },

  'dna-evidence': {
    id: 'dna-evidence',
    name: 'Evidence Philosophy',
    phase: 'book-dna',
    index: 9,
    persona: 'research-editor',
    opening: `How you support your claims is as important as the claims themselves. A book with a strong evidence philosophy earns trust. A book that mixes research and anecdote without a clear framework feels sloppy.\n\nLet\'s decide what kind of book this is, evidentially.`,
    questions: [
      {
        key: 'evidenceTypes',
        label: 'How will you back up your claims?',
        hint: 'Peer-reviewed research? Case studies? Industry data? Interviews? Personal experience? A combination? Which carries the most weight?',
        required: true,
      },
      {
        key: 'primaryResearch',
        label: 'Will you conduct any primary research (interviews, surveys, original experiments)?',
        hint: 'If yes: who, how many, what will you ask? Primary research is a strong differentiator.',
        required: false,
      },
      {
        key: 'sourcingRigor',
        label: 'How rigorous will your sourcing be?',
        hint: 'Endnotes only? In-text citations? Inline attribution? No citations (voice-forward)? This affects both reader trust and writing style.',
        required: true,
      },
      {
        key: 'evidenceWeakness',
        label: 'Where is the evidence for your Big Idea weakest?',
        hint: 'Better to know now so you can fill the gap or caveat it in the book',
        required: false,
      },
    ],
    validation: ['evidenceTypes', 'sourcingRigor'],
    summary: [
      { label: 'Evidence types', key: 'evidenceTypes' },
      { label: 'Primary research', key: 'primaryResearch' },
      { label: 'Sourcing rigor', key: 'sourcingRigor' },
      { label: 'Weakest point', key: 'evidenceWeakness' },
    ],
    transition: 'Evidence philosophy set. Now let\'s think commercially — what does success beyond sales look like?',
  },

  'dna-commercial': {
    id: 'dna-commercial',
    name: 'Commercial Model',
    phase: 'book-dna',
    index: 10,
    persona: 'publishing-strategist',
    opening: `Most authors think about the book. Smart authors think about the book as the beginning of a commercial strategy.\n\nThis doesn't mean turning your writing into a funnel — it means understanding what the book unlocks for you, so you can design accordingly.`,
    questions: [
      {
        key: 'bookPrimaryGoal',
        label: 'What is the primary goal for the book itself?',
        hint: 'Revenue from sales? Building authority/credibility? Generating leads? Platform for future work? The goal shapes decisions about price, format, and marketing.',
        required: true,
      },
      {
        key: 'beyondBook',
        label: 'What does the book enable beyond the book itself?',
        hint: 'Speaking engagements? Courses? Consulting? A second book? A community? None of those?',
        required: false,
      },
      {
        key: 'targetAudience',
        label: 'Where will you sell this? (trade publisher, self-publish, hybrid, for now keep options open)',
        hint: 'Traditional = editorial quality signal but loss of control. Self-publish = control but marketing is all you. Hybrid = middle path.',
        required: false,
      },
      {
        key: 'successIn12Months',
        label: 'How will you know this book succeeded in 12 months?',
        hint: 'Be specific and measurable. Not "it does well" but "1,000 copies sold" or "I land three keynotes" or "my consulting pipeline fills"',
        required: true,
      },
    ],
    validation: ['bookPrimaryGoal', 'successIn12Months'],
    summary: [
      { label: 'Primary goal', key: 'bookPrimaryGoal' },
      { label: 'Beyond book', key: 'beyondBook' },
      { label: 'Distribution', key: 'targetAudience' },
      { label: 'Success in 12 months', key: 'successIn12Months' },
    ],
    transition: 'Commercial model clear. Now let\'s pressure-test the title before we consolidate.',
  },

  'dna-title': {
    id: 'dna-title',
    name: 'Working Title Pressure-Test',
    phase: 'book-dna',
    index: 11,
    persona: 'title-specialist',
    opening: `A book title has to do three things simultaneously: grab attention, state (or strongly imply) the promise, and signal the category.\n\nMost first titles fail at least one of those. That's fine — this is a pressure-test, not a final commitment.`,
    questions: [
      {
        key: 'workingTitle',
        label: 'What is your current working title?',
        required: true,
      },
      {
        key: 'titleDoesJob',
        label: 'Does the title: (1) grab attention, (2) state the promise, (3) signal the category?',
        hint: 'Score each out of 3 and explain. A title that gets 2/3 is usually fixable with subtitle work.',
        required: true,
      },
      {
        key: 'altTitles',
        label: 'Two alternative titles you\'ve considered or that come to mind now',
        hint: 'Don\'t edit yourself — write them even if they feel worse than the working title',
        required: false,
      },
      {
        key: 'titleRisk',
        label: 'What\'s the biggest risk with the working title?',
        hint: 'Too generic? Too niche? Already in use? Confusing category? Overpromising?',
        required: false,
      },
    ],
    validation: ['workingTitle', 'titleDoesJob'],
    summary: [
      { label: 'Working title', key: 'workingTitle' },
      { label: 'Job done?', key: 'titleDoesJob' },
      { label: 'Alternatives', key: 'altTitles' },
      { label: 'Title risk', key: 'titleRisk' },
    ],
    transition: 'Title pressure-tested. Time to consolidate everything into the Book DNA brief.',
  },

  'dna-consolidate': {
    id: 'dna-consolidate',
    name: 'Book DNA Consolidation',
    phase: 'book-dna',
    index: 12,
    persona: 'editorial-director',
    opening: `We've built twelve layers of the book's foundation. Now we synthesise them into the Book DNA — a one-page document that any editor, agent, or co-author could read and immediately understand the book.\n\nWe'll also confirm the pipeline for Phase 1.`,
    questions: [
      {
        key: 'elevatorPitch',
        label: 'Write the 30-second elevator pitch for this book',
        hint: 'For [reader], who [has problem], this book [delivers transformation] by [method]. Unlike [primary comp], it [key difference].',
        required: true,
      },
      {
        key: 'confirmedPipeline',
        label: 'Confirm the pipeline for Phase 1: A (Prescriptive), B (Narrative NF), or C (How-To)',
        hint: 'We inferred this from Stage 1 — confirm or override here. Once set, pipeline changes mean some stages won\'t apply.',
        required: true,
      },
      {
        key: 'biggestRisk',
        label: 'What is the biggest risk that could sink this book?',
        hint: 'Honest answer: category too crowded? Author authority thin? Big Idea not actually differentiated? Transformation too vague to deliver?',
        required: true,
      },
      {
        key: 'oneThingToFix',
        label: 'If you could fix one thing about the Book DNA before moving to Phase 1, what would it be?',
        required: false,
      },
    ],
    consolidationOutput: {
      generates: ['book-dna.md', 'book-dna.json'],
      note: 'After saving this stage, run `npx storyline-vsc nf consolidate` to generate the Book DNA document.',
    },
    validation: ['elevatorPitch', 'confirmedPipeline', 'biggestRisk'],
    summary: [
      { label: 'Elevator pitch', key: 'elevatorPitch' },
      { label: 'Pipeline', key: 'confirmedPipeline' },
      { label: 'Biggest risk', key: 'biggestRisk' },
    ],
    transition: `Book DNA complete. Moving to Pipeline [A/B/C] — the structural planning phase.`,
  },

  // ── Academic-specific DNA stages (NF-14.2) ───────────────────────────────────
  // These replace dna-comps (skipped) and dna-voice (replaced by dna-ac-level)
  // in the academic pipeline's DNA phase. They slot between dna-promise and
  // dna-evidence.

  'dna-ac-level': {
    id: 'dna-ac-level',
    name: 'Level & Register',
    phase: 'book-dna',
    index: 7,
    persona: 'academic-editor',
    opening: `Academic books live and die by register. A GCSE revision guide written at A-level pitch fails the student. An undergraduate text written at sixth-form level loses the lecturer.\n\nLet's pin the level and register precisely before a word of content is planned.`,
    questions: [
      {
        key: 'academicLevel',
        label: 'What is the target academic level?',
        hint: 'KS3 (age 11–14) / GCSE (age 14–16) / A-level (age 16–18) / IB / Undergraduate (which year?) / Postgraduate / CPD / Professional',
        required: true,
      },
      {
        key: 'register',
        label: 'What is the appropriate register for this level?',
        hint: 'e.g. "Accessible with technical precision" (GCSE), "Rigorous, citations expected, peer-level dialogue" (undergrad), "Examination-voice, direct, bullet-friendly" (revision guide)',
        required: true,
      },
      {
        key: 'priorKnowledge',
        label: 'What can you assume the reader already knows before opening this book?',
        hint: 'Be specific — this defines where Chapter 1 starts. e.g. "GCSE Maths grade 5+, no prior physics"',
        required: true,
      },
      {
        key: 'vocabularyPolicy',
        label: 'How will you handle technical vocabulary?',
        hint: 'Define on first use only? Maintain a running glossary? Bold key terms throughout? The answer should match the level.',
        required: false,
      },
    ],
    validation: ['academicLevel', 'register', 'priorKnowledge'],
    summary: [
      { label: 'Level', key: 'academicLevel' },
      { label: 'Register', key: 'register' },
      { label: 'Prior knowledge assumed', key: 'priorKnowledge' },
      { label: 'Vocabulary policy', key: 'vocabularyPolicy' },
    ],
    transition: 'Level and register locked. Now let\'s capture the specification or syllabus this book is aligned to.',
  },

  'dna-ac-spec': {
    id: 'dna-ac-spec',
    name: 'Specification & Syllabus Alignment',
    phase: 'book-dna',
    index: 8,
    persona: 'curriculum-editor',
    opening: `Academic books need to be anchored to a specification or curriculum — even if they\'re not purely exam-focused. That anchor is what gives the outcome inventory (Stage 2 of planning) its authority.\n\nLet's capture it now so every chapter plan can trace back to it.`,
    questions: [
      {
        key: 'specReference',
        label: 'Name the syllabus, specification, or curriculum framework this book covers',
        hint: 'e.g. "AQA GCSE Combined Science Trilogy 8464", "Edexcel A-level History 9HI0", "IB Diploma HL Biology", "Cambridge A-level Physics 9702", "UK National Curriculum KS3 Geography". Can be more than one.',
        required: true,
      },
      {
        key: 'specCoverage',
        label: 'Does this book cover the full spec, or a subset?',
        hint: 'Full coverage? A specific module or paper? Topic clusters? If subset, which ones?',
        required: true,
      },
      {
        key: 'specVersion',
        label: 'Which version or year of the specification?',
        hint: 'Specs change. Capture the version so readers know when to seek an update. e.g. "First assessed 2025", "2023–2025 cohort"',
        required: false,
      },
      {
        key: 'examBoard',
        label: 'Which exam board or awarding body sets this specification?',
        hint: 'e.g. AQA, Edexcel/Pearson, OCR, WJEC, CCEA, Cambridge International, IB, or None (curriculum-aligned but no single exam board)',
        required: false,
      },
    ],
    validation: ['specReference', 'specCoverage'],
    summary: [
      { label: 'Specification', key: 'specReference' },
      { label: 'Coverage scope', key: 'specCoverage' },
      { label: 'Spec version', key: 'specVersion' },
      { label: 'Exam board', key: 'examBoard' },
    ],
    transition: 'Spec reference captured. Now let\'s define the assessment shape — what the student is ultimately being prepared for.',
  },

  'dna-ac-assessment': {
    id: 'dna-ac-assessment',
    name: 'Assessment Shape',
    phase: 'book-dna',
    index: 9,
    persona: 'assessment-editor',
    opening: `The assessment shape defines what the worked examples and exercises in this book need to look like. A book preparing students for multi-step calculation papers needs different worked examples to one preparing them for extended-essay responses.\n\nLet's capture it before we plan a single chapter.`,
    questions: [
      {
        key: 'assessmentType',
        label: 'What type of assessment are students being prepared for?',
        hint: 'Multi-step calculation (maths/science) / Extended written response (humanities/essay) / Multiple-choice / Short-answer (factual recall) / Mixed paper / Practical/coursework / Portfolio / No formal assessment (CPD/reference)',
        required: true,
      },
      {
        key: 'examFormat',
        label: 'Describe the typical exam or assessment format',
        hint: 'e.g. "2-hour written paper, 6-mark extended question at the end of each section" or "4 x 1-hour papers, Paper 1 is MCQ, Papers 2–4 are structured"',
        required: false,
      },
      {
        key: 'commandWords',
        label: 'What command words or task verbs appear most in the assessment?',
        hint: 'e.g. "Describe, Explain, Evaluate, Calculate, Analyse, Compare, Justify". These should drive the exercise types in each chapter.',
        required: false,
      },
      {
        key: 'markSchemeStyle',
        label: 'How are marks awarded? Point-based or level-descriptors?',
        hint: 'Point-based (1 mark per correct point) or levels-of-response (bands, e.g. 0–2, 3–5, 6–8 marks). Affects how exercises in this book should be scaffolded.',
        required: false,
      },
    ],
    validation: ['assessmentType'],
    summary: [
      { label: 'Assessment type', key: 'assessmentType' },
      { label: 'Exam format', key: 'examFormat' },
      { label: 'Command words', key: 'commandWords' },
      { label: 'Mark scheme style', key: 'markSchemeStyle' },
    ],
    transition: 'Assessment shape captured. Now let\'s define the evidence philosophy — how claims and examples will be sourced.',
  },
};

export function getNfDnaGuide(stageId: string): NfDnaGuide | null {
  return NF_DNA_GUIDES[stageId] ?? null;
}

export const NF_DNA_GUIDE_ORDER: NfDnaGuide[] = Object.values(NF_DNA_GUIDES)
  .sort((a, b) => a.index - b.index);
