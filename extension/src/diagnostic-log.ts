import * as vscode from 'vscode'

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
    channel = vscode.window.createOutputChannel('Storyline')
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
