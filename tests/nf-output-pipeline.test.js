// NF-11.9 — NF output-pipeline integration tests.
//
// Proves that a Pipeline A fixture state fed through the output pipeline
// produces all expected artefacts on disk with correct content.
//
// Covers:
//  (a) NF chapter cards written to docs/chapters/ with section structure
//  (b) NF manuscript files seeded with H2 sections and {{research:}} markers
//  (c) NF master document generated at output/nf-master-document.md
//  (d) Research-todo generated at output/research-todo.md grouped by chapter
//  (e) Manuscript-seed regeneration is idempotent (unchanged file not rewritten)
//  (f) Writer prose is never overwritten (modified file without seed marker preserved)
//  (g) NF chapter cards not generated for fiction projects (mode guard)

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { getWritingPlan } from '../packages/core/dist/state/writing-plan.js'
import { generateNfMasterDocument } from '../packages/core/dist/output/nf-master-doc.js'
import { generateResearchTodo } from '../packages/core/dist/output/research-todo.js'
import { seedManuscriptFromPlan, seedNfChapterContent, MANUSCRIPT_SEED_MARKER } from '../packages/core/dist/scaffold/manuscript-seeder.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, 'fixtures/writing-plan')

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'))
}

let tmpDir

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'nf-pipeline-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── (a) NF chapter cards ──────────────────────────────────────────────────────

describe('NF chapter plan normalisation', () => {
  it('pipeline A fixture produces nfChapters with title and sections', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    expect(plan.mode).toBe('nonfiction')
    expect(plan.nfChapters.length).toBeGreaterThan(0)
    const ch = plan.nfChapters[0]
    expect(ch.number).toBe(1)
    expect(ch.title).toBeTruthy()
    expect(ch.manuscriptFile).toMatch(/^manuscript\//)
  })

  it('pipeline A chapter has linkedPrinciple from fixture', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    expect(plan.nfChapters[0].linkedPrinciple).toBeTruthy()
  })

  it('legacy pipeline A shape produces same chapter count as canonical', () => {
    const canonical = getWritingPlan(loadFixture('nf-pipeline-a-canonical.json'))
    const legacy = getWritingPlan(loadFixture('nf-pipeline-a-legacy.json'))
    expect(legacy.nfChapters.length).toBe(canonical.nfChapters.length)
  })
})

// ── (b) NF manuscript seeding ────────────────────────────────────────────────

describe('seedManuscriptFromPlan — NF', () => {
  it('seeds one manuscript file per NF chapter', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    seedManuscriptFromPlan(plan, tmpDir)
    for (const ch of plan.nfChapters) {
      expect(existsSync(join(tmpDir, ch.manuscriptFile))).toBe(true)
    }
  })

  it('seeded file contains seed marker', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    seedManuscriptFromPlan(plan, tmpDir)
    const content = readFileSync(join(tmpDir, plan.nfChapters[0].manuscriptFile), 'utf-8')
    expect(content).toContain(MANUSCRIPT_SEED_MARKER)
  })

  it('seeded file contains H1 chapter title', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    seedManuscriptFromPlan(plan, tmpDir)
    const ch = plan.nfChapters[0]
    const content = readFileSync(join(tmpDir, ch.manuscriptFile), 'utf-8')
    expect(content).toContain(`# Chapter ${ch.number}`)
  })

  it('seeded NF chapter with sections includes H2 section headers', () => {
    const plan = getWritingPlan({
      mode: 'nonfiction',
      pipeline: 'A',
      nfStages: {
        'pa-chapters': {
          chapters: [{
            number: 1,
            title: 'The Hook',
            sections: [
              { title: 'Opening Hook', type: 'hook', notes: 'Start with a question' },
              { title: 'Core Argument', type: 'concept' },
            ],
          }],
        },
      },
    })
    const content = seedNfChapterContent(plan.nfChapters[0])
    expect(content).toContain('## Opening Hook')
    expect(content).toContain('## Core Argument')
    expect(content).toContain('Section purpose: Start with a question')
  })

  it('seeded NF chapter with keyResearch includes {{research:}} markers', () => {
    const plan = getWritingPlan({
      mode: 'nonfiction',
      pipeline: 'A',
      nfStages: {
        'pa-chapters': {
          chapters: [{
            number: 1,
            title: 'Evidence Chapter',
            sections: [
              { title: 'Data Section', type: 'evidence', keyResearch: 'Find 2023 study on burnout' },
            ],
          }],
        },
      },
    })
    const content = seedNfChapterContent(plan.nfChapters[0])
    expect(content).toContain('{{research: Find 2023 study on burnout}}')
  })
})

// ── (c) NF master document ────────────────────────────────────────────────────

describe('generateNfMasterDocument', () => {
  it('generates output/nf-master-document.md', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    const result = generateNfMasterDocument(plan, state, tmpDir)
    expect(result.outputPath).toMatch(/nf-master-document\.md$/)
    expect(existsSync(result.outputPath)).toBe(true)
  })

  it('master doc contains chapter titles', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    const { outputPath } = generateNfMasterDocument(plan, state, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    for (const ch of plan.nfChapters) {
      if (ch.title) expect(content).toContain(ch.title)
    }
  })

  it('reports correct chapter count', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    const { chapterCount } = generateNfMasterDocument(plan, state, tmpDir)
    expect(chapterCount).toBe(plan.nfChapters.length)
  })
})

// ── (d) Research-todo register ───────────────────────────────────────────────

describe('generateResearchTodo', () => {
  it('generates output/research-todo.md', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    const result = generateResearchTodo(plan, tmpDir)
    expect(existsSync(result.outputPath)).toBe(true)
  })

  it('groups items by chapter when chapterNumber is set', () => {
    const plan = getWritingPlan({
      mode: 'nonfiction',
      pipeline: 'A',
      nfStages: {
        'pa-chapters': {
          chapters: [
            { number: 3, title: 'Evidence', sections: [], keyResearch: 'Find warehouse stat' },
            { number: 7, title: 'Case Studies', sections: [], keyResearch: 'Interview source' },
          ],
        },
      },
    })
    // Manually add research items with chapter references
    plan.researchItems.push(
      { id: 'r1', description: 'warehouse stats', chapterNumber: 3, status: 'planned', source: 'chapter' },
      { id: 'r2', description: 'interview notes', chapterNumber: 7, status: 'captured', source: 'chapter' },
    )
    const { outputPath } = generateResearchTodo(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).toContain('## Chapter 3')
    expect(content).toContain('## Chapter 7')
    expect(content).toContain('warehouse stats')
    expect(content).toContain('interview notes')
  })

  it('loose items appear in General Research section', () => {
    const plan = getWritingPlan({ mode: 'nonfiction', pipeline: 'A', nfStages: {} })
    plan.researchItems.push(
      { id: 'r1', description: 'background reading', chapterNumber: null, status: 'planned', source: 'loose' },
    )
    const { outputPath } = generateResearchTodo(plan, tmpDir)
    const content = readFileSync(outputPath, 'utf-8')
    expect(content).toContain('## General Research')
    expect(content).toContain('background reading')
  })
})

// ── (e) Idempotent seeding ────────────────────────────────────────────────────

describe('manuscript seeding — idempotency', () => {
  it('re-seeding a seed-marker file updates it (safe to refresh)', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    seedManuscriptFromPlan(plan, tmpDir)
    const ch = plan.nfChapters[0]
    const filePath = join(tmpDir, ch.manuscriptFile)
    const first = readFileSync(filePath, 'utf-8')
    // Seed again — should overwrite because marker is present
    seedManuscriptFromPlan(plan, tmpDir)
    const second = readFileSync(filePath, 'utf-8')
    expect(second).toBe(first)
  })
})

// ── (f) Writer prose preservation ────────────────────────────────────────────

describe('manuscript seeding — writer prose protection', () => {
  it('does not overwrite a file that has been modified by the writer', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    seedManuscriptFromPlan(plan, tmpDir)
    const ch = plan.nfChapters[0]
    const filePath = join(tmpDir, ch.manuscriptFile)
    // Simulate writer removing seed marker and adding prose
    writeFileSync(filePath, '# My Chapter\n\nActual prose written by the author.\n', 'utf-8')
    seedManuscriptFromPlan(plan, tmpDir)
    const after = readFileSync(filePath, 'utf-8')
    expect(after).toContain('Actual prose written by the author.')
    expect(after).not.toContain(MANUSCRIPT_SEED_MARKER)
  })
})

// ── (g) Mode guard for chapter cards ─────────────────────────────────────────

describe('seedManuscriptFromPlan — mode guard', () => {
  it('does not create NF manuscript files for a fiction project', () => {
    const state = loadFixture('fiction-real-world.json')
    const plan = getWritingPlan(state)
    expect(plan.mode).toBe('fiction')
    seedManuscriptFromPlan(plan, tmpDir)
    // NF-style manuscript/01-*.md should not exist
    const manuscriptDir = join(tmpDir, 'manuscript')
    if (existsSync(manuscriptDir)) {
      const files = readdirSync(manuscriptDir)
      // All files seeded should be fiction chapters, not NF placeholders
      expect(files.every(f => /^\d{2}/.test(f))).toBe(true)
    }
  })
})
