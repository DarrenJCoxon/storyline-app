import * as vscode from 'vscode'

const DEFAULT_TIMEOUT_MS = 2000

/** Wraps VS Code's SecretStorage with a timeout. On Windows the Credential
 *  Manager (DPAPI) can hang indefinitely if the store is locked or corrupted.
 *  Every secrets call in Storyline goes through here so activation never blocks.
 */
export async function secretsGet(
  context: vscode.ExtensionContext,
  key: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string | undefined> {
  return Promise.race([
    context.secrets.get(key),
    new Promise<undefined>((_, reject) =>
      setTimeout(() => reject(new Error('secrets timeout')), timeoutMs),
    ),
  ]).catch(() => {
    console.warn(`[Storyline] secrets.get("${key}") timed out after ${timeoutMs}ms`)
    return undefined
  })
}

export async function secretsStore(
  context: vscode.ExtensionContext,
  key: string,
  value: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  return Promise.race([
    context.secrets.store(key, value),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('secrets timeout')), timeoutMs),
    ),
  ]).catch(() => {
    console.warn(`[Storyline] secrets.store("${key}") timed out after ${timeoutMs}ms`)
  })
}

export async function secretsDelete(
  context: vscode.ExtensionContext,
  key: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  return Promise.race([
    context.secrets.delete(key),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('secrets timeout')), timeoutMs),
    ),
  ]).catch(() => {
    console.warn(`[Storyline] secrets.delete("${key}") timed out after ${timeoutMs}ms`)
  })
}
