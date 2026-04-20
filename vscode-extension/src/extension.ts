import * as vscode from 'vscode';
import { openNovelEditor } from './webview-panel';
import { NovelEditorProvider } from './novel-editor-provider';
import { WordCountStatusBar } from './status-bar';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Novel Writer extension activated');

  // Custom editor for .md files. Only registered here so non-novel workspaces
  // (where extension doesn't activate) get VS Code's default markdown editor.
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      NovelEditorProvider.viewType,
      new NovelEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

  // Status bar word count.
  const statusBar = new WordCountStatusBar(context);
  await statusBar.start();

  context.subscriptions.push(
    vscode.commands.registerCommand('novelWriter.hello', () => {
      vscode.window.showInformationMessage('Novel Writer — active');
    }),
    vscode.commands.registerCommand('novelWriter.openEditor', (uri?: vscode.Uri) => {
      if (uri) {
        return vscode.commands.executeCommand('vscode.openWith', uri, NovelEditorProvider.viewType);
      }
      return openNovelEditor(context);
    }),
    vscode.commands.registerCommand('novelWriter.showWordCountBreakdown', async () => {
      const breakdown = statusBar.getBreakdown();
      if (!breakdown.length) {
        vscode.window.showInformationMessage('Novel Writer: no markdown files found in the workspace');
        return;
      }
      const total = statusBar.getTotal();
      const target = statusBar.getTarget();
      const title = target > 0
        ? `Total: ${total.toLocaleString()} / ${target.toLocaleString()} words (${Math.round(total / target * 100)}%)`
        : `Total: ${total.toLocaleString()} words`;

      interface BreakdownItem extends vscode.QuickPickItem {
        uri: vscode.Uri;
      }

      const items: BreakdownItem[] = breakdown.map(b => ({
        label: b.label,
        description: `${b.count.toLocaleString()} words`,
        uri: b.uri,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title,
        placeHolder: 'Select a file to open it',
        matchOnDescription: true,
      });
      if (picked) {
        await vscode.window.showTextDocument(picked.uri);
      }
    }),
  );
}

export function deactivate(): void {
  // Disposables registered on context.subscriptions are cleaned up by VS Code.
}
