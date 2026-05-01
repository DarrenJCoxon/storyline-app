import * as path from 'path'
import * as fs from 'fs'
import { DEFAULT_STATE } from '@storyline/core'
import { ensureCompileConfig } from '../compile/compile-config.js'

/**
 * Mirrors `npx storyline-vsc init` from the original /storyline harness:
 * scaffolds .storyline/, output/, manuscript/ (with seed README + chapter),
 * docs/welcome.md, and compile.config.json. Idempotent — never overwrites
 * existing files.
 */
export function scaffoldProject(
  workspaceRoot: string,
  name: string,
): string {
  // 1. Directories
  // Layout convention:
  //   manuscript/  — prose only (the thing that compiles)
  //   planning/    — every generated planning artefact (book-dna, master-doc,
  //                  bibliography, fact-check, chapters/, stages/)
  //   research/    — writer-supplied source material the AI reads
  //   output/      — only what the compile pipeline produces (EPUBs, PDFs)
  //   docs/        — onboarding (welcome.md)
  const dirs = [
    path.join(workspaceRoot, '.storyline'),
    path.join(workspaceRoot, 'manuscript'),
    path.join(workspaceRoot, 'planning'),
    path.join(workspaceRoot, 'planning', 'chapters'),
    path.join(workspaceRoot, 'planning', 'stages'),
    path.join(workspaceRoot, 'research'),
    path.join(workspaceRoot, 'output'),
    path.join(workspaceRoot, 'docs'),
  ]
  for (const dir of dirs) fs.mkdirSync(dir, { recursive: true })

  // 2. .storyline/state.json — initial state with project metadata
  const stateFile = path.join(workspaceRoot, '.storyline', 'state.json')
  if (!fs.existsSync(stateFile)) {
    const now = new Date().toISOString()
    const state = {
      ...DEFAULT_STATE,
      _meta: {
        ...DEFAULT_STATE._meta,
        projectTitle: name,
        projectPath: workspaceRoot,
        createdAt: now,
        updatedAt: now,
      },
    }
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8')
  }

  // 3. Seed manuscript files (only if missing — never overwrite the writer's prose)
  writeIfMissing(path.join(workspaceRoot, 'manuscript', 'README.md'), MANUSCRIPT_README)
  writeIfMissing(path.join(workspaceRoot, 'manuscript', 'chapter-01.md'), SEED_CHAPTER)

  // 4. Welcome doc
  writeIfMissing(path.join(workspaceRoot, 'docs', 'welcome.md'), WELCOME_DOC)

  // 4b. Research folder README — explains the drop-folder convention to the writer
  writeIfMissing(path.join(workspaceRoot, 'research', 'README.md'), RESEARCH_README)

  // 5. compile.config.json
  ensureCompileConfig(workspaceRoot)

  return stateFile
}

function writeIfMissing(filePath: string, content: string): void {
  if (fs.existsSync(filePath)) return
  fs.writeFileSync(filePath, content, 'utf8')
}

/**
 * One-shot backfill for projects scaffolded before research/ existed.
 * Called on extension activation when a Storyline project is detected.
 * No-op if research/ already exists. Idempotent.
 */
export function ensureResearchFolder(workspaceRoot: string): void {
  const dir = path.join(workspaceRoot, 'research')
  fs.mkdirSync(dir, { recursive: true })
  writeIfMissing(path.join(dir, 'README.md'), RESEARCH_README)
}

/**
 * One-shot backfill for projects scaffolded before planning/ existed.
 * Generators (book-dna.md, master-document.md, stages/, chapters/, etc.)
 * now write to planning/ instead of output/ + docs/chapters/. Existing
 * projects need the empty folders so the first save doesn't have to
 * mkdir -p deep paths. Idempotent — no-op if already there.
 */
export function ensurePlanningFolder(workspaceRoot: string): void {
  for (const sub of ['planning', 'planning/chapters', 'planning/stages']) {
    fs.mkdirSync(path.join(workspaceRoot, sub), { recursive: true })
  }
  writeIfMissing(path.join(workspaceRoot, 'planning', 'README.md'), PLANNING_README)
}

const MANUSCRIPT_README = `# Manuscript

Your novel's prose lives here. One \`.md\` file per chapter is the usual pattern:

\`\`\`
manuscript/
├── chapter-01.md
├── chapter-02.md
├── chapter-03.md
└── ...
\`\`\`

Word counts shown in the Storyline status bar scan only this folder — so
planning docs in \`output/\` and notes elsewhere don't inflate the total.

If you prefer a different layout (e.g. \`chapters/\` or \`drafts/\`), edit
\`.storyline/state.json\` and change \`writing.manuscriptPath\` to the
folder you want scanned.

Delete this README once you're comfortable with the layout.
`

const SEED_CHAPTER = `# Chapter One

Welcome to Storyline. This is a seeded chapter file to get you started — replace this text with your own prose when you're ready.

A few things that will help as you write:

- **Your prose goes here.** Delete everything in this file and start typing. Every 1.5 seconds after you stop typing, Storyline auto-saves your work.
- **One \`.md\` file per chapter** is the usual pattern. Add \`chapter-02.md\`, \`chapter-03.md\`, and so on as you go. The status bar at the bottom of VS Code shows your total word count across the whole manuscript.
- **Leave research questions inline** in double curly braces as you draft. For example: {{check the opening times of the British Museum}}. Keep writing — don't break flow to look things up.
- **Scene breaks** render as a centred line when you type \`* * *\` on its own line between paragraphs.
- **Compile when ready.** Press \`Cmd+Shift+P\` / \`Ctrl+Shift+P\`, type "Storyline: Compile to EPUB" or "Storyline: Compile to PDF", and the finished file lands in \`output/\`.

Ready when you are. Delete this placeholder and write your opening.
`

const WELCOME_DOC = `# Welcome to Storyline

This file is a scratchpad — notes, character sheets, research, reminders to yourself — anything that isn't prose. Your novel's chapters live in \`manuscript/\`; everything supporting the novel can live here in \`docs/\`.

## The three-column layout

Storyline expects you to work in three columns:

- **Left:** the file tree (your project).
- **Middle:** this document, or whatever supporting material you're consulting right now.
- **Right:** the chapter you're writing.

To open a file in the right-hand column, right-click it in the file tree and choose **"Storyline: Open to the Side"**, or select the file in the tree and press \`Cmd+Enter\` (Mac) or \`Ctrl+Enter\` (Windows).

## Starting a planning session

Click the **Storyline** item in the bottom-left status bar to open the planning chat. The harness will walk you through Save the Cat (fiction) or Book DNA (non-fiction), one stage at a time.

## What to delete, what to keep

- Delete the content of this file when you're ready — it's just an onboarding note.
- Keep \`.storyline/\` untouched (that's your planning state).
- Keep \`output/\` alone unless you want to clear old compiled EPUBs/PDFs.
- The \`manuscript/README.md\` can be deleted once you're comfortable with the folder's convention.

Happy writing.
`

const RESEARCH_README = `# Research

Drop reference material here and the planning AI will read it as part of every conversation. Works for fiction and non-fiction:

- **Non-fiction:** exam syllabuses, mark schemes, study guides, model essays, source extracts, primary documents
- **Fiction:** worldbuilding sources, real-world inspiration, style references, period research

## Supported files

\`.md\`, \`.markdown\`, \`.txt\` — anything plain-text. Files are read alphabetically.

PDFs, DOCX, and other binary formats aren't ingested directly yet. For those, paste the relevant extract into a new \`.md\` file in this folder.

## How it's used

Every file you put here is injected into the AI's system prompt at every planning stage. The AI is instructed to treat it as authoritative source material — to quote and cite from it where relevant, and not to contradict its facts.

## Limits

There's a ~60 KB total budget across all research files (roughly 15,000 tokens) to leave room in the AI's context for the rest of the conversation. Larger files are truncated; if you exceed the budget, files later in alphabetical order are skipped (and the AI is told which ones).

If you want to keep multiple long source documents but only some active at a time, prefix the inactive ones with an underscore (\`_\`) — files starting with \`_\` stay in the folder but aren't loaded into the AI's context.

## What's the difference from \`docs/\` ?

- \`docs/\` is **your** scratchpad — notes you read, the AI doesn't.
- \`research/\` is **the AI's** reading list — the AI sees it, you maintain it.
`

const PLANNING_README = `# Planning

Every artefact the planning pipeline generates lands here. You don't write to this folder — Storyline does, and rewrites these files on every relevant save. Editing them by hand will work for a session, but the next save in the originating stage will overwrite your changes.

## What you'll find

- \`book-dna.md\` / \`book-dna.json\` — DNA consolidation
- \`master-document.md\` (fiction) / \`nf-master-document.md\` / \`academic-master-document.md\` — the headline planning artefact
- \`bibliography.md\` — sources cited
- \`fact-check-report.md\` — claim verification status
- \`detailed-chapter-design.md\` — extended per-chapter plan
- \`promise-payoff-ledger.md\` (fiction) — promise/payoff tracking
- \`story-bible.md\` (fiction) — character / world reference
- \`character-arc-matrix.md\` (fiction) — arc by chapter
- \`research-todo.md\` (NF) — open research items
- \`claim-evidence-ledger.md\` (NF) — claim → evidence map
- \`figure-registry.md\` — figures planned
- \`glossary.md\` (academic) — key terms by chapter
- \`exercise-index.md\` (academic) — exercise catalogue
- \`prerequisite-chain.md\` (academic) — chapter ordering
- \`learning-outcome-coverage.md\` (academic) — syllabus coverage
- \`chapters/\` — per-chapter planning notes (one file per chapter)
- \`stages/\` — per-stage state captures (one file per planning stage)

## What's the difference from \`output/\` ?

- \`planning/\` is **how the book gets made** — planning notes, drafts of structure, AI-generated reference docs.
- \`output/\` is **the finished book** — only EPUBs, PDFs, and print preview HTML from the compile pipeline.
`


