import * as path from 'path'
import * as fs from 'fs'
import { DEFAULT_STATE } from '@storyline/core'

export function scaffoldProject(
  workspaceRoot: string,
  name: string,
  genreHint?: string,
): string {
  const dirs = [
    path.join(workspaceRoot, '.storyline'),
    path.join(workspaceRoot, 'output'),
    path.join(workspaceRoot, 'docs', 'chapters'),
    path.join(workspaceRoot, 'manuscript'),
  ]
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const state = {
    ...DEFAULT_STATE,
    projectName: name,
    ...(genreHint ? { genreHint } : {}),
  }

  const stateFile = path.join(workspaceRoot, '.storyline', 'state.json')
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8')
  return stateFile
}
