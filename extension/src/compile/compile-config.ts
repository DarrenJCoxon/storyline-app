import * as fs from 'fs'
import * as path from 'path'

export interface CompileMetadata {
  title: string
  author: string | null
  language: string
  publisher?: string
  coverImage?: string | null
}

export type PrintTrim = '6x9' | '7x10' | '8x10' | '8.5x8.5'
export type BookType = 'novel' | 'picture-book'

export interface CompileConfig {
  metadata: CompileMetadata
  bookStyle?: string
  theme?: string   // legacy alias for bookStyle; kept for one-release compat
  paragraphStyle?: 'indented' | 'spaced'
  bookType?: BookType   // 'picture-book' switches layout to one centred text block per page + full-bleed image support
  epub?: { theme?: string }
  pdf?: { pageSize?: 'A5' | 'US Letter'; trim?: PrintTrim }
  manuscript?: { path?: string; chapterPattern?: string }
  nonfiction?: { citationStyle?: 'chicago' | 'apa' | 'mla'; generateExtras?: boolean }
}

export function readCompileConfig(projectDir: string): CompileConfig | null {
  try {
    const p = path.join(projectDir, 'compile.config.json')
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as CompileConfig
  } catch {
    return null
  }
}

export function writeCompileConfig(projectDir: string, config: CompileConfig): void {
  fs.writeFileSync(
    path.join(projectDir, 'compile.config.json'),
    JSON.stringify(config, null, 2) + '\n',
    'utf-8',
  )
}

export function ensureCompileConfig(projectDir: string): CompileConfig {
  let title = path.basename(projectDir)
  try {
    const state = JSON.parse(fs.readFileSync(path.join(projectDir, '.storyline', 'state.json'), 'utf-8'))
    title = state?._meta?.projectTitle ?? state?.projectName ?? title
  } catch { /* use dirname */ }

  const existing = readCompileConfig(projectDir)
  if (existing) {
    // Live Preview's saveDefaultsToConfig writes a partial config (theme/
    // paragraphStyle only) and would leave metadata undefined for projects
    // where Live Preview ran before Compile. Backfill metadata so the
    // webview can always render.
    if (!existing.metadata) {
      existing.metadata = { title, author: null, language: 'en', publisher: 'Independent' }
      try { writeCompileConfig(projectDir, existing) } catch { /* non-fatal */ }
    }
    return existing
  }

  const config: CompileConfig = {
    metadata: { title, author: null, language: 'en', publisher: 'Independent' },
    bookStyle: 'classic-serif',
    paragraphStyle: 'indented',
  }
  writeCompileConfig(projectDir, config)
  return config
}
