import * as fs from 'fs'
import * as path from 'path'

export interface CompileMetadata {
  title: string
  author: string | null
  language: string
  publisher?: string
  coverImage?: string | null
}

export interface CompileConfig {
  metadata: CompileMetadata
  theme: string
  paragraphStyle?: 'indented' | 'spaced'
  epub?: { theme?: string }
  pdf?: { pageSize?: 'A5' | 'US Letter' }
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
  const existing = readCompileConfig(projectDir)
  if (existing) return existing

  let title = path.basename(projectDir)
  try {
    const state = JSON.parse(fs.readFileSync(path.join(projectDir, '.storyline', 'state.json'), 'utf-8'))
    title = state?._meta?.projectTitle ?? state?.projectName ?? title
  } catch { /* use dirname */ }

  const config: CompileConfig = {
    metadata: { title, author: null, language: 'en', publisher: 'Independent' },
    theme: 'classic-serif',
    paragraphStyle: 'indented',
  }
  writeCompileConfig(projectDir, config)
  return config
}
