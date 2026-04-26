import * as vscode from 'vscode'
import { scaffoldProject } from '../onboarding/project-scaffold.js'
import { LicenceManager } from '../auth/licence.js'
import { BYOKProvider } from '../ai/byok-provider.js'
import { OllamaProvider } from '../ai/ollama-provider.js'

const BACKEND_URL = 'https://api.storyline.app'

// Hardcoded free-tier key — the Worker's KV must have this seeded with
// { type: 'free', valid: true, creditBalance: 50, totalPurchased: 50 }
export const FREE_LICENCE_KEY = 'SL-FREE-0000-0000-FREE'

const STRIPE_LINKS: Record<string, string> = {
  '10': 'https://buy.stripe.com/PLACEHOLDER_10',
  '20': 'https://buy.stripe.com/PLACEHOLDER_20',
}

export const STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/PLACEHOLDER'

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

    const folders = vscode.workspace.workspaceFolders
    const workspaceName = folders?.[0]?.name ?? 'My Novel'
    this.post({ type: 'init', workspaceName, initialScreen })
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
        const url = STRIPE_LINKS[pack]
        if (url) await vscode.env.openExternal(vscode.Uri.parse(url))
        break
      }

      case 'validateLicence': {
        const key = (msg.key as string).trim()
        await this.licenceManager.setLicenceKey(key)
        try {
          const info = await this.licenceManager.validate({})
          if (info.valid) {
            this.post({ type: 'validateResult', success: true, creditBalance: info.creditBalance })
          } else {
            await this.licenceManager.clearLicenceKey()
            this.post({ type: 'validateResult', success: false, error: 'Invalid or expired licence key.' })
          }
        } catch {
          await this.licenceManager.clearLicenceKey()
          this.post({ type: 'validateResult', success: false, error: 'Could not reach activation server. Check your connection.' })
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
            await this.context.secrets.store('storyline.byokApiKey', cfg.apiKey)
          }
        }
        break
      }

      case 'useFree': {
        await this.licenceManager.setLicenceKey(FREE_LICENCE_KEY)
        await this.context.globalState.update('storyline.freePlan', { active: true })
        break
      }

      case 'scaffold': {
        const folders = vscode.workspace.workspaceFolders
        if (!folders?.length) {
          this.post({ type: 'error', message: 'Please open a folder before creating a project.' })
          return
        }
        const name = (msg.name as string | undefined)?.trim() || folders[0].name
        const genreHint = msg.genreHint as string | undefined
        try {
          scaffoldProject(folders[0].uri.fsPath, name, genreHint)
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
