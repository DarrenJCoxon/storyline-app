import * as vscode from 'vscode';

// CustomTextEditorProvider that owns .md files in novel projects. VS Code
// hands us a TextDocument and a WebviewPanel; we render the TipTap editor
// in the panel and keep the document synced with webview edits. VS Code's
// native save flow (Ctrl/Cmd+S, dirty dot on tab, close-prompt) works
// because we write changes back to the document via WorkspaceEdit.
export class NovelEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'novelWriter.editor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };

    webviewPanel.webview.html = buildWebviewHtml(webviewPanel.webview, this.context.extensionUri);

    const pushContentToWebview = () => {
      webviewPanel.webview.postMessage({
        type: 'load-content',
        markdown: document.getText(),
        fileName: vscode.workspace.asRelativePath(document.uri),
      });
    };

    // Keep the webview in sync if the document changes externally (git
    // pull, another editor, find/replace). Only push if the webview
    // isn't the source of the change — applyEdit below fires this event
    // too, which would create an echo loop. We suppress by tracking
    // whether we initiated the most recent edit.
    let suppressNextDocChange = false;

    const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (suppressNextDocChange) {
        suppressNextDocChange = false;
        return;
      }
      pushContentToWebview();
    });

    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
    });

    webviewPanel.webview.onDidReceiveMessage(async (msg: { type: string; markdown?: string }) => {
      if (msg.type === 'ready') {
        pushContentToWebview();
        return;
      }

      if (msg.type === 'content-changed' && typeof msg.markdown === 'string') {
        if (msg.markdown === document.getText()) return; // no-op

        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          msg.markdown,
        );
        suppressNextDocChange = true;
        await vscode.workspace.applyEdit(edit);
        return;
      }

      if (msg.type === 'save') {
        // User clicked the toolbar save button — sync (if the webview
        // hasn't pushed its latest content yet, msg.markdown carries it)
        // and then save via VS Code's native flow.
        if (typeof msg.markdown === 'string' && msg.markdown !== document.getText()) {
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            msg.markdown,
          );
          suppressNextDocChange = true;
          await vscode.workspace.applyEdit(edit);
        }
        await document.save();
        webviewPanel.webview.postMessage({ type: 'saved' });
        return;
      }
    });
  }
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
