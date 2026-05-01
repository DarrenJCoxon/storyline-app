/**
 * Production error reporter — fire-and-forget POST to the Worker's
 * `/log-error` endpoint. Used to capture AI-call failures (chat,
 * illustrate, cover, critique, transcribe) so we can see breakages
 * without waiting for users to email.
 *
 * Contract:
 *  - never throws
 *  - never blocks the caller (await is safe but unnecessary)
 *  - silently no-ops if the network is unreachable
 *
 * Implementation note:
 * `vscode` is intentionally imported via dynamic require/await-import
 * inside the call rather than at the top of the file — top-level
 * `import * as vscode from 'vscode'` breaks vitest, which has no real
 * vscode module to resolve. The provider unit tests pull in this file
 * transitively through ManagedProvider / BYOKProvider, so static
 * resolution would crash the whole test suite.
 *
 * The licence key is sent raw and hashed server-side, so the reporter
 * itself can stay tiny — no crypto subtle calls in the hot path.
 */

interface ReportErrorOptions {
  /** Logical endpoint name: 'chat' | 'illustrate' | 'cover' | 'critique' | 'transcribe' | 'validate' | etc. */
  endpoint: string
  /** HTTP status code (0 if the request never reached the server). */
  statusCode: number
  /** Human-readable error text. Truncated server-side at 1000 chars. */
  message: string
  /** Optional licence key — hashed server-side before logging. */
  licenceKey?: string
  /** Optional planning-stage id, for chat errors only. */
  stageId?: string
}

let _backendUrl: string | null = null
let _extensionVersion: string | null = null

function getBackendUrl(): string {
  if (_backendUrl !== null) return _backendUrl
  try {
    // Lazy load — see file-header note. Avoids top-level vscode import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode')
    const cfg = vscode.workspace.getConfiguration('storyline').get<string>('backendUrl')
    _backendUrl = cfg ?? 'https://api.storyline.my'
  } catch {
    _backendUrl = 'https://api.storyline.my'
  }
  return _backendUrl
}

function getExtensionVersion(): string {
  if (_extensionVersion !== null) return _extensionVersion
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as typeof import('vscode')
    const v = vscode.extensions
      .getExtension('darrenjcoxon.storyline-extension')
      ?.packageJSON?.version
    _extensionVersion = typeof v === 'string' ? v : 'unknown'
  } catch {
    _extensionVersion = 'unknown'
  }
  return _extensionVersion
}

export function reportError(opts: ReportErrorOptions): void {
  // Fire and forget. Wrapping the entire call in a try/catch (including
  // the URL build) means a misconfigured backendUrl can't take down a
  // chat session via reporter failure.
  try {
    const payload = {
      endpoint: opts.endpoint,
      statusCode: opts.statusCode,
      message: opts.message,
      version: getExtensionVersion(),
      licenceKey: opts.licenceKey,
      stageId: opts.stageId,
      platform: typeof process !== 'undefined' ? process.platform : 'unknown',
    }
    void fetch(`${getBackendUrl()}/log-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => { /* swallow */ })
  } catch {
    /* swallow */
  }
}
