import * as vscode from 'vscode';
import { openNovelEditor } from './webview-panel';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Novel Writer extension activated');

  context.subscriptions.push(
    vscode.commands.registerCommand('novelWriter.hello', () => {
      vscode.window.showInformationMessage('Novel Writer — scaffold active');
    }),
    vscode.commands.registerCommand('novelWriter.openEditor', () => {
      openNovelEditor(context);
    }),
  );
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
