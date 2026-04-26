import type { ProjectState } from '@storyline/core'
import { getFictionSkill, getNonfictionSkill, getExtensionPath } from './skill-loader.js'

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

const EXTENSION_ADAPTER = `
---

## How to operate inside this VS Code extension

You are running inside a chat panel, not the Claude Code CLI. Adapt the harness behavior:

- **Do not** suggest the writer run \`npx storyline-vsc <command>\` — the extension handles all CLI calls behind the scenes.
- **Do not** ask the writer to switch tools or paste output.
- **All state writes happen via JSON code blocks you emit.** When you have captured a complete answer for a field, emit a fenced JSON block of the form:

  \`\`\`json
  { "<stageId>": { "<fieldKey>": <value>, ... } }
  \`\`\`

  The extension will parse this block, save it to \`.storyline/state.json\`, and push it to durable memory automatically. You do not need to mention the save — the extension shows the writer a confirmation card.

- **Memory is automatic.** Every save pushes to memory in the background. You can reference previously captured state (it is in the "Current state" JSON below) without asking the writer to repeat themselves.

- **One stage at a time.** When the current stage's required fields are saved, the extension advances you to the next stage automatically and gives you a fresh system prompt. Do not jump ahead.

- **Conversational, not interrogative.** Follow the harness questions but adapt the wording to what the writer just said. Never produce a bulleted questionnaire.

- **Never write prose for the writer.** Storyline plans only.
`

export function buildSystemPrompt(stageId: string, state: ProjectState): string {
  // Stage 0: mode gate — runs before anything else if mode hasn't been confirmed yet
  if (stageId === 'mode' || !state.stages?.mode?.completed) {
    return MODE_GATE_PROMPT
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

  return [skill, EXTENSION_ADAPTER, stageContext].join('\n\n')
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
