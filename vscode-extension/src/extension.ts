import * as vscode from 'vscode';
import { openNovelEditor } from './webview-panel';
import { NovelEditorProvider } from './novel-editor-provider';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Novel Writer extension activated');

  // Register the custom editor for .md files. The activation event
  // ("workspaceContains:.novel-writer/state.json") ensures the extension
  // only activates in novel projects — so non-novel workspaces get VS
  // Code's default markdown editor as before.
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      NovelEditorProvider.viewType,
      new NovelEditorProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('novelWriter.hello', () => {
      vscode.window.showInformationMessage('Novel Writer — active');
    }),
    // Command still works for opening files outside the workspace or via
    // right-click. For files inside the workspace, the custom editor
    // takes over automatically on double-click.
    vscode.commands.registerCommand('novelWriter.openEditor', (uri?: vscode.Uri) => {
      if (uri) {
        return vscode.commands.executeCommand('vscode.openWith', uri, NovelEditorProvider.viewType);
      }
      return openNovelEditor(context);
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
