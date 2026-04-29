// FIC-A.6 — Planning-complete artefact discovery.
//
// When fiction (or NF) planning completes, the chat panel posts a
// `planningComplete` card listing every artefact the project has produced
// that the writer can open right now. The card replaces the previous
// silent null-stage return with a concrete handoff into drafting.
//
// This helper is pure — it walks `projectDir` and reports what exists.
// It does NOT generate artefacts; that's the job of the renderers fired
// during normal stage saves. If an artefact doesn't exist yet (because
// the milestone that produces it — story bible, arc matrix, promise
// ledger — hasn't shipped), the corresponding field is null and the
// webview card omits the action.

import * as fs from 'fs'
import * as path from 'path'
import type { ProjectState, WritingPlan } from '@storyline/core'

export interface PlanningCompleteArtefacts {
  mode: 'fiction' | 'nonfiction'
  masterDocPath: string | null
  nfMasterDocPath: string | null    // NF-11.5
  chapterCardPaths: string[]
  manuscriptPaths: string[]
  /** First chapter the writer should open (manuscript file if it exists, else card). */
  firstChapterPath: string | null
  /** Future-milestone artefacts. Null until the producing milestone ships. */
  storyBiblePath: string | null     // FIC-D
  arcMatrixPath: string | null      // FIC-D
  promiseLedgerPath: string | null  // FIC-C
  researchTodoPath: string | null   // NF-11.7
  claimLedgerPath: string | null    // NF-12
  figureRegistryPath: string | null // NF-13
}

export function discoverPlanningArtefacts(
  state: ProjectState,
  plan: WritingPlan,
  projectDir: string,
): PlanningCompleteArtefacts {
  const exists = (rel: string): string | null => {
    const abs = path.join(projectDir, rel)
    return fs.existsSync(abs) ? rel : null
  }

  const chapterCardPaths = listIfDir(projectDir, 'planning/chapters', /^\d{2}(-[a-z0-9-]+)?\.md$/)
  const manuscriptPaths = listIfDir(projectDir, state.writing?.manuscriptPath ?? 'manuscript', /^\d{2}.*\.md$/)

  // Pick the first chapter to open — manuscript file if it exists, else card.
  let firstChapterPath: string | null = null
  if (manuscriptPaths.length > 0) {
    firstChapterPath = manuscriptPaths[0]
  } else if (chapterCardPaths.length > 0) {
    firstChapterPath = chapterCardPaths[0]
  } else {
    // Fall back to the seed chapter scaffold if it exists.
    firstChapterPath = exists('manuscript/chapter-01.md')
  }

  return {
    mode: plan.mode === 'nonfiction' ? 'nonfiction' : 'fiction',
    masterDocPath: exists('output/master-document.md'),
    nfMasterDocPath: exists('output/nf-master-document.md'),
    chapterCardPaths,
    manuscriptPaths,
    firstChapterPath,
    storyBiblePath: exists('output/story-bible.md'),
    arcMatrixPath: exists('output/character-arc-matrix.md'),
    promiseLedgerPath: exists('output/promise-payoff-ledger.md'),
    researchTodoPath: exists('output/research-todo.md'),
    claimLedgerPath: exists('output/claim-evidence-ledger.md'),
    figureRegistryPath: exists('output/figure-registry.md'),
  }
}

function listIfDir(projectDir: string, relDir: string, match: RegExp): string[] {
  const abs = path.join(projectDir, relDir)
  try {
    if (!fs.statSync(abs).isDirectory()) return []
    return fs.readdirSync(abs)
      .filter(n => match.test(n))
      .sort()
      .map(n => path.posix.join(relDir.replace(/\\/g, '/'), n))
  } catch {
    return []
  }
}
