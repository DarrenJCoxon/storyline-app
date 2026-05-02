import * as vscode from 'vscode'
import { LicenceManager } from './licence.js'
import { issueFreePlan } from './free-plan-issue.js'
import { postActivateOpenWorkspace } from '../onboarding/post-activate.js'

const BACKEND_URL = 'https://api.storyline.my'

/**
 * Show a notification with action buttons that DO the action in one click —
 * never sends users to the command palette. The action set differs by plan
 * type because the recovery options are different:
 *
 *   - Free plan: re-mint a fresh per-install key (no email exists, paid keys
 *     don't apply). Offer "Reset & start over" which clears state and
 *     re-runs the Start Free flow end-to-end.
 *
 *   - Paid plan: ask the user to paste the licence key from their purchase
 *     email. This is the legitimate device-add path.
 *
 * In both cases "Try again" re-runs the open-planning flow so transient
 * propagation races self-heal.
 */
export async function offerReactivation(
  context: vscode.ExtensionContext,
  backendUrl: string,
  opts: { isFree: boolean },
): Promise<void> {
  if (opts.isFree) {
    await offerFreeReactivation(context)
  } else {
    await offerPaidReactivation(context, backendUrl)
  }
}

async function offerFreeReactivation(context: vscode.ExtensionContext): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    'Storyline can\'t reach your free plan right now.',
    { modal: false },
    'Try again',
    'Reset & start over',
  )

  if (action === 'Try again') {
    await vscode.commands.executeCommand('storyline.openPlanning')
    return
  }

  if (action === 'Reset & start over') {
    const manager = new LicenceManager(context, BACKEND_URL)
    await manager.clearLicenceKey()
    await manager.clearCache()
    await context.globalState.update('storyline.freePlan', undefined)

    try {
      const issued = await issueFreePlan(BACKEND_URL)
      await manager.setLicenceKey(issued.licenceKey)
      const info = await manager.validate({})
      if (info.valid) {
        await context.globalState.update('storyline.freePlan', { active: true })
        void vscode.window.showInformationMessage(
          `Free plan activated — ${info.creditBalance.toLocaleString()} credits ready.`,
        )
        await postActivateOpenWorkspace(context, context.extensionUri)
      } else {
        await manager.clearLicenceKey()
        void vscode.window.showErrorMessage(
          'Couldn\'t reactivate the free plan. The activation server is reachable but the new key didn\'t validate. Email darren@coxon.ai if this persists.',
        )
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      const message = /429/.test(raw)
        ? 'Free plan limit reached for this network — try again in a few hours, or buy credits to continue.'
        : `Could not reach activation server: ${raw}`
      void vscode.window.showErrorMessage(message)
    }
  }
}

async function offerPaidReactivation(
  context: vscode.ExtensionContext,
  backendUrl: string,
): Promise<void> {
  const action = await vscode.window.showWarningMessage(
    'Storyline can\'t verify your licence right now.',
    'Try again',
    'Paste key from email',
  )

  if (action === 'Try again') {
    await vscode.commands.executeCommand('storyline.openPlanning')
    return
  }

  if (action === 'Paste key from email') {
    const key = await vscode.window.showInputBox({
      title: 'Paste your Storyline licence key',
      prompt: 'You can find this in your purchase confirmation email.',
      placeHolder: 'SL-XXXX-XXXX-XXXX',
      ignoreFocusOut: true,
      validateInput: v => (v.trim().toUpperCase().startsWith('SL-') ? null : 'Key should start with SL-'),
    })
    if (!key?.trim()) return

    const manager = new LicenceManager(context, backendUrl)
    await manager.setLicenceKey(key.trim().toUpperCase())
    const info = await manager.validate({})
    if (info.valid) {
      void vscode.window.showInformationMessage(
        `Activated — ${info.creditBalance.toLocaleString()} credits ready.`,
      )
      await postActivateOpenWorkspace(context, context.extensionUri)
    } else {
      await manager.clearLicenceKey()
      void vscode.window.showErrorMessage(
        'That key isn\'t recognised. Check the activation email and paste it again.',
      )
    }
  }
}
