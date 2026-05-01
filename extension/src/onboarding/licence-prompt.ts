import * as vscode from 'vscode'
import { LicenceManager } from '../auth/licence.js'
import { FREE_LICENCE_KEY } from '../panels/OnboardingPanel.js'

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
    'Welcome to Storyline! Start with one free book plan, or enter a licence key.',
    { modal: false },
    'Start free plan',
    'Enter Licence Key',
  )

  if (choice === 'Enter Licence Key') {
    await promptForKey(context, manager)
  } else if (choice === 'Start free plan') {
    // Auto-activate the seeded free-tier key. The Worker's KV holds an entry
    // for SL-FREE-0000-0000-FREE granting a credit pool sized to cover one
    // complete planning run (chat + critique). Image generation is blocked
    // server-side regardless of remaining credits.
    await manager.setLicenceKey(FREE_LICENCE_KEY)
    const info = await manager.validate({})
    if (info.valid) {
      await context.globalState.update(SNOOZE_KEY, undefined)
      await context.globalState.update('storyline.freePlan', { active: true })
      void vscode.window.showInformationMessage(
        `Free plan activated — ${info.creditBalance.toLocaleString()} credits ready. Image generation requires paid credits; top up any time.`,
      )
    } else {
      // KV not seeded — clear so we don't lock the user into a dead key.
      await manager.clearLicenceKey()
      void vscode.window.showErrorMessage(
        "Free plan unavailable right now — please try again later or enter a licence key.",
      )
    }
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
