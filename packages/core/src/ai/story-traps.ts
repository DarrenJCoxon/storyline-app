import type { ProjectState } from '../state/project-state.js'

export type TrapSeverity = 'error' | 'warning'

export interface TrapResult {
  id: string
  name: string
  severity: TrapSeverity
  description: string
  stcReasoning: string
  details: string[] | null
  fixProtocol: string[]
}

type Detection = (state: ProjectState) => boolean | string[]

interface Trap {
  id: string
  name: string
  severity: TrapSeverity
  description: string
  stcReasoning: string
  detection: Detection
  fixProtocol: string[]
}

const STORY_TRAPS: Record<string, Trap> = {
  flatProtagonist: {
    id: 'flatProtagonist',
    name: 'Flat Protagonist',
    severity: 'error',
    description: 'Want and Need are identical — no internal contradiction',
    stcReasoning: `Save the Cat requires the protagonist to want something external but need something internal. If they're the same thing, there's no internal conflict — and without internal conflict, the character arc is a flat line.`,
    detection: (state) => {
      const p = state.protagonist
      if (!p?.want || !p?.need) return false
      const wantWords = p.want.toLowerCase().split(/\s+/)
      const needWords = p.need.toLowerCase().split(/\s+/)
      const overlap = wantWords.filter(w => needWords.includes(w) && w.length > 3)
      const overlapRatio = overlap.length / Math.max(wantWords.length, needWords.length)
      const identical = p.want.toLowerCase().trim() === p.need.toLowerCase().trim()
      return identical || overlapRatio > 0.6
    },
    fixProtocol: [
      "1. Separate want from need: the want is what they're CHASING (external, tangible), the need is what they'd discover if they STOPPED chasing (internal, emotional)",
      '2. Make them contradictory: "I want the promotion" vs "I need to accept I\'m enough without it"',
      '3. The flaw should block the need but drive the want',
      "4. Test it: can they achieve the want without meeting the need? If no, they're too close.",
    ],
  },

  structuralGap: {
    id: 'structuralGap',
    name: 'Structural Gap',
    severity: 'error',
    description: "Beats exist but don't connect — a chain with broken links",
    stcReasoning: `Each beat must CAUSE the next beat. If a beat could be removed without changing what comes after it, it's not connected.`,
    detection: (state) => {
      const beats = state.beatSheet?.beats as Record<string, Record<string, string | null>> | undefined
      if (!beats) return false
      const gaps: string[] = []
      if (beats.beat03Catalyst?.scene && beats.beat04Debate?.scene && !beats.beat04Debate.debateQuestion) {
        gaps.push('Debate has no question — the catalyst should force a question the protagonist must answer')
      }
      if (beats.beat07FunAndGames?.scene && beats.beat08Midpoint?.scene && !beats.beat08Midpoint.midpointType) {
        gaps.push('Midpoint has no type — Fun and Games must lead to a reversal (False Victory or False Defeat)')
      }
      if (beats.beat09BadGuysCloseIn?.scene && beats.beat10AllIsLost?.scene && !beats.beat10AllIsLost.whiffOfDeath) {
        gaps.push('All Is Lost has no whiff of death — pressures must culminate in a genuine loss')
      }
      if (beats.beat11BlackMoment?.scene && beats.beat12Beat13?.scene && !beats.beat12Beat13.secondDoorway) {
        gaps.push('Break Into Three has no second doorway — the Black Moment should force a revelation')
      }
      return gaps.length > 0 ? gaps : false
    },
    fixProtocol: [
      '1. Walk through your beats in order. For each beat, ask: "Does the PREVIOUS beat CAUSE this one?"',
      "2. If you find a beat that doesn't follow from the one before it, you have a structural gap",
      '3. The fix is to make the earlier beat CREATE the later one',
      '4. Test it: if you removed any beat, would the story still make sense?',
    ],
  },

  themeFreePlot: {
    id: 'themeFreePlot',
    name: 'Theme-Free Plot',
    severity: 'warning',
    description: "B Story doesn't echo the A Story's theme — the plot has no meaning",
    stcReasoning: `In Save the Cat, the B story carries the theme. If the B story doesn't connect to the A story's theme, the novel is just events.`,
    detection: (state) => {
      const bStory = state.bStory
      if (!bStory?.character || !bStory?.premise) return false
      return !bStory.themeConnection
    },
    fixProtocol: [
      '1. State your theme in one sentence: "You can\'t protect people by controlling them"',
      '2. The B story character should EXPRESS this theme to the protagonist — and the protagonist should ignore it',
      '3. The B story should RESOLVE the theme by the end',
      '4. Test it: remove the B story. Does the A story still have meaning?',
    ],
  },

  staticWorld: {
    id: 'staticWorld',
    name: 'Static World',
    severity: 'warning',
    description: 'The opening image and final image are essentially the same — no visible transformation',
    stcReasoning: `Save the Cat demands that the Opening Image and Final Image be a mirror or inversion. If they're the same, nothing transformed.`,
    detection: (state) => {
      const beats = state.beatSheet?.beats as Record<string, Record<string, string | null>> | undefined
      if (!beats?.beat01OpeningImage?.image || !beats?.beat14FinalImage?.scene) return false
      const opening = (beats.beat01OpeningImage.image as string).toLowerCase().trim()
      const final_ = (beats.beat14FinalImage.scene as string).toLowerCase().trim()
      if (opening === final_) return true
      if (beats.beat14FinalImage.contrastToOpening) return false
      const openWords = new Set(opening.split(/\s+/).filter(w => w.length > 3))
      const finalWords = new Set(final_.split(/\s+/).filter(w => w.length > 3))
      const overlap = [...openWords].filter(w => finalWords.has(w))
      const overlapRatio = overlap.length / Math.max(openWords.size, finalWords.size, 1)
      return overlapRatio > 0.7
    },
    fixProtocol: [
      '1. Go back to the Opening Image. What SPECIFIC visual did you create?',
      '2. Now invert it. If they were alone, they\'re connected. If they were in control, they\'ve surrendered.',
      '3. The Final Image should contain the THEME.',
      "4. Test it: describe both images to someone who hasn't read the book — can they tell which is before and which is after?",
    ],
  },
}

export function runStoryTraps(state: ProjectState): TrapResult[] {
  return Object.values(STORY_TRAPS).flatMap(trap => {
    const detected = trap.detection(state)
    if (!detected) return []
    return [{
      id: trap.id,
      name: trap.name,
      severity: trap.severity,
      description: trap.description,
      stcReasoning: trap.stcReasoning,
      details: Array.isArray(detected) ? detected : null,
      fixProtocol: trap.fixProtocol,
    }]
  })
}
