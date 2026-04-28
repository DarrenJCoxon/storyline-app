// NF-13.7 — Figure registry integration tests.
//
// Covers:
//  (a) generateFigureRegistry produces output from fixture with figures
//  (b) synthesizeImagePrompt returns structured ImagePrompt with textElements + negativeConstraints
//  (c) {{figure: id}} markers appear in seeded NF manuscript content
//  (d) Status transitions read from nfStages[figure-status]
//  (e) Mode-agnostic: fiction fixture produces empty figure registry

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, mkdtempSync, rmSync, readdirSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { getWritingPlan } from '../packages/core/dist/state/writing-plan.js'
import { generateFigureRegistry } from '../packages/core/dist/output/figure-registry.js'
import { synthesizeImagePrompt } from '../packages/core/dist/output/figure-prompt-synthesizer.js'
import { seedNfChapterContent, seedManuscriptFromPlan } from '../packages/core/dist/scaffold/manuscript-seeder.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = resolve(__dirname, 'fixtures/writing-plan')

function loadFixture(name) {
  return JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'))
}

let tmpDir

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'figure-registry-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── (a) Registry generates from fixture with figures ──────────────────────────

describe('generateFigureRegistry — Pipeline A fixture', () => {
  it('(a) plan.figures is populated from pa-chapters figures array', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    expect(plan.figures.length).toBeGreaterThan(0)
  })

  it('figure has correct id, type, chapterNumber, purpose', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    const fig = plan.figures[0]
    expect(fig.id).toBe('fig-ch1-1')
    expect(fig.type).toBe('flow-diagram')
    expect(fig.chapterNumber).toBe(1)
    expect(fig.purpose).toContain('Disappointment Ladder')
    expect(fig.status).toBe('planned')
    expect(fig.promptHistory).toHaveLength(0)
    expect(fig.imagePrompt).toBeNull()
  })

  it('generateFigureRegistry writes figure-registry.md with figure details', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    const result = generateFigureRegistry(plan, tmpDir)

    expect(result.totalFigures).toBe(plan.figures.length)
    expect(result.producedCount).toBe(0)

    const md = readFileSync(result.outputPath, 'utf-8')
    expect(md).toContain('# Figure Registry')
    expect(md).toContain('fig-ch1-1')
    expect(md).toContain('flow-diagram')
  })

  it('type summary table appears with flow-diagram count', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    const result = generateFigureRegistry(plan, tmpDir)
    const md = readFileSync(result.outputPath, 'utf-8')
    expect(md).toContain('## Figures by Type')
    expect(md).toContain('flow-diagram')
    expect(md).toContain('| 1 |')
  })

  it('figures are grouped under chapter heading', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    const result = generateFigureRegistry(plan, tmpDir)
    const md = readFileSync(result.outputPath, 'utf-8')
    expect(md).toContain('Chapter 1')
    expect(md).toContain('The Cost of Being Liked')
  })

  it('(e) fiction fixture produces empty figure registry', () => {
    const state = loadFixture('fiction-new-shape.json')
    const plan = getWritingPlan(state)
    expect(plan.figures).toHaveLength(0)

    const result = generateFigureRegistry(plan, tmpDir)
    expect(result.totalFigures).toBe(0)
    expect(result.producedCount).toBe(0)
    const md = readFileSync(result.outputPath, 'utf-8')
    expect(md).toContain('No figures declared yet')
  })
})

// ── (b) synthesizeImagePrompt ─────────────────────────────────────────────────

describe('synthesizeImagePrompt', () => {
  it('(b) flow diagram produces landscape aspectRatio, textElements[], negativeConstraints[]', () => {
    const prompt = synthesizeImagePrompt(
      'Illustrate the 4-step Disappointment Ladder framework',
      'flow-diagram',
      { chapterTitle: 'Chapter 1', chapterMission: 'Introduce the framework' },
      { title: 'Leading With Disappointment', frameworkName: 'The Disappointment Ladder' },
    )

    expect(prompt.aspectRatio).toBe('landscape')
    expect(Array.isArray(prompt.textElements)).toBe(true)
    expect(prompt.textElements.length).toBeGreaterThan(0)
    expect(Array.isArray(prompt.negativeConstraints)).toBe(true)
    expect(prompt.negativeConstraints.length).toBeGreaterThan(0)
    expect(prompt.subject).toContain('Disappointment Ladder')
  })

  it('framework name appears as title textElement when book.frameworkName is set', () => {
    const prompt = synthesizeImagePrompt(
      'Illustrate the 4-step Disappointment Ladder process',
      'flow-diagram',
      {},
      { frameworkName: 'The Disappointment Ladder' },
    )
    const titleElem = prompt.textElements.find(t => t.text === 'The Disappointment Ladder')
    expect(titleElem).toBeDefined()
    expect(titleElem.position).toBe('title, top centre')
  })

  it('4-step purpose generates 4 Step textElements', () => {
    const prompt = synthesizeImagePrompt(
      'Show the 4-step process for handling a difficult conversation',
      'flow-diagram',
      {},
      {},
    )
    const stepElems = prompt.textElements.filter(t => t.text.startsWith('Step '))
    expect(stepElems).toHaveLength(4)
  })

  it('chart type adds X-axis and Y-axis textElements', () => {
    const prompt = synthesizeImagePrompt(
      'Bar chart comparing likeability scores across departments',
      'chart',
      {},
      {},
    )
    expect(prompt.textElements.some(t => t.text.includes('axis') || t.text.includes('X axis') || t.text.includes('Y axis'))).toBe(true)
  })

  it('uses book.palette when provided', () => {
    const prompt = synthesizeImagePrompt(
      'A diagram of the process',
      'flow-diagram',
      {},
      { palette: 'terracotta and sage green' },
    )
    expect(prompt.colourPalette).toBe('terracotta and sage green')
  })

  it('falls back to default navy/gold palette when book.palette absent', () => {
    const prompt = synthesizeImagePrompt('A simple diagram', 'diagram', {}, {})
    expect(prompt.colourPalette).toContain('navy')
  })

  it('negativeConstraints always includes garbled text protection', () => {
    const prompt = synthesizeImagePrompt('A flow diagram', 'flow-diagram', {}, {})
    expect(prompt.negativeConstraints).toContain('no garbled or illegible text')
  })

  it('portrait figuresget portrait aspectRatio', () => {
    const prompt = synthesizeImagePrompt('Cast sheet showing portrait of character', 'cast-sheet', {}, {})
    expect(prompt.aspectRatio).toBe('portrait')
  })

  it('quoted labels in purpose become textElements', () => {
    const prompt = synthesizeImagePrompt(
      'Diagram with "Name the Gap" and "Hold the Room" as key labels',
      'flow-diagram',
      {},
      {},
    )
    const texts = prompt.textElements.map(t => t.text)
    expect(texts).toContain('Name the Gap')
    expect(texts).toContain('Hold the Room')
  })
})

// ── (c) Figure markers in seeded manuscript ────────────────────────────────────

describe('figure markers in seeded manuscript', () => {
  it('(c) {{figure: id}} marker appears in chapter content for the matching chapter figure', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    const figuresForCh1 = plan.figures.filter(f => f.chapterNumber === 1)
    expect(figuresForCh1.length).toBeGreaterThan(0)

    const ch1 = plan.nfChapters.find(c => c.number === 1)
    expect(ch1).toBeDefined()

    const content = seedNfChapterContent(ch1, [], figuresForCh1)
    expect(content).toContain(`{{figure: ${figuresForCh1[0].id}}}`)
  })

  it('figures from other chapters are not injected into this chapter', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    const figuresForCh1 = plan.figures.filter(f => f.chapterNumber === 1)

    const ch2 = plan.nfChapters.find(c => c.number === 2)
    if (!ch2 || figuresForCh1.length === 0) return

    const content = seedNfChapterContent(ch2, [], figuresForCh1)
    expect(content).not.toContain(`{{figure: ${figuresForCh1[0].id}}}`)
  })

  it('seedManuscriptFromPlan writes figure markers into chapter manuscript files', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const plan = getWritingPlan(state)
    expect(plan.figures.length).toBeGreaterThan(0)

    seedManuscriptFromPlan(plan, tmpDir)

    const msDir = join(tmpDir, 'manuscript')
    expect(existsSync(msDir)).toBe(true)
    const files = readdirSync(msDir)
    expect(files.length).toBeGreaterThan(0)

    const hasMarker = files.some(f => {
      const content = readFileSync(join(msDir, f), 'utf-8')
      return content.includes('{{figure:')
    })
    expect(hasMarker).toBe(true)
  })
})

// ── (d) Status transitions from figure-status ──────────────────────────────────

describe('figure status from nfStages[figure-status]', () => {
  it('(d) produced status + producedAssetPath read from persisted figure-status', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    const figureId = 'fig-ch1-1'
    state.nfStages['figure-status'] = {
      [figureId]: {
        status: 'produced',
        producedAssetPath: 'assets/figures/fig-ch1-1-v1.png',
        promptHistory: ['Generated prompt for the Disappointment Ladder diagram'],
      },
    }
    const plan = getWritingPlan(state)
    const fig = plan.figures.find(f => f.id === figureId)
    expect(fig?.status).toBe('produced')
    expect(fig?.producedAssetPath).toBe('assets/figures/fig-ch1-1-v1.png')
    expect(fig?.promptHistory).toHaveLength(1)
  })

  it('accepted status counts toward producedCount in registry', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    state.nfStages['figure-status'] = {
      'fig-ch1-1': {
        status: 'accepted',
        producedAssetPath: 'assets/figures/fig-ch1-1-v1.png',
        promptHistory: ['first prompt'],
      },
    }
    const plan = getWritingPlan(state)
    const result = generateFigureRegistry(plan, tmpDir)
    expect(result.producedCount).toBeGreaterThan(0)
  })

  it('rejected status shows rejected badge in registry markdown', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    state.nfStages['figure-status'] = {
      'fig-ch1-1': { status: 'rejected', promptHistory: [] },
    }
    const plan = getWritingPlan(state)
    const result = generateFigureRegistry(plan, tmpDir)
    const md = readFileSync(result.outputPath, 'utf-8')
    expect(md).toContain('🔴')
  })

  it('figures without figure-status entry default to planned', () => {
    const state = loadFixture('nf-pipeline-a-canonical.json')
    // No figure-status set
    const plan = getWritingPlan(state)
    for (const fig of plan.figures) {
      expect(fig.status).toBe('planned')
    }
  })
})
