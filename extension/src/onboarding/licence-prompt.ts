import * as vscode from 'vscode'
import { LicenceManager } from '../auth/licence.js'

const SNOOZE_KEY = 'storyline.licencePromptSnoozedUntil'
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

export async function checkLicencePrompt(
  context: vscode.ExtensionContext,
  backendUrl: string,
): Promise<void> {
  const manager = new LicenceManager(context, backendUrl)
  const key = await manager.getLicenceKey()
  if (key) return // already activated

  const snoozedUntil = context.globalState.get<number>(SNOOZE_KEY, 0)
  if (Date.now() < snoozedUntil) return

  await showKeyPrompt(context, manager)
}

/** Call this when the backend returns 402 / creditsExhausted */
export async function promptOnCreditsExhausted(
  context: vscode.ExtensionContext,
  backendUrl: string,
): Promise<void> {
  const manager = new LicenceManager(context, backendUrl)
  const key = await manager.getLicenceKey()

  if (!key) {
    await showKeyPrompt(context, manager)
    return
  }

  const choice = await vscode.window.showWarningMessage(
    'Your Storyline credits are exhausted. Top up to keep writing.',
    'Top Up Credits',
    'Later',
  )
  if (choice === 'Top Up Credits') {
    void vscode.commands.executeCommand('storyline.topUpCredits')
  }
}

async function showKeyPrompt(
  context: vscode.ExtensionContext,
  manager: LicenceManager,
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    'Welcome to Storyline! Enter your licence key to activate, or try it free for 3 days.',
    { modal: false },
    'Enter Licence Key',
    'Try Free (3 days)',
  )

  if (choice === 'Enter Licence Key') {
    await promptForKey(context, manager)
  } else if (choice === 'Try Free (3 days)') {
    await context.globalState.update(SNOOZE_KEY, Date.now() + SNOOZE_MS)
    void vscode.window.showInformationMessage(
      "You're on the free trial. Your licence key will be needed in 3 days — check your email if you already purchased.",
    )
  }
  // Dismissed without choosing → show again next session
}

async function promptForKey(
  context: vscode.ExtensionContext,
  manager: LicenceManager,
): Promise<void> {
  const key = await vscode.window.showInputBox({
    title: 'Storyline — Enter Licence Key',
    placeHolder: 'SL-XXXX-XXXX-XXXX-XXXX',
    ignoreFocusOut: true,
    validateInput: v => (v.trim().toUpperCase().startsWith('SL-') ? null : 'Key should start with SL-'),
  })

  if (!key?.trim()) return

  await manager.setLicenceKey(key.trim().toUpperCase())
  const info = await manager.validate({})

  if (info.valid) {
    await context.globalState.update(SNOOZE_KEY, undefined)
    void vscode.window.showInformationMessage(
      `Storyline activated — ${info.creditBalance.toLocaleString()} credits ready.`,
    )
  } else {
    await manager.clearLicenceKey()
    void vscode.window.showErrorMessage(
      'That licence key is invalid or expired. Check your purchase email and try again.',
    )
  }
}
