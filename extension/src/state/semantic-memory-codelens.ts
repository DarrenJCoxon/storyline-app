import * as vscode from 'vscode'
import * as path from 'node:path'
import { getSemanticMemoryService } from './semantic-memory-service.js'
import { readSemanticMemoryConfig, bookScopePrefix } from './semantic-memory.js'
import { logVerbose, logError } from '../diagnostic-log.js'

/**
 * NT-09 — auto-suggest links via CodeLens. Scans manuscript chapter
 * files for semantically similar passages elsewhere in the project and
 * surfaces them as inline "Suggest links" affordances. Click → quick-pick
 * to commit the link as a typed edge (NT-08).
 *
 * Pragmatic v1: per-chapter granularity, not per-scene. Per-scene needs
 * AST-style splitting + line-mapping that's out of scope for this push.
 */

const CMD_SUGGEST = 'storyline.suggestLinksForChapter'
const CMD_DISMISS = 'storyline.dismissLinkSuggestion'
const STATE_KEY_DISMISSED = 'storyline.semanticMemory.dismissedLinks'

interface DismissedPair {
  from: string
  to: string
}

interface DismissedStore {
  pairs: DismissedPair[]
}

class StorylineCodeLensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>()
  readonly onDidChangeCodeLenses = this._onDidChange.event

  refresh(): void {
    this._onDidChange.fire()
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isManuscriptFile(document)) return []
    const cfg = readSemanticMemoryConfig()
    if (!cfg.enabled) return []

    const range = new vscode.Range(0, 0, 0, 0)
    return [
      new vscode.CodeLens(range, {
        title: '$(lightbulb-sparkle) Suggest links for this chapter',
        command: CMD_SUGGEST,
        arguments: [document.uri],
      }),
    ]
  }
}

export function registerSemanticMemoryCodeLens(context: vscode.ExtensionContext): void {
  const provider = new StorylineCodeLensProvider()
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'markdown', scheme: 'file' },
      provider,
    ),
    vscode.commands.registerCommand(CMD_SUGGEST, (uri: vscode.Uri) => suggestLinksForChapter(context, uri)),
    vscode.commands.registerCommand(CMD_DISMISS, (from: string, to: string) => dismissPair(context, from, to)),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('storyline.semanticMemory.enabled')) provider.refresh()
    }),
  )
}

function isManuscriptFile(doc: vscode.TextDocument): boolean {
  if (doc.languageId !== 'markdown') return false
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return false
  const rel = path.relative(folder.uri.fsPath, doc.uri.fsPath)
  return rel.startsWith('manuscript') && !rel.startsWith('..')
}

async function suggestLinksForChapter(
  context: vscode.ExtensionContext,
  uri: vscode.Uri,
): Promise<void> {
  const service = getSemanticMemoryService()
  if (!service) {
    void vscode.window.showWarningMessage('Semantic memory service not ready.')
    return
  }
  const cfg = readSemanticMemoryConfig()
  if (!cfg.enabled) {
    void vscode.window.showInformationMessage(
      'Enable storyline.semanticMemory.enabled to see link suggestions.',
    )
    return
  }

  let document: vscode.TextDocument
  try {
    document = await vscode.workspace.openTextDocument(uri)
  } catch {
    return
  }
  const text = document.getText().trim()
  if (text.length < 50) {
    void vscode.window.showInformationMessage('Chapter is too short to suggest links yet.')
    return
  }

  const chapterChunkId = chapterChunkIdFor(uri)
  const dismissed = readDismissed(context)
  const dismissedKey = (to: string): string => `${chapterChunkId}=>${to}`

  const pack = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'Storyline — finding link suggestions…' },
    () => service.search(text.slice(0, 4000), { topK: 8 }),
  )
  if (!pack || pack.items.length === 0) {
    void vscode.window.showInformationMessage('No similar passages found yet.')
    return
  }

  const candidates = pack.items
    .filter(it => it.ref !== chapterChunkId)
    .filter(it => !dismissed.pairs.some(p => p.from === chapterChunkId && p.to === it.ref))
    .filter(it => it.score >= 0.6) // light threshold; the ranking does most of the work
    .slice(0, 5)

  if (candidates.length === 0) {
    void vscode.window.showInformationMessage('No new suggestions — earlier ones may have been dismissed.')
    return
  }

  type Pick = vscode.QuickPickItem & { ref: string; score: number }
  const items: Pick[] = candidates.map(it => ({
    label: humanLabel(it.ref),
    description: `relevance ${(it.score * 100).toFixed(0)}%`,
    detail: oneLine(it.text ?? '', 150),
    ref: it.ref,
    score: it.score,
  }))

  const chosen = await vscode.window.showQuickPick(items, {
    title: 'Pick a passage to link to this chapter',
    placeHolder: 'Or press Esc to skip',
  })
  if (!chosen) return

  type KindPick = vscode.QuickPickItem & { edgeKind: string }
  const KIND_OPTIONS: KindPick[] = [
    { label: 'Pays off setup', edgeKind: 'pays-off-setup' },
    { label: 'References character', edgeKind: 'references-character' },
    { label: 'Mirrors theme', edgeKind: 'mirrors-theme' },
    { label: 'Contradicts', edgeKind: 'contradicts' },
    { label: 'Dismiss — don\'t suggest this pair again', edgeKind: '__dismiss' },
  ]
  const kindPick = await vscode.window.showQuickPick(KIND_OPTIONS, {
    title: `Link kind for ${humanLabel(chosen.ref)}`,
  })
  if (!kindPick) return

  if (kindPick.edgeKind === '__dismiss') {
    await dismissPair(context, chapterChunkId, chosen.ref)
    void vscode.window.showInformationMessage('Suggestion dismissed for this session.')
    return
  }

  const result = await service.addEdge({
    from: chapterChunkId,
    to: chosen.ref,
    kind: kindPick.edgeKind,
    createdBy: 'manual',
  })
  if (result.status === 'upserted') {
    void vscode.window.showInformationMessage(`Linked: ${kindPick.label}`)
    logVerbose(`[Storyline] codelens edge ${kindPick.edgeKind}: ${chapterChunkId} → ${chosen.ref}`)
  } else {
    logError(`[Storyline] codelens edge failed: ${result.status} ${result.reason ?? ''}`)
    void vscode.window.showWarningMessage('Couldn\'t save the link — see Storyline log.')
  }
}

async function dismissPair(
  context: vscode.ExtensionContext,
  from: string,
  to: string,
): Promise<void> {
  const store = readDismissed(context)
  if (store.pairs.some(p => p.from === from && p.to === to)) return
  store.pairs.push({ from, to })
  await context.workspaceState.update(STATE_KEY_DISMISSED, store)
}

function readDismissed(context: vscode.ExtensionContext): DismissedStore {
  const raw = context.workspaceState.get<DismissedStore>(STATE_KEY_DISMISSED)
  if (!raw || !Array.isArray(raw.pairs)) return { pairs: [] }
  return raw
}

function chapterChunkIdFor(uri: vscode.Uri): string {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return ''
  const filename = path.basename(uri.fsPath)
  const m = /^(?:chapter[-_])?(\d+)/i.exec(filename)
  if (!m) return ''
  return `${bookScopePrefix()}/chapter:${parseInt(m[1], 10)}`
}

function humanLabel(chunkId: string): string {
  const stripped = chunkId.replace(/^book:[^/]+\//, '')
  const sceneMatch = /^scene:ch(\d+)-s(\d+)$/.exec(stripped)
  if (sceneMatch) return `Chapter ${sceneMatch[1]}, scene ${sceneMatch[2]}`
  const chapterMatch = /^chapter:(\d+)$/.exec(stripped)
  if (chapterMatch) return `Chapter ${chapterMatch[1]}`
  const stageMatch = /^stage:(.+)$/.exec(stripped)
  if (stageMatch) return `Planning — ${stageMatch[1]}`
  const researchMatch = /^research:(.+)$/.exec(stripped)
  if (researchMatch) return `Research — ${researchMatch[1]}`
  return stripped
}

function oneLine(s: string, maxLen: number): string {
  const collapsed = s.replace(/\s+/g, ' ').trim()
  return collapsed.length > maxLen ? `${collapsed.slice(0, maxLen)}…` : collapsed
}
