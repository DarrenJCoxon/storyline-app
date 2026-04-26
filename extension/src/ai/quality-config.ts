import * as vscode from 'vscode'

export type QualityMode = 'economy' | 'balanced' | 'premium'

export function getQualityMode(): QualityMode {
  const val = vscode.workspace.getConfiguration('storyline').get<string>('aiQuality', 'balanced')
  if (val === 'economy' || val === 'balanced' || val === 'premium') return val
  return 'balanced'
}
