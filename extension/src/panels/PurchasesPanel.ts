import * as vscode from 'vscode'
import { LicenceManager, type BatchSummary } from '../auth/licence.js'
import { updateCreditBalance } from '../credits/credit-display.js'

/**
 * Recent Purchases panel — lists the user's credit batches and lets them
 * request a pro-rata refund within the 14-day UK consumer-rights window.
 *
 * Singleton — second show() reveals the existing panel.
 *
 * Intentionally read-mostly: webview asks for batches, renders, posts a
 * refund request, re-fetches on success. No state caching in the webview.
 */
export class PurchasesPanel {
  public static readonly viewType = 'storyline.purchases'
  private static instance: PurchasesPanel | undefined

  private readonly panel: vscode.WebviewPanel
  private readonly licence: LicenceManager

  private constructor(
    private readonly context: vscode.ExtensionContext,
    extensionUri: vscode.Uri,
    backendUrl: string,
  ) {
    this.licence = new LicenceManager(context, backendUrl)
    this.panel = vscode.window.createWebviewPanel(
      PurchasesPanel.viewType,
      'Storyline — Recent Purchases',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      },
    )
    this.panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg')
    this.panel.webview.html = this.getHtml()
    this.panel.webview.onDidReceiveMessage(msg => this.handleMessage(msg))
    this.panel.onDidDispose(() => { PurchasesPanel.instance = undefined })

    void this.refresh()
  }

  public static show(
    context: vscode.ExtensionContext,
    extensionUri: vscode.Uri,
    backendUrl: string,
  ): void {
    if (PurchasesPanel.instance) {
      PurchasesPanel.instance.panel.reveal(vscode.ViewColumn.One)
      void PurchasesPanel.instance.refresh()
      return
    }
    PurchasesPanel.instance = new PurchasesPanel(context, extensionUri, backendUrl)
  }

  private async refresh(): Promise<void> {
    const data = await this.licence.listBatches()
    if (!data) {
      this.panel.webview.postMessage({
        type: 'error',
        message: 'Could not load your purchase history. Make sure you have a paid licence and an internet connection.',
      })
      return
    }
    this.panel.webview.postMessage({
      type: 'batches',
      creditBalance: data.creditBalance,
      batches: data.batches,
    })
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    if (msg.type === 'refresh') {
      await this.refresh()
      return
    }

    if (msg.type === 'requestRefund') {
      const batchId = msg.batchId as string
      const refundablePence = msg.refundablePence as number
      const currency = msg.currency as string
      const creditsRefundable = msg.creditsRefundable as number

      const formatted = formatMoney(refundablePence, currency)
      const choice = await vscode.window.showWarningMessage(
        `Refund ${formatted} for ${creditsRefundable} unused credits?`,
        {
          modal: true,
          detail:
            'Credits you have already used cannot be refunded. The refund will appear on your card within 5–10 business days. This cannot be undone.',
        },
        'Refund unused credits',
      )

      if (choice !== 'Refund unused credits') return

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Storyline: processing refund…' },
        () => this.licence.requestRefund(batchId),
      )

      if (!result.ok) {
        vscode.window.showErrorMessage(`Storyline: refund failed — ${result.error}`)
        await this.refresh()
        return
      }

      vscode.window.showInformationMessage(
        `Storyline: refunded ${formatMoney(result.result.refundedPence, result.result.currency)} `
        + `(${result.result.creditsRefunded} credits). Your remaining balance is `
        + `${result.result.newBalance} credits.`,
      )

      // Re-render with the response payload directly so the user sees the
      // updated state without a network round-trip.
      this.panel.webview.postMessage({
        type: 'batches',
        creditBalance: result.result.newBalance,
        batches: result.result.batches,
      })

      // Sync the global credit status-bar so the deduction is visible
      // outside the Recent-Purchases panel too. Refunds only apply to
      // 'credits'-type licences (free/byok have no purchase batches).
      void updateCreditBalance(result.result.newBalance, 'credits')
    }
  }

  private getHtml(): string {
    const nonce = getNonce()
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>Recent Purchases</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    padding: 32px 28px;
    line-height: 1.5;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 6px; }
  .subtitle { color: var(--vscode-descriptionForeground); font-size: 13px; margin-bottom: 24px; }
  .balance {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-widget-border, #2d2d2d);
    border-radius: 8px;
    padding: 14px 18px;
    margin-bottom: 24px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .balance-label { font-size: 12px; color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.05em; }
  .balance-value { font-size: 20px; font-weight: 600; color: #c47b00; }
  .empty {
    padding: 32px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    border: 1px dashed var(--vscode-widget-border, #2d2d2d);
    border-radius: 8px;
  }
  .batch {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-widget-border, #2d2d2d);
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 12px;
  }
  .batch-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .batch-main { flex: 1; min-width: 0; }
  .batch-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
  .batch-meta { font-size: 12px; color: var(--vscode-descriptionForeground); }
  .batch-meta + .batch-meta { margin-top: 2px; }
  .pill {
    display: inline-block; padding: 1px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 500; margin-left: 6px; vertical-align: 1px;
  }
  .pill.refunded { background: rgba(123, 165, 232, 0.12); color: #7ba5e8; }
  .pill.expired { background: rgba(160, 160, 160, 0.12); color: var(--vscode-descriptionForeground); }
  .pill.eligible { background: rgba(34, 197, 94, 0.12); color: #4ade80; }
  .pill.legacy { background: rgba(160, 160, 160, 0.12); color: var(--vscode-descriptionForeground); }
  button {
    background: #c47b00; color: white; border: none; padding: 7px 14px;
    border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;
    white-space: nowrap;
  }
  button:hover { background: #a86a00; }
  button:disabled { background: #444; color: #888; cursor: not-allowed; }
  .footer { margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--vscode-widget-border, #2d2d2d); font-size: 12px; color: var(--vscode-descriptionForeground); }
  .error {
    background: rgba(220, 80, 80, 0.08);
    border: 1px solid rgba(220, 80, 80, 0.4);
    color: #ff8a8a;
    padding: 12px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 13px;
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>Recent Purchases</h1>
  <p class="subtitle">UK consumer rights — request a pro-rata refund of any unused credits within 14 days of purchase.</p>

  <div id="error" class="error" style="display:none"></div>

  <div class="balance">
    <span class="balance-label">Current Balance</span>
    <span class="balance-value" id="balance">—</span>
  </div>

  <div id="list">Loading…</div>

  <div class="footer">
    Refunds are issued back to the original card via Stripe and typically arrive in 5–10 business days. Used credits are non-refundable.
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi()

  function fmtMoney(pence, currency) {
    const sym = currency === 'gbp' ? '£' : currency === 'usd' ? '$' : currency === 'eur' ? '€' : ''
    return sym + (pence / 100).toFixed(2)
  }

  function fmtDate(iso) {
    if (!iso || iso.startsWith('1970-')) return '—'
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function daysBetween(later, earlier) {
    return Math.round((later.getTime() - earlier.getTime()) / 86400000)
  }

  function pill(b) {
    if (b.refundedAt) return '<span class="pill refunded">Refunded</span>'
    if (b.source !== 'purchase') return '<span class="pill legacy">Legacy</span>'
    const eligibleUntil = new Date(b.refundEligibleUntil)
    const now = new Date()
    if (now > eligibleUntil) return '<span class="pill expired">Refund window closed</span>'
    const daysLeft = daysBetween(eligibleUntil, now)
    return '<span class="pill eligible">Refundable for ' + daysLeft + ' more day' + (daysLeft === 1 ? '' : 's') + '</span>'
  }

  function batchTitle(b) {
    if (b.source === 'free') return 'Free plan'
    if (b.source === 'grandfathered') return 'Earlier balance'
    return fmtMoney(b.pricePaidPence, b.currency) + ' • ' + b.creditsTotal + ' credits'
  }

  function render(payload) {
    document.getElementById('balance').textContent = payload.creditBalance + ' credits'
    document.getElementById('error').style.display = 'none'

    const list = document.getElementById('list')

    if (!payload.batches || payload.batches.length === 0) {
      list.innerHTML = '<div class="empty">No purchases yet. Use <strong>Storyline: Top Up Credits</strong> to buy credits.</div>'
      return
    }

    // Newest first
    const sorted = [...payload.batches].sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt))

    list.innerHTML = sorted.map(b => {
      const used = b.creditsTotal - b.creditsRemaining - (b.refundedAt ? b.creditsRemaining : 0)
      const remainingText = b.refundedAt
        ? '0 credits remaining (refunded)'
        : b.creditsRemaining + ' of ' + b.creditsTotal + ' credits remaining'

      const action = b.refundable
        ? '<button data-batch="' + b.id + '" data-pence="' + b.refundablePence + '" data-currency="' + b.currency + '" data-credits="' + b.creditsRemaining + '">Refund ' + fmtMoney(b.refundablePence, b.currency) + '</button>'
        : ''

      return [
        '<div class="batch">',
        '  <div class="batch-row">',
        '    <div class="batch-main">',
        '      <div class="batch-title">', batchTitle(b), pill(b), '</div>',
        '      <div class="batch-meta">Purchased ', fmtDate(b.purchasedAt), '</div>',
        '      <div class="batch-meta">', remainingText, '</div>',
        '    </div>',
        '    <div>', action, '</div>',
        '  </div>',
        '</div>',
      ].join('')
    }).join('')

    list.querySelectorAll('button[data-batch]').forEach(btn => {
      btn.addEventListener('click', () => {
        vscode.postMessage({
          type: 'requestRefund',
          batchId: btn.getAttribute('data-batch'),
          refundablePence: parseInt(btn.getAttribute('data-pence'), 10),
          currency: btn.getAttribute('data-currency'),
          creditsRefundable: parseInt(btn.getAttribute('data-credits'), 10),
        })
      })
    })
  }

  window.addEventListener('message', e => {
    const msg = e.data
    if (msg.type === 'batches') render(msg)
    else if (msg.type === 'error') {
      const el = document.getElementById('error')
      el.textContent = msg.message
      el.style.display = 'block'
      document.getElementById('list').innerHTML = ''
    }
  })

  vscode.postMessage({ type: 'refresh' })
</script>
</body>
</html>`
  }
}

function formatMoney(pence: number, currency: string): string {
  const sym = currency === 'gbp' ? '£' : currency === 'usd' ? '$' : currency === 'eur' ? '€' : ''
  return `${sym}${(pence / 100).toFixed(2)}`
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
