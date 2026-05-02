import * as vscode from 'vscode'
import { LicenceManager } from './licence.js'

/**
 * Single source of truth for "your licence isn't working — do something about
 * it" UX. Shows a notification with action buttons that DO the action in one
 * click. Never sends users to the command palette.
 *
 * The two action buttons are:
 *
 *   - "Try again"        — re-runs the open-planning flow, which re-validates
 *                          the stored key. Fixes transient KV propagation
 *                          races (KV is eventually consistent across colos).
 *   - "Paste key from email" — opens an input box for the user to paste a
 *                          licence key. This is the new-device-add path; the
 *                          email contains the key for exactly this case.
 */
export async function offerReactivation(
  context: vscode.ExtensionContext,
  backendUrl: string,
  opts: { isFree: boolean },
): Promise<void> {
  const message = opts.isFree
    ? 'Storyline can\'t reach your free plan right now. This usually clears in a moment.'
    : 'Storyline can\'t verify your licence right now.'

  const action = await vscode.window.showWarningMessage(
    message,
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
      await vscode.commands.executeCommand('storyline.openPlanning')
    } else {
      await manager.clearLicenceKey()
      void vscode.window.showErrorMessage(
        'That key isn\'t recognised. Check the activation email and paste it again.',
      )
    }
  }
}
