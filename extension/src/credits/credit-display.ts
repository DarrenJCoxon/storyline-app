// Type-only — runtime vscode is loaded lazily so vitest can import this
// module's pure helpers without resolving the synthetic vscode module.
import type * as vscode from 'vscode'

/** Credit count below which we surface the low-credit warning toast and
 *  paint the status-bar item yellow/orange. */
export const LOW_THRESHOLD = 50

/** Below this we paint the status-bar item red so the user can't miss it.
 *  Same colour as exhausted (0) — at this point the conversation is one
 *  or two more turns from running out and requiring a top-up. */
export const CRITICAL_THRESHOLD = 10

/** Once the user has been warned, the toast stays muted until balance
 *  climbs back above this re-arm threshold (typically via a top-up). The
 *  gap between LOW_THRESHOLD and REARM_THRESHOLD prevents flap when the
 *  user spends a few credits, gets warned, tops up to ~60, spends a few
 *  more, and would otherwise re-trigger the warning. */
export const REARM_THRESHOLD = 100

/** globalState key tracking the threshold at which we last warned. */
export const LOW_WARNED_KEY = 'storyline.lowCreditWarnedBelow'

export type LicenceTypeForDisplay = 'free' | 'credits' | 'byok'

let statusBar: vscode.StatusBarItem | undefined
let extContext: vscode.ExtensionContext | undefined

/**
 * Construct the singleton credit status-bar item. Idempotent — second
 * call is a no-op so multiple activation paths can call freely.
 *
 * Status-bar slot: right-aligned at priority 95 — keeps it adjacent to
 * the other right-aligned Storyline indicators (Notes lives at 96) but
 * out of the way of the left-aligned action buttons (Planning, Preview,
 * Research, Compile).
 */
export function initCreditDisplay(context: vscode.ExtensionContext): void {
  if (statusBar) return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscodeRuntime = require('vscode') as typeof import('vscode')
  extContext = context
  statusBar = vscodeRuntime.window.createStatusBarItem(vscodeRuntime.StatusBarAlignment.Right, 95)
  statusBar.command = 'storyline.topUpCredits'
  context.subscriptions.push(statusBar)
}

/**
 * Public sink for credit-balance updates. Call from every place the
 * balance can change: chat-turn completion, image gen, critique, refund,
 * top-up, validate. Updates the status bar AND fires the one-shot
 * low-credit warning toast when the balance crosses below LOW_THRESHOLD.
 */
export async function updateCreditBalance(
  balance: number,
  type: LicenceTypeForDisplay,
): Promise<void> {
  if (!statusBar || !extContext) return
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscodeRuntime = require('vscode') as typeof import('vscode')

  // BYOK doesn't have a credit balance — hide the indicator entirely.
  if (type === 'byok') {
    statusBar.hide()
    return
  }

  statusBar.text = `$(zap) ${balance.toLocaleString()}`
  statusBar.tooltip = balance === 0
    ? 'Storyline: credits exhausted. Click to top up.'
    : `Storyline: ${balance.toLocaleString()} credits remaining. Click to top up.`

  // Three colour tiers — drawn from VS Code theme tokens so the contrast
  // stays correct in dark, light, and high-contrast themes:
  //   0–10 credits  → errorBackground   (red)
  //   11–50 credits → warningBackground (orange/yellow)
  //   >50 credits   → default
  if (balance <= CRITICAL_THRESHOLD) {
    statusBar.backgroundColor = new vscodeRuntime.ThemeColor('statusBarItem.errorBackground')
  } else if (balance <= LOW_THRESHOLD) {
    statusBar.backgroundColor = new vscodeRuntime.ThemeColor('statusBarItem.warningBackground')
  } else {
    statusBar.backgroundColor = undefined
  }

  statusBar.show()

  await maybeWarnLowCredits(balance)
}

async function maybeWarnLowCredits(balance: number): Promise<void> {
  if (!extContext) return
  const lastWarnedBelow = extContext.globalState.get<number | undefined>(LOW_WARNED_KEY)
  const decision = lowCreditWarningDecision(balance, lastWarnedBelow)

  if (decision === 'reset') {
    await extContext.globalState.update(LOW_WARNED_KEY, undefined)
    return
  }

  if (decision === 'fire') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscodeRuntime = require('vscode') as typeof import('vscode')
    const choice = await vscodeRuntime.window.showWarningMessage(
      `You have ${balance} Storyline credits left. Top up to keep using AI features without interruption.`,
      'Top up',
      'Dismiss',
    )
    if (choice === 'Top up') {
      void vscodeRuntime.commands.executeCommand('storyline.topUpCredits')
    }
    await extContext.globalState.update(LOW_WARNED_KEY, LOW_THRESHOLD)
  }
}

export type LowCreditDecision = 'fire' | 'mute' | 'reset' | 'noop'

/**
 * Pure decision function — extracted from the side-effecting helper so
 * we can unit-test the threshold/re-arm logic without a vscode runtime.
 *
 * - `fire` → show the warning + persist last-warned-at.
 * - `mute` → in low-credit territory, but already warned this cycle; do nothing.
 * - `reset` → balance climbed back above re-arm threshold; clear the persisted flag so the next dip will fire again.
 * - `noop`  → no state change needed (above LOW_THRESHOLD but below REARM, never warned).
 */
export function lowCreditWarningDecision(
  balance: number,
  lastWarnedBelow: number | undefined,
): LowCreditDecision {
  // Past the re-arm threshold → forget any prior warning so the next
  // dip below LOW_THRESHOLD triggers cleanly.
  if (balance >= REARM_THRESHOLD) {
    return lastWarnedBelow !== undefined ? 'reset' : 'noop'
  }

  // Zero is handled separately by the exhausted-credits modal/colour;
  // we don't fire the soft "running low" toast at zero.
  if (balance <= 0) return 'noop'

  // In the low-credit band: fire iff we haven't warned this cycle.
  if (balance <= LOW_THRESHOLD) {
    return lastWarnedBelow === undefined ? 'fire' : 'mute'
  }

  return 'noop'
}

/**
 * Convenience: pull fresh balance from /validate and push it to the
 * status bar in one call. Use this from places where the caller doesn't
 * already have a fresh `LicenceInfo` in hand (e.g. image-gen completion,
 * refund-completion webhooks, post-startup heartbeat).
 *
 * Silent on failure — if validate() throws or returns an invalid record,
 * the status bar stays at its last known value rather than disappearing
 * (better than flapping the indicator on transient network blips).
 */
export async function refreshAndDisplayCredits(
  context: vscode.ExtensionContext,
  backendUrl: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LicenceManager } = require('../auth/licence.js') as typeof import('../auth/licence.js')
  const manager = new LicenceManager(context, backendUrl)
  try {
    const info = await manager.validate({})
    if (info.valid) {
      await updateCreditBalance(info.creditBalance, info.type)
    }
  } catch {
    /* keep last-known state on transient failure */
  }
}

/** Test-only escape hatch — resets the singleton so a fresh test run
 *  doesn't see leaked state. Don't call from production code. */
export function _resetForTests(): void {
  statusBar = undefined
  extContext = undefined
}
