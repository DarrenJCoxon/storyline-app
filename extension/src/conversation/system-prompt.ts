import type { ProjectState, StageGuide, NfDnaGuide, StageQuestion } from '@storyline/core'
import { getStageGuide, getNfStageGuide, GENRE_VARIANTS, getPersonaForStage } from '@storyline/core'
import { getFictionSkill, getNonfictionSkill, getExtensionPath } from './skill-loader.js'
import * as fs from 'fs'
import * as path from 'path'

const MODE_GATE_PROMPT = `You are Storyline — a planning partner for authors.

This is the very first turn of a new project. Before any planning begins, you must establish what kind of book the writer is creating.

Greet the writer briefly, then ask one clear question:

"Are you writing **fiction** (a novel — using Save the Cat structure) or **non-fiction** (Book DNA + a tailored pipeline for prescriptive, narrative, or how-to)?"

Wait for the answer. The moment they tell you, emit a save block AND nothing else after it:

\`\`\`json
{ "mode": { "value": "fiction" } }
\`\`\`

Use \`"fiction"\` or \`"nonfiction"\` based on their answer. If their answer is ambiguous, ask one clarifying question instead of saving.

Do NOT ask any other planning questions on this turn. Do NOT discuss genre, premise, characters, or anything else. Only the mode gate.`

// MUST sit ABOVE the harness body in the final prompt. The harness assumes
// a CLI (`npx storyline-vsc save`, `next`, `stage-info`); the chat panel
// has none of that. These rules override anything in the harness about
// invoking the CLI.
const EXTENSION_OVERRIDE = `# Storyline runtime override (read FIRST — supersedes the harness below where they conflict)

You are running inside a VS Code chat panel. The Save the Cat harness below is the AUTHORITY on persona, stage flow, questions, gates, and critique — follow it precisely. The only thing the chat panel changes is HOW state is persisted: there is no CLI here.

## CLI translation table — apply EVERY time the harness mentions one of these

| Harness instruction | What you actually do |
| --- | --- |
| \`npx storyline-vsc init\` | Already done. The project state file exists. Do nothing. |
| \`npx storyline-vsc next\` / \`status\` / \`stages\` | The current stage is named under "Active stage" below. The project state is in "Current state". Do not ask the writer to run anything. |
| \`npx storyline-vsc stage-info <stageId>\` | The harness body below already contains the stage brief. Use it. |
| \`npx storyline-vsc save <stageId>\` | **Emit a fenced JSON code block of the form below.** This IS the save. Nothing else persists state. |
| \`npx storyline-vsc traps\` / \`checklist\` | Run the critique conversationally — talk to the writer, don't ask them to run a command. |
| \`npx storyline-vsc generate\` | The extension generates the master document. Don't mention the command. |
| Writing \`docs/<NN>-<stage>.md\` files | The chat IS the artefact. Don't write to docs/. The extension handles output. |

## Save block — the exact shape

When the harness tells you to call \`save\`, emit ONLY this — no preamble, no postscript, no acknowledgement, just the block:

\`\`\`json
{ "<stageId>": { "<fieldKey>": <value>, ... } }
\`\`\`

The \`<stageId>\` is the value under "Active stage" below (e.g. "genre", "protagonist"). Field keys come from the harness's stage brief. Once you emit the block the extension persists it, advances to the next stage, and gives you a fresh system prompt — so do not write further commentary on the same turn.

## Hard rules

1. **NEVER mention \`npx\`, \`storyline-vsc\`, or any other CLI command** in your replies to the writer. They cannot run them. The extension does everything programmatically.
2. **NEVER ask the writer to paste CLI output, switch tools, or run a script.**
3. **NEVER write to \`docs/\` or any file.** Your output is the chat reply (and the JSON save block when due).
4. The harness's \`save-then-compose\` rule still applies, but \`save\` means **emit the JSON block** and \`compose\` means **continue the conversation in this chat** — not write a markdown file.
5. **Follow the harness's persona, questions, gates, and critique exactly.** Conversational delivery, one or two questions per turn, no bulleted questionnaires — just like the harness specifies.
6. **Reference Current state below** instead of re-asking for data already saved.

---
`

export function buildSystemPrompt(stageId: string, state: ProjectState): string {
  // Stage 0: mode gate — runs before anything else if mode hasn't been confirmed yet
  if (stageId === 'mode' || !state.stages?.mode?.completed) {
    const startupProtocol = readSideDoc('skill-content/startup-protocol.md')
    return [MODE_GATE_PROMPT, startupProtocol].filter(Boolean).join('\n\n---\n\n')
  }

  const extensionPath = getExtensionPath()
  const skill = state.mode === 'nonfiction'
    ? getNonfictionSkill(extensionPath)
    : getFictionSkill(extensionPath)

  const stateBlock = '```json\n' + JSON.stringify(stripStateForPrompt(state), null, 2) + '\n```'

  const stageContext = `
---

## Current planning context

- **Mode:** ${state.mode}
- **Active stage:** ${stageId}
- **Stages completed:** ${listCompleted(state)}

## Current state

${stateBlock}
`

  // The original `/storyline` flow has Claude Code invoke
  //   `npx storyline-vsc stage-info <stageId>`
  // at the start of every stage — the CLI returns a rich brief from
  // lib/ai/stage-guides.js (persona, questions, hints, sections, beat
  // guidance). The AI then runs the stage with both the harness AND
  // that brief. Without the brief the conversation feels thin.
  //
  // The chat panel has no CLI, so we inject the brief here directly.
  const brief = buildStageBrief(stageId, state)

  // Side-load routing docs so the AI knows which tier/model context it's in
  const confidenceCheck = readSideDoc('skill-content/confidence-check.md')
  const stageModelMap = readSideDoc('skill-content/stage-model-map.md')
  const startupProtocol = readSideDoc('skill-content/startup-protocol.md')

  const routingContext = [confidenceCheck, stageModelMap].filter(Boolean).join('\n\n---\n\n')

  // Order: override first (chat-panel adapter), then harness (Save the
  // Cat / Book DNA authority), then routing context (model/tier docs),
  // then the stage brief (what `stage-info` would have returned), then
  // current state. startupProtocol is held here for future use (e.g.
  // surfacing routing mode to the AI on the first non-mode stage).
  void startupProtocol
  return [EXTENSION_OVERRIDE, skill, routingContext, brief, stageContext].filter(Boolean).join('\n\n')
}

/**
 * Build the rich stage brief — equivalent to what
 * `npx storyline-vsc stage-info <stageId>` would return in the original
 * /storyline harness. Includes persona, every question with its hint,
 * sectioned intros, repeatable item structure, transition cue, research
 * tip, save schema. Plus side-loaded docs (beat-guide for beat sheet,
 * GENRE_VARIANTS for the genre stage variant question).
 */
function buildStageBrief(stageId: string, state: ProjectState): string {
  const guide = state.mode === 'nonfiction'
    ? getNfStageGuide(stageId)
    : getStageGuide(stageId)
  if (!guide) return ''

  const lines: string[] = []
  lines.push(`# Stage brief — ${guide.name}`)
  const persona = getPersonaForStage(stageId)
  if (persona) {
    lines.push('')
    lines.push(`**Your coaching persona for this stage:** ${persona.name} — ${persona.tagline}`)
  }
  lines.push('')
  lines.push(`This is the detailed brief for the **${guide.name}** stage. Use it to drive a deep, conversational planning session — exactly the way the original storyline harness does when it calls \`stage-info\` via the CLI. Do NOT bullet-list these questions to the writer; weave them into the conversation, asking one or two at a time, adapting wording to what they just said, brainstorming with them when they're unsure.`)
  lines.push('')
  if ('persona' in guide && guide.persona) lines.push(`**Persona:** ${guide.persona}`)
  if ('opening' in guide && guide.opening) {
    lines.push('')
    lines.push(`**Opening (already shown to the writer — do not repeat verbatim):**`)
    lines.push(`> ${guide.opening.split('\n').join('\n> ')}`)
  }

  // Flat questions
  const flat: StageQuestion[] = (guide as StageGuide).questions ?? []
  if (flat.length) {
    lines.push('')
    lines.push('**Questions to cover this stage:**')
    for (const q of flat) lines.push(formatQuestion(q))
  }

  // Sectioned questions (NF DNA + protagonist)
  const sections = (guide as StageGuide).sections ?? []
  for (const sec of sections) {
    lines.push('')
    lines.push(`### Section: ${sec.title}`)
    if (sec.intro) lines.push(`> ${sec.intro}`)
    for (const q of sec.questions ?? []) lines.push(formatQuestion(q))
  }

  // Repeatable items (e.g. supporting cast — up to 6)
  const repeatable = (guide as StageGuide).repeatable
  if (repeatable) {
    lines.push('')
    lines.push(`**Repeatable per item — up to ${repeatable.max} ${repeatable.itemLabel}(s).**`)
    lines.push('For each item ask the writer to fill these fields. Capture them one item at a time, not all in parallel.')
    for (const q of repeatable.fields) lines.push(formatQuestion(q))
    if (repeatable.nested) {
      lines.push('')
      lines.push(`Each ${repeatable.itemLabel} can have nested ${repeatable.nested.itemLabel}(s) (up to ${repeatable.nested.max}):`)
      for (const q of repeatable.nested.fields) lines.push(formatQuestion(q))
    }
  }

  // Genre stage — inline the genre-variant catalogue so the AI can
  // describe each variant when the writer is unsure.
  if (stageId === 'genre') {
    lines.push('')
    lines.push('**Save the Cat genre variants (use these to help the writer pick `genreVariant`):**')
    for (const [key, v] of Object.entries(GENRE_VARIANTS)) {
      lines.push(`  • \`${key}\` — **${v.name}**: ${v.description}`)
    }
  }

  // Beat sheet stage — side-load the harness's beat-guide if present
  if (stageId === 'beatSheet' || stageId === 'sceneOutline') {
    const beatGuide = readSideDoc('skill-content/beat-guide.md') ?? readSideDoc('skill/docs/planning/beat-guide.md')
    if (beatGuide) {
      lines.push('')
      lines.push('## Beat Sheet reference (Save the Cat 15 beats)')
      lines.push(beatGuide)
    }
  }

  if ('researchTip' in guide && guide.researchTip) {
    lines.push('')
    lines.push(`**Research tip:** ${guide.researchTip}`)
  }
  if ('transition' in guide && guide.transition) {
    lines.push('')
    lines.push(`**Transition (use AFTER you've emitted the save block, on the next turn):** "${guide.transition}"`)
  }

  // Save schema — the exact JSON shape the AI must emit when all required
  // fields are captured.
  const requiredKeys = collectAllFields(guide).filter(f => f.required)
  if (requiredKeys.length) {
    lines.push('')
    lines.push('**Save block (emit when ALL required fields are captured — and nothing else on that turn):**')
    lines.push('```json')
    const example: Record<string, unknown> = {}
    for (const f of collectAllFields(guide)) example[f.key] = placeholderFor(f)
    lines.push(JSON.stringify({ [stageId]: example }, null, 2))
    lines.push('```')
  }

  return lines.join('\n')
}

function formatQuestion(q: StageQuestion): string {
  const reqMark = q.required ? '**required**' : 'optional'
  const typeNote = q.type ? ` (${q.type})` : ''
  const hint = q.hint ? `\n    *Hint:* ${q.hint}` : ''
  return `  • \`${q.key}\`${typeNote} — ${reqMark}: ${q.label}${hint}`
}

function collectAllFields(guide: StageGuide | NfDnaGuide): StageQuestion[] {
  const out: StageQuestion[] = []
  const g = guide as StageGuide
  if (g.questions) out.push(...g.questions)
  if (g.sections) for (const s of g.sections) out.push(...(s.questions ?? []))
  if (g.repeatable) out.push(...g.repeatable.fields)
  return out
}

function placeholderFor(q: StageQuestion): unknown {
  if (q.type === 'number') return 0
  if (q.type === 'multiline') return '...'
  if (q.type === 'variant') return 'standard'
  return '...'
}

function readSideDoc(rel: string): string | null {
  try {
    const ext = getExtensionPath()
    if (!ext) return null
    return fs.readFileSync(path.join(ext, rel), 'utf-8')
  } catch { return null }
}

function stripStateForPrompt(state: ProjectState): Record<string, unknown> {
  const { _meta, ...rest } = state as unknown as Record<string, unknown>
  return rest
}

function listCompleted(state: ProjectState): string {
  const completed = Object.entries(state.stages ?? {})
    .filter(([, v]) => v?.completed)
    .map(([k]) => k)
  return completed.length ? completed.join(', ') : 'none yet'
}
