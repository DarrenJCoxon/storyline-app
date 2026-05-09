// CB-10 wrapper used by extension.ts and panels — registers a VS Code
// command in a way that:
//
//   1. Surfaces any thrown error as a toast (instead of silently swallowing
//      it as `void asyncFn()` would). This is the change v0.2.9 made for
//      the two preview commands; this helper is the generalised form.
//   2. Reports the same error to the production error-reporter (CB-05)
//      with `endpoint: cmd:<commandName>` so we can see breakages in the
//      Worker logs without waiting for users to email.
//   3. Logs the full error + stack to Developer Tools console for local
//      debugging.
//
// Usage:
//   context.subscriptions.push(
//     safeCommand('storyline.openLivePreview', () => openLivePreview(context)),
//   )
//
// The handler can be sync or async. Return values are passed through.
//
// Errors that flow through here include the toast + report + console log
// — there's no need to re-wrap inside the handler. This helper is the
// single place we want catch logic for command callbacks; if it grows
// new behaviour (telemetry sampling, error categorisation, etc.) it
// happens in one file.

import * as vscode from 'vscode'
import { reportException } from './ai/error-reporter.js'
import { logError } from './diagnostic-log.js'

export type CommandHandler = (...args: unknown[]) => unknown | Promise<unknown>

export function safeCommand(commandId: string, handler: CommandHandler): vscode.Disposable {
  return vscode.commands.registerCommand(commandId, async (...args) => {
    try {
      return await handler(...args)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logError(`[Storyline] command ${commandId} threw:`, err)
      reportException(err, `cmd:${commandId}`)
      void vscode.window.showErrorMessage(`Storyline: ${commandId.replace(/^storyline\./, '')} failed — ${msg}`)
    }
  })
}
