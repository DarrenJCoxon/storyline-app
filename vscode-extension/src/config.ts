import * as vscode from 'vscode';

const PROD_BACKEND = 'https://api.storyline.app';

export function getBackendUrl(): string {
  const cfg = vscode.workspace.getConfiguration('storyline');
  const url = cfg.get<string>('backendUrl', PROD_BACKEND).replace(/\/$/, '');
  return url || PROD_BACKEND;
}
