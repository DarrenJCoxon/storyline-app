import * as vscode from 'vscode'
import * as path from 'path'

let cached: string | null = null

export async function readManuscriptPath(workspaceRoot: vscode.Uri): Promise<string> {
  if (cached !== null) return cached
  try {
    const statePath = vscode.Uri.joinPath(workspaceRoot, '.storyline', 'state.json')
    const bytes = await vscode.workspace.fs.readFile(statePath)
    const state = JSON.parse(new TextDecoder('utf-8').decode(bytes))
    const p = state?.writing?.manuscriptPath
    if (typeof p === 'string' && p.trim()) {
      cached = p.trim()
      return cached
    }
  } catch { /* fall through */ }
  cached = 'manuscript'
  return cached
}

export function invalidateManuscriptPathCache(): void {
  cached = null
}

export async function classifyDocumentRole(
  uri: vscode.Uri,
  workspaceRoot: vscode.Uri,
): Promise<'manuscript' | 'supporting'> {
  const msPath = await readManuscriptPath(workspaceRoot)
  const msSeg = msPath.split(path.sep).filter(Boolean).pop() ?? 'manuscript'
  const rel = path.relative(workspaceRoot.fsPath, uri.fsPath)
  return rel.split(path.sep).includes(msSeg) ? 'manuscript' : 'supporting'
}
