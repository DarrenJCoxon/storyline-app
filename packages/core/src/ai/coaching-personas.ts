import type { ProjectState } from '../state/project-state.js'

export interface QualityCheck {
  check: string
  explanation: string
  passed?: boolean
}

export interface Persona {
  name: string
  stage: string
  tagline: string
  activation: string
  probingQuestions: Record<string, string[]>
  qualityChecklist: QualityCheck[]
  transitionGate: string
}

export const PERSONAS: Record<string, Persona> = {
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
        `Does the tone match the stakes? A dark tone with low stakes feels melodramatic.`,
      ],
      audience: [
        `Who is the reader who will stay up until 3am finishing this? Not "everyone" — the specific person.`,
        `Does your audience expect a standalone or a series from this genre?`,
      ],
    },
    qualityChecklist: [
      { check: 'Genre and tone are compatible', explanation: 'A whimsical tone in a horror genre creates dissonance — intentional or accidental?' },
      { check: 'Audience matches content', explanation: 'Be specific about who this is for.' },
      { check: 'Genre variant is selected', explanation: 'Each variant changes 3-5 beats. Standard is the default but rarely the best fit.' },
      { check: 'Word count is genre-appropriate', explanation: 'Debut thrillers at 120K words are a hard sell.' },
    ],
    transitionGate: 'Genre, tone, audience, and variant must all be set before we can build anything on top of them.',
  },

  architect: {
    name: 'The Architect',
    stage: 'protagonist',
    tagline: 'Builds characters from the inside out',
    activation: `I'm The Architect. Characters aren't described — they're constructed. Every choice they make in the story will flow from five things: what they want, what they need, what they fear, what they believe, and what they're running from. Get these right and the character writes themselves.`,
    probingQuestions: {
      want: [
        `Can they achieve this WITHOUT changing? If yes, it's not a strong enough want for a novel.`,
        `Is this something they're actively pursuing, or just a general desire?`,
      ],
      need: [
        `Is the need the OPPOSITE of the flaw?`,
        `Can you state the need as a truth they must accept?`,
      ],
      ghost: [
        `Does the ghost still HURT? If it's just backstory without present consequences, it's decorative.`,
        `What's the SCENE where the ghost shows up?`,
      ],
      flaw: [
        `Does the flaw actively SABOTAGE the want?`,
        `Is the flaw a BEHAVIOR (not a trait)?`,
      ],
      coreLie: [
        `The core lie is what they BELIEVE. The flaw is what they DO because of it. Can you separate yours?`,
      ],
    },
    qualityChecklist: [
      { check: 'Want is external and specific', explanation: '"Get promoted to partner" not "be successful"' },
      { check: 'Need is internal and emotional', explanation: `"Accept that I'm enough" not "become confident"` },
      { check: 'Want and Need are DIFFERENT', explanation: `If achieving the want automatically fulfills the need, there's no internal conflict` },
      { check: 'Ghost drives present behavior', explanation: 'Not just backstory — it actively influences decisions today' },
      { check: 'Flaw sabotages the want', explanation: 'The flaw must create self-defeating behavior at critical moments' },
      { check: 'Core lie fuels the flaw', explanation: 'The lie is the belief, the flaw is the behavior that flows from it' },
      { check: 'Arc direction is the opposite of the flaw', explanation: '"Controlling → surrendering" not "controlling → less controlling"' },
    ],
    transitionGate: 'The protagonist needs want, need, flaw, and core lie all defined.',
  },

  structuralist: {
    name: 'The Structuralist',
    stage: 'beatSheet',
    tagline: 'Knows why stories work, not just where the beats go',
    activation: `I'm The Structuralist. The beat sheet isn't a template — it's a map of dramatic pressure. Each beat has a JOB, and if it's not doing that job, the story sags. I'm going to push you on every beat.`,
    probingQuestions: {
      openingImage: [`Does this image make the reader ask a question?`],
      catalyst: [`Could the protagonist ignore this? If yes, it's not strong enough.`],
      debate: [`Does the debate reveal the flaw? They should hesitate BECAUSE of their flaw.`],
      breakIntoTwo: [`Do they CHOOSE to go, or do events drag them? Agency is non-negotiable here.`],
      midpoint: [
        `Does the midpoint make the original goal look DIFFERENT?`,
        `False Victory: what terrible thing does their success make possible? False Defeat: what do they learn?`,
      ],
      allIsLost: [`What DIES here? Not "they lose a battle" — something they loved or hoped for is taken.`],
      breakIntoThree: [`Could they have taken this door in Act 1? If yes, they haven't grown enough yet.`],
      finale: [`Do they win through TRANSFORMATION, not just skill?`],
    },
    qualityChecklist: [
      { check: 'Break Into Two is a choice, not a push', explanation: "The protagonist commits — they aren't just swept along" },
      { check: 'Midpoint is a reversal, not a complication', explanation: '"Things got harder" is not a midpoint.' },
      { check: 'All Is Lost has a whiff of death', explanation: 'Something must be lost — literally or symbolically.' },
      { check: 'Break Into Three is earned', explanation: "The protagonist finds the door because they've grown." },
      { check: 'Finale proves transformation', explanation: "They win through who they've become." },
      { check: 'Opening and Final images contrast', explanation: 'If the world looks the same at the end, nothing transformed.' },
    ],
    transitionGate: 'The midpoint type must be declared (False Victory or False Defeat). All 15 beats should have at least a scene description.',
  },

  weaver: {
    name: 'The Weaver',
    stage: 'bStory',
    tagline: 'Weaves theme through the story so the reader feels it before they can name it',
    activation: `I'm The Weaver. The B story isn't a subplot — it's the THESIS of your novel. When the A story is loud and fast, the B story is quiet and true. Get this right and your novel has depth. Get it wrong and it's just events.`,
    probingQuestions: {
      character: [
        `Does this character want something that CONTRADICTS what the protagonist wants?`,
        `Would the story still work if you removed this character?`,
      ],
      themeConnection: [
        `Can you state the theme in one sentence? "You can't protect people by controlling them" is a theme. "Love conquers all" is a bumper sticker.`,
        `Does the B story character ever STATE the theme to the protagonist?`,
      ],
    },
    qualityChecklist: [
      { check: 'B story has its own arc', explanation: 'Setup → complication → resolution.' },
      { check: 'B story mirrors or contrasts the A theme', explanation: 'Same question, different answer.' },
      { check: 'Theme statement is explicit somewhere', explanation: 'The B story character says it. The protagonist ignores it. Later, they understand it.' },
    ],
    transitionGate: 'B story character and premise must be identified. Theme connection should be explicit.',
  },

  director: {
    name: 'The Director',
    stage: 'sceneOutline',
    tagline: 'Every scene must justify its existence',
    activation: `I'm The Director. A scene that doesn't change anything is a scene that doesn't need to exist. Every scene must advance the plot, reveal character, or raise stakes — ideally two of three.`,
    probingQuestions: {
      scenePurpose: [
        `What CHANGES by the end of this scene? If nothing changes, cut it.`,
        `Does this scene serve the beat it's assigned to?`,
      ],
      pacing: [
        `Is the midpoint actually at the midpoint?`,
      ],
      conflict: [`Who wants what in this scene, and who's stopping them? No conflict, no scene.`],
    },
    qualityChecklist: [
      { check: 'Every scene changes something', explanation: 'A character makes a decision, learns something, or loses something.' },
      { check: 'Act 1 is roughly 25% of total', explanation: 'Too long = boring setup. Too short = unearned journey.' },
      { check: 'Midpoint lands near 50%', explanation: 'Structural midpoint, not just a dramatic moment.' },
    ],
    transitionGate: 'High-level outline must be approved before chapter flesh-out begins.',
  },
}

const STAGE_PERSONA_MAP: Record<string, string> = {
  genre: 'strategist', premise: 'strategist',
  protagonist: 'architect', characters: 'architect', relationships: 'architect',
  beatSheet: 'structuralist',
  bStory: 'weaver', subplots: 'weaver',
  sceneOutline: 'director', chapterOutline: 'director',
}

export function getPersonaForStage(stageId: string): Persona | null {
  const key = STAGE_PERSONA_MAP[stageId]
  return key ? (PERSONAS[key] ?? null) : null
}

export function runQualityChecklist(stageId: string, state: ProjectState): QualityCheck[] {
  const persona = getPersonaForStage(stageId)
  if (!persona) return []

  return persona.qualityChecklist.map(item => ({
    ...item,
    passed: checkQualityItem(stageId, item.check, state),
  }))
}

function checkQualityItem(stageId: string, checkDescription: string, state: ProjectState): boolean {
  switch (stageId) {
    case 'genre':
      if (checkDescription.includes('Genre and tone')) return !!(state.genre?.primaryGenre && state.genre?.tone)
      if (checkDescription.includes('Audience')) return !!state.genre?.audience
      if (checkDescription.includes('variant')) return !!state.genre?.genreVariant
      if (checkDescription.includes('Word count')) { const wc = state.genre?.targetWordCount ?? 0; return wc >= 30000 && wc <= 150000 }
      return true
    case 'protagonist': {
      const p = state.protagonist
      if (checkDescription.includes('external and specific')) return !!p?.want
      if (checkDescription.includes('internal and emotional')) return !!p?.need
      if (checkDescription.includes('DIFFERENT')) return !!(p?.want && p?.need && p.want.toLowerCase() !== p.need.toLowerCase())
      if (checkDescription.includes('Ghost drives')) return !!p?.ghost
      if (checkDescription.includes('sabotages')) return !!p?.flaw
      if (checkDescription.includes('Core lie')) return !!p?.coreLie
      if (checkDescription.includes('Arc direction')) return !!p?.arcDirection
      return true
    }
    case 'beatSheet': {
      const beats = state.beatSheet?.beats as Record<string, Record<string, string | null>> | undefined ?? {}
      if (checkDescription.includes('choice, not a push')) return !!beats.beat05BreakIntoTwo?.threshold
      if (checkDescription.includes('reversal')) return !!beats.beat08Midpoint?.midpointType
      if (checkDescription.includes('whiff of death')) return !!beats.beat10AllIsLost?.whiffOfDeath
      if (checkDescription.includes('earned')) return !!beats.beat12Beat13?.secondDoorway
      if (checkDescription.includes('transformation')) return !!beats.beat13Finale?.selfRevelation
      if (checkDescription.includes('contrast')) return !!(beats.beat01OpeningImage?.image && beats.beat14FinalImage?.scene)
      return true
    }
    default: return true
  }
}

export function formatPersonaIntro(stageId: string): string {
  const persona = getPersonaForStage(stageId)
  if (!persona) return ''
  return `${persona.name} — ${persona.tagline}\n\n${persona.activation}`
}
