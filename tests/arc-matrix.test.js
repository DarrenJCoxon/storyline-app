// FIC-D.6 — Character arc matrix renderer tests.
//
// Covers:
//  (a) protagonist row contains all required arc-stage fields
//  (b) chapter-presence is correctly inferred from scene-level POV
//  (c) supporting characters with arc fields appear; without don't
//  (d) handoff card (discoverPlanningArtefacts) surfaces arc-matrix action
//      only once the file exists

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { getWritingPlan } from '../packages/core/dist/state/writing-plan.js'
import { generateCharacterArcMatrix } from '../packages/core/dist/output/character-arc-matrix.js'
import { generateStoryBible } from '../packages/core/dist/output/story-bible.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, 'fixtures/writing-plan')

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'))
}

let tmpDir

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'arc-matrix-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── (a) Protagonist row arc fields ───────────────────────────────────────────

describe('generateCharacterArcMatrix — protagonist arc fields', () => {
  it('produces output/character-arc-matrix.md', () => {
    const state = loadFixture('fiction-real-world.json')
    const plan = getWritingPlan(state)
    const result = generateCharacterArcMatrix(plan, tmpDir)
    expect(result.outputPath).toMatch(/character-arc-matrix\.md$/)
    const content = readFileSync(result.outputPath, 'utf-8')
    expect(content).toContain('Character Arc Matrix')
  })

  it('contains protagonist name', () => {
    const state = loadFixture('fiction-real-world.json')
    const plan = getWritingPlan(state)
    const { outputPath } = generateCharacterArcMatrix(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).toContain('Mira Halloran')
  })

  it('includes Want and Need in arc table for fully-planned protagonist', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: {
        name: 'Elena',
        want: 'to solve the case',
        need: 'to trust others',
        coreLie: 'she must do everything alone',
        ghost: 'her partner died because she froze',
        flaw: 'closed off',
        arcDirection: 'positive',
      },
      characters: [],
      relationships: [],
      chapterOutline: [],
      plotThreads: [],
    })
    const { outputPath } = generateCharacterArcMatrix(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).toContain('Want')
    expect(content).toContain('to solve the case')
    expect(content).toContain('Need')
    expect(content).toContain('to trust others')
    expect(content).toContain('she must do everything alone')
    expect(content).toContain('her partner died because she froze')
  })
})

// ── (b) Chapter presence from POV ───────────────────────────────────────────

describe('generateCharacterArcMatrix — chapter presence', () => {
  it('detects chapters where protagonist is POV', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: { name: 'Mia', want: 'escape' },
      characters: [],
      relationships: [],
      chapterOutline: [
        {
          chapterNumber: 1,
          chapterTitle: 'Ch1',
          scenes: [{ sceneNumber: 1, pov: 'Mia', location: null }],
        },
        {
          chapterNumber: 2,
          chapterTitle: 'Ch2',
          scenes: [{ sceneNumber: 1, pov: 'Detective Cole', location: null }],
        },
        {
          chapterNumber: 3,
          chapterTitle: 'Ch3',
          scenes: [{ sceneNumber: 1, pov: 'Mia', location: null }],
        },
      ],
      plotThreads: [],
    })
    const { outputPath } = generateCharacterArcMatrix(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).toContain('Ch 1')
    expect(content).toContain('Ch 3')
  })

  it('protagonist absent from chapter with different POV only', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: { name: 'Mia', want: 'escape' },
      characters: [],
      relationships: [],
      chapterOutline: [
        {
          chapterNumber: 5,
          chapterTitle: 'Ch5',
          scenes: [{ sceneNumber: 1, pov: 'Other Person', location: null }],
        },
      ],
      plotThreads: [],
    })
    // arcMatrix should still have Mia but with empty chapterPresence
    expect(plan.arcMatrix.characters[0].chapterPresence).toEqual([])
  })
})

// ── (c) Supporting characters with / without arc fields ─────────────────────

describe('generateCharacterArcMatrix — supporting characters', () => {
  it('includes supporting character who has want/need', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: { name: 'Hero', want: 'win' },
      characters: [
        { name: 'Mentor', role: 'mentor', want: 'redemption', need: 'forgiveness', arcSummary: 'grows' },
      ],
      relationships: [],
      chapterOutline: [],
      plotThreads: [],
    })
    const { outputPath } = generateCharacterArcMatrix(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).toContain('Mentor')
    expect(content).toContain('redemption')
  })

  it('excludes supporting character with no arc fields', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: { name: 'Hero', want: 'win' },
      characters: [
        { name: 'Background Person', role: 'extra' },
      ],
      relationships: [],
      chapterOutline: [],
      plotThreads: [],
    })
    const { characterCount } = generateCharacterArcMatrix(plan, tmpDir)
    // only protagonist should appear
    expect(characterCount).toBe(1)
  })

  it('does not include supporting char-only row for character with name only', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: { name: 'Hero', want: 'win' },
      characters: [
        { name: 'NameOnly' },
      ],
      relationships: [],
      chapterOutline: [],
      plotThreads: [],
    })
    const { outputPath } = generateCharacterArcMatrix(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).not.toContain('NameOnly')
  })
})

// ── (d) Handoff card artefact file contract ───────────────────────────────────
//
// discoverPlanningArtefacts (extension/src/conversation/planning-complete.ts)
// uses fs.existsSync to decide which artefact paths to surface. These tests
// verify the underlying file contract: the file is absent before generation
// and present after, so the handoff card shows actions only once data exists.

describe('arc matrix handoff file contract', () => {
  it('arc-matrix file absent before generation', () => {
    const matrixPath = join(tmpDir, 'planning', 'character-arc-matrix.md')
    expect(existsSync(matrixPath)).toBe(false)
  })

  it('arc-matrix file present after generation', () => {
    const state = loadFixture('fiction-real-world.json')
    const plan = getWritingPlan(state)
    generateCharacterArcMatrix(plan, tmpDir)
    const matrixPath = join(tmpDir, 'planning', 'character-arc-matrix.md')
    expect(existsSync(matrixPath)).toBe(true)
  })

  it('story-bible file absent before generation', () => {
    const biblePath = join(tmpDir, 'planning', 'story-bible.md')
    expect(existsSync(biblePath)).toBe(false)
  })

  it('story-bible file present after generation', () => {
    const state = loadFixture('fiction-real-world.json')
    const plan = getWritingPlan(state)
    generateStoryBible(plan, tmpDir)
    const biblePath = join(tmpDir, 'planning', 'story-bible.md')
    expect(existsSync(biblePath)).toBe(true)
  })
})
