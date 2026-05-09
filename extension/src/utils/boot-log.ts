import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/**
 * Synchronous file-based boot log. Writes to %LOCALAPPDATA%\Storyline\boot.log
 * on Windows (~/.storyline-boot.log elsewhere) using fs.appendFileSync. Used
 * to diagnose hangs that occur before VS Code's Output channel is registered
 * — when the extension host gets stuck mid-activation we still get a trail.
 *
 * Every call must be cheap and crash-proof: a failure to write the boot log
 * must never block activation.
 *
 * CB-17 — opt-in by default. The boot log was indispensable while we were
 * tracking down the Windows DPAPI hang, but on a stable build it writes a
 * file every workspace open with no consumer reading it. Now gated behind
 * STORYLINE_BOOT_LOG=1. Set the env var to re-enable when chasing a new
 * activation issue. Off-by-default avoids leaving forensic traces in user
 * home dirs and saves 5–10 sync writes per activation.
 */

let logPath: string | null = null
let bootStart = 0
const BOOT_LOG_ENABLED = process.env.STORYLINE_BOOT_LOG === '1'

function resolvePath(): string {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || os.tmpdir()
    return path.join(base, 'Storyline', 'boot.log')
  }
  return path.join(os.homedir(), '.storyline-boot.log')
}

export function bootLogInit(): void {
  if (!BOOT_LOG_ENABLED) {
    logPath = null
    return
  }
  try {
    bootStart = Date.now()
    logPath = resolvePath()
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    const header = `\n=== boot ${new Date().toISOString()} pid=${process.pid} platform=${process.platform} arch=${process.arch} node=${process.version} ===\n`
    fs.appendFileSync(logPath, header, 'utf8')
  } catch {
    logPath = null
  }
}

export function bootLog(checkpoint: string, extra?: string): void {
  if (!logPath) return
  try {
    const elapsed = Date.now() - bootStart
    const line = `+${String(elapsed).padStart(5, ' ')}ms  ${checkpoint}${extra ? ` :: ${extra}` : ''}\n`
    fs.appendFileSync(logPath, line, 'utf8')
  } catch {
    // Never throw from instrumentation.
  }
}

export function bootLogError(checkpoint: string, err: unknown): void {
  if (!logPath) return
  try {
    const elapsed = Date.now() - bootStart
    const msg = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack || ''}` : String(err)
    fs.appendFileSync(logPath, `+${String(elapsed).padStart(5, ' ')}ms  ERROR ${checkpoint} :: ${msg}\n`, 'utf8')
  } catch {
    // Swallow.
  }
}

export function bootLogPath(): string | null {
  return logPath
}
