import * as vscode from 'vscode'
import { LicenceManager } from '../auth/licence.js'
import { issueFreePlan } from '../auth/free-plan-issue.js'
import { postActivateOpenWorkspace } from './post-activate.js'

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

  await showKeyPrompt(context, manager, backendUrl)
}

/** Call this when the backend returns 402 / creditsExhausted */
export async function promptOnCreditsExhausted(
  context: vscode.ExtensionContext,
  backendUrl: string,
): Promise<void> {
  const manager = new LicenceManager(context, backendUrl)
  const key = await manager.getLicenceKey()

  if (!key) {
    await showKeyPrompt(context, manager, backendUrl)
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
  backendUrl: string,
): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    'Welcome to Storyline! Start with one free book plan (250 credits), or enter a licence key. By continuing you accept the Terms and Privacy Policy.',
    { modal: false },
    'Start free plan',
    'Enter Licence Key',
    'View Terms',
    'View Privacy',
  )

  if (choice === 'View Terms') {
    await vscode.env.openExternal(vscode.Uri.parse('https://api.storyline.my/terms'))
    await showKeyPrompt(context, manager, backendUrl)
    return
  }
  if (choice === 'View Privacy') {
    await vscode.env.openExternal(vscode.Uri.parse('https://api.storyline.my/privacy'))
    await showKeyPrompt(context, manager, backendUrl)
    return
  }

  if (choice === 'Enter Licence Key') {
    await promptForKey(context, manager)
  } else if (choice === 'Start free plan') {
    console.log('[Storyline] licence-prompt: Start free plan chosen — calling /free-plan/issue at', backendUrl)
    try {
      const issued = await issueFreePlan(backendUrl)
      console.log('[Storyline] licence-prompt: issued', issued.licenceKey, 'credits=', issued.creditBalance)
      await manager.setLicenceKey(issued.licenceKey)
      const info = await manager.validate({})
      console.log('[Storyline] licence-prompt: validate result', info)
      if (info.valid) {
        await context.globalState.update(SNOOZE_KEY, undefined)
        await context.globalState.update('storyline.freePlan', { active: true })
        void vscode.window.showInformationMessage(
          `Free plan activated — ${info.creditBalance.toLocaleString()} credits ready. Opening your planning chat…`,
        )
        await postActivateOpenWorkspace()
      } else {
        // Newly-issued key didn't validate — safe to clear, we know the
        // stored key is the one we just wrote.
        await manager.clearLicenceKey()
        void vscode.window.showErrorMessage(
          `Free plan activation failed: ${info.type}/${info.creditBalance} — please try again or enter a licence key.`,
        )
      }
    } catch (err) {
      // DO NOT clear the stored key here — issueFreePlan throws before we
      // touch SecretStorage, so any pre-existing key (paid key, valid free
      // key from a prior install) is untouched. Wiping it would punish
      // users who clicked Start Free when rate-limited.
      console.error('[Storyline] licence-prompt: failed', err)
      const raw = err instanceof Error ? err.message : String(err)
      const message = /429/.test(raw)
        ? 'Free plan limit reached for this network. Please try again later or enter a licence key.'
        : `Could not reach activation server: ${raw}`
      void vscode.window.showErrorMessage(message)
    }
  }
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
      `Storyline activated — ${info.creditBalance.toLocaleString()} credits ready. Opening your planning chat…`,
    )
    await postActivateOpenWorkspace()
  } else {
    await manager.clearLicenceKey()
    void vscode.window.showErrorMessage(
      'That licence key is invalid or expired. Check your purchase email and try again.',
    )
  }
}
