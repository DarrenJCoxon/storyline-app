// Per-stage markdown renderer — writes output/stages/<stageId>.md on every save
import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import * as path from 'path'
import { STAGE_BY_ID, NF_STAGE_BY_ID, type ProjectState } from '../state/project-state.js'

const line = (k: string, v: string | number | null | undefined): string =>
  v != null && v !== '' ? `**${k}:** ${v}\n\n` : ''

const heading = (txt: string, level = 2): string =>
  `${'#'.repeat(level)} ${txt}\n\n`

const para = (txt: string | null | undefined): string =>
  txt ? `${txt}\n\n` : ''

const listItem = (txt: string): string =>
  txt ? `- ${txt}\n` : ''

const BEAT_ORDER = [
  { id: 'beat01OpeningImage', name: 'Opening Image' },
  { id: 'beat02Setup', name: 'Setup' },
  { id: 'beat03Catalyst', name: 'Catalyst' },
  { id: 'beat04Debate', name: 'Debate' },
  { id: 'beat05BreakIntoTwo', name: 'Break Into Two' },
  { id: 'beat06BStory', name: 'B Story' },
  { id: 'beat07FunAndGames', name: 'Fun and Games' },
  { id: 'beat08Midpoint', name: 'Midpoint' },
  { id: 'beat09BadGuysCloseIn', name: 'Bad Guys Close In' },
  { id: 'beat10AllIsLost', name: 'All Is Lost' },
  { id: 'beat11BlackMoment', name: 'Black Moment' },
  { id: 'beat12Beat13', name: 'Break Into Three' },
  { id: 'beat13Finale', name: 'Finale' },
  { id: 'beat14FinalImage', name: 'Final Image' },
  { id: 'beat15EndCredits', name: 'End Credits' },
] as const

type BeatRecord = Record<string, string | null | undefined>

const renderers: Record<string, (state: ProjectState) => string> = {
  genre(state) {
    const g = state.genre || ({} as ProjectState['genre'])
    let md = heading('Genre & Foundations')
    md += `| Field | Value |\n|-------|-------|\n`
    md += `| Primary Genre | ${g.primaryGenre || '-'} |\n`
    md += `| Sub-Genre | ${g.subGenre || '-'} |\n`
    md += `| Tone | ${g.tone || '-'} |\n`
    md += `| Audience | ${g.audience || '-'} |\n`
    md += `| Target Word Count | ${g.targetWordCount?.toLocaleString() || '-'} |\n`
    md += `| Save the Cat Variant | ${g.genreVariant || 'standard'} |\n\n`
    return md
  },

  premise(state) {
    const p = state.premise || ({} as ProjectState['premise'])
    let md = heading('Story Seed & Premise')
    md += line('Raw logline', p.rawLogline)
    md += line('Concept hook', p.conceptHook)
    if (p.seriesContext?.isSeries) {
      md += heading('Series Context', 3)
      md += line('Series title', p.seriesContext.seriesTitle)
      md += line('Book count', p.seriesContext.bookCount)
      md += line('This book', `Book ${p.seriesContext.currentBookNumber || 1}`)
      md += line('Overall arc across all books', p.seriesContext.overallArc)
      md += line('Focus of Book 1', p.seriesContext.firstBookFocus)
    }
    const sp = p.seriesPotential as { detected?: boolean; reason?: string; suggestion?: string } | null
    if (sp?.detected) {
      md += heading('Series Potential Detected', 3)
      md += para(sp.reason)
      md += line('Suggestion', sp.suggestion)
    }
    return md
  },

  protagonist(state) {
    const p = state.protagonist || ({} as ProjectState['protagonist'])
    let md = heading('Protagonist Deep Dive')
    md += `**${p.name || 'Unnamed'}**${p.age ? ` — age ${p.age}` : ''}${p.occupation ? ` — ${p.occupation}` : ''}\n\n`

    md += heading('Inner Engine (wound → lie → flaw → want → need)', 3)
    md += `| Element | Content |\n|---------|---------|\n`
    md += `| **GHOST / WOUND** | ${p.ghost || '-'} |\n`
    md += `| **CORE LIE** | ${p.coreLie || '-'} |\n`
    md += `| **FLAW** | ${p.flaw || '-'} |\n`
    md += `| **WANT** | ${p.want || '-'} |\n`
    md += `| **NEED** | ${p.need || '-'} |\n`
    md += `| **ARC** | ${p.arcDirection || '-'} |\n\n`

    if (p.dailyLife) {
      md += heading('Ordinary World', 3)
      md += para(p.dailyLife)
    }
    if (p.voice) {
      md += heading('Voice', 3)
      md += para(p.voice)
    }
    return md
  },

  characters(state) {
    const chars = state.characters || []
    let md = heading('Supporting Cast')
    if (!chars.length) return md + '_No supporting characters yet._\n'
    chars.forEach((c, i) => {
      md += heading(`${i + 1}. ${c.name}${c.role ? ` (${c.role})` : ''}`, 3)
      md += `| | |\n|--|--|\n`
      md += `| **Want** | ${c.want || '-'} |\n`
      md += `| **Need** | ${c.need || '-'} |\n`
      md += `| **Flaw** | ${c.flaw || '-'} |\n`
      md += `| **Ghost** | ${c.ghost || '-'} |\n`
      md += `| **Arc** | ${c.arcSummary || '-'} |\n`
      md += `| **Relationship to protagonist** | ${c.relationshipToProtagonist || '-'} |\n`
      md += `| **Enters story at** | ${c.meetsProtagonistAt || '-'} |\n\n`
    })
    return md
  },

  relationships(state) {
    const rels = (state.relationships || []) as Array<{
      characterA: string
      characterB: string
      connection?: string
      conflict?: string
      whatTheyWantFromEachOther?: string
    }>
    let md = heading('Relationship Web')
    if (!rels.length) return md + '_No relationships mapped yet._\n'
    rels.forEach(r => {
      md += `### ${r.characterA} ↔ ${r.characterB}\n\n`
      md += line('Connection', r.connection)
      md += line('Conflict', r.conflict)
      md += line('Mutual want', r.whatTheyWantFromEachOther)
    })
    return md
  },

  logline(state) {
    const l = (state.logline || {}) as Record<string, string | null>
    let md = heading('Logline')
    if (l.sentence) md += `> ${l.sentence}\n\n`
    md += line('Setup', l.setup)
    md += line('Inciting incident', l.incitingIncident)
    md += line('Stakes', l.stakes)
    md += line('Resolution hint', l.resolutionHint)
    md += line('Antagonist question', l.antagonistQuestion)
    return md
  },

  beatSheet(state) {
    const b = state.beatSheet || ({} as ProjectState['beatSheet'])
    const beats = (b.beats || {}) as Record<string, BeatRecord>
    let md = heading('Beat Sheet')
    md += line('Genre variant', b.genreVariant || 'standard')
    BEAT_ORDER.forEach(bo => {
      const beat = beats[bo.id] || {}
      md += heading(bo.name, 3)
      md += line('Scene', beat.scene)
      md += line('Image', beat.image)
      if (bo.id === 'beat02Setup') md += line('Theme stated (hidden)', beat.themeStated)
      if (bo.id === 'beat03Catalyst') md += line('Inciting incident', beat.incitingIncident)
      if (bo.id === 'beat04Debate') md += line('Debate question', beat.debateQuestion)
      if (bo.id === 'beat05BreakIntoTwo') {
        md += line('Threshold choice', beat.threshold)
        md += line('False reality', beat.falseReality)
      }
      if (bo.id === 'beat06BStory') {
        md += line('B story intro', beat.bStoryIntro)
        md += line('Theme connection', beat.themeConnection)
      }
      if (bo.id === 'beat07FunAndGames') md += line('Promise of premise', beat.promiseOfPremise)
      if (bo.id === 'beat08Midpoint' && beat.midpointType) {
        md += line('Type', beat.midpointType === 'falseVictory' ? 'False Victory' : 'False Defeat')
        md += line('Flip/reveal', beat.flipOrReveal)
        md += line('Stakes raise', beat.stakesRaise)
      }
      if (bo.id === 'beat09BadGuysCloseIn' && Array.isArray(beat.pressures) && beat.pressures.length) {
        md += line('Pressures', (beat.pressures as string[]).join('; '))
      } else if (bo.id === 'beat09BadGuysCloseIn') {
        md += line('Pressures', beat.pressures as string)
      }
      if (bo.id === 'beat10AllIsLost') {
        md += line('Whiff of death', beat.whiffOfDeath)
        md += line('Dark night of soul', beat.darkNightOfSoul)
      }
      if (bo.id === 'beat11BlackMoment') {
        md += line('What makes them try', beat.whatMakesThemTry)
        md += line('Defeat type', beat.defeatType)
        md += line('Despair', beat.despair)
      }
      if (bo.id === 'beat12Beat13') {
        md += line('Second doorway', beat.secondDoorway)
        md += line('Forced re-examination', beat.forcedReexamination)
      }
      if (bo.id === 'beat13Finale') {
        md += line('Self-revelation', beat.selfRevelation)
        md += line('New equilibrium', beat.newEquilibrium)
      }
      if (bo.id === 'beat14FinalImage') md += line('Contrast to opening', beat.contrastToOpening)
      md += line('Notes', beat.notes)
    })
    if (b.overallNotes) {
      md += heading('Overall Notes', 3)
      md += para(b.overallNotes)
    }
    return md
  },

  bStory(state) {
    const b = (state.bStory || {}) as Record<string, unknown>
    let md = heading('B Story')
    md += line('Character', b.character as string)
    md += line('Premise', b.premise as string)
    md += line('Theme connection', b.themeConnection as string)
    md += line('Resolution', b.resolution as string)
    if (b.beats && typeof b.beats === 'object' && !Array.isArray(b.beats)) {
      const bBeats = b.beats as Record<string, string>
      md += heading('Arc Beats', 3)
      md += line('Begins', bBeats.begins)
      md += line('Deepens', bBeats.deepens)
      md += line('Resolves', bBeats.resolves)
    }
    return md
  },

  subplots(state) {
    const subs = (state.subplots || []) as Array<{
      name: string
      character?: string
      purpose?: string
      premise?: string
      beats?: { setup?: string; complication?: string; resolution?: string }
    }>
    let md = heading('Subplots')
    if (!subs.length) return md + '_No subplots defined yet._\n'
    subs.forEach((s, i) => {
      md += heading(`${i + 1}. ${s.name}${s.character ? ` (${s.character})` : ''}`, 3)
      md += line('Purpose', s.purpose)
      md += line('Premise', s.premise)
      if (s.beats) {
        md += line('Setup', s.beats.setup)
        md += line('Complication', s.beats.complication)
        md += line('Resolution', s.beats.resolution)
      }
    })
    return md
  },

  sceneOutline(state) {
    const s = (state.sceneOutline || {}) as {
      approved?: boolean
      highLevel?: Array<{ act: string | number; sequence: string | number; highLevelSummary: string }>
    }
    let md = heading('Scene Outline')
    md += line('Approved', s.approved ? 'Yes' : 'No — first pass only')
    if (s.highLevel?.length) {
      md += heading('High-Level Outline', 3)
      s.highLevel.forEach(item => {
        md += `- **Act ${item.act}, seq ${item.sequence}:** ${item.highLevelSummary}\n`
      })
      md += '\n'
    }
    return md
  },

  plotThreads(state) {
    const threads = (state.plotThreads || []) as Array<{
      name: string
      threadType?: string
      type?: string
      introducedAt?: string
      status?: string
      resolutionPlan?: string
    }>
    let md = heading('Plot Thread Registry')
    if (!threads.length) return md + '_No plot threads registered yet._\n'
    md += `| Thread | Type | Introduced | Status | Resolution Plan |\n`
    md += `|--------|------|------------|--------|----------------|\n`
    threads.forEach(t => {
      md += `| ${t.name} | ${t.threadType || t.type || '-'} | ${t.introducedAt || '-'} | ${t.status || '-'} | ${t.resolutionPlan || '-'} |\n`
    })
    return md + '\n'
  },

  chapterOutline(state) {
    const chapters = (state.chapterOutline || []) as Array<{
      chapterNumber: number
      chapterTitle?: string
      beat?: string
      scenes?: Array<{
        sceneNumber: number
        location?: string
        timeOfDay?: string
        pov?: string
        summary?: string
        purpose?: string
        conflict?: string
        whatChanges?: string
        beats?: string
      }>
    }>
    let md = heading('Chapter Outline (Fleshed)')
    if (!chapters.length) return md + '_No chapters fleshed out yet._\n'
    chapters.forEach(ch => {
      md += heading(`Chapter ${ch.chapterNumber}: ${ch.chapterTitle || ''}`, 3)
      if (ch.beat) md += `*Beat: ${ch.beat}*\n\n`
      ;(ch.scenes || []).forEach(sc => {
        md += `**Scene ${sc.sceneNumber}** — ${sc.location || '?'} / ${sc.timeOfDay || '?'} / POV: ${sc.pov || '?'}\n\n`
        if (sc.summary) md += `${sc.summary}\n\n`
        md += line('Purpose', sc.purpose)
        md += line('Conflict', sc.conflict)
        md += line('What changes', sc.whatChanges)
        md += line('Serves beats', sc.beats)
      })
    })
    return md
  },

  critique(state) {
    const c = (state.critique || {}) as {
      flaggedIssues?: Array<string | { message?: string }>
      resolvedIssues?: Array<string | { message?: string }>
      pacingAnalysis?: string
      characterConsistency?: string
      beatSheetValidation?: string
    }
    let md = heading('Consistency & Critique')
    if (c.flaggedIssues?.length) {
      md += heading('Flagged Issues', 3)
      c.flaggedIssues.forEach(i => md += listItem(typeof i === 'string' ? i : i.message || JSON.stringify(i)))
      md += '\n'
    }
    if (c.resolvedIssues?.length) {
      md += heading('Resolved Issues', 3)
      c.resolvedIssues.forEach(i => md += listItem(typeof i === 'string' ? i : i.message || JSON.stringify(i)))
      md += '\n'
    }
    md += line('Pacing analysis', c.pacingAnalysis)
    md += line('Character consistency', c.characterConsistency)
    md += line('Beat sheet validation', c.beatSheetValidation)
    return md
  },

  masterDoc(state) {
    const m = (state.masterDoc || {}) as { generatedAt?: string; wordCountEstimate?: number }
    let md = heading('Master Document')
    md += line('Generated at', m.generatedAt)
    md += line('Word count estimate', m.wordCountEstimate?.toLocaleString())
    md += `\nSee [master-document.md](../master-document.md) for the full planning output.\n`
    return md
  },
}

// ── NF stage-doc renderers (NF-11.4) ─────────────────────────────────────────

type NfStageState = Record<string, unknown>

function nfStage(state: ProjectState, stageId: string): NfStageState {
  const nf = (state.nfStages ?? {}) as Record<string, NfStageState>
  const top = state as unknown as Record<string, NfStageState>
  return nf[stageId] ?? top[stageId] ?? {}
}

function nfLine(k: string, v: unknown): string {
  return v != null && v !== '' ? `**${k}:** ${v}\n\n` : ''
}

function nfList(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return ''
  return items.map(i => `- ${i}\n`).join('') + '\n'
}

// Render a primitive-only array as bullets, OR an object array as numbered
// sub-blocks where each item's keys become **Label:** lines. Used by stages
// whose array fields hold structured items (comps, principles, objections,
// evidence-by-principle). Replaces a previous code path that called nfList()
// on object arrays and produced literal '- [object Object]' lines.
function nfStructuredList(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return ''
  const allPrimitive = items.every(
    i => i == null || ['string', 'number', 'boolean'].includes(typeof i),
  )
  if (allPrimitive) {
    return items.filter(i => i != null && i !== '').map(i => `- ${i}\n`).join('') + '\n'
  }
  let md = ''
  items.forEach((item, i) => {
    if (item == null || typeof item !== 'object') {
      md += `**${i + 1}.** ${item ?? ''}\n\n`
      return
    }
    md += `**${i + 1}.**\n\n`
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      if (v == null || v === '') continue
      if (Array.isArray(v)) {
        md += `- **${humanLabel(k)}:**\n`
        md += nfStructuredList(v).split('\n').map(l => l ? `    ${l}` : l).join('\n')
      } else if (typeof v === 'object') {
        md += `- **${humanLabel(k)}:**\n`
        for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
          if (v2 == null || v2 === '') continue
          md += `    - **${humanLabel(k2)}:** ${v2}\n`
        }
      } else {
        md += `- **${humanLabel(k)}:** ${v}\n`
      }
    }
    md += '\n'
  })
  return md
}

// IMPORTANT — these renderers must read the same `key`s the LLM emits
// (defined as `questions[].key` in packages/core/src/ai/stage-guides-nf-*.ts).
// Drift produces empty markdown bodies even when state is fully populated.
// CB-04b's static drift test (extension/src/__tests__/nf-renderer-drift.test.ts)
// fails the build if any required key isn't reflected here.
const nfRenderers: Record<string, (state: ProjectState) => string> = {
  'dna-category'(state) {
    const s = nfStage(state, 'dna-category')
    let md = heading('Category & Market Positioning')
    md += nfLine('Subject', s.subject)
    md += nfLine('Book type', s.bookType)
    md += nfLine('Primary category', s.primaryCategory)
    md += nfLine('Amazon sub-category', s.amazonSubcategory)
    md += nfLine('Shelf description', s.shelfDescription)
    md += nfLine('Competitor title', s.competitorTitle)
    md += nfLine('Pipeline', s.pipeline)
    return md
  },
  'dna-reader'(state) {
    const s = nfStage(state, 'dna-reader')
    let md = heading('Reader Avatar')
    md += nfLine('Avatar name', s.avatarName)
    md += nfLine('Demographics', s.demographics)
    md += nfLine('Already tried', s.alreadyTried)
    md += nfLine('Biggest fear', s.biggestFear)
    md += nfLine('Deepest wish', s.deepestWish)
    return md
  },
  'dna-transform'(state) {
    const s = nfStage(state, 'dna-transform')
    let md = heading('Reader Transformation')
    md += nfLine('Before state', s.beforeState)
    md += nfLine('After state', s.afterState)
    md += nfLine('Transformation sentence', s.transformationSentence)
    return md
  },
  'dna-idea'(state) {
    const s = nfStage(state, 'dna-idea')
    let md = heading('The One Big Idea')
    md += nfLine('Big idea', s.bigIdea)
    md += nfLine('Why different from comp', s.whyDifferent)
    md += nfLine('One-sentence idea', s.ideaSentence)
    return md
  },
  'dna-author'(state) {
    const s = nfStage(state, 'dna-author')
    let md = heading('Author Angle & Authority')
    md += nfLine('Credibility source', s.credibilitySource)
    md += nfLine('Unique access', s.uniqueAccess)
    md += nfLine('Personal stake', s.personalStake)
    md += nfLine('Potential weakness', s.potentialWeakness)
    return md
  },
  'dna-promise'(state) {
    const s = nfStage(state, 'dna-promise')
    let md = heading('Core Promise & Subtitle Engineering')
    md += nfLine('Core promise', s.corePromise)
    md += nfLine('Subtitle draft', s.subtitleDraft)
    md += nfLine('Alt subtitle', s.subtitleAlt)
    return md
  },
  'dna-comps'(state) {
    const s = nfStage(state, 'dna-comps')
    let md = heading('Comps Deep Dive')
    const comps = Array.isArray(s.comps) ? (s.comps as Array<Record<string, unknown>>) : []
    if (comps.length) {
      md += heading('Comparable Titles', 3)
      comps.forEach((c, i) => {
        const title = (c.title as string) || `Comp ${i + 1}`
        const author = c.author ? ` — ${c.author}` : ''
        md += `**${i + 1}. ${title}${author}**\n\n`
        if (c.year) md += `- **Year:** ${c.year}\n`
        if (c.whatItDoes) md += `- **What it does:** ${c.whatItDoes}\n`
        if (c.whatTheyGotRight) md += `- **What they got right:** ${c.whatTheyGotRight}\n`
        if (c.yourGap) md += `- **Your gap:** ${c.yourGap}\n`
        else if (c.gap) md += `- **Gap:** ${c.gap}\n`
        md += '\n'
      })
    }
    md += nfLine('Market gap', s.marketGap)
    return md
  },
  'dna-voice'(state) {
    const s = nfStage(state, 'dna-voice')
    let md = heading('Voice & Tone')
    md += nfLine('Voice register', s.voiceRegister)
    md += nfLine('Tone descriptors', s.toneDescriptors)
    md += nfLine('Voice example (closest)', s.voiceExample)
    md += nfLine('Voice not-this', s.voiceNotThis)
    md += nfLine('Unresolved', s.unresolved)
    return md
  },
  'dna-evidence'(state) {
    const s = nfStage(state, 'dna-evidence')
    let md = heading('Evidence Philosophy')
    md += nfLine('Evidence types', s.evidenceTypes)
    md += nfLine('Primary research', s.primaryResearch)
    md += nfLine('Sourcing rigor', s.sourcingRigor)
    md += nfLine('Evidence weakness', s.evidenceWeakness)
    return md
  },
  'dna-commercial'(state) {
    const s = nfStage(state, 'dna-commercial')
    let md = heading('Commercial Model')
    md += nfLine('Primary goal for the book', s.bookPrimaryGoal)
    md += nfLine('Beyond the book', s.beyondBook)
    md += nfLine('Target audience / channel', s.targetAudience)
    md += nfLine('Success in 12 months', s.successIn12Months)
    return md
  },
  'dna-title'(state) {
    const s = nfStage(state, 'dna-title')
    let md = heading('Working Title Pressure-Test')
    md += nfLine('Working title', s.workingTitle)
    md += nfLine('Does the title do its job?', s.titleDoesJob)
    md += nfLine('Alternative titles', s.altTitles)
    md += nfLine('Title risk', s.titleRisk)
    return md
  },
  'dna-consolidate'(state) {
    const s = nfStage(state, 'dna-consolidate')
    let md = heading('Book DNA Consolidation')
    md += nfLine('Elevator pitch', s.elevatorPitch)
    md += nfLine('Confirmed pipeline', s.confirmedPipeline)
    md += nfLine('Biggest risk', s.biggestRisk)
    md += nfLine('One thing to fix', s.oneThingToFix)
    return md
  },
  // Pipeline A
  'pa-thesis'(state) {
    const s = nfStage(state, 'pa-thesis')
    let md = heading('Core Thesis')
    md += nfLine('Thesis', s.thesis)
    md += nfLine('Reader belief before', s.thesisBefore)
    md += nfLine('Reader belief after', s.thesisAfter)
    md += nfLine('Thesis sentence', s.thesisSentence)
    md += nfLine('Supporting argument', s.supportingArgument)
    return md
  },
  'pa-framework'(state) {
    const s = nfStage(state, 'pa-framework')
    let md = heading('Framework Design')
    md += nfLine('Model name', s.modelName)
    md += nfLine('Framework description', s.frameworkDescription)
    md += nfLine('Framework logic', s.frameworkLogic)
    md += nfLine('Sub-mode (argument-led / braid)', s.subMode)
    md += nfLine('Cover accent', s.coverAccent)
    const steps = Array.isArray(s.steps) ? (s.steps as Array<unknown>) : []
    if (steps.length) {
      md += heading('Steps / Phases', 3)
      const allPrimitive = steps.every(
        i => i == null || ['string', 'number', 'boolean'].includes(typeof i),
      )
      if (allPrimitive) md += nfList(steps)
      else md += nfStructuredList(steps)
    }
    const principles = Array.isArray(s.principles) ? (s.principles as Array<Record<string, unknown>>) : []
    if (principles.length) {
      md += heading('Principles', 3)
      principles.forEach((p, i) => {
        const num = p.number ?? i + 1
        const name = (p.name as string) ?? (typeof p === 'string' ? p : `Principle ${num}`)
        const def = (p.definition as string) ?? (p.claim as string) ?? ''
        md += def ? `**${num}. ${name}** — ${def}\n\n` : `**${num}. ${name}**\n\n`
      })
    }
    return md
  },
  'pa-objections'(state) {
    const s = nfStage(state, 'pa-objections')
    let md = heading('Reader Objections')
    const objs = Array.isArray(s.objections) ? (s.objections as Array<Record<string, unknown>>) : []
    objs.forEach((o, i) => {
      const obj = (o.objection as string) ?? (typeof o === 'string' ? o : `Objection ${i + 1}`)
      md += heading(`${i + 1}. ${obj}`, 3)
      if (o.source) md += nfLine('Source', o.source)
      if (o.response) md += nfLine('Response', o.response)
      if (o.chapterOrPrinciple !== undefined && o.chapterOrPrinciple !== null && o.chapterOrPrinciple !== '') {
        md += nfLine('Where addressed', o.chapterOrPrinciple)
      }
    })
    md += nfLine('Unanswered objection', s.unansweredObjection)
    return md
  },
  'pa-principles'(state) {
    const s = nfStage(state, 'pa-principles')
    let md = heading('Principles / Laws')
    const ps = Array.isArray(s.principleDetails)
      ? (s.principleDetails as Array<Record<string, unknown>>)
      : Array.isArray(s.principles)
        ? (s.principles as Array<Record<string, unknown>>)
        : []
    ps.forEach((p, i) => {
      const num = p.number ?? i + 1
      const name = (p.name as string) ?? (p.principle as string) ?? `Principle ${num}`
      md += heading(`${num}. ${name}`, 3)
      md += nfLine('Definition', p.deepDefinition ?? p.definition ?? p.claim)
      md += nfLine('Mechanism', p.mechanism)
      md += nfLine('Behaviour change', p.behaviourChange)
      md += nfLine('Common mistake', p.commonMistake)
    })
    md += nfLine('Principle interplay', s.principleInterplay)
    return md
  },
  'pa-evidence'(state) {
    const s = nfStage(state, 'pa-evidence')
    let md = heading('Evidence Map')
    const byPrinciple = Array.isArray(s.evidenceByPrinciple)
      ? (s.evidenceByPrinciple as Array<Record<string, unknown>>)
      : []
    byPrinciple.forEach(p => {
      const num = p.principleNumber ?? '?'
      const label = (p.principleLabel as string) ?? ''
      md += heading(`Principle ${num}${label ? ` — ${label}` : ''}`, 3)
      const items = Array.isArray(p.evidenceItems) ? (p.evidenceItems as Array<unknown>) : []
      items.forEach(item => {
        if (typeof item === 'string') {
          md += `- ${item}\n`
          return
        }
        if (item == null || typeof item !== 'object') return
        const it = item as Record<string, unknown>
        const type = it.type ? `_${it.type}_` : ''
        const source = (it.source as string) ?? ''
        const supports = (it.supportsTheClaim as string) ?? ''
        const strength = it.strength ? ` (${it.strength})` : ''
        const head = [type, source].filter(Boolean).join(' — ')
        md += `- ${head}${strength}${supports ? `: ${supports}` : ''}\n`
      })
      if (items.length) md += '\n'
    })
    md += nfLine('Primary research planned', s.primaryResearchPlanned)
    md += nfLine('Strongest evidence', s.strongestEvidence)
    md += nfLine('Thinnest evidence', s.thinnestEvidence)
    return md
  },
  'pa-chapters'(state) {
    const s = nfStage(state, 'pa-chapters')
    const chapters = Array.isArray(s.chapters) ? s.chapters as Array<Record<string, unknown>> : []
    let md = heading('Chapter Plan')
    md += nfLine('Total chapter count', s.chapterCount)
    md += nfLine('Total word count estimate', s.totalWordCountEstimate)
    for (const ch of chapters) {
      const num = ch.number ?? ch.chapterNumber ?? '?'
      const title = ch.title ?? ch.chapterTitle ?? `Chapter ${num}`
      md += heading(`Chapter ${num} — ${title}`, 3)
      if (ch.linkedPrinciple) md += nfLine('Principle', ch.linkedPrinciple)
      if (ch.job ?? ch.mission) md += nfLine('Job', ch.job ?? ch.mission)
      if (ch.keyEvidence) md += nfLine('Key evidence', ch.keyEvidence)
      if (ch.wordCountEstimate) md += nfLine('Word target', ch.wordCountEstimate)
    }
    return md
  },
  'pa-master'(state) {
    const s = nfStage(state, 'pa-master')
    let md = heading('Pipeline A Master Document')
    md += nfLine('Generated at', s.generatedAt)
    md += `\nSee [nf-master-document.md](../nf-master-document.md) for the full planning output.\n`
    return md
  },
  // Pipeline B
  'pb-chapters'(state) {
    const s = nfStage(state, 'pb-chapters')
    const chapters = Array.isArray(s.chapters) ? s.chapters as Array<Record<string, unknown>> : []
    let md = heading('Chapter Plan')
    md += nfLine('Momentum note', s.momentumNote)
    md += nfLine('Total word count estimate', s.totalWordCountEstimate)
    for (const ch of chapters) {
      const num = ch.number ?? '?'
      const title = ch.title ?? `Chapter ${num}`
      md += heading(`Chapter ${num} — ${title}`, 3)
      if (ch.chapterQuestion) md += nfLine('Question', ch.chapterQuestion)
      if (ch.mission) md += nfLine('Mission', ch.mission)
      if (ch.keyEvidence) md += nfLine('Key evidence', ch.keyEvidence)
    }
    return md
  },
  'pb-master'(state) {
    const s = nfStage(state, 'pb-master')
    let md = heading('Pipeline B Master Document')
    md += nfLine('Generated at', s.generatedAt)
    md += `\nSee [nf-master-document.md](../nf-master-document.md) for the full planning output.\n`
    return md
  },
  // Pipeline C
  'pc-lessons'(state) {
    const s = nfStage(state, 'pc-lessons')
    const lessons = Array.isArray(s.lessons) ? s.lessons as Array<Record<string, unknown>> : []
    let md = heading('Lesson / Chapter Plan')
    md += nfLine('Lesson pacing', s.lessonPacing)
    md += nfLine('Longest lesson', s.longestLesson)
    for (const ch of lessons) {
      const num = ch.number ?? '?'
      const title = ch.lessonTitle ?? ch.title ?? `Lesson ${num}`
      md += heading(`Lesson ${num} — ${title}`, 3)
      if (ch.learningObjective) md += nfLine('Objective', ch.learningObjective)
      if (ch.keyEvidence) md += nfLine('Key evidence', ch.keyEvidence)
    }
    return md
  },
  'pc-master'(state) {
    const s = nfStage(state, 'pc-master')
    let md = heading('Pipeline C Master Document')
    md += nfLine('Generated at', s.generatedAt)
    md += `\nSee [nf-master-document.md](../nf-master-document.md) for the full planning output.\n`
    return md
  },
}

// camelCase / kebab-case → Title Case for the generic fallback labels.
function humanLabel(key: string): string {
  return key
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

function renderValue(value: unknown, depth = 0): string {
  if (value == null || value === '') return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return ''
    // Array of primitives → bullets. Array of objects → numbered sub-blocks.
    const allPrimitive = value.every(v => v == null || ['string', 'number', 'boolean'].includes(typeof v))
    if (allPrimitive) {
      return '\n' + value.filter(v => v != null && v !== '').map(v => `- ${v}`).join('\n') + '\n'
    }
    return '\n' + value.map((entry, i) => {
      const inner = renderValue(entry, depth + 1)
      return `**${i + 1}.**\n\n${inner}`
    }).join('\n')
  }
  if (typeof value === 'object') {
    const lines: string[] = []
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v == null || v === '') continue
      const rendered = renderValue(v, depth + 1)
      if (!rendered) continue
      if (rendered.includes('\n')) {
        lines.push(`**${humanLabel(k)}:**\n${rendered}`)
      } else {
        lines.push(`**${humanLabel(k)}:** ${rendered}`)
      }
    }
    return lines.length ? lines.join('\n\n') + '\n' : ''
  }
  return ''
}

// Fallback renderer — used when no hand-written renderer exists for the
// stage. Walks the captured state for the stage and emits whatever's
// there as bold-label entries. Less polished than the bespoke renderers,
// but ensures every captured stage gets an MD instead of silently
// producing nothing.
//
// Looks in both locations a stage's data can live:
//   - state.nfStages[stageId]  (canonical for non-fiction stages)
//   - state[stageId]           (canonical for fiction stages)
// — mirroring the resolution order in nfStage() above. Some renderers
// (e.g. the NF DNA ones) read from nfStages; the fiction renderers read
// top-level. The fallback needs to find both kinds.
//
// Returns null when nothing is captured for the stage in either
// location, so we don't overwrite an existing MD with a stub for a stage
// the writer hasn't touched.
function genericRender(stageId: string, state: ProjectState): string | null {
  const nf = (state.nfStages ?? {}) as Record<string, unknown>
  const top = state as unknown as Record<string, unknown>
  const data = nf[stageId] ?? top[stageId]
  if (data == null) return null
  const body = renderValue(data)
  if (!body.trim()) return null

  const stageName =
    STAGE_BY_ID[stageId]?.name ??
    NF_STAGE_BY_ID[stageId]?.name ??
    humanLabel(stageId)

  return heading(stageName) + body
}

/**
 * Write a per-stage markdown document to
 * `<projectPath>/planning/stages/<stageId>.md`.
 *
 * Returns the absolute path written, or null if there is no captured
 * data for the stage (no specific renderer applied AND state[stageId]
 * is empty). A null return is the "nothing to write yet" signal —
 * callers can treat it the same as a successful no-op.
 */
export async function writeStageDoc(
  stageId: string,
  state: ProjectState,
  projectPath: string,
): Promise<string | null> {
  const renderer = renderers[stageId] ?? nfRenderers[stageId]
  let body: string | null
  if (renderer) {
    body = renderer(state)
  } else {
    body = genericRender(stageId, state)
  }
  if (body == null || !body.trim()) return null

  const outputDir = path.resolve(projectPath, 'planning', 'stages')
  fs.mkdirSync(outputDir, { recursive: true })

  const title = (state._meta as Record<string, unknown>)?.projectTitle as string | undefined || 'Untitled Novel'
  const header = `<!-- Stage: ${stageId} — Auto-generated by storyline save. Do not edit manually. -->\n\n`
  const meta = `_Project: ${title} · Updated: ${new Date().toISOString()}_\n\n---\n\n`

  const filePath = path.resolve(outputDir, `${stageId}.md`)
  await fsPromises.writeFile(filePath, header + meta + body)
  return filePath
}
