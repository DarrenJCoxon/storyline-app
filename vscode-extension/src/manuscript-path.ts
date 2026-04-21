import * as vscode from 'vscode';
import * as path from 'path';

// Shared helper: read the project's manuscript directory from
// .novel-writer/state.json. Used by both the custom editor provider
// (for role classification) and the Inspector command (to decide
// which files are "supporting" vs "manuscript").
//
// Cached per-session because it's read on every file open and the
// state file rarely changes within a session.

let cached: string | null = null;

export async function readManuscriptPath(workspaceRoot: vscode.Uri): Promise<string> {
  if (cached !== null) return cached;
  try {
    const statePath = vscode.Uri.joinPath(workspaceRoot, '.novel-writer', 'state.json');
    const bytes = await vscode.workspace.fs.readFile(statePath);
    const state = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    const p = state?.writing?.manuscriptPath;
    if (typeof p === 'string' && p.trim()) {
      cached = p.trim();
      return cached;
    }
  } catch { /* fall through */ }
  cached = 'manuscript';
  return cached;
}

// Classify a file URI as either manuscript prose or a supporting doc.
// A file is "manuscript" if any segment of its workspace-relative path
// equals the manuscript directory name. This catches both
// `manuscript/scene-1.md` and `output/manuscript/scene-1.md` without
// requiring writers to tweak state.json for non-default layouts.
export async function classifyDocumentRole(
  uri: vscode.Uri,
  workspaceRoot: vscode.Uri,
): Promise<'manuscript' | 'supporting'> {
  const manuscriptPath = await readManuscriptPath(workspaceRoot);
  const msSeg = manuscriptPath.split(path.sep).filter(Boolean).pop() || 'manuscript';
  const rel = path.relative(workspaceRoot.fsPath, uri.fsPath);
  const segments = rel.split(path.sep);
  return segments.includes(msSeg) ? 'manuscript' : 'supporting';
}
