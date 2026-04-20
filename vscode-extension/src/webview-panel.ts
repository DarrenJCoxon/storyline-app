import * as vscode from 'vscode';

// Open the Novel Writer editor for a specific markdown file. Reads the file,
// sends its content to the webview, receives save requests, writes back.
// Custom-editor-for-.md-files (so VS Code auto-routes markdown opens here)
// lands in Story 2.5. For now this is a command-driven flow.
export async function openNovelEditor(
  context: vscode.ExtensionContext,
  fileUri?: vscode.Uri,
): Promise<void> {
  const uri = fileUri ?? (await pickMarkdownFile());
  if (!uri) return; // user cancelled

  let initialMarkdown: string;
  try {
    const buf = await vscode.workspace.fs.readFile(uri);
    initialMarkdown = new TextDecoder('utf-8').decode(buf);
  } catch (err) {
    vscode.window.showErrorMessage(`Novel Writer: could not read ${uri.fsPath} — ${(err as Error).message}`);
    return;
  }

  const relativePath = vscode.workspace.asRelativePath(uri);
  const panel = vscode.window.createWebviewPanel(
    'novelWriter.editor',
    `Novel Writer — ${relativePath}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    },
  );

  panel.webview.html = buildWebviewHtml(panel.webview, context.extensionUri);

  // Track the latest content from the webview so we always save fresh bytes.
  let latestMarkdown = initialMarkdown;

  panel.webview.onDidReceiveMessage(
    async (msg: { type: string; markdown?: string }) => {
      if (msg.type === 'ready') {
        await panel.webview.postMessage({
          type: 'load-content',
          markdown: initialMarkdown,
          fileName: relativePath,
        });
        return;
      }
      if (msg.type === 'content-changed' && typeof msg.markdown === 'string') {
        latestMarkdown = msg.markdown;
        return;
      }
      if (msg.type === 'save') {
        const toWrite = typeof msg.markdown === 'string' ? msg.markdown : latestMarkdown;
        try {
          const buf = new TextEncoder().encode(toWrite);
          await vscode.workspace.fs.writeFile(uri, buf);
          latestMarkdown = toWrite;
          await panel.webview.postMessage({ type: 'saved' });
          vscode.window.setStatusBarMessage(`Novel Writer: saved ${relativePath}`, 3000);
        } catch (err) {
          vscode.window.showErrorMessage(`Novel Writer: save failed — ${(err as Error).message}`);
        }
        return;
      }
    },
    undefined,
    context.subscriptions,
  );
}

async function pickMarkdownFile(): Promise<vscode.Uri | undefined> {
  // Prefer the currently active .md file if the user has one open.
  const active = vscode.window.activeTextEditor?.document;
  if (active && active.uri.path.toLowerCase().endsWith('.md')) {
    return active.uri;
  }
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { Markdown: ['md', 'markdown'] },
    title: 'Select a markdown file to open in Novel Writer',
  });
  return uris?.[0];
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
