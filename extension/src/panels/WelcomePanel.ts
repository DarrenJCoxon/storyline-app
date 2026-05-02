import * as vscode from 'vscode'

/**
 * Storyline-branded welcome page. Replaces VS Code's default Get Started tab
 * with a presentation-quality "here's how to use this thing" guide so the
 * very first thing a free-trial user sees is on-brand and actionable —
 * three columns: Explorer / Welcome / Chat. No noise.
 *
 * Singleton — the second show() call reveals the existing panel rather
 * than spawning a duplicate.
 */
export class WelcomePanel {
  public static readonly viewType = 'storyline.welcome'
  private static instance: WelcomePanel | undefined

  private readonly panel: vscode.WebviewPanel

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      WelcomePanel.viewType,
      'Welcome to Storyline',
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
    this.panel.onDidDispose(() => { WelcomePanel.instance = undefined })
  }

  public static show(
    context: vscode.ExtensionContext,
    extensionUri: vscode.Uri,
  ): void {
    if (WelcomePanel.instance) {
      WelcomePanel.instance.panel.reveal(vscode.ViewColumn.One)
      return
    }
    WelcomePanel.instance = new WelcomePanel(context, extensionUri)
  }

  public static current(): WelcomePanel | undefined {
    return WelcomePanel.instance
  }

  public dispose(): void {
    this.panel.dispose()
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type) {
      case 'runCommand':
        await vscode.commands.executeCommand(msg.command as string)
        break
      case 'openExternal':
        await vscode.env.openExternal(vscode.Uri.parse(msg.url as string))
        break
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
<title>Welcome to Storyline</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: var(--vscode-editor-background, #1a1a1a);
    --fg: var(--vscode-editor-foreground, #e8e8e8);
    --muted: var(--vscode-descriptionForeground, #888);
    --accent: #c47b00;
    --accent-soft: rgba(196, 123, 0, 0.12);
    --card: var(--vscode-sideBar-background, #232323);
    --border: var(--vscode-widget-border, #2d2d2d);
    --info-bg: rgba(123, 165, 232, 0.08);
    --info-border: rgba(123, 165, 232, 0.35);
    --tip-bg: rgba(196, 123, 0, 0.08);
    --tip-border: rgba(196, 123, 0, 0.35);
    --serif: 'Iowan Old Style', 'Apple Garamond', 'Baskerville', 'Times New Roman', serif;
  }
  html, body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--fg);
    line-height: 1.6;
    font-size: 14px;
  }
  body { padding: 48px 56px 80px; max-width: 820px; margin: 0 auto; }
  .brand { font-family: var(--serif); font-size: 36px; letter-spacing: -0.02em; margin-bottom: 4px; font-weight: 400; }
  .brand .tail { color: var(--accent); }
  .tagline { color: var(--muted); font-size: 15px; margin-bottom: 40px; }

  h1 { font-family: var(--serif); font-size: 28px; font-weight: 500; letter-spacing: -0.01em; margin: 0 0 12px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin: 36px 0 16px; font-weight: 600; }
  h3 { font-size: 16px; margin: 20px 0 8px; font-weight: 600; }
  p { margin: 0 0 12px; }
  p:last-child { margin-bottom: 0; }

  .hero {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 32px 32px 28px;
    margin-bottom: 32px;
    position: relative;
    overflow: hidden;
  }
  .hero::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent), transparent);
  }
  .hero p.lede { font-size: 16px; color: var(--fg); margin-top: 12px; line-height: 1.6; }

  .steps { counter-reset: step; }
  .step {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 22px 18px 64px;
    margin-bottom: 12px;
    position: relative;
  }
  .step::before {
    counter-increment: step;
    content: counter(step);
    position: absolute;
    left: 22px;
    top: 18px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
  }
  .step h3 { margin: 0 0 4px; }
  .step p { color: var(--muted); font-size: 13.5px; }
  .step kbd { background: var(--border); padding: 1px 6px; border-radius: 4px; font-family: 'SF Mono', monospace; font-size: 12px; color: var(--fg); }

  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
  .action-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 18px;
    text-align: left;
    cursor: pointer;
    color: var(--fg);
    font-family: inherit;
    font-size: inherit;
    transition: border-color 0.15s, background 0.15s;
  }
  .action-card:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .action-card .label { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
  .action-card .desc { color: var(--muted); font-size: 12.5px; }

  .callout {
    border-radius: 10px;
    padding: 16px 20px;
    margin: 16px 0;
    font-size: 13.5px;
    line-height: 1.55;
  }
  .callout.info { background: var(--info-bg); border-left: 3px solid var(--info-border); }
  .callout.tip  { background: var(--tip-bg);  border-left: 3px solid var(--tip-border); }
  .callout strong { color: var(--accent); }

  .layout-tree {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px 24px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 13px;
    line-height: 1.7;
    color: var(--fg);
    white-space: pre;
    overflow-x: auto;
  }
  .layout-tree .dim { color: var(--muted); }
  .layout-tree .accent { color: var(--accent); }

  .footer {
    margin-top: 56px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
    text-align: center;
  }
  .footer a { color: var(--muted); margin: 0 6px; }
  .footer a:hover { color: var(--accent); }
</style>
</head>
<body>

  <div class="brand"><span>story</span><span class="tail">line</span></div>
  <p class="tagline">Plan your book. Write your story.</p>

  <div class="hero">
    <h1>Welcome — your free book plan is active.</h1>
    <p class="lede">
      Storyline walks you through your novel or non-fiction book one stage at a time, with an AI planning partner. Your prose lives locally on your computer — the AI never sees your draft. When the plan's ready, you switch to writing.
    </p>
    <p style="margin-top:14px;color:var(--muted);font-size:13.5px">
      <strong style="color:var(--accent);">250 free credits</strong> cover one full book plan with critique. Image generation needs paid credits, never the free plan.
    </p>
  </div>

  <h2>Get started in three steps</h2>
  <div class="steps">
    <div class="step">
      <h3>Tell the chat what you want to write</h3>
      <p>Open the panel on the right and type a few words about your story or topic. The AI starts the planning conversation from there.</p>
    </div>
    <div class="step">
      <h3>Walk through 14 planning stages</h3>
      <p>Storyline structures planning around Save the Cat (fiction) or the Book DNA framework (non-fiction). Each stage is a short conversation. After every stage, your plan is saved to <kbd>planning/</kbd> as a markdown file you can read and edit.</p>
    </div>
    <div class="step">
      <h3>Switch to writing</h3>
      <p>Your prose lives in <kbd>manuscript/</kbd> — one <kbd>.md</kbd> file per chapter. Type freely; Storyline auto-saves every 1.5&nbsp;seconds. When you're ready, compile to EPUB or PDF.</p>
    </div>
  </div>

  <h2>Quick actions</h2>
  <div class="actions">
    <button class="action-card" data-cmd="storyline.openPlanning">
      <div class="label">Open the planning chat</div>
      <div class="desc">If you closed it by accident — re-open the chat panel.</div>
    </button>
    <button class="action-card" data-cmd="storyline.newChapter">
      <div class="label">Add a new chapter</div>
      <div class="desc">Creates an empty <code>chapter-NN.md</code> in <code>manuscript/</code>.</div>
    </button>
    <button class="action-card" data-cmd="storyline.compileEpub">
      <div class="label">Compile to EPUB</div>
      <div class="desc">Bundle your manuscript into a finished EPUB in <code>output/</code>.</div>
    </button>
    <button class="action-card" data-cmd="storyline.topUpCredits">
      <div class="label">Buy more credits</div>
      <div class="desc">When the free 250 are gone — top up to keep planning.</div>
    </button>
  </div>

  <h2>Project layout</h2>
  <div class="layout-tree"><span class="dim">your-book/</span>
├── <span class="accent">manuscript/</span>   <span class="dim">← your prose, one .md per chapter</span>
├── <span class="accent">planning/</span>     <span class="dim">← AI-generated plan (don't edit by hand)</span>
├── <span class="accent">research/</span>     <span class="dim">← drop reference material here; the AI reads it</span>
├── <span class="accent">output/</span>       <span class="dim">← compiled EPUB / PDF</span>
├── <span class="dim">docs/</span>         <span class="dim">← your scratchpad — notes you write to yourself</span>
└── <span class="dim">.storyline/</span>   <span class="dim">← internal state (leave alone)</span></div>

  <h2>Tips that pay off later</h2>
  <div class="callout tip">
    <strong>Drop reference material into <kbd>research/</kbd>.</strong> Anything you put there — exam syllabuses, worldbuilding notes, source extracts, style guides — is fed to the AI as authoritative reference for every planning conversation. Use it for non-fiction sources, fiction worldbuilding, anything you want the AI to honour.
  </div>
  <div class="callout tip">
    <strong>Inline research markers while drafting.</strong> Don't break flow to look things up — write <code>{{check the dates of the Reformation}}</code> inline and find the markers later. Storyline collects them in a single notes view (<kbd>Cmd+Shift+P</kbd> → <em>Storyline: View Manuscript Notes</em>).
  </div>
  <div class="callout info">
    <strong>The AI never reads your manuscript.</strong> The planning chat works on outline-level metadata only. Your prose stays local and private — even on the managed plan.
  </div>

  <div class="footer">
    <a href="#" data-url="https://api.storyline.my/terms">Terms</a> ·
    <a href="#" data-url="https://api.storyline.my/privacy">Privacy</a> ·
    <a href="mailto:coxondj@gmail.com">Support</a>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    document.querySelectorAll('button.action-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-cmd')
        if (cmd) vscode.postMessage({ type: 'runCommand', command: cmd })
      })
    })
    document.querySelectorAll('.footer a[data-url]').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault()
        vscode.postMessage({ type: 'openExternal', url: a.getAttribute('data-url') })
      })
    })
  </script>
</body>
</html>`
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
