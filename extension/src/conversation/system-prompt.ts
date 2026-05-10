import type { ProjectState } from '@storyline/core'
import { getStageGuide, getNfStageGuide, getPersonaForStage, gateStageSave } from '@storyline/core'
import { getFictionSkill, getNonfictionSkill, getExtensionPath } from './skill-loader.js'
import { collectWikiArticles } from '../wiki/article-injector.js'
import { buildPinnedNotesBlock } from '../sidebar/research-pins.js'
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
  \`\`\`file:planning/chapters/ch-19.md
  # Chapter 19 — The Betrayal

  ...full markdown content...
  \`\`\`
  The extension writes it to disk instantly. You CAN and SHOULD write directly into docs/ and manuscript/ files this way whenever the writer asks you to update chapter cards, planning docs, or any project file. Never tell the writer you "can't write files" — use this syntax instead.
- **Reading project files**: if you need to read a file that isn't already in your context (e.g. a chapter card the writer wants you to review), emit a JSON block with a \`file_read\` key. The extension will inject the contents and re-run you automatically. Single file: \`{ "file_read": "planning/chapters/ch-01.md" }\`. Multiple: \`{ "file_read": ["planning/chapters/ch-01.md", "planning/chapters/ch-02.md"] }\`. Never tell the writer you "can't read files" — use this instead.
  - **Long files (research transcripts, sample chapters, source PDFs)**: each read returns up to 60 KB. If the file is larger, the response ends with a footer that gives you the exact offset for the next chunk — emit \`{ "file_read": { "path": "research/big-source.pdf", "offset": 60000 } }\` to keep reading from there. You can chain up to three such reads per turn, so a single research file of ~180 KB can be fully ingested in one conversational beat. Don't tell the writer "this file is too large" — fetch the next chunk via offset.
- **Banner / startup display blocks** the harness asks you to "Display" (e.g. \`Storyline — Save the Cat Planning Harness / Character-first…\` or \`Storyline — Returning to <Project Title>\`) → **do not display them.** They were CLI-init flourishes for the original terminal harness. The extension's onboarding handles project-state messaging; jumping straight into the active stage is the right behaviour here.
- **Persona introduction**: introduce your coaching persona once on the FIRST chat turn of the project (the mode-gate or first non-mode stage). Subsequent stages of the same persona — and any time \`stages.completed\` already shows prior stages — must continue the conversation directly without "I'm The Strategist…" / "Before we build anything…" preamble. Look at the prior assistant turns in the conversation history; if you've already introduced yourself, don't do it again.
- **Plain English only**: the stageInfo JSON below uses camelCase keys as machine identifiers (e.g. \`whatTheyGotRight\`, \`yourGap\`, \`marketGap\`, \`targetReader\`). NEVER say these identifiers aloud in your responses. Always convert them to natural prose: "what they got right", "your gap", "market gap", "target reader", etc. The writer must never see raw camelCase field names in the chat.
- **Signal clearly when the ball is in the writer's court at ambiguous moments**: when a message ends with a summary, a stage-complete note, or a "what's next" suggestion — rather than an obvious question — add a brief closing prompt (*"Ready to move on?"*, *"Shall we continue?"*, *"Over to you"*) so the writer knows they need to respond. Don't do this after every message; only when it would otherwise be unclear whether the conversation is waiting on them.
- **Build on what the writer already told you**: the conversation history above this kickoff often includes turns from a previous stage where the writer named their book's subject, premise, genre, or other facts already covered by your stage's first questions. ALWAYS read those prior turns before asking. If the writer already gave you the answer to your stage's opening question, acknowledge it back to them in plain English (*"Great — your book is about X"*) and move directly to the NEXT thing the stage needs, instead of asking them to repeat themselves. Asking the writer to re-state something they just told you is the worst possible UX.

Everything else — depth, conversational pacing, question coverage, gates, critique behaviour, transitions — comes straight from the harness skill below. Mirror it exactly.

---
`

import { projectManifestBlock } from './project-manifest.js'

export function buildSystemPrompt(
  stageId: string,
  state: ProjectState,
  memoryBlock?: string,
  activeChapterRelPath?: string,
  /** NT-21: top-K NuVector hits relevant to the writer's most recent message. */
  semanticContextBlock?: string,
): string {
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

  // NT-20: lightweight project manifest. Lives in EVERY prompt regardless
  // of stage so the AI never has to guess what files exist where. Costs
  // ~1-15 KB depending on project size — well under the 160 KB cap.
  const manifestBlock = projectManifestBlock(state._meta?.projectPath ?? null)

  const stateBlock = '```json\n' + JSON.stringify(stateForStage(stageId, state), null, 2) + '\n```'

  // Stage-close cue. Long conversations cause the AI to drift into
  // pure-prose wrap-ups ("Great, captured — ready to move on?") without
  // emitting the JSON save block, leaving the stage stuck. When the
  // gate already passes, tell it explicitly so it knows to either emit
  // the save block now or, if it had something more to add, do so
  // before doing so. The runtime will auto-advance on the next turn if
  // the AI still doesn't emit JSON, but a clear nudge here keeps the
  // save-block discipline visible.
  const stageCloseCue = buildStageCloseCue(stageId, state)

  // Trigger-based reference docs — only side-loaded when the active stage
  // actually needs them. Mirrors the original harness's CLI pattern where
  // /storyline calls `stage-info` (gets the brief) and then opens specific
  // reference docs only when the stage demands them.
  const triggerDocs = collectTriggerDocs(stageId, state, activeChapterRelPath)

  // Compiled wiki articles — pre-synthesised prose summaries of earlier
  // planning stages, injected only for the articles relevant to this stage.
  // Empty string when no articles have been compiled yet (early in planning).
  const wikiBlock = collectWikiArticles(stageId, state._meta?.projectPath ?? null, state)

  const stageContext = `
---

## stageInfo (output of \`stage-info ${stageId}\`)

${stageInfoBlock}
${manifestBlock ? '\n' + manifestBlock + '\n' : ''}${semanticContextBlock ? '\n' + semanticContextBlock + '\n' : ''}${wikiBlock ? '\n' + wikiBlock + '\n' : ''}${memoryBlock ? '\n' + memoryBlock + '\n' : ''}
## Current state (output of \`next\`)

${stateBlock}
${stageCloseCue ? '\n' + stageCloseCue + '\n' : ''}${triggerDocs ? '\n---\n\n' + triggerDocs : ''}
`

  const full = [EXTENSION_OVERRIDE, skill, stageContext].filter(Boolean).join('\n\n')
  return capSystemPrompt(full, triggerDocs, wikiBlock)
}

// Backend limit is 256 KB for the entire request body (messages + systemPrompt +
// overhead). Keep the system prompt under this ceiling so there's always room for
// the message array. When over budget, shed lowest-priority blocks first.
const SYSTEM_PROMPT_MAX_BYTES = 160_000 // ~40k tokens — leaves ~96 KB for messages

function capSystemPrompt(full: string, triggerDocs: string, wikiBlock: string): string {
  if (byteLength(full) <= SYSTEM_PROMPT_MAX_BYTES) return full

  // Trim strategy: shed triggerDocs first (research files, pinned notes, beat
  // guide are helpful but not load-bearing for stage logic), then wiki articles.
  // The core prompt (skill + stageInfo + state) is always preserved.
  let trimmed = full

  if (triggerDocs) {
    trimmed = trimmed.replace('\n---\n\n' + triggerDocs, '')
    if (byteLength(trimmed) <= SYSTEM_PROMPT_MAX_BYTES) return trimmed
  }

  if (wikiBlock) {
    trimmed = trimmed.replace('\n' + wikiBlock + '\n', '')
  }

  return trimmed
}

function byteLength(s: string): number {
  // UTF-8 byte count — same measure the backend uses for its 256 KB guard.
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c < 0xd800 || c >= 0xe000) n += 3
    else { n += 4; i++ }
  }
  return n
}

/**
 * Side-load reference docs based on the active stage. Mirrors the original
 * /storyline harness's per-stage doc triggers — beat-guide.md when the
 * writer reaches the beat sheet or scene outline, etc. Anything not in
 * the trigger list stays out of the prompt entirely.
 */
function collectTriggerDocs(stageId: string, state: ProjectState, activeChapterRelPath?: string): string {
  const docs: string[] = []
  if (stageId === 'beatSheet' || stageId === 'sceneOutline') {
    const beatGuide = readSideDoc('skill-content/beat-guide.md')
    if (beatGuide) docs.push('## Beat Sheet reference (Save the Cat 15 beats)\n\n' + beatGuide)
  }
  if (stageId === 'ac-syllabus') {
    const syllabusCtx = collectSyllabusContext(state._meta?.projectPath ?? null)
    if (syllabusCtx) docs.push(syllabusCtx)
  }
  // Always-on: writer-supplied reference material in research/. Works for
  // both fiction (worldbuilding sources, real-world inspiration) and
  // non-fiction (source documents, study guides, mark schemes, etc.).
  const researchCtx = collectResearchContext(state._meta?.projectPath ?? null)
  if (researchCtx) docs.push(researchCtx)
  const pinnedCtx = state._meta?.projectPath ? buildPinnedNotesBlock(state._meta.projectPath, activeChapterRelPath) : ''
  if (pinnedCtx) docs.push(pinnedCtx)
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

// Read writer-supplied reference material from <project>/research/.
// Active for every stage in both fiction and NF mode — anything the
// writer drops here (syllabuses, mark schemes, study guides, source
// extracts, worldbuilding notes, real-world inspiration, etc.) becomes
// part of the AI's context. Capped at RESEARCH_BUDGET_BYTES total so a
// large file can't blow the context window; per-file truncation keeps
// every dropped file at least partially represented.
const RESEARCH_BUDGET_BYTES = 60_000   // ~15k tokens — leaves room for the rest of the prompt
const RESEARCH_PER_FILE_BYTES = 20_000 // hard cap per file before the budget logic kicks in

function collectResearchContext(projectPath: string | null): string {
  if (!projectPath) return ''
  const dir = path.join(projectPath, 'research')
  if (!fs.existsSync(dir)) return ''
  let files: string[]
  try {
    files = fs.readdirSync(dir)
      // CB-20: PDF/DOCX/EPUB join the markdown set. The actual text
      // extraction is async (pdf-parse / mammoth / EPUB unzip), so we
      // route through the cache at .storyline/research-cache/<rel>.txt
      // — populated by prewarmResearchCache (called from activate when
      // a project is opened) and refreshed on every sidebar load.
      .filter(f =>
        /\.(md|markdown|txt|pdf|docx|epub)$/i.test(f) &&
        f.toLowerCase() !== 'readme.md' &&
        !f.startsWith('_'),    // underscore-prefix = inactive; sits in the folder but isn't loaded
      )
      .sort()
  } catch { return '' }
  if (files.length === 0) return ''

  let remaining = RESEARCH_BUDGET_BYTES
  const parts: string[] = []
  const skipped: string[] = []

  for (const f of files) {
    if (remaining <= 0) { skipped.push(f); continue }
    const ext = path.extname(f).toLowerCase()
    const isText = ext === '.md' || ext === '.markdown' || ext === '.txt'
    let content: string
    try {
      if (isText) {
        content = fs.readFileSync(path.join(dir, f), 'utf-8').trim()
      } else {
        // Heavy formats: read the prewarm cache. If the cache file
        // doesn't exist yet (e.g. the user just dropped the file in
        // and the prewarm hasn't run), skip — the next workspace open
        // or sidebar refresh will populate it.
        const cacheFile = path.join(projectPath, '.storyline', 'research-cache', `research_${f}.txt`)
        if (!fs.existsSync(cacheFile)) { skipped.push(f); continue }
        content = fs.readFileSync(cacheFile, 'utf-8').trim()
      }
    } catch { continue }
    if (!content) continue
    const allow = Math.min(content.length, RESEARCH_PER_FILE_BYTES, remaining)
    const slice = content.slice(0, allow)
    const truncated = slice.length < content.length
    const tag = isText ? '' : `  *(${ext.replace('.', '').toUpperCase()} — extracted text)*`
    parts.push(`### ${f}${tag}${truncated ? '  *(truncated)*' : ''}\n\n${slice}`)
    remaining -= slice.length
  }

  if (parts.length === 0) return ''

  const skippedNote = skipped.length > 0
    ? `\n\n*(${skipped.length} additional file${skipped.length === 1 ? '' : 's'} not loaded due to context budget: ${skipped.join(', ')})*`
    : ''

  return `## Research materials (from research/ folder)

*The writer has placed the following reference material in their project's \`research/\` folder. Treat these as authoritative source documents — quote and cite from them when relevant, and don't contradict facts they assert.*

${parts.join('\n\n---\n\n')}${skippedNote}`
}

function readSideDoc(rel: string): string | null {
  try {
    const ext = getExtensionPath()
    if (!ext) return null
    return fs.readFileSync(path.join(ext, rel), 'utf-8')
  } catch { return null }
}

/**
 * If the active stage already meets every required field but isn't yet
 * marked complete, surface that to the AI so it stops drifting. Returns
 * empty string when the gate hasn't passed yet, when the stage is `mode`
 * (which uses its own gate), or when the stage was already advanced.
 */
function buildStageCloseCue(stageId: string, state: ProjectState): string {
  if (stageId === 'mode') return ''
  if (state.stages?.[stageId]?.completed) return ''
  const gate = gateStageSave(stageId, state)
  if (!gate.complete) return ''
  return [
    '## ⚠️ Stage-close cue',
    '',
    `Every required field for **${stageId}** is now captured in state. The next turn must emit the save block:`,
    '',
    '```json',
    `{ "${stageId}": { …all stage fields you have captured, even if previously saved partially… } }`,
    '```',
    '',
    'Do NOT keep gathering more for this stage unless the writer explicitly asks for it. Confirm what\'s been captured in one short sentence, emit the JSON block, and let the runtime advance to the next stage. If you reply in pure prose without the JSON block, the runtime will auto-advance on the next turn — but emitting the block is cleaner and gives you control over the final captured shape.',
  ].join('\n')
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

// ─── Stage-scoped state injection ────────────────────────────────────────────
//
// Instead of dumping the entire project state on every turn (1,000–5,000 tokens
// of raw JSON including null fields for incomplete stages), we inject only the
// fields the active stage actually needs, then strip null/empty values.
//
// Always included regardless of stage: mode, pipeline, subMode, bookType,
// stages (completion tracking) — the skill needs these everywhere.
//
// Fiction stages: a relevance map controls which top-level keys are included.
// NF stages:      all bookDna + nfStages (after null stripping) — DNA context
//                 is load-bearing for every pipeline stage.

// NT-20: chapterOutline and sceneOutline are always-relevant project shape.
// The transcript bug (2026-05-10) showed the AI inventing a duplicate
// chapter because chapterOutline wasn't in the slice for the active stage.
// These are small enough to always carry; the compactJson pass strips them
// to nothing in early projects where they haven't been populated yet.
const ALWAYS_INCLUDE: ReadonlyArray<string> = [
  'mode', 'pipeline', 'subMode', 'bookType', 'stages',
  'chapterOutline', 'sceneOutline',
]

const FICTION_STAGE_FIELDS: Readonly<Record<string, ReadonlyArray<string>>> = {
  genre:          ['genre'],
  premise:        ['genre', 'premise'],
  protagonist:    ['genre', 'premise', 'protagonist'],
  characters:     ['genre', 'premise', 'protagonist', 'characters'],
  relationships:  ['protagonist', 'characters'],
  logline:        ['genre', 'premise', 'protagonist', 'characters', 'logline'],
  beatSheet:      ['genre', 'premise', 'protagonist', 'characters', 'logline', 'beatSheet'],
  bStory:         ['protagonist', 'characters', 'beatSheet', 'bStory'],
  subplots:       ['protagonist', 'beatSheet', 'bStory', 'subplots'],
  sceneOutline:   ['premise', 'protagonist', 'beatSheet', 'bStory', 'subplots', 'sceneOutline'],
  plotThreads:    ['characters', 'beatSheet', 'sceneOutline', 'plotThreads'],
  chapterOutline: ['beatSheet', 'sceneOutline', 'plotThreads', 'chapterOutline'],
  critique:       ['genre', 'premise', 'protagonist', 'characters', 'logline', 'beatSheet', 'bStory', 'subplots', 'sceneOutline'],
  masterDoc:      ['genre', 'premise', 'protagonist', 'characters', 'logline', 'beatSheet', 'bStory', 'subplots', 'sceneOutline', 'plotThreads', 'chapterOutline'],
}

// NF stage prefixes — dna-, pa-, pb-, pc-, ac- and the unprefixed academic DNA stages
function isNfStage(stageId: string): boolean {
  return /^(dna-|pa-|pb-|pc-|ac-)/.test(stageId)
}

function stateForStage(stageId: string, state: ProjectState): Record<string, unknown> {
  const raw = state as unknown as Record<string, unknown>
  const result: Record<string, unknown> = {}

  for (const key of ALWAYS_INCLUDE) {
    if (raw[key] != null) result[key] = raw[key]
  }

  const isNf = raw['mode'] === 'nonfiction' || isNfStage(stageId)
  const extraKeys: ReadonlyArray<string> = isNf
    ? ['bookDna', 'nfStages']
    : (FICTION_STAGE_FIELDS[stageId] ?? (Object.keys(raw) as string[]))

  for (const key of extraKeys) {
    if (raw[key] != null) result[key] = raw[key]
  }

  return compactJson(result) as Record<string, unknown>
}

// Strip null, undefined, empty string, and empty arrays/objects so the JSON
// the AI sees contains only data that was actually entered by the writer.
// Keeps false and 0 — those are meaningful values.
function compactJson(value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value.trim() === '' ? undefined : value
  if (Array.isArray(value)) {
    const items = value.map(compactJson).filter(v => v !== undefined)
    return items.length === 0 ? undefined : items
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cv = compactJson(v)
      if (cv !== undefined) out[k] = cv
    }
    return Object.keys(out).length === 0 ? undefined : out
  }
  return value
}
