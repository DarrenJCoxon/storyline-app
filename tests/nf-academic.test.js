// NF-14.10 (partial) — Academic category e2e tests.
//
// Tests what is currently implemented: NF-14.1 through NF-14.4.
// NF-14.5 through NF-14.9 (WritingPlan academic extension, manuscript seeding,
// coverage reports, glossary, academic master doc) are stubs pending implementation.
//
// Covers:
//  (A) NF-14.1 — Academic pipeline routing (inferPipelineFromCategory)
//  (B) NF-14.1 — BookType in ProjectState
//  (C) NF-14.2 — Academic DNA stage order (trimmed, correct stages)
//  (D) NF-14.2 — Academic stage guides (dna-ac-level, dna-ac-spec, dna-ac-assessment)
//  (E) NF-14.3 — ac-syllabus guide with syllabi/ folder, textbook/revision-guide variants
//  (F) NF-14.4 — ac-chapters guide with per-bookType itemSchema variants
//  (G) NF-14.1 — stageOrderFor routes correctly for academic pipeline
//  (H) NF-14.3 — seedSyllabiFolder / readSyllabiFiles utilities

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { tmpdir } from 'os'

import {
  inferPipelineFromCategory,
  getNfStageGuide,
  getAcademicGuide,
  NF_ACADEMIC_DNA_STAGE_ORDER,
  NF_ACADEMIC_STAGE_ORDER,
  stageOrderFor,
  DEFAULT_STATE,
  seedSyllabiFolder,
  readSyllabiFiles,
} from '../packages/core/dist/index.js'

let tmpDir

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'nf-academic-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── (A) NF-14.1 — Academic pipeline routing ───────────────────────────────────

describe('inferPipelineFromCategory — academic routes', () => {
  it('textbook → academic', () => {
    expect(inferPipelineFromCategory('textbook')).toBe('academic')
  })

  it('revision guide (spaced) → academic', () => {
    expect(inferPipelineFromCategory('revision guide')).toBe('academic')
  })

  it('revision-guide (hyphenated) → academic', () => {
    expect(inferPipelineFromCategory('revision-guide')).toBe('academic')
  })

  it('study guide → academic', () => {
    expect(inferPipelineFromCategory('study guide')).toBe('academic')
  })

  it('exam revision → academic', () => {
    expect(inferPipelineFromCategory('exam revision')).toBe('academic')
  })

  it('course book → academic', () => {
    expect(inferPipelineFromCategory('course book')).toBe('academic')
  })

  it('academic (generic) → academic', () => {
    expect(inferPipelineFromCategory('academic')).toBe('academic')
  })

  it('case-insensitive: Textbook → academic', () => {
    expect(inferPipelineFromCategory('Textbook')).toBe('academic')
  })

  it('case-insensitive: Revision Guide → academic', () => {
    expect(inferPipelineFromCategory('Revision Guide')).toBe('academic')
  })

  // Ensure non-academic categories are NOT routed to academic
  it('self-help → A (not academic)', () => {
    expect(inferPipelineFromCategory('self-help')).toBe('A')
  })

  it('history → B (not academic)', () => {
    expect(inferPipelineFromCategory('history')).toBe('B')
  })

  it('how-to → C (not academic)', () => {
    expect(inferPipelineFromCategory('how-to')).toBe('C')
  })

  it('unknown → null (not academic)', () => {
    expect(inferPipelineFromCategory('zxcvbnm')).toBeNull()
  })
})

// ── (B) NF-14.1 — BookType in ProjectState ─────────────────────────────────────

describe('BookType field in state', () => {
  it('DEFAULT_STATE.bookType is null', () => {
    expect(DEFAULT_STATE.bookType).toBeNull()
  })

  it('ProjectState accepts textbook bookType via stageOrderFor (no throw)', () => {
    expect(() => stageOrderFor({ mode: 'nonfiction', pipeline: 'academic' })).not.toThrow()
  })
})

// ── (C) NF-14.2 — Academic DNA stage order ────────────────────────────────────

describe('NF_ACADEMIC_DNA_STAGE_ORDER', () => {
  it('has 14 stages (standard DNA: 13 → trimmed: -comps, -voice, +ac-level, +ac-spec, +ac-assessment = 14)', () => {
    expect(NF_ACADEMIC_DNA_STAGE_ORDER).toHaveLength(14)
  })

  it('starts with mode (index 0)', () => {
    expect(NF_ACADEMIC_DNA_STAGE_ORDER[0].id).toBe('mode')
  })

  it('ends with dna-consolidate (index 13)', () => {
    const last = NF_ACADEMIC_DNA_STAGE_ORDER[NF_ACADEMIC_DNA_STAGE_ORDER.length - 1]
    expect(last.id).toBe('dna-consolidate')
  })

  it('does NOT include dna-comps', () => {
    expect(NF_ACADEMIC_DNA_STAGE_ORDER.some(s => s.id === 'dna-comps')).toBe(false)
  })

  it('does NOT include dna-voice', () => {
    expect(NF_ACADEMIC_DNA_STAGE_ORDER.some(s => s.id === 'dna-voice')).toBe(false)
  })

  it('includes dna-ac-level', () => {
    expect(NF_ACADEMIC_DNA_STAGE_ORDER.some(s => s.id === 'dna-ac-level')).toBe(true)
  })

  it('includes dna-ac-spec', () => {
    expect(NF_ACADEMIC_DNA_STAGE_ORDER.some(s => s.id === 'dna-ac-spec')).toBe(true)
  })

  it('includes dna-ac-assessment', () => {
    expect(NF_ACADEMIC_DNA_STAGE_ORDER.some(s => s.id === 'dna-ac-assessment')).toBe(true)
  })

  it('dna-ac-level immediately follows dna-promise', () => {
    const promiseIdx = NF_ACADEMIC_DNA_STAGE_ORDER.findIndex(s => s.id === 'dna-promise')
    const levelIdx = NF_ACADEMIC_DNA_STAGE_ORDER.findIndex(s => s.id === 'dna-ac-level')
    expect(levelIdx).toBe(promiseIdx + 1)
  })

  it('dna-ac-assessment is followed by dna-evidence', () => {
    const assessIdx = NF_ACADEMIC_DNA_STAGE_ORDER.findIndex(s => s.id === 'dna-ac-assessment')
    const evidenceIdx = NF_ACADEMIC_DNA_STAGE_ORDER.findIndex(s => s.id === 'dna-evidence')
    expect(evidenceIdx).toBe(assessIdx + 1)
  })

  it('all index values are unique and ascending', () => {
    const indexes = NF_ACADEMIC_DNA_STAGE_ORDER.map(s => s.index)
    for (let i = 1; i < indexes.length; i++) {
      expect(indexes[i]).toBeGreaterThan(indexes[i - 1])
    }
  })
})

describe('NF_ACADEMIC_STAGE_ORDER (Phase 1)', () => {
  it('has 4 stages: ac-syllabus, ac-chapters, ac-critique, ac-master', () => {
    expect(NF_ACADEMIC_STAGE_ORDER).toHaveLength(4)
    const ids = NF_ACADEMIC_STAGE_ORDER.map(s => s.id)
    expect(ids).toEqual(['ac-syllabus', 'ac-chapters', 'ac-critique', 'ac-master'])
  })

  it('ac-syllabus has index 14 (immediately after DNA consolidate)', () => {
    const syllabusStage = NF_ACADEMIC_STAGE_ORDER.find(s => s.id === 'ac-syllabus')
    expect(syllabusStage?.index).toBe(14)
  })
})

// ── (G) NF-14.1 — stageOrderFor academic routing ──────────────────────────────

describe('stageOrderFor — academic pipeline routing', () => {
  it('returns 18 stages total for academic pipeline (14 DNA + 4 phases)', () => {
    const order = stageOrderFor({ mode: 'nonfiction', pipeline: 'academic' })
    expect(order).toHaveLength(18)
  })

  it('first 14 stages are DNA stages; next 4 are ac-* stages', () => {
    const order = stageOrderFor({ mode: 'nonfiction', pipeline: 'academic' })
    const dna = order.slice(0, 14)
    const phase1 = order.slice(14)
    expect(dna.every(s => !s.id.startsWith('ac-'))).toBe(true)
    expect(phase1.map(s => s.id)).toEqual(['ac-syllabus', 'ac-chapters', 'ac-critique', 'ac-master'])
  })

  it('academic stage order does not include pa-*, pb-*, pc-* stages', () => {
    const order = stageOrderFor({ mode: 'nonfiction', pipeline: 'academic' })
    const ids = order.map(s => s.id)
    expect(ids.some(id => id.startsWith('pa-') || id.startsWith('pb-') || id.startsWith('pc-'))).toBe(false)
  })

  it('Pipeline A does not include ac-* stages', () => {
    const order = stageOrderFor({ mode: 'nonfiction', pipeline: 'A' })
    expect(order.some(s => s.id.startsWith('ac-'))).toBe(false)
  })

  it('academic pipeline does not include dna-comps or dna-voice', () => {
    const order = stageOrderFor({ mode: 'nonfiction', pipeline: 'academic' })
    const ids = order.map(s => s.id)
    expect(ids).not.toContain('dna-comps')
    expect(ids).not.toContain('dna-voice')
  })
})

// ── (D) NF-14.2 — Academic DNA stage guides ───────────────────────────────────

describe('getNfStageGuide — dna-ac-level', () => {
  const guide = getNfStageGuide('dna-ac-level')

  it('returns a guide for dna-ac-level', () => {
    expect(guide).not.toBeNull()
    expect(guide.id).toBe('dna-ac-level')
  })

  it('has academicLevel as a required question', () => {
    const q = guide.questions?.find(q => q.key === 'academicLevel')
    expect(q).toBeDefined()
    expect(q.required).toBe(true)
  })

  it('has register as a required question', () => {
    const q = guide.questions?.find(q => q.key === 'register')
    expect(q).toBeDefined()
    expect(q.required).toBe(true)
  })

  it('has priorKnowledge as a required question', () => {
    const q = guide.questions?.find(q => q.key === 'priorKnowledge')
    expect(q).toBeDefined()
    expect(q.required).toBe(true)
  })

  it('validation includes academicLevel, register, priorKnowledge', () => {
    expect(guide.validation).toContain('academicLevel')
    expect(guide.validation).toContain('register')
    expect(guide.validation).toContain('priorKnowledge')
  })
})

describe('getNfStageGuide — dna-ac-spec', () => {
  const guide = getNfStageGuide('dna-ac-spec')

  it('returns a guide for dna-ac-spec', () => {
    expect(guide).not.toBeNull()
    expect(guide.id).toBe('dna-ac-spec')
  })

  it('has specReference as a required question', () => {
    const q = guide.questions?.find(q => q.key === 'specReference')
    expect(q).toBeDefined()
    expect(q.required).toBe(true)
  })

  it('has specCoverage as a required question', () => {
    const q = guide.questions?.find(q => q.key === 'specCoverage')
    expect(q).toBeDefined()
    expect(q.required).toBe(true)
  })

  it('includes optional specVersion and examBoard questions', () => {
    const keys = guide.questions?.map(q => q.key) ?? []
    expect(keys).toContain('specVersion')
    expect(keys).toContain('examBoard')
  })
})

describe('getNfStageGuide — dna-ac-assessment', () => {
  const guide = getNfStageGuide('dna-ac-assessment')

  it('returns a guide for dna-ac-assessment', () => {
    expect(guide).not.toBeNull()
    expect(guide.id).toBe('dna-ac-assessment')
  })

  it('has assessmentType as a required question', () => {
    const q = guide.questions?.find(q => q.key === 'assessmentType')
    expect(q).toBeDefined()
    expect(q.required).toBe(true)
  })

  it('includes examFormat, commandWords, markSchemeStyle as optional', () => {
    const keys = guide.questions?.map(q => q.key) ?? []
    expect(keys).toContain('examFormat')
    expect(keys).toContain('commandWords')
    expect(keys).toContain('markSchemeStyle')
  })
})

describe('getNfStageGuide — academic stages fall through correctly', () => {
  it('getNfStageGuide resolves ac-syllabus (falls through to academic guides)', () => {
    expect(getNfStageGuide('ac-syllabus')).not.toBeNull()
  })

  it('getNfStageGuide resolves ac-chapters', () => {
    expect(getNfStageGuide('ac-chapters')).not.toBeNull()
  })

  it('getNfStageGuide resolves ac-critique', () => {
    expect(getNfStageGuide('ac-critique')).not.toBeNull()
  })

  it('getNfStageGuide resolves ac-master', () => {
    expect(getNfStageGuide('ac-master')).not.toBeNull()
  })
})

// ── (E) NF-14.3 — ac-syllabus guide ──────────────────────────────────────────

describe('getAcademicGuide — ac-syllabus', () => {
  const guide = getAcademicGuide('ac-syllabus')

  it('returns the ac-syllabus guide', () => {
    expect(guide).not.toBeNull()
    expect(guide.id).toBe('ac-syllabus')
    expect(guide.name).toBe('Outcome Inventory')
  })

  it('has contextDir: syllabi (signals system-prompt to inject syllabi/ folder contents)', () => {
    expect(guide.contextDir).toBe('syllabi')
  })

  it('has outcomes as a required question', () => {
    const q = guide.questions?.find(q => q.key === 'outcomes')
    expect(q).toBeDefined()
    expect(q.required).toBe(true)
    expect(q.type).toBe('array')
  })

  it('outcomes itemSchema includes code, text, bloom fields', () => {
    const q = guide.questions?.find(q => q.key === 'outcomes')
    expect(q.itemSchema).toHaveProperty('code')
    expect(q.itemSchema).toHaveProperty('text')
    expect(q.itemSchema).toHaveProperty('bloom')
  })

  it('has textbook and revision-guide variants', () => {
    expect(guide.variants).toBeDefined()
    expect(guide.variants?.textbook).toBeDefined()
    expect(guide.variants?.['revision-guide']).toBeDefined()
  })

  it('revision-guide variant has different questions (recallType, examTrap)', () => {
    const rgVariant = guide.variants?.['revision-guide']
    expect(rgVariant?.questions).toBeDefined()
    const outcomeQ = rgVariant.questions?.find(q => q.key === 'outcomes')
    expect(outcomeQ?.itemSchema).toHaveProperty('recallType')
    expect(outcomeQ?.itemSchema).toHaveProperty('examTrap')
  })

  it('revision-guide variant opening is different from default', () => {
    expect(guide.variants?.['revision-guide']?.opening).toBeTruthy()
    expect(guide.variants?.['revision-guide']?.opening).not.toBe(guide.opening)
  })

  it('validation requires outcomes field', () => {
    expect(guide.validation).toContain('outcomes')
  })
})

// ── (E) NF-14.3 — seedSyllabiFolder / readSyllabiFiles ──────────────────────

describe('seedSyllabiFolder', () => {
  it('creates syllabi/ directory in project dir', () => {
    seedSyllabiFolder(tmpDir)
    expect(existsSync(join(tmpDir, 'syllabi'))).toBe(true)
  })

  it('creates syllabi/README.md with instructions', () => {
    seedSyllabiFolder(tmpDir)
    expect(existsSync(join(tmpDir, 'syllabi', 'README.md'))).toBe(true)
  })

  it('README.md mentions summaries, not full PDFs', () => {
    seedSyllabiFolder(tmpDir)
    const { readFileSync } = require('fs')
    const readme = readFileSync(join(tmpDir, 'syllabi', 'README.md'), 'utf-8')
    expect(readme).toContain('summaries')
    expect(readme).toMatch(/not.*PDF|PDF.*not/i)
  })

  it('is safe to call twice (no error on re-seed)', () => {
    seedSyllabiFolder(tmpDir)
    expect(() => seedSyllabiFolder(tmpDir)).not.toThrow()
  })

  it('does not overwrite existing README.md on re-seed', () => {
    seedSyllabiFolder(tmpDir)
    const custom = '# Custom README\n'
    writeFileSync(join(tmpDir, 'syllabi', 'README.md'), custom, 'utf-8')
    seedSyllabiFolder(tmpDir)
    const { readFileSync } = require('fs')
    const after = readFileSync(join(tmpDir, 'syllabi', 'README.md'), 'utf-8')
    expect(after).toBe(custom)
  })
})

describe('readSyllabiFiles', () => {
  it('returns empty array when syllabi/ does not exist', () => {
    expect(readSyllabiFiles(tmpDir)).toEqual([])
  })

  it('returns empty array when syllabi/ exists but has no content files', () => {
    seedSyllabiFolder(tmpDir)
    expect(readSyllabiFiles(tmpDir)).toEqual([])
  })

  it('reads .md files from syllabi/', () => {
    seedSyllabiFolder(tmpDir)
    writeFileSync(join(tmpDir, 'syllabi', 'paper-1-physics.md'), '# Physics\n\nP4.1 Describe waves', 'utf-8')
    const files = readSyllabiFiles(tmpDir)
    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('paper-1-physics.md')
    expect(files[0].content).toContain('P4.1')
  })

  it('reads .txt files from syllabi/', () => {
    seedSyllabiFolder(tmpDir)
    writeFileSync(join(tmpDir, 'syllabi', 'module-2.txt'), 'LO-2.1 Define DNA replication', 'utf-8')
    const files = readSyllabiFiles(tmpDir)
    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('module-2.txt')
  })

  it('ignores README.md', () => {
    seedSyllabiFolder(tmpDir)
    writeFileSync(join(tmpDir, 'syllabi', 'spec.md'), '# Spec content', 'utf-8')
    const files = readSyllabiFiles(tmpDir)
    expect(files.every(f => f.filename.toLowerCase() !== 'readme.md')).toBe(true)
  })

  it('reads multiple files sorted alphabetically', () => {
    seedSyllabiFolder(tmpDir)
    writeFileSync(join(tmpDir, 'syllabi', 'paper-2-chemistry.md'), 'C1.1 Atomic structure', 'utf-8')
    writeFileSync(join(tmpDir, 'syllabi', 'paper-1-biology.md'), 'B1.1 Cell structure', 'utf-8')
    const files = readSyllabiFiles(tmpDir)
    expect(files).toHaveLength(2)
    expect(files[0].filename).toBe('paper-1-biology.md')
    expect(files[1].filename).toBe('paper-2-chemistry.md')
  })

  it('skips empty files', () => {
    seedSyllabiFolder(tmpDir)
    writeFileSync(join(tmpDir, 'syllabi', 'empty.md'), '', 'utf-8')
    const files = readSyllabiFiles(tmpDir)
    expect(files).toHaveLength(0)
  })
})

// ── (F) NF-14.4 — ac-chapters guide with variants ────────────────────────────

describe('getAcademicGuide — ac-chapters', () => {
  const guide = getAcademicGuide('ac-chapters')

  it('returns the ac-chapters guide', () => {
    expect(guide).not.toBeNull()
    expect(guide.id).toBe('ac-chapters')
    expect(guide.name).toBe('Chapter Plan')
  })

  it('has chapters as a required question', () => {
    const q = guide.questions?.find(q => q.key === 'chapters')
    expect(q).toBeDefined()
    expect(q.required).toBe(true)
    expect(q.type).toBe('array')
  })

  it('has both textbook and revision-guide variants', () => {
    expect(guide.variants?.textbook).toBeDefined()
    expect(guide.variants?.['revision-guide']).toBeDefined()
  })

  it('textbook variant itemSchema includes workedExamples and exercises', () => {
    const schema = guide.variants?.textbook?.itemSchema ?? {}
    expect(schema).toHaveProperty('workedExamples')
    expect(schema).toHaveProperty('exercises')
  })

  it('textbook variant itemSchema includes figures', () => {
    const schema = guide.variants?.textbook?.itemSchema ?? {}
    expect(schema).toHaveProperty('figures')
  })

  it('textbook variant itemSchema includes prerequisites', () => {
    const schema = guide.variants?.textbook?.itemSchema ?? {}
    expect(schema).toHaveProperty('prerequisites')
  })

  it('revision-guide variant itemSchema includes recallQuestions', () => {
    const schema = guide.variants?.['revision-guide']?.itemSchema ?? {}
    expect(schema).toHaveProperty('recallQuestions')
  })

  it('revision-guide variant itemSchema includes examPractice', () => {
    const schema = guide.variants?.['revision-guide']?.itemSchema ?? {}
    expect(schema).toHaveProperty('examPractice')
  })

  it('revision-guide variant opening mentions exam-focused structure', () => {
    const opening = guide.variants?.['revision-guide']?.opening ?? ''
    expect(opening.toLowerCase()).toMatch(/exam|revision|recall|topic/)
  })

  it('textbook variant opening mentions worked examples or chapter structure', () => {
    const opening = guide.variants?.textbook?.opening ?? ''
    expect(opening.toLowerCase()).toMatch(/worked example|chapter|concept|coverage/)
  })

  it('validation requires chapters', () => {
    expect(guide.validation).toContain('chapters')
  })
})

// ── NF-14.5 — WritingPlan academic extension ─────────────────────────────────

import { getWritingPlan } from '../packages/core/dist/index.js'

const TEXTBOOK_STATE = {
  _meta: { projectPath: null, createdAt: null, updatedAt: null },
  mode: 'nonfiction',
  pipeline: 'academic',
  subMode: null,
  bookType: 'textbook',
  bookDna: {},
  stages: {},
  nfStages: {
    'dna-ac-level': { level: 'GCSE', academicLevel: 'GCSE' },
    'dna-ac-spec': { specReference: 'AQA Physics 8463' },
    'dna-ac-assessment': { assessmentShape: 'multi-step calculation and short-answer' },
    'ac-syllabus': {
      outcomes: [
        { code: 'P4.1', text: 'Describe forces', bloom: 'understand', module: 'Forces' },
        { code: 'P4.2', text: 'Calculate resultant force', bloom: 'apply', module: 'Forces' },
        { code: 'P5.1', text: 'Explain wave properties', bloom: 'understand', module: 'Waves' },
      ],
      syllabusSource: 'gcse-physics.md',
      totalOutcomeCount: 3,
    },
    'ac-chapters': {
      chapters: [
        {
          number: 1,
          title: 'Forces and Motion',
          outcomes: ['P4.1', 'P4.2'],
          keyTerms: ['resultant force', 'Newton'],
          prerequisites: [],
          sections: [
            { title: 'Concept', type: 'concept' },
            { title: 'Worked example', type: 'worked-example' },
          ],
          wordTarget: 2000,
          workedExamples: [
            { id: 'we-1.1', title: 'Resultant force calculation', difficulty: 'foundation' },
            { id: 'we-1.2', title: 'Free body diagram', difficulty: 'higher' },
          ],
          exercises: [
            { id: 'ex-1.1', title: 'Basic forces', difficulty: 'foundation' },
          ],
        },
        {
          number: 2,
          title: 'Wave Properties',
          outcomes: ['P5.1'],
          keyTerms: ['wavelength', 'frequency', 'amplitude'],
          prerequisites: [1],
          sections: [{ title: 'Concept', type: 'concept' }],
          wordTarget: 1800,
          workedExamples: [
            { id: 'we-2.1', title: 'Wave speed calculation', difficulty: 'higher' },
          ],
          exercises: [],
        },
      ],
    },
  },
}

const REVISION_STATE = {
  _meta: { projectPath: null, createdAt: null, updatedAt: null },
  mode: 'nonfiction',
  pipeline: 'academic',
  subMode: null,
  bookType: 'revision-guide',
  bookDna: {},
  stages: {},
  nfStages: {
    'dna-ac-level': { level: 'A-level' },
    'dna-ac-spec': { specReference: 'OCR History A' },
    'dna-ac-assessment': { assessmentShape: 'extended essay and source analysis' },
    'ac-syllabus': {
      outcomes: [
        { code: 'H1.1', text: 'Recall causes of WWI', recallType: 'fact', examTrap: 'Confusing immediate with long-term causes' },
        { code: 'H1.2', text: 'Explain the role of alliances', recallType: 'explanation' },
      ],
    },
    'ac-chapters': {
      chapters: [
        {
          number: 1,
          title: 'Causes of WWI',
          outcomes: ['H1.1', 'H1.2'],
          keyTerms: ['entente', 'triple alliance', 'imperialism'],
          prerequisites: [],
          sections: [{ title: 'Topic summary', type: 'topic-summary' }],
          wordTarget: 600,
          recallQuestions: 5,
          examPractice: [
            { type: 'short-answer', count: 3 },
            { type: 'extended', count: 1 },
          ],
        },
      ],
    },
  },
}

describe('NF-14.5 — WritingPlan academic extension', () => {
  it('getWritingPlan(academicState).academic is populated for textbook', () => {
    const plan = getWritingPlan(TEXTBOOK_STATE)
    expect(plan.academic).not.toBeNull()
    expect(plan.academic.bookType).toBe('textbook')
  })

  it('academic.learningOutcomes[] populated from ac-syllabus outcomes', () => {
    const plan = getWritingPlan(TEXTBOOK_STATE)
    expect(plan.academic.learningOutcomes).toHaveLength(3)
    expect(plan.academic.learningOutcomes[0].code).toBe('P4.1')
    expect(plan.academic.learningOutcomes[0].bloom).toBe('understand')
    expect(plan.academic.learningOutcomes[1].code).toBe('P4.2')
  })

  it('academic.workedExamples[] populated from ac-chapters (textbook)', () => {
    const plan = getWritingPlan(TEXTBOOK_STATE)
    expect(plan.academic.workedExamples).toHaveLength(3)
    const ids = plan.academic.workedExamples.map(w => w.id)
    expect(ids).toContain('we-1.1')
    expect(ids).toContain('we-1.2')
    expect(ids).toContain('we-2.1')
    expect(plan.academic.workedExamples[0].chapterNumber).toBe(1)
  })

  it('academic.exercises[] populated from ac-chapters (textbook)', () => {
    const plan = getWritingPlan(TEXTBOOK_STATE)
    expect(plan.academic.exercises).toHaveLength(1)
    expect(plan.academic.exercises[0].id).toBe('ex-1.1')
    expect(plan.academic.exercises[0].chapterNumber).toBe(1)
  })

  it('academic.prerequisites map populated from ac-chapters prerequisite chains', () => {
    const plan = getWritingPlan(TEXTBOOK_STATE)
    expect(plan.academic.prerequisites[1]).toEqual([])
    expect(plan.academic.prerequisites[2]).toEqual([1])
  })

  it('academic.keyTerms aggregated across all chapters (deduplicated, sorted)', () => {
    const plan = getWritingPlan(TEXTBOOK_STATE)
    expect(plan.academic.keyTerms).toContain('resultant force')
    expect(plan.academic.keyTerms).toContain('wavelength')
    // sorted alphabetically
    const sorted = [...plan.academic.keyTerms].sort()
    expect(plan.academic.keyTerms).toEqual(sorted)
  })

  it('academic.level, specReference, assessmentShape populated from DNA stages', () => {
    const plan = getWritingPlan(TEXTBOOK_STATE)
    expect(plan.academic.level).toBe('GCSE')
    expect(plan.academic.specReference).toBe('AQA Physics 8463')
    expect(plan.academic.assessmentShape).toBe('multi-step calculation and short-answer')
  })

  it('revision guide academic plan captures recallType and examTrap from outcomes', () => {
    const plan = getWritingPlan(REVISION_STATE)
    expect(plan.academic.bookType).toBe('revision-guide')
    expect(plan.academic.learningOutcomes[0].recallType).toBe('fact')
    expect(plan.academic.learningOutcomes[0].examTrap).toContain('immediate')
  })

  it('revision guide chapters carry recallQuestions and examPractice', () => {
    const plan = getWritingPlan(REVISION_STATE)
    const ch = plan.academic.chapters[0]
    expect(ch.recallQuestions).toBe(5)
    expect(ch.examPractice).toHaveLength(2)
    expect(ch.examPractice[0].type).toBe('short-answer')
    expect(ch.examPractice[0].count).toBe(3)
  })

  it('nfChapters populated from ac-chapters for academic pipeline', () => {
    const plan = getWritingPlan(TEXTBOOK_STATE)
    expect(plan.nfChapters).toHaveLength(2)
    expect(plan.nfChapters[0].title).toBe('Forces and Motion')
    expect(plan.nfChapters[0].number).toBe(1)
  })

  it('non-academic plan returns academic: null', () => {
    const nonAcademic = { ...TEXTBOOK_STATE, pipeline: 'A', bookType: null }
    const plan = getWritingPlan(nonAcademic)
    expect(plan.academic).toBeNull()
  })
})

// ── NF-14.6 — Academic manuscript seeding ────────────────────────────────────

import { seedAcademicChapterContent, seedManuscriptFromPlan } from '../packages/core/dist/index.js'
import { readFileSync } from 'fs'

describe('NF-14.6 — Academic manuscript seeding', () => {
  const textbookPlan = (() => {
    const plan = getWritingPlan(TEXTBOOK_STATE)
    return plan
  })()
  const revisionPlan = (() => {
    const plan = getWritingPlan(REVISION_STATE)
    return plan
  })()

  it('textbook chapter seeds with H2 Learning outcomes, Key terms, Concept, Worked example, Exercise, Summary', () => {
    const nfCh = textbookPlan.nfChapters[0]
    const acCh = textbookPlan.academic.chapters[0]
    const out = seedAcademicChapterContent(nfCh, acCh, 'textbook', [], [])
    expect(out).toContain('## Learning outcomes')
    expect(out).toContain('## Key terms')
    expect(out).toContain('## Concept')
    expect(out).toContain('## Worked example')
    expect(out).toContain('## Exercise')
    expect(out).toContain('## Summary')
  })

  it('textbook chapter lists outcome codes under Learning outcomes', () => {
    const nfCh = textbookPlan.nfChapters[0]
    const acCh = textbookPlan.academic.chapters[0]
    const out = seedAcademicChapterContent(nfCh, acCh, 'textbook', [], [])
    expect(out).toContain('- P4.1')
    expect(out).toContain('- P4.2')
  })

  it('textbook chapter emits {{example: we-1.1}} markers', () => {
    const nfCh = textbookPlan.nfChapters[0]
    const acCh = textbookPlan.academic.chapters[0]
    const out = seedAcademicChapterContent(nfCh, acCh, 'textbook', [], [])
    expect(out).toContain('{{example: we-1.1}}')
    expect(out).toContain('{{example: we-1.2}}')
    expect(out).toContain('### we-1.1 — Resultant force calculation')
  })

  it('textbook chapter emits {{exercise: ex-1.1}} markers', () => {
    const nfCh = textbookPlan.nfChapters[0]
    const acCh = textbookPlan.academic.chapters[0]
    const out = seedAcademicChapterContent(nfCh, acCh, 'textbook', [], [])
    expect(out).toContain('{{exercise: ex-1.1}}')
    expect(out).toContain('### ex-1.1 — Basic forces')
  })

  it('revision guide chapter seeds with Exam objectives, Core idea, Common misconceptions, Quick check, Exam-style questions, Summary', () => {
    const nfCh = revisionPlan.nfChapters[0]
    const acCh = revisionPlan.academic.chapters[0]
    const out = seedAcademicChapterContent(nfCh, acCh, 'revision-guide', [], [])
    expect(out).toContain('## Exam objectives')
    expect(out).toContain('## Core idea')
    expect(out).toContain('## Common misconceptions')
    expect(out).toContain('## Quick check')
    expect(out).toContain('## Exam-style questions')
    expect(out).toContain('## Summary')
  })

  it('revision guide quick check has numbered slots matching recallQuestions', () => {
    const nfCh = revisionPlan.nfChapters[0]
    const acCh = revisionPlan.academic.chapters[0]
    const out = seedAcademicChapterContent(nfCh, acCh, 'revision-guide', [], [])
    // 5 recall questions → 5 numbered slots
    for (let i = 1; i <= 5; i++) expect(out).toMatch(new RegExp(`${i}\\. `))
  })

  it('revision guide emits exam-practice subsections by type and count', () => {
    const nfCh = revisionPlan.nfChapters[0]
    const acCh = revisionPlan.academic.chapters[0]
    const out = seedAcademicChapterContent(nfCh, acCh, 'revision-guide', [], [])
    expect(out).toContain('### short-answer (3)')
    expect(out).toContain('### extended (1)')
  })

  it('NF-12 {{claim:}} markers appear under Concept (textbook)', () => {
    const nfCh = textbookPlan.nfChapters[0]
    const acCh = textbookPlan.academic.chapters[0]
    const claims = [{ id: 'ev-p4-1', chapterNumber: 1, claimText: 'F=ma' }]
    const out = seedAcademicChapterContent(nfCh, acCh, 'textbook', claims, [])
    expect(out).toContain('{{claim: ev-p4-1}}')
    // Claim must appear after "## Concept" and before next H2
    const conceptIdx = out.indexOf('## Concept')
    const claimIdx = out.indexOf('{{claim: ev-p4-1}}')
    expect(claimIdx).toBeGreaterThan(conceptIdx)
  })

  it('NF-13 {{figure:}} markers appear under Concept', () => {
    const nfCh = textbookPlan.nfChapters[0]
    const acCh = textbookPlan.academic.chapters[0]
    const figures = [{ id: 'fig-ch1-1', chapterNumber: 1, type: 'diagram', purpose: 'forces' }]
    const out = seedAcademicChapterContent(nfCh, acCh, 'textbook', [], figures)
    expect(out).toContain('{{figure: fig-ch1-1}}')
  })

  it('seedManuscriptFromPlan writes textbook chapter files', () => {
    seedManuscriptFromPlan(textbookPlan, tmpDir)
    const ch1Path = join(tmpDir, 'manuscript', '01-forces-and-motion.md')
    expect(existsSync(ch1Path)).toBe(true)
    const content = readFileSync(ch1Path, 'utf-8')
    expect(content).toContain('# Chapter 1 — Forces and Motion')
    expect(content).toContain('## Worked example')
    expect(content).toContain('{{example: we-1.1}}')
  })

  it('seedManuscriptFromPlan writes revision-guide topic files with Topic header', () => {
    seedManuscriptFromPlan(revisionPlan, tmpDir)
    const ch1Path = join(tmpDir, 'manuscript', '01-causes-of-wwi.md')
    expect(existsSync(ch1Path)).toBe(true)
    const content = readFileSync(ch1Path, 'utf-8')
    expect(content).toContain('# Topic 1 — Causes of WWI')
    expect(content).toContain('## Exam objectives')
    expect(content).toContain('## Quick check')
  })

  it('textbook prerequisites surface in chapter header', () => {
    const nfCh = textbookPlan.nfChapters[1]
    const acCh = textbookPlan.academic.chapters[1]
    const out = seedAcademicChapterContent(nfCh, acCh, 'textbook', [], [])
    expect(out).toContain('Prerequisites: Ch 1')
  })
})

describe.skip('NF-14.7 — Learning-outcome coverage report (PENDING)', () => {
  it('generateLearningOutcomeCoverage flags outcomes with zero coverage', () => {})
  it('generateLearningOutcomeCoverage lists double-covered outcomes', () => {})
  it('prerequisite chain renderer detects forward-references', () => {})
  it('prerequisite chain renderer detects cycles', () => {})
})

describe.skip('NF-14.8 — Glossary + exercise index (PENDING)', () => {
  it('generateGlossary deduplicates terms alphabetically with first-mention chapter', () => {})
  it('generateExerciseIndex lists all worked examples and exercises by chapter', () => {})
  it('exercise index flags chapters missing exercises (textbook)', () => {})
  it('exercise index flags chapters missing exam-style questions (revision guide)', () => {})
})

describe.skip('NF-14.9 — Academic master document (PENDING)', () => {
  it('generateAcademicMasterDocument renders outcome coverage summary', () => {})
  it('academic master doc includes prerequisite chain section', () => {})
  it('academic master doc includes glossary preview', () => {})
  it('academic master doc links figure registry and claim ledger', () => {})
})
