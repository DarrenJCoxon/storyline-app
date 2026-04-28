// FIC-D.6 — Story-bible renderer tests.
//
// Covers:
//  (a) renders correctly from a fixture with cast + relationships + locations
//  (b) skips empty sections rather than printing "(none)" placeholders
//  (c) auto-generated header is present and edit-warning is present
//  (d) location list correctly aggregates chapter-presence across chapters

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { getWritingPlan } from '../packages/core/dist/state/writing-plan.js'
import { generateStoryBible } from '../packages/core/dist/output/story-bible.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, 'fixtures/writing-plan')

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'))
}

let tmpDir

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'story-bible-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── (a) Renders correctly from real-world fixture ────────────────────────────

describe('generateStoryBible — real-world fixture', () => {
  it('produces output/story-bible.md', () => {
    const state = loadFixture('fiction-real-world.json')
    const plan = getWritingPlan(state)
    const result = generateStoryBible(plan, tmpDir)
    expect(result.outputPath).toMatch(/story-bible\.md$/)
    const content = readFileSync(result.outputPath, 'utf-8')
    expect(content).toContain('Story Bible')
  })

  it('contains protagonist name in cast section', () => {
    const state = loadFixture('fiction-real-world.json')
    const plan = getWritingPlan(state)
    const { outputPath } = generateStoryBible(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).toContain('Mira Halloran')
  })

  it('contains relationship pairs', () => {
    const state = loadFixture('fiction-real-world.json')
    const plan = getWritingPlan(state)
    const { outputPath } = generateStoryBible(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).toContain('Mira Halloran ↔ Det. Arthur Vance')
  })

  it('lists locations derived from scene data', () => {
    const state = loadFixture('fiction-real-world.json')
    const plan = getWritingPlan(state)
    const { outputPath, locationCount } = generateStoryBible(plan, tmpDir)
    expect(locationCount).toBeGreaterThan(0)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).toContain('The studio')
  })

  it('reports correct character count', () => {
    const state = loadFixture('fiction-real-world.json')
    const plan = getWritingPlan(state)
    const { characterCount } = generateStoryBible(plan, tmpDir)
    // protagonist + cast
    const expected = (plan.protagonist ? 1 : 0) + plan.cast.length
    expect(characterCount).toBe(expected)
  })
})

// ── (b) Skips empty sections ─────────────────────────────────────────────────

describe('generateStoryBible — empty sections', () => {
  it('omits Relationships section when none exist', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: { name: 'Alice', want: 'freedom', need: 'connection' },
      characters: [],
      relationships: [],
      chapterOutline: [],
      plotThreads: [],
    })
    const { outputPath } = generateStoryBible(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).not.toContain('## Relationships')
  })

  it('omits Locations section when no scenes have locations', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: { name: 'Alice', want: 'freedom' },
      characters: [],
      relationships: [],
      chapterOutline: [
        { chapterNumber: 1, chapterTitle: 'Ch1', scenes: [{ sceneNumber: 1, location: null, pov: 'Alice' }] },
      ],
      plotThreads: [],
    })
    const { outputPath } = generateStoryBible(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).not.toContain('## Locations')
  })

  it('does not print "(none)" anywhere', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: { name: 'Bob' },
      characters: [],
      relationships: [],
      chapterOutline: [],
      plotThreads: [],
    })
    const { outputPath } = generateStoryBible(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).not.toContain('(none)')
  })
})

// ── (c) Auto-generated header ────────────────────────────────────────────────

describe('generateStoryBible — header', () => {
  it('contains the auto-generated warning', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: { name: 'Charlie' },
      characters: [],
      relationships: [],
      chapterOutline: [],
      plotThreads: [],
    })
    const { outputPath } = generateStoryBible(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).toContain('Auto-generated by Storyline')
    expect(content).toContain('edits will be overwritten')
  })
})

// ── (d) Location aggregation ─────────────────────────────────────────────────

describe('generateStoryBible — location aggregation', () => {
  it('aggregates the same location across multiple chapters', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: { name: 'Dana' },
      characters: [],
      relationships: [],
      chapterOutline: [
        {
          chapterNumber: 3,
          chapterTitle: 'Ch3',
          scenes: [{ sceneNumber: 1, location: 'warehouse', pov: 'Dana' }],
        },
        {
          chapterNumber: 7,
          chapterTitle: 'Ch7',
          scenes: [{ sceneNumber: 1, location: 'warehouse', pov: 'Dana' }],
        },
      ],
      plotThreads: [],
    })
    const { outputPath } = generateStoryBible(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    // warehouse should appear listing both Ch 3 and Ch 7
    expect(content).toMatch(/warehouse.*Ch 3.*Ch 7/)
  })

  it('lists each unique location once', () => {
    const plan = getWritingPlan({
      mode: 'fiction',
      protagonist: { name: 'Dana' },
      characters: [],
      relationships: [],
      chapterOutline: [
        {
          chapterNumber: 1,
          chapterTitle: 'Ch1',
          scenes: [
            { sceneNumber: 1, location: 'office', pov: 'Dana' },
            { sceneNumber: 2, location: 'office', pov: 'Dana' },
          ],
        },
      ],
      plotThreads: [],
    })
    const { outputPath } = generateStoryBible(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    const matches = [...content.matchAll(/\*\*office\*\*/g)]
    expect(matches).toHaveLength(1)
  })
})
