import * as vscode from 'vscode';

// Open the Novel Writer editor in a webview panel. For Story 2.2 this is a
// standalone panel with empty content; the custom-editor-for-md-files wiring
// arrives in Story 2.5.
export function openNovelEditor(context: vscode.ExtensionContext): void {
  const panel = vscode.window.createWebviewPanel(
    'novelWriter.editor',
    'Novel Writer Editor',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    },
  );

  panel.webview.html = buildWebviewHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage(
    (msg: { type: string; [k: string]: unknown }) => {
      // Story 2.2 stub: just log messages from the webview so we can verify
      // the channel works. Real message handling (load-file, save, etc.)
      // arrives when markdown round-trip wiring lands in Story 2.3.
      console.log('[novel-writer] webview message:', msg.type, msg);
    },
    undefined,
    context.subscriptions,
  );
}

function buildWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.css'));
  const nonce = randomNonce();
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `script-src 'nonce-${nonce}'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Novel Writer</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function randomNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
