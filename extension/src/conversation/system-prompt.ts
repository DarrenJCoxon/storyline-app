import type { ProjectState } from '@storyline/core'
import { getStageGuide, getNfStageGuide, getPersonaForStage } from '@storyline/core'
import { getFictionSkill, getNonfictionSkill, getExtensionPath } from './skill-loader.js'
import * as fs from 'fs'
import * as path from 'path'

const MODE_GATE_PROMPT = `You are Storyline — a planning partner for authors.

This is the very first turn of a new project. Before any planning begins, you must establish what kind of book the writer is creating.

Greet the writer briefly, then ask one clear question:

"Are you writing **fiction** (a novel — using Save the Cat structure) or **non-fiction**? Non-fiction covers: prescriptive (self-help, business, health), narrative (popular science, history, memoir), how-to (cookbooks, craft, technical skills), and **academic (textbooks and revision guides)**."

Wait for the answer. The moment they tell you, emit a save block AND nothing else after it:

\`\`\`json
{ "mode": { "value": "fiction" } }
\`\`\`

Use \`"fiction"\` or \`"nonfiction"\` based on their answer. If their answer is ambiguous, ask one clarifying question instead of saving.

Do NOT ask any other planning questions on this turn. Do NOT discuss genre, premise, characters, or anything else. Only the mode gate.`

// Minimal CLI→JSON-block translation. The harness body (the original
// SKILL.md, loaded verbatim below this) is the authority on stage flow,
// pacing, persona, and depth — same as the original Claude Code /storyline.
// The only adaptation: there is no CLI here, so wherever the harness says
// `npx storyline-vsc save`, emit a JSON code block instead.
const EXTENSION_OVERRIDE = `# Runtime adapter (CLI → chat panel)

You are running inside a VS Code chat panel — not Claude Code. There is no CLI. The harness skill below was originally written for Claude Code; follow it precisely, with one adaptation: wherever it tells you to run a CLI command, do this instead:

- \`npx storyline-vsc stage-info <id>\` → the brief is already injected below as \`stageInfo\`. Use it.
- \`npx storyline-vsc save <id> '<json>'\` (or \`nf save\`) → emit a fenced \`\`\`json\`\`\` code block of \`{ "<stageId>": { …data… } }\`. That IS the save. **Special case for \`dna-consolidate\`**: also include \`"pipeline": "A"\` (or \`"B"\` or \`"C"\`) at the top level of the JSON block so the planner knows which Phase 1 pipeline to enter. Example: \`{ "dna-consolidate": { "confirmedPipeline": "A", … }, "pipeline": "A" }\`. **Special case for \`dna-category\` when the book is a textbook, revision guide, or other academic category**: also include \`"pipeline": "academic"\` and \`"bookType": "textbook"\` (or \`"revision-guide"\`) at the top level so the planner can switch to the trimmed academic DNA stage order immediately. Example: \`{ "dna-category": { "primaryCategory": "textbook", "bookType": "textbook", … }, "pipeline": "academic", "bookType": "textbook" }\`.
- \`npx storyline-vsc next\` / \`status\` / \`stages\` / \`route\` / \`record-model\` / \`verify-stage\` / \`traps\` / \`checklist\` / \`doctor\` / \`generate\` / \`config get\` → the extension runs these automatically. Do nothing. Do not mention CLI commands to the writer.
- Subagent / Task tool invocation → the extension calls the backend critique endpoint after each save. Do not invoke or mention it.
- **Writing project files** (docs/, manuscript/, output/, etc.): emit a fenced block with the file path as the language tag. Example:
  \`\`\`file:docs/chapters/ch-19.md
  # Chapter 19 — The Betrayal

  ...full markdown content...
  \`\`\`
  The extension writes it to disk instantly. You CAN and SHOULD write directly into docs/ and manuscript/ files this way whenever the writer asks you to update chapter cards, planning docs, or any project file. Never tell the writer you "can't write files" — use this syntax instead.
- **Reading project files**: if you need to read a file that isn't already in your context (e.g. a chapter card the writer wants you to review), emit a JSON block with a \`file_read\` key. The extension will inject the contents and re-run you automatically. Single file: \`{ "file_read": "docs/chapters/ch-01.md" }\`. Multiple: \`{ "file_read": ["docs/chapters/ch-01.md", "docs/chapters/ch-02.md"] }\`. Never tell the writer you "can't read files" — use this instead.
- **Banner / startup display blocks** the harness asks you to "Display" (e.g. \`Storyline — Save the Cat Planning Harness / Character-first…\` or \`Storyline — Returning to <Project Title>\`) → **do not display them.** They were CLI-init flourishes for the original terminal harness. The extension's onboarding handles project-state messaging; jumping straight into the active stage is the right behaviour here.
- **Persona introduction**: introduce your coaching persona once on the FIRST chat turn of the project (the mode-gate or first non-mode stage). Subsequent stages of the same persona — and any time \`stages.completed\` already shows prior stages — must continue the conversation directly without "I'm The Strategist…" / "Before we build anything…" preamble. Look at the prior assistant turns in the conversation history; if you've already introduced yourself, don't do it again.
- **Plain English only**: the stageInfo JSON below uses camelCase keys as machine identifiers (e.g. \`whatTheyGotRight\`, \`yourGap\`, \`marketGap\`, \`targetReader\`). NEVER say these identifiers aloud in your responses. Always convert them to natural prose: "what they got right", "your gap", "market gap", "target reader", etc. The writer must never see raw camelCase field names in the chat.
- **Signal clearly when the ball is in the writer's court at ambiguous moments**: when a message ends with a summary, a stage-complete note, or a "what's next" suggestion — rather than an obvious question — add a brief closing prompt (*"Ready to move on?"*, *"Shall we continue?"*, *"Over to you"*) so the writer knows they need to respond. Don't do this after every message; only when it would otherwise be unclear whether the conversation is waiting on them.

Everything else — depth, conversational pacing, question coverage, gates, critique behaviour, transitions — comes straight from the harness skill below. Mirror it exactly.

---
`

export function buildSystemPrompt(stageId: string, state: ProjectState): string {
  // Stage 0: mode gate — runs before anything else if mode hasn't been confirmed yet.
  // The mode gate is self-contained — no harness, no CLI startup protocol
  // needed (the original startup-protocol.md is CLI-flavoured and only
  // confuses the model in our chat-panel context).
  // Skip the mode gate if mode is already known — either via the new stages.mode
  // flag (set by the gate itself) or via a top-level state.mode value present in
  // projects that predate the mode gate.
  const modeKnown = !!state.stages?.mode?.completed || !!state.mode
  if (stageId === 'mode' || !modeKnown) {
    return MODE_GATE_PROMPT
  }

  const extensionPath = getExtensionPath()
  const skill = state.mode === 'nonfiction'
    ? getNonfictionSkill(extensionPath)
    : getFictionSkill(extensionPath)

  // Mirror exactly what `npx storyline-vsc stage-info <id>` returns in the
  // original harness — the full guide as JSON plus persona overlay and
  // currentState. The skill above already tells the AI how to use this.
  const stageInfoBlock = buildStageInfoBlock(stageId, state)

  const stateBlock = '```json\n' + JSON.stringify(stripStateForPrompt(state), null, 2) + '\n```'

  // Trigger-based reference docs — only side-loaded when the active stage
  // actually needs them. Mirrors the original harness's CLI pattern where
  // /storyline calls `stage-info` (gets the brief) and then opens specific
  // reference docs only when the stage demands them.
  const triggerDocs = collectTriggerDocs(stageId, state)

  const stageContext = `
---

## stageInfo (output of \`stage-info ${stageId}\`)

${stageInfoBlock}

## Current state (output of \`next\`)

${stateBlock}
${triggerDocs ? '\n---\n\n' + triggerDocs : ''}
`

  return [EXTENSION_OVERRIDE, skill, stageContext].filter(Boolean).join('\n\n')
}

/**
 * Side-load reference docs based on the active stage. Mirrors the original
 * /storyline harness's per-stage doc triggers — beat-guide.md when the
 * writer reaches the beat sheet or scene outline, etc. Anything not in
 * the trigger list stays out of the prompt entirely.
 */
function collectTriggerDocs(stageId: string, state: ProjectState): string {
  const docs: string[] = []
  if (stageId === 'beatSheet' || stageId === 'sceneOutline') {
    const beatGuide = readSideDoc('skill-content/beat-guide.md')
    if (beatGuide) docs.push('## Beat Sheet reference (Save the Cat 15 beats)\n\n' + beatGuide)
  }
  if (stageId === 'ac-syllabus') {
    const syllabusCtx = collectSyllabusContext(state._meta?.projectPath ?? null)
    if (syllabusCtx) docs.push(syllabusCtx)
  }
  return docs.join('\n\n---\n\n')
}

function collectSyllabusContext(projectPath: string | null): string {
  if (!projectPath) return ''
  const syllabiDir = path.join(projectPath, 'syllabi')
  if (!fs.existsSync(syllabiDir)) return ''
  let files: string[]
  try {
    files = fs.readdirSync(syllabiDir)
      .filter(f => (f.endsWith('.md') || f.endsWith('.txt')) && f.toLowerCase() !== 'readme.md')
      .sort()
  } catch { return '' }
  if (files.length === 0) return ''
  const parts = files.flatMap(f => {
    try {
      const content = fs.readFileSync(path.join(syllabiDir, f), 'utf-8').trim()
      if (!content) return []
      return [`### ${f}\n\n${content}`]
    } catch { return [] }
  })
  if (parts.length === 0) return ''
  return `## Syllabus documents (from syllabi/ folder)\n\n*The writer has placed the following syllabus summaries in their project. Use these to populate the outcome inventory — extract outcome codes and text verbatim where present.*\n\n${parts.join('\n\n---\n\n')}`
}

function readSideDoc(rel: string): string | null {
  try {
    const ext = getExtensionPath()
    if (!ext) return null
    return fs.readFileSync(path.join(ext, rel), 'utf-8')
  } catch { return null }
}

/**
 * Reproduces the original `npx storyline-vsc stage-info <stageId>` JSON
 * output exactly: the full guide object plus a persona overlay and
 * currentState (progress, missingRequirements, gateBlocked). The harness
 * skill knows how to read this — same shape it always has.
 */
const ACADEMIC_STAGE_IDS = new Set([
  'dna-ac-level', 'dna-ac-spec', 'dna-ac-assessment',
  'ac-syllabus', 'ac-chapters', 'ac-critique', 'ac-master',
])

function buildStageInfoBlock(stageId: string, state: ProjectState): string {
  const guide = state.mode === 'nonfiction'
    ? getNfStageGuide(stageId)
    : getStageGuide(stageId)
  if (!guide) return '```json\n{ "error": "No guide for this stage" }\n```'

  const persona = getPersonaForStage(stageId)
  // Suppress the activation intro if this persona was already introduced in a
  // prior completed stage (e.g. 'premise' shares The Strategist with 'genre').
  // Omitting the field removes the prompt that causes the model to re-introduce itself.
  const alreadyIntroduced = persona != null && hasPersonaBeenIntroduced(stageId, state)
  const output: Record<string, unknown> = {
    ...guide,
    persona: persona
      ? {
          name: persona.name,
          tagline: persona.tagline,
          ...(alreadyIntroduced ? {} : { activation: persona.activation }),
        }
      : null,
  }

  // Inject bookType for academic stages. If the guide carries a `variants` map,
  // merge the matching variant's fields (opening, questions, itemSchema) into the
  // output so the AI receives the correct format spec for textbook vs revision-guide
  // without the stage guide author having to duplicate every field.
  if (ACADEMIC_STAGE_IDS.has(stageId) && state.bookType) {
    output.bookType = state.bookType
    output.bookTypeNote = state.bookType === 'textbook'
      ? 'This is a TEXTBOOK. Use full chapter structure: concept explanations, worked examples, multi-part exercises, prerequisite chains, and figures. Depth and coverage matter most.'
      : 'This is a REVISION GUIDE. Use concise topic structure: summary boxes, recall questions, key terms, exam practice questions, and quick-check grids. Brevity and exam-readiness matter most — assume the student was already taught the content.'

    const variants = (guide as { variants?: Record<string, unknown> }).variants
    if (variants) {
      const variant = variants[state.bookType] as Record<string, unknown> | undefined
      if (variant) {
        if (variant.opening) output.opening = variant.opening
        if (variant.questions) output.questions = variant.questions
        if (variant.itemSchema) {
          // Merge into the first array-type question's itemSchema
          const qs = output.questions as Array<Record<string, unknown>> | undefined
          if (qs) {
            const arrayQ = qs.find(q => q.type === 'array')
            if (arrayQ) arrayQ.itemSchema = variant.itemSchema
          }
        }
      }
      delete output.variants
    }
  }

  return '```json\n' + JSON.stringify(output, null, 2) + '\n```'
}

/**
 * Returns true if any OTHER completed stage used the same coaching persona as
 * the given stage. Used to decide whether to omit the activation intro.
 */
function hasPersonaBeenIntroduced(currentStageId: string, state: ProjectState): boolean {
  const current = getPersonaForStage(currentStageId)
  if (!current) return false
  return Object.entries(state.stages ?? {})
    .filter(([id, s]) => id !== currentStageId && s?.completed)
    .some(([id]) => getPersonaForStage(id)?.name === current.name)
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
