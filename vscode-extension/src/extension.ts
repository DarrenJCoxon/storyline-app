import * as vscode from 'vscode';
import { openNovelEditor } from './webview-panel';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Novel Writer extension activated');

  context.subscriptions.push(
    vscode.commands.registerCommand('novelWriter.hello', () => {
      vscode.window.showInformationMessage('Novel Writer — scaffold active');
    }),
    // Command palette: "Novel Writer: Open Editor" — picks a file or uses the
    // currently active .md file. URI can also be passed directly (e.g. from
    // a right-click handler, or when we register as a custom editor in 2.5).
    vscode.commands.registerCommand('novelWriter.openEditor', (uri?: vscode.Uri) => {
      return openNovelEditor(context, uri);
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
