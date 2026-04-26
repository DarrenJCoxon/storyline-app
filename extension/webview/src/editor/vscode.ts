export interface WebviewMessage {
  type: string
  [key: string]: unknown
}

interface VsCodeApi {
  postMessage(msg: WebviewMessage): void
  setState(state: unknown): void
  getState(): unknown
}

declare global {
  function acquireVsCodeApi(): VsCodeApi
}

export const vscode: VsCodeApi = acquireVsCodeApi()
