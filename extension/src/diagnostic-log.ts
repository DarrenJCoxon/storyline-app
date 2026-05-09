// Type-only import — erased before bundling, so vitest doesn't try to
// resolve the synthetic `vscode` module. The runtime reference is loaded
// lazily inside `initDiagnosticLog` (see also: extension/src/ai/error-reporter.ts
// which documents the same pattern).
import type * as vscode from 'vscode'

/**
 * Persistent output channel for Storyline diagnostics. Lives at
 * Output → Storyline so users (and us) can read what the extension is
 * doing without spelunking the Extension Host renderer console. Mirrors
 * everything to console.* too so existing call sites that just want a
 * one-liner ("[Storyline] foo") still work.
 */
let channel: vscode.OutputChannel | undefined

export function initDiagnosticLog(): vscode.OutputChannel {
  if (!channel) {
    // Lazy require: keeps unit tests (vitest) able to import this module
    // transitively (via diagnostic-log → managed-provider → providers.test)
    // without crashing on the unresolvable `vscode` module. Real extension
    // activation always has the VS Code runtime, so this branch is hot.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscodeRuntime = require('vscode') as typeof import('vscode')
    channel = vscodeRuntime.window.createOutputChannel('Storyline')
  }
  return channel
}

/**
 * Reveal the Storyline output channel as the active panel so users (and
 * us) can read diagnostic logs without searching for it. Only call this
 * from contexts where surfacing the panel is genuinely desired (e.g. a
 * "Show Storyline log" command), not on every activation — that would
 * be intrusive.
 */
export function showLog(preserveFocus = true): void {
  channel?.show(preserveFocus)
}

export function logInfo(message: string, ...rest: unknown[]): void {
  const line = format(message, rest)
  console.log(line)
  channel?.appendLine(line)
}

/**
 * CB-16 — opt-in verbose logging. Used for chatty per-init lines that
 * are helpful when debugging support cases but noisy on every workspace
 * open (e.g. "stored key prefix = SL-FREE-…", "validate = {valid:true,
 * type:'free', creditBalance:145}", "/chat POST url=… key=SL-FREE-…
 * stage=mode"). These don't reach the console or output channel unless
 * the user has set STORYLINE_VERBOSE=1 in their environment.
 *
 * The Output → Storyline channel is for user-meaningful events (errors,
 * stage saves, update offers); verbose noise belongs in DevTools when
 * deliberately enabled.
 */
const VERBOSE = process.env.STORYLINE_VERBOSE === '1'
export function logVerbose(message: string, ...rest: unknown[]): void {
  if (!VERBOSE) return
  const line = format(message, rest)
  console.log(line)
  channel?.appendLine(line)
}

export function logWarn(message: string, ...rest: unknown[]): void {
  const line = format(message, rest)
  console.warn(line)
  channel?.appendLine(`WARN: ${line}`)
}

export function logError(message: string, ...rest: unknown[]): void {
  const line = format(message, rest)
  console.error(line)
  channel?.appendLine(`ERROR: ${line}`)
}

function format(message: string, rest: unknown[]): string {
  const ts = new Date().toISOString().slice(11, 23)
  const tail = rest.length === 0 ? '' : ' ' + rest.map(serialise).join(' ')
  return `[${ts}] ${message}${tail}`
}

function serialise(v: unknown): string {
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return String(v) }
}
