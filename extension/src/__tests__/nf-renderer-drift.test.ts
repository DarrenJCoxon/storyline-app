// CB-04b — Static drift test that locks NF stage renderers to their
// stage guides.
//
// Background: each NF stage has TWO definitions:
//   1. The conversation guide (packages/core/src/ai/stage-guides-nf-*.ts)
//      — defines the questions the AI asks the user, by `key`. The LLM
//      emits a JSON patch using these keys.
//   2. The markdown renderer (packages/core/src/output/stage-doc.ts:
//      nfRenderers) — reads keys from state and produces the
//      planning/stages/<id>.md doc.
//
// If the renderer reads keys that the guide doesn't define (or vice
// versa), the markdown body silently misses content. CB-04 found one
// such case (`dna-promise` reading `measurableOutcome` instead of
// `subtitleAlt`). This test walks every NF stage and asserts the
// renderer's output reflects every required-or-listed question key
// from the guide.
//
// Mechanism: for each stage with a renderer, build a state where
// every flat question key is filled with a unique sentinel string,
// run writeStageDoc, read the .md, and check every sentinel appears.
// Any missing sentinels are real drift bugs.
//
// Limitations:
//   - Only flat scalar keys are checked. `type: 'array'` questions
//     with itemSchema (e.g. dna-comps `comps`) are skipped — those
//     need separate per-stage tests because their state shape differs.
//   - Stages without a renderer in nfRenderers are skipped (some
//     transition stages legitimately don't produce a doc).
//
// When this test fails, it reports every drifting (stageId, key) pair
// in one go so the fix-list is actionable in a single pass.

import { describe, it, expect, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

vi.mock('vscode', () => ({
  workspace: { workspaceFolders: undefined },
}))

import {
  writeStageDoc,
  NF_DNA_GUIDES,
  PIPELINE_A_GUIDES,
  PIPELINE_B_GUIDES,
  PIPELINE_C_GUIDES,
  type ProjectState,
} from '@storyline/core'

interface GuideQuestion {
  key: string
  required?: boolean
  type?: string          // 'array' / 'object' / undefined (= scalar)
  itemSchema?: unknown   // present on array-type questions
}

interface GuideShape {
  id: string
  questions?: GuideQuestion[]
  sections?: { questions?: GuideQuestion[] }[]
}

function flatScalarKeys(guide: GuideShape): string[] {
  const keys: string[] = []
  const harvest = (qs: GuideQuestion[] | undefined): void => {
    for (const q of qs ?? []) {
      if (!q.key) continue
      // Skip array/object questions — their shape doesn't fit the
      // flat-key sentinel test. Track separately if needed.
      if (q.type === 'array' || q.type === 'object' || q.itemSchema) continue
      keys.push(q.key)
    }
  }
  harvest(guide.questions)
  for (const s of guide.sections ?? []) harvest(s.questions)
  return keys
}

function makeTmpProject(): string {
  const dir = path.join(os.tmpdir(), `storyline-drift-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(path.join(dir, '.storyline'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'planning', 'stages'), { recursive: true })
  return dir
}

async function checkStageDrift(stageId: string, keys: string[]): Promise<{ rendered: boolean; missing: string[] }> {
  const projectDir = makeTmpProject()
  // Synthetic state with a unique sentinel per key. We put it both at
  // top-level and under nfStages because nfStage() in stage-doc.ts
  // checks both — let the renderer find it via whichever path.
  const stageState: Record<string, string> = {}
  for (const k of keys) stageState[k] = `__SENTINEL_${stageId}_${k}__`

  const state = {
    mode: 'nonfiction',
    [stageId]: stageState,
    nfStages: { [stageId]: stageState },
  } as unknown as ProjectState

  const filePath = await writeStageDoc(stageId, state, projectDir)
  if (!filePath) return { rendered: false, missing: [] }

  const md = fs.readFileSync(filePath, 'utf-8')
  const missing = keys.filter(k => !md.includes(`__SENTINEL_${stageId}_${k}__`))
  return { rendered: true, missing }
}

interface DriftReport {
  stageId: string
  missingKeys: string[]
}

async function auditGuideCollection(
  collectionLabel: string,
  guides: Record<string, GuideShape>,
): Promise<DriftReport[]> {
  const reports: DriftReport[] = []
  for (const stageId of Object.keys(guides)) {
    const guide = guides[stageId]
    const keys = flatScalarKeys(guide)
    if (keys.length === 0) continue  // Nothing to assert
    const { rendered, missing } = await checkStageDrift(stageId, keys)
    if (!rendered) continue  // No renderer for this stage — skip silently
    if (missing.length > 0) {
      reports.push({ stageId: `${collectionLabel}/${stageId}`, missingKeys: missing })
    }
  }
  return reports
}

describe('NF stage renderer ↔ guide drift (CB-04b)', () => {
  it('every flat scalar question key reaches the rendered markdown', async () => {
    const drift: DriftReport[] = [
      ...await auditGuideCollection('dna', NF_DNA_GUIDES as unknown as Record<string, GuideShape>),
      ...await auditGuideCollection('pa',  PIPELINE_A_GUIDES as unknown as Record<string, GuideShape>),
      ...await auditGuideCollection('pb',  PIPELINE_B_GUIDES as unknown as Record<string, GuideShape>),
      ...await auditGuideCollection('pc',  PIPELINE_C_GUIDES as unknown as Record<string, GuideShape>),
    ]

    if (drift.length > 0) {
      const report = drift
        .map(d => `  ${d.stageId}: missing keys [${d.missingKeys.join(', ')}]`)
        .join('\n')
      // Single combined failure with the full fix-list — easier to act on
      // than one assertion per stage.
      throw new Error(
        `Renderer/guide drift detected in ${drift.length} NF stage(s):\n${report}\n\n` +
        `Fix: align nfRenderers in packages/core/src/output/stage-doc.ts with the question keys in packages/core/src/ai/stage-guides-nf-*.ts.`,
      )
    }

    expect(drift).toHaveLength(0)
  })
})
