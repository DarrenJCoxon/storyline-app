import * as vscode from 'vscode'
import { scaffoldProject } from '../onboarding/project-scaffold.js'
import { postActivateOpenWorkspace } from '../onboarding/post-activate.js'
import { secretsStore } from '../utils/secrets-timeout.js'
import { LicenceManager } from '../auth/licence.js'
import { issueFreePlan } from '../auth/free-plan-issue.js'
import { BYOKProvider } from '../ai/byok-provider.js'
import { OllamaProvider } from '../ai/ollama-provider.js'
import { logVerbose, logError } from '../diagnostic-log.js'

const BACKEND_URL = 'https://api.storyline.my'

// One-time top-up Payment Links (no subscription product — credits only).
const STRIPE_LINKS: Record<string, string> = {
  '10': 'https://buy.stripe.com/7sYdR9bwndIa8Pv7Ye3wQ01',
  '20': 'https://buy.stripe.com/cNicN5gQH7jM3vbguK3wQ02',
}

type Screen = 'welcome' | 'buy-credits' | 'byok' | 'new-project'

export class OnboardingPanel {
  public static readonly viewType = 'storyline.onboarding'
  private static instance: OnboardingPanel | undefined

  private readonly panel: vscode.WebviewPanel
  private readonly licenceManager: LicenceManager
  private onScaffolded?: () => void

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
    initialScreen: Screen = 'welcome',
    onScaffolded?: () => void,
  ) {
    this.onScaffolded = onScaffolded
    this.licenceManager = new LicenceManager(context, BACKEND_URL)

    this.panel = vscode.window.createWebviewPanel(
      OnboardingPanel.viewType,
      'Storyline — Get Started',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      },
    )

    this.panel.webview.html = this.getHtml(this.panel.webview)
    this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg))
    this.panel.onDidDispose(() => { OnboardingPanel.instance = undefined })

    void this.sendInit(initialScreen)
  }

  /**
   * Recognise a returning user. If we already have a licence key in
   * SecretStorage AND the backend confirms it's valid with credits (or BYOK
   * configured, or Ollama enabled), skip every payment / activation screen
   * and jump straight to "name your new project". Returning writers
   * shouldn't have to pick a plan they already have.
   */
  private async sendInit(requested: Screen): Promise<void> {
    const folders = vscode.workspace.workspaceFolders
    const workspaceName = folders?.[0]?.name ?? 'My Novel'

    // Honour an explicit screen override (e.g. when the user chose
    // "Storyline: Top Up Credits" from the command palette).
    if (requested !== 'welcome') {
      this.post({ type: 'init', workspaceName, initialScreen: requested })
      return
    }

    let resolvedScreen: Screen = 'welcome'
    let creditBalance: number | undefined
    let licenceType: string | undefined
    let providerName: string | undefined

    try {
      const existingKey = await this.licenceManager.getLicenceKey()
      if (existingKey) {
        const info = await this.licenceManager.validate({ useCache: true })
        if (info.valid) {
          resolvedScreen = 'new-project'
          creditBalance = info.creditBalance
          licenceType = info.type
        }
      }
      // BYOK / Ollama paths are also "already set up" — no plan picker needed.
      if (resolvedScreen === 'welcome') {
        const byok = this.context.globalState.get<{ kind: string }>('storyline.byokConfig')
        const ollama = this.context.globalState.get<boolean>('storyline.ollamaEnabled')
        if (ollama) {
          resolvedScreen = 'new-project'
          providerName = 'Ollama (local)'
        } else if (byok) {
          resolvedScreen = 'new-project'
          providerName = byok.kind === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible'
        }
      }
    } catch {
      // Network / backend hiccup — fall through to the welcome screen so
      // the user can pick a plan or enter a key manually.
    }

    this.post({
      type: 'init',
      workspaceName,
      initialScreen: resolvedScreen,
      returningUser: resolvedScreen === 'new-project',
      creditBalance,
      licenceType,
      providerName,
    })
  }

  public static show(
    context: vscode.ExtensionContext,
    extensionUri: vscode.Uri,
    opts?: { initialScreen?: Screen; onScaffolded?: () => void },
  ): void {
    if (OnboardingPanel.instance) {
      OnboardingPanel.instance.panel.reveal(vscode.ViewColumn.One)
      if (opts?.initialScreen) {
        OnboardingPanel.instance.post({ type: 'navigate', to: opts.initialScreen })
      }
      return
    }
    OnboardingPanel.instance = new OnboardingPanel(context, extensionUri, opts?.initialScreen, opts?.onScaffolded)
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type) {
      case 'openStripe': {
        const pack = msg.pack as string
        const baseUrl = STRIPE_LINKS[pack]
        if (!baseUrl) break
        // Pass the user's existing licence key (if any) into Stripe as
        // client_reference_id so the webhook can top up the SAME record
        // instead of issuing a fresh one. Without this, new credits land
        // on a brand-new key and the user's free / previously-purchased
        // balance is stranded on the old key.
        let url = baseUrl
        try {
          const existingKey = await this.licenceManager.getLicenceKey()
          if (existingKey) {
            const sep = baseUrl.includes('?') ? '&' : '?'
            url = `${baseUrl}${sep}client_reference_id=${encodeURIComponent(existingKey)}`
          }
        } catch {
          /* no key yet — first-time buyer, fall through with the bare URL */
        }
        await vscode.env.openExternal(vscode.Uri.parse(url))
        break
      }

      case 'validateLicence': {
        const key = (msg.key as string).trim()
        logVerbose('[Storyline] validateLicence: handler entered, keyPrefix=', key.slice(0, 12))
        try {
          await this.licenceManager.setLicenceKey(key)
          logVerbose('[Storyline] validateLicence: setLicenceKey resolved')
          const info = await this.licenceManager.validate({})
          logVerbose('[Storyline] validateLicence: validate result', info)
          if (info.valid) {
            this.post({ type: 'validateResult', success: true, creditBalance: info.creditBalance })
          } else {
            await this.licenceManager.clearLicenceKey()
            this.post({ type: 'validateResult', success: false, error: 'Invalid or expired licence key.' })
          }
        } catch (err) {
          logError('[Storyline] validateLicence: threw', err)
          // DO NOT clear the licence key here. Catch fires for both network
          // failures AND for unexpected exceptions inside validate(). On a
          // network blip we want to keep the just-pasted key so the user
          // can retry — clearing it forces them to paste it again.
          this.post({ type: 'validateResult', success: false, error: 'Could not reach activation server — check your connection and try again.' })
        }
        break
      }

      case 'testByok': {
        const cfg = msg.config as { kind: 'anthropic' | 'openai' | 'ollama'; apiKey?: string; baseUrl?: string }
        try {
          let provider
          if (cfg.kind === 'ollama') {
            provider = new OllamaProvider(cfg.baseUrl ?? 'http://localhost:11434')
          } else {
            provider = new BYOKProvider(
              cfg.kind === 'anthropic'
                ? { kind: 'anthropic', apiKey: cfg.apiKey ?? '' }
                : { kind: 'openai', apiKey: cfg.apiKey ?? '', baseUrl: cfg.baseUrl ?? 'https://api.openai.com/v1' },
            )
          }
          const ok = await provider.isAvailable()
          this.post({ type: 'testResult', success: ok, error: ok ? undefined : 'Connection failed. Check your key and try again.' })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Connection failed.'
          this.post({ type: 'testResult', success: false, error: message })
        }
        break
      }

      case 'saveByok': {
        const cfg = msg.config as { kind: 'anthropic' | 'openai' | 'ollama'; apiKey?: string; baseUrl?: string }
        if (cfg.kind === 'ollama') {
          await this.context.globalState.update('storyline.ollamaEnabled', true)
          await this.context.globalState.update('storyline.ollamaUrl', cfg.baseUrl ?? 'http://localhost:11434')
        } else {
          await this.context.globalState.update('storyline.byokConfig', {
            kind: cfg.kind,
            baseUrl: cfg.baseUrl,
          })
          if (cfg.apiKey) {
            await secretsStore(this.context, 'storyline.byokApiKey', cfg.apiKey)
          }
        }
        break
      }

      case 'useFree': {
        // Mint a per-install free key so each user has their own credit
        // pool (size set by FREE_PLAN_CREDITS in backend/src/free-plan.ts).
        // The backend creates a unique SL-FREE-XXXX-XXXX-XXXX record;
        // we then validate it the same way as any other key. On success this
        // is a one-click flow — we scaffold the project (using the workspace
        // folder name), dispose this panel, and open the planning chat plus
        // the welcome doc, so the user lands straight in chat with usage
        // instructions visible. Same end state as the toast notification
        // path in licence-prompt.ts.
        logVerbose('[Storyline] useFree: handler entered')
        try {
          logVerbose('[Storyline] useFree: calling /free-plan/issue at', BACKEND_URL)
          const issued = await issueFreePlan(BACKEND_URL)
          logVerbose('[Storyline] useFree: issued', issued.licenceKey, 'credits=', issued.creditBalance)
          await this.licenceManager.setLicenceKey(issued.licenceKey)
          const info = await this.licenceManager.validate({})
          logVerbose('[Storyline] useFree: validate result', info)
          if (info.valid) {
            await this.context.globalState.update('storyline.freePlan', { active: true })
            this.post({ type: 'validateResult', success: true, creditBalance: info.creditBalance })
            // Brief delay so the React success state can render before the
            // panel disposes — feels less abrupt than a hard cut.
            setTimeout(async () => {
              this.panel.dispose()
              await postActivateOpenWorkspace(this.context, this.extensionUri)
            }, 600)
          } else {
            // We DID set a freshly-issued key but it failed to validate —
            // safe to clear because we know the key we wrote was the new
            // one, not a pre-existing user key.
            await this.licenceManager.clearLicenceKey()
            this.post({ type: 'validateResult', success: false, error: 'Free plan activation failed — please try again or enter a licence key.' })
          }
        } catch (err) {
          // DO NOT clear the licence key here. issueFreePlan throws BEFORE
          // we touch SecretStorage, so any key already stored (a paid key,
          // a previously-activated free key, etc.) is untouched. Wiping it
          // here would punish users who clicked Start Free by accident
          // when rate-limited.
          logError('[Storyline] useFree: failed', err)
          const raw = err instanceof Error ? err.message : String(err)
          const message = /429/.test(raw)
            ? 'Free plan limit reached for this network. Please try again later or enter a licence key.'
            : `Could not reach activation server: ${raw}`
          this.post({ type: 'validateResult', success: false, error: message })
        }
        break
      }

      case 'scaffold': {
        const folders = vscode.workspace.workspaceFolders
        if (!folders?.length) {
          this.post({ type: 'error', message: 'Please open a folder before creating a project.' })
          return
        }
        const name = (msg.name as string | undefined)?.trim() || folders[0].name
        try {
          scaffoldProject(folders[0].uri.fsPath, name)
          this.post({ type: 'scaffolded' })
          const cb = this.onScaffolded
          setTimeout(() => {
            this.panel.dispose()
            vscode.commands.executeCommand('workbench.view.extension.storyline-sidebar')
            cb?.()
          }, 700)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to create project.'
          this.post({ type: 'error', message })
        }
        break
      }
    }
  }

  private post(msg: Record<string, unknown>): void {
    this.panel.webview.postMessage(msg)
  }

  private getHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'onboarding.js'))
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'tokens.css'))
    const nonce = getNonce()

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource} https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
