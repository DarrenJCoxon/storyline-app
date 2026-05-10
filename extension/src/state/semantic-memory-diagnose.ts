import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'
import {
  openInMemoryStore,
  openProjectStore,
  closeStore,
  STORYLINE_EMBEDDING_DIMENSIONS,
} from '@storyline/core/dist/nuvector.js'
import { logInfo, logError, logWarn } from '../diagnostic-log.js'

/**
 * Step-by-step diagnostic for the semantic-memory native path. Each
 * step logs before AND after so a host crash leaves a clear last-known
 * line in the output channel. Use this when reindex silently dies.
 */
export async function diagnoseSemanticMemoryCommand(): Promise<void> {
  logInfo('[diagnose] === BEGIN ===')
  logInfo(`[diagnose] node version: ${process.version}`)
  logInfo(`[diagnose] electron version: ${process.versions.electron ?? 'n/a'}`)
  logInfo(`[diagnose] arch: ${process.arch}`)
  logInfo(`[diagnose] platform: ${process.platform}`)
  logInfo(`[diagnose] dimensions: ${STORYLINE_EMBEDDING_DIMENSIONS}`)

  // ── Step 1: in-memory store open ───────────────────────────────────────
  logInfo('[diagnose] step 1: openInMemoryStore — about to call NuVector.open(memory:)')
  let memStore
  try {
    memStore = await openInMemoryStore()
    logInfo('[diagnose] step 1: openInMemoryStore OK')
  } catch (err) {
    logError(`[diagnose] step 1: openInMemoryStore THREW: ${err instanceof Error ? err.message : err}`)
    void vscode.window.showErrorMessage('Step 1 failed (in-memory open). See Storyline log.')
    return
  }

  // ── Step 2: in-memory upsert with deterministic fake vector ───────────
  logInfo('[diagnose] step 2: in-memory upsert — about to call store.upsert')
  try {
    const v = new Float32Array(STORYLINE_EMBEDDING_DIMENSIONS)
    for (let i = 0; i < v.length; i++) v[i] = Math.sin(i * 0.001)
    await memStore.upsert({
      id: 'diagnose:test:1',
      kind: 'document_chunk',
      embedding: v,
      text: 'diagnose test chunk',
      metadata: { documentType: 'diagnose' },
      tenant: 'default',
    })
    logInfo('[diagnose] step 2: in-memory upsert OK')
  } catch (err) {
    logError(`[diagnose] step 2: in-memory upsert THREW: ${err instanceof Error ? err.message : err}`)
    try { await closeStore(memStore) } catch { /* ignore */ }
    void vscode.window.showErrorMessage('Step 2 failed (in-memory upsert). See Storyline log.')
    return
  }

  // ── Step 3: in-memory retrieve ────────────────────────────────────────
  logInfo('[diagnose] step 3: in-memory retrieve — about to call store.retrieveContext')
  try {
    const v = new Float32Array(STORYLINE_EMBEDDING_DIMENSIONS)
    for (let i = 0; i < v.length; i++) v[i] = Math.sin(i * 0.001)
    const r = await memStore.retrieveContext({ embedding: v, tenant: 'default', topK: 3 })
    logInfo(`[diagnose] step 3: in-memory retrieve OK — items=${r.items.length}`)
  } catch (err) {
    logError(`[diagnose] step 3: in-memory retrieve THREW: ${err instanceof Error ? err.message : err}`)
    try { await closeStore(memStore) } catch { /* ignore */ }
    void vscode.window.showErrorMessage('Step 3 failed (in-memory retrieve). See Storyline log.')
    return
  }

  await closeStore(memStore).catch(() => { /* ignore */ })
  logInfo('[diagnose] in-memory store closed')

  // ── Step 4: file-backed store at the project path ─────────────────────
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    logWarn('[diagnose] no workspace open — skipping file-backed steps')
    void vscode.window.showInformationMessage('In-memory diagnostic OK. Open a project to test the file-backed path.')
    return
  }
  const projectRoot = folder.uri.fsPath
  const expectedPath = path.join(projectRoot, '.storyline', 'memory.nv')
  logInfo(`[diagnose] step 4: file-backed open — projectRoot=${projectRoot}`)
  logInfo(`[diagnose] step 4: expected store path: ${expectedPath}`)
  logInfo(`[diagnose] step 4: file exists already? ${fs.existsSync(expectedPath)}`)

  let fileStore
  try {
    fileStore = await openProjectStore(projectRoot, { tenant: 'default' })
    logInfo('[diagnose] step 4: openProjectStore OK')
  } catch (err) {
    logError(`[diagnose] step 4: openProjectStore THREW: ${err instanceof Error ? err.message : err}`)
    void vscode.window.showErrorMessage('Step 4 failed (file-backed open). See Storyline log.')
    return
  }

  // ── Step 5: file-backed upsert ────────────────────────────────────────
  logInfo('[diagnose] step 5: file-backed upsert')
  try {
    const v = new Float32Array(STORYLINE_EMBEDDING_DIMENSIONS)
    for (let i = 0; i < v.length; i++) v[i] = Math.cos(i * 0.001)
    await fileStore.upsert({
      id: 'diagnose:file:1',
      kind: 'document_chunk',
      embedding: v,
      text: 'file diagnose test chunk',
      metadata: { documentType: 'diagnose' },
      tenant: 'default',
    })
    logInfo('[diagnose] step 5: file-backed upsert OK')
  } catch (err) {
    logError(`[diagnose] step 5: file-backed upsert THREW: ${err instanceof Error ? err.message : err}`)
    try { await closeStore(fileStore) } catch { /* ignore */ }
    void vscode.window.showErrorMessage('Step 5 failed (file-backed upsert). See Storyline log.')
    return
  }

  // ── Step 6: file-backed retrieve ──────────────────────────────────────
  logInfo('[diagnose] step 6: file-backed retrieve')
  try {
    const v = new Float32Array(STORYLINE_EMBEDDING_DIMENSIONS)
    for (let i = 0; i < v.length; i++) v[i] = Math.cos(i * 0.001)
    const r = await fileStore.retrieveContext({ embedding: v, tenant: 'default', topK: 3 })
    logInfo(`[diagnose] step 6: file-backed retrieve OK — items=${r.items.length}`)
  } catch (err) {
    logError(`[diagnose] step 6: file-backed retrieve THREW: ${err instanceof Error ? err.message : err}`)
  }

  await closeStore(fileStore).catch(() => { /* ignore */ })
  logInfo('[diagnose] === END ===')
  void vscode.window.showInformationMessage('All diagnose steps logged. Check Storyline log for results.')
}
