import * as vscode from 'vscode';
import { openNovelEditor } from './webview-panel';
import { StorylineEditorProvider } from './storyline-editor-provider';
import { WordCountStatusBar } from './status-bar';
import { compileToEpub, compileToPrintPdf } from './compile-command';
import { editBookInfo } from './book-info-command';
import { openPreview } from './preview-command';
import { openLivePreview } from './live-preview-command';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Storyline extension activated');

  // Status bar word count — created first so the custom editor provider
  // can notify it of focus changes (needed because custom editors aren't
  // text editors and don't flip vscode.window.activeTextEditor).
  const statusBar = new WordCountStatusBar(context);
  await statusBar.start();

  // Custom editor for .md files. Only registered here so non-novel workspaces
  // (where extension doesn't activate) get VS Code's default markdown editor.
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      StorylineEditorProvider.viewType,
      new StorylineEditorProvider(context, statusBar),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('storyline.hello', () => {
      vscode.window.showInformationMessage('Storyline — active');
    }),
    vscode.commands.registerCommand('storyline.openEditor', (uri?: vscode.Uri) => {
      if (uri) {
        return vscode.commands.executeCommand('vscode.openWith', uri, StorylineEditorProvider.viewType);
      }
      return openNovelEditor(context);
    }),
    // Open a file in the right-hand editor column (ViewColumn.Beside).
    // Writers use this to pin a supporting doc next to their manuscript
    // without affecting the Explorer sidebar. VS Code creates column 2
    // the first time and persists the layout per-workspace — no
    // extension-side enforcement required. Replaces the failed
    // Inspector-view approach from v0.16.x.
    vscode.commands.registerCommand('storyline.openToSide', async (uri?: vscode.Uri) => {
      let target = uri;
      if (!target) {
        const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
        const input = activeTab?.input;
        if (input instanceof vscode.TabInputText) target = input.uri;
        else if (input instanceof vscode.TabInputCustom) target = input.uri;
      }
      if (!target) {
        vscode.window.showInformationMessage(
          'Storyline: select a .md file in the explorer or focus one in the editor first.',
        );
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        target,
        StorylineEditorProvider.viewType,
        vscode.ViewColumn.Beside,
      );
    }),
    vscode.commands.registerCommand('storyline.compileEpub', () => compileToEpub()),
    vscode.commands.registerCommand('storyline.compilePrintPdf', () => compileToPrintPdf()),
    vscode.commands.registerCommand('storyline.openPreview', () => openPreview()),
    vscode.commands.registerCommand('storyline.openLivePreview', () => openLivePreview(context)),
    vscode.commands.registerCommand('storyline.editBookInfo', () => editBookInfo(context)),
    vscode.commands.registerCommand('storyline.showWordCountBreakdown', async () => {
      const breakdown = statusBar.getBreakdown();
      if (!breakdown.length) {
        vscode.window.showInformationMessage('Storyline: no markdown files found in the workspace');
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
