// CB-13 — Manuscript versioning in writer-language.
//
// Most novelists don't use Git but they understand "save as version 2"
// and "try a different ending". This module wraps Git plumbing in
// writer-friendly primitives:
//
//   storyline.saveAsVersion   — name the current state, snapshot it
//   storyline.listVersions    — show saved versions, switch between them
//
// Implementation rides on the existing isomorphic-git wrapper that
// powers GitHub auto-sync (extension/src/github/git.ts). Versions are
// just branches under a `version/<slug>` namespace — the writer never
// sees the words "branch" or "commit". When viewing a version, the
// status bar makes it obvious by showing "$(git-branch) <name>".
//
// This is the v1 surface. The prose-aware diff viewer ("Compare two
// versions") and the auto-branch-at-a-stage flow ("Try a different
// ending") are tracked as CB-13b/c.

import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as git from 'isomorphic-git'
import { logInfo, logWarn } from '../diagnostic-log.js'

const VERSION_PREFIX = 'version/'

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled'
}

async function ensureGitRepo(projectDir: string): Promise<void> {
  const gitDir = path.join(projectDir, '.git')
  if (fs.existsSync(gitDir)) return
  // Init with `main` as default to match the standard set elsewhere
  // in the extension. isomorphic-git creates an empty repo; the first
  // commit comes from saveAsVersion's commitAll-equivalent below.
  await git.init({ fs, dir: projectDir, defaultBranch: 'main' })
  logInfo('[Storyline] versions: initialised git repo at', projectDir)
}

async function listVersionBranches(projectDir: string): Promise<string[]> {
  try {
    const all = await git.listBranches({ fs, dir: projectDir })
    return all.filter(b => b.startsWith(VERSION_PREFIX))
  } catch {
    return []
  }
}

async function currentBranchName(projectDir: string): Promise<string | undefined> {
  try {
    return (await git.currentBranch({ fs, dir: projectDir, fullname: false })) || undefined
  } catch {
    return undefined
  }
}

async function stageAllAndCommit(
  projectDir: string,
  message: string,
): Promise<string | null> {
  const status = await git.statusMatrix({ fs, dir: projectDir })
  let touched = 0
  for (const [filepath, head, workdir, stage] of status) {
    if (workdir === 0 && head === 1) {
      await git.remove({ fs, dir: projectDir, filepath })
      touched++
    } else if (workdir !== stage) {
      await git.add({ fs, dir: projectDir, filepath })
      touched++
    }
  }
  if (touched === 0) return null
  const oid = await git.commit({
    fs,
    dir: projectDir,
    message,
    author: { name: 'Storyline', email: 'storyline@local' },
  })
  return oid
}

/**
 * Save the current state of the project under a writer-named version.
 *
 * Behaviour:
 *   - Prompts for a version name. Empty name aborts.
 *   - If the workspace isn't yet a git repo, initialises one (silent).
 *   - Snapshots all files into a new branch `version/<slug>`. The user
 *     STAYS on their current branch — saving a version is a checkpoint,
 *     not a context switch.
 *   - On success, surfaces a toast with "Switch to it" so the writer
 *     can immediately preview the just-saved version if they want.
 */
export async function saveAsVersion(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    void vscode.window.showWarningMessage('Storyline: open a project folder first.')
    return
  }
  const projectDir = folder.uri.fsPath

  const name = await vscode.window.showInputBox({
    title: 'Storyline — save as version',
    prompt: 'What do you want to call this version?',
    placeHolder: 'e.g. "First draft", "Alt ending where Sarah stays"',
    ignoreFocusOut: true,
    validateInput: v => v.trim().length === 0 ? 'Give it a name' : null,
  })
  if (!name?.trim()) return
  const slug = slugify(name)
  const branchName = `${VERSION_PREFIX}${slug}`

  await ensureGitRepo(projectDir)

  const existing = await listVersionBranches(projectDir)
  if (existing.includes(branchName)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Version "${name}" already exists. Overwrite?`,
      'Overwrite',
      'Cancel',
    )
    if (overwrite !== 'Overwrite') return
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Storyline: saving version "${name}"…` },
    async () => {
      const previousBranch = await currentBranchName(projectDir)

      // Commit the current working state on the active branch first so
      // the version branch we're about to create captures everything,
      // not just what was already committed.
      try {
        await stageAllAndCommit(projectDir, `Pre-version snapshot — saving "${name}"`)
      } catch (err) {
        logWarn('[Storyline] versions: pre-version commit failed (proceeding):', err)
      }

      // Create or move version/<slug> to point at the same commit.
      // checkout: false — we don't want to switch the writer to the
      // version branch on save. They stay where they are.
      try {
        if (existing.includes(branchName)) {
          await git.deleteBranch({ fs, dir: projectDir, ref: branchName })
        }
        await git.branch({ fs, dir: projectDir, ref: branchName, checkout: false })
        logInfo(`[Storyline] versions: saved "${name}" → ${branchName} from ${previousBranch ?? '(detached)'}`)
      } catch (err) {
        logWarn('[Storyline] versions: branch create failed:', err)
        throw err
      }
    },
  )

  const choice = await vscode.window.showInformationMessage(
    `Saved version "${name}". You're still on your working draft.`,
    'Switch to this version',
    'Show all versions',
  )
  if (choice === 'Switch to this version') {
    await switchToVersion(branchName)
  } else if (choice === 'Show all versions') {
    await listVersions()
  }
}

/**
 * Show the writer their saved versions in a quick-pick. Picking one
 * switches the working tree to that version's branch. The current
 * branch is annotated.
 */
export async function listVersions(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    void vscode.window.showWarningMessage('Storyline: open a project folder first.')
    return
  }
  const projectDir = folder.uri.fsPath

  const branches = await listVersionBranches(projectDir)
  if (branches.length === 0) {
    void vscode.window.showInformationMessage('No saved versions yet. Use "Storyline: Save as Version" to make your first.')
    return
  }

  const current = await currentBranchName(projectDir)
  const items: Array<vscode.QuickPickItem & { branch: string }> = branches.map(b => {
    const friendly = b.slice(VERSION_PREFIX.length).replace(/-/g, ' ')
    return {
      label: friendly,
      description: b === current ? '● currently viewing' : '',
      branch: b,
    }
  })
  // Plus an entry to return to the working draft (typically `main`).
  if (current?.startsWith(VERSION_PREFIX)) {
    items.unshift({ label: '← Back to working draft (main)', description: '', branch: 'main' })
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Storyline — Versions',
    placeHolder: 'Pick a version to view. Your working draft is preserved.',
  })
  if (!picked) return
  await switchToVersion(picked.branch)
}

async function switchToVersion(branch: string): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) return
  const projectDir = folder.uri.fsPath

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Storyline: switching to ${branch}…` },
    async () => {
      // Stash uncommitted changes by committing them with a "wip" label.
      // Without this, isomorphic-git's checkout refuses to overwrite
      // dirty paths and the writer loses what they were typing. The wip
      // commit lives on the branch they came from, so when they switch
      // back, their work is right where they left it.
      try {
        await stageAllAndCommit(projectDir, 'Storyline: wip auto-save before switching versions')
      } catch (err) {
        logWarn('[Storyline] versions: wip auto-save failed (proceeding):', err)
      }
      await git.checkout({ fs, dir: projectDir, ref: branch, force: false })
      logInfo(`[Storyline] versions: switched to ${branch}`)
    },
  )

  void vscode.window.showInformationMessage(
    branch === 'main'
      ? 'Back to your working draft.'
      : `Now viewing version "${branch.slice(VERSION_PREFIX.length).replace(/-/g, ' ')}". Your working draft is safe.`,
  )
}
