// Typed wrapper around VS Code's webview API. `acquireVsCodeApi` can only
// be called once per webview — we call it here and export the result.

export interface WebviewMessage {
  type: string;
  [key: string]: unknown;
}

interface VsCodeApi {
  postMessage(msg: WebviewMessage): void;
  setState(state: unknown): void;
  getState(): unknown;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

export const vscode: VsCodeApi = acquireVsCodeApi();
