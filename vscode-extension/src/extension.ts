import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Novel Writer extension activated');

  const hello = vscode.commands.registerCommand('novelWriter.hello', () => {
    vscode.window.showInformationMessage('Novel Writer — scaffold active');
  });

  context.subscriptions.push(hello);
}

export function deactivate(): void {
  // Nothing to clean up yet.
}
