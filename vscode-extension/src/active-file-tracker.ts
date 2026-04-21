import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

// Writes the currently-focused manuscript file path to
// .storyline/active-file.txt whenever focus moves to a .md file in the
// workspace. Lets external processes (Claude Code skills invoked from a
// separate terminal) know what the writer is working on — VS Code's
// custom editors don't register as activeTextEditor, so a disk
// breadcrumb is the only reliable IPC channel.
//
// Behaviour:
//   - Write only triggers for .md files inside the workspace
//   - Stale breadcrumb is fine: the skill verifies the file still exists
//     before acting on it, and "most recent focused chapter" is usually
//     the right answer even after focus has moved elsewhere
//   - No-ops if .storyline/ doesn't exist (non-Storyline project)

export class ActiveFileTracker {
  private workspaceRoot: vscode.Uri | undefined;
  private pendingWrite: Promise<void> | undefined;

  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  }

  // Called by the custom editor provider on focus change (custom editors
  // aren't text editors, so we can't rely on onDidChangeActiveTextEditor
  // for TipTap-rendered chapters).
  setActive(uri: vscode.Uri): void {
    void this.write(uri);
  }

  // Raw-text-editor path — hooked at extension activation for the
  // developer-workflow case where someone opens a .md file with VS Code's
  // default text editor instead of the Storyline custom editor.
  attachTextEditorListener(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) return;
        if (editor.document.uri.scheme !== 'file') return;
        if (!editor.document.fileName.toLowerCase().endsWith('.md')) return;
        void this.write(editor.document.uri);
      }),
    );
  }

  private async write(uri: vscode.Uri): Promise<void> {
    if (!this.workspaceRoot) return;
    if (uri.scheme !== 'file') return;

    const relative = path.relative(this.workspaceRoot.fsPath, uri.fsPath);
    // Ignore files outside the workspace (edits via an absolute path that
    // happens to sit outside the project shouldn't clobber the breadcrumb).
    if (relative.startsWith('..') || path.isAbsolute(relative)) return;
    if (!uri.fsPath.toLowerCase().endsWith('.md')) return;

    const storylineDir = path.join(this.workspaceRoot.fsPath, '.storyline');
    const breadcrumbPath = path.join(storylineDir, 'active-file.txt');

    // Serialise writes so a rapid sequence of focus changes doesn't
    // interleave and produce a garbled file.
    const previous = this.pendingWrite ?? Promise.resolve();
    this.pendingWrite = previous.then(async () => {
      try {
        // Fail fast if .storyline/ doesn't exist — this extension should
        // never create that directory outside of a Storyline project.
        await fs.access(storylineDir);
      } catch {
        return;
      }
      try {
        await fs.writeFile(breadcrumbPath, relative + '\n', 'utf8');
      } catch {
        // Best-effort — a breadcrumb write failure shouldn't surface to
        // the writer. /follow-up will just fall back to asking which
        // file to scan.
      }
    });
  }
}
