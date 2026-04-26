import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

let cachedFiction: string | null = null
let cachedNonfiction: string | null = null

function loadSkill(extensionPath: string, file: string): string {
  const skillPath = path.join(extensionPath, 'skill-content', file)
  return fs.readFileSync(skillPath, 'utf-8')
}

function stripFrontmatter(md: string): string {
  if (!md.startsWith('---')) return md
  const end = md.indexOf('\n---', 3)
  if (end === -1) return md
  return md.slice(end + 4).trimStart()
}

export function getFictionSkill(extensionPath: string): string {
  if (!cachedFiction) {
    cachedFiction = stripFrontmatter(loadSkill(extensionPath, 'storyline-fiction.md'))
  }
  return cachedFiction
}

export function getNonfictionSkill(extensionPath: string): string {
  if (!cachedNonfiction) {
    cachedNonfiction = stripFrontmatter(loadSkill(extensionPath, 'storyline-nonfiction.md'))
  }
  return cachedNonfiction
}

export function getExtensionPath(): string {
  const ext = vscode.extensions.getExtension('darrenjcoxon.storyline-extension')
  if (ext) return ext.extensionPath
  return path.resolve(__dirname, '..', '..')
}
