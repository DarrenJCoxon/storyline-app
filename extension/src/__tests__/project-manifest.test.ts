import { describe, it, expect, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

vi.mock('vscode', () => ({}))

import {
  buildProjectManifest,
  renderProjectManifest,
  projectManifestBlock,
} from '../conversation/project-manifest.js'

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'storyline-manifest-'))
}

function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true })
}

function seed(root: string, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, body)
  }
}

describe('project-manifest (NT-20)', () => {
  let root: string | null = null

  afterEach(() => {
    if (root) {
      rmrf(root)
      root = null
    }
  })

  it('returns empty arrays for an empty project', () => {
    root = tmpProject()
    const m = buildProjectManifest(root)
    expect(m.chapters).toHaveLength(0)
    expect(m.planningChapters).toHaveLength(0)
    expect(m.planningStages).toHaveLength(0)
    expect(m.research).toHaveLength(0)
  })

  it('discovers manuscript chapters with word count and first heading', () => {
    root = tmpProject()
    seed(root, {
      'manuscript/01-opening.md': '# The case against vibe coding\n\nWhat is the cost of building software through conversation alone?',
      'manuscript/02-second.md': '## Second chapter\n\nMore body.',
    })
    const m = buildProjectManifest(root)
    expect(m.chapters).toHaveLength(2)
    expect(m.chapters[0].relPath).toBe('manuscript/01-opening.md')
    expect(m.chapters[0].firstHeading).toBe('The case against vibe coding')
    expect(m.chapters[0].wordCount).toBeGreaterThan(0)
    expect(m.chapters[1].firstHeading).toBe('Second chapter')
  })

  it('discovers planning chapter cards', () => {
    root = tmpProject()
    seed(root, {
      'planning/chapters/01-the-case-against.md': '# The case against vibe coding\n\nCard body.',
      'planning/chapters/11-maps-canonical.md': '# Maps as the single canonical plan\n',
    })
    const m = buildProjectManifest(root)
    expect(m.planningChapters).toHaveLength(2)
    expect(m.planningChapters[0].firstHeading).toBe('The case against vibe coding')
    expect(m.planningChapters[1].relPath).toBe('planning/chapters/11-maps-canonical.md')
  })

  it('discovers research items', () => {
    root = tmpProject()
    seed(root, {
      '.storyline/research/itm-aaa.md': '---\ntitle: Bartholomew docks\n---\nBody',
      '.storyline/research/itm-bbb.md': '# Cipher etymology\n',
    })
    const m = buildProjectManifest(root)
    expect(m.research).toHaveLength(2)
    expect(m.research[1].firstHeading).toBe('Cipher etymology')
  })

  it('skips non-markdown files', () => {
    root = tmpProject()
    seed(root, {
      'manuscript/01.md': '# OK',
      'manuscript/notes.txt': 'should be ignored',
      'manuscript/cover.png': 'binary-ish',
    })
    const m = buildProjectManifest(root)
    expect(m.chapters).toHaveLength(1)
  })

  it('renders a non-empty manifest as a markdown block with section counts', () => {
    root = tmpProject()
    seed(root, {
      'manuscript/01.md': '# Open\n\nText.',
      'manuscript/02.md': '# Two\n\nText.',
      'planning/chapters/01-card.md': '# Card 1',
      'planning/stages/protagonist.md': '# Protagonist',
      '.storyline/research/itm-aaa.md': '# Quote',
    })
    const block = renderProjectManifest(buildProjectManifest(root))
    expect(block).toContain('## Project files')
    expect(block).toContain('Manuscript chapters (2)')
    expect(block).toContain('Planning chapter cards (1)')
    expect(block).toContain('Planning stage docs (1)')
    expect(block).toContain('Research items (1)')
    expect(block).toContain('manuscript/01.md')
    expect(block).toContain('planning/chapters/01-card.md')
  })

  it('renders empty string when nothing exists', () => {
    root = tmpProject()
    expect(renderProjectManifest(buildProjectManifest(root))).toBe('')
  })

  it('projectManifestBlock returns empty string for null projectRoot', () => {
    expect(projectManifestBlock(null)).toBe('')
  })

  it('regression: a duplicate file like ch-11.md alongside the canonical 11-foo.md is shown so the AI can flag it', () => {
    root = tmpProject()
    seed(root, {
      'planning/chapters/11-maps-as-the-single-canonical-plan.md': '# Maps',
      'planning/chapters/ch-11.md': '# Duplicate',
    })
    const m = buildProjectManifest(root)
    expect(m.planningChapters).toHaveLength(2)
    const paths = m.planningChapters.map(e => e.relPath)
    expect(paths).toContain('planning/chapters/11-maps-as-the-single-canonical-plan.md')
    expect(paths).toContain('planning/chapters/ch-11.md')
  })
})
