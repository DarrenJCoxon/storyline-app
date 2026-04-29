import * as vscode from 'vscode'
import * as fs from 'fs'

/**
 * Paths matching these globs require explicit writer confirmation before the
 * AI can write to them. The check is enforced in code — not in the prompt —
 * so the model cannot bypass it regardless of what it generates.
 *
 * Rule: if the normalised relative path starts with any of these prefixes,
 * the file is protected.
 */
const PROTECTED_PREFIXES = ['manuscript/']

/** Fraction by which content may shrink before we flag it as destructive. */
const SHRINK_THRESHOLD = 0.10

export interface GuardStats {
  existingWords: number
  newWords: number
  shrinkPct: number
  isNewFile: boolean
}

export type GuardDecision =
  | { allowed: true; stats: GuardStats }
  | { allowed: false; reason: string; stats: GuardStats }

function wordCount(text: string): number {
  const t = text.trim()
  return t === '' ? 0 : t.split(/\s+/).length
}

function readExisting(absPath: string): string | null {
  try { return fs.readFileSync(absPath, 'utf-8') } catch { return null }
}

/**
 * Pure guard — returns a decision without any side-effects.
 * Call this from the ChatPanel before writing; show the confirmation dialog
 * only when `allowed` is false so the writer controls what happens next.
 */
export function guardFileWrite(relPath: string, absPath: string, newContent: string): GuardDecision {
  const normalised = relPath.replace(/\\/g, '/')
  const isProtected = PROTECTED_PREFIXES.some(p => normalised.startsWith(p))

  const existing = readExisting(absPath)
  const existingWords = existing !== null ? wordCount(existing) : 0
  const newWords = wordCount(newContent)
  const isNewFile = existing === null

  const shrinkPct = existingWords > 0
    ? Math.max(0, (existingWords - newWords) / existingWords)
    : 0

  const stats: GuardStats = { existingWords, newWords, shrinkPct, isNewFile }

  if (!isProtected && shrinkPct <= SHRINK_THRESHOLD) {
    return { allowed: true, stats }
  }

  // Blocked pending confirmation — caller must call confirmWrite() and only
  // proceed if the writer approves.
  return {
    allowed: false,
    reason: isProtected
      ? 'manuscript protection'
      : `content shrink (${Math.round(shrinkPct * 100)}%)`,
    stats,
  }
}

/**
 * Show a modal confirmation dialog. Returns true only if the writer
 * explicitly clicks "Write file". Cancelling or dismissing always returns
 * false — no destructive action taken.
 */
export async function confirmWrite(relPath: string, stats: GuardStats): Promise<boolean> {
  const { existingWords, newWords, shrinkPct, isNewFile } = stats

  let detail: string
  if (isNewFile) {
    detail = `This will create a new file at ${relPath} (~${newWords} words).`
  } else if (shrinkPct > SHRINK_THRESHOLD) {
    detail = `This will replace ${relPath}: ${existingWords} words → ${newWords} words (−${Math.round(shrinkPct * 100)}% reduction).`
  } else {
    detail = `This will overwrite ${relPath} (${existingWords} words → ${newWords} words).`
  }

  const choice = await vscode.window.showWarningMessage(
    `Allow AI to write to ${relPath}?`,
    { modal: true, detail },
    'Write file',
  )
  return choice === 'Write file'
}
