import * as fs from 'fs';
import * as path from 'path';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';

// isomorphic-git wrapper — pure JS git, no system git required. Bundled
// into the extension via esbuild, so the writer's machine doesn't need
// git installed at all.
//
// All operations are scoped to a single project directory (`dir`). The
// token is passed per-call rather than stashed in remote URLs so it
// never lands on disk in .git/config.

interface GitContext {
  dir: string;
  token: string;
  authorName: string;
  authorEmail: string;
}

export interface CommitResult {
  oid: string;
  filesChanged: string[];
}

export async function ensureRepo(dir: string, defaultBranch: string): Promise<void> {
  const dotGit = path.join(dir, '.git');
  if (fs.existsSync(dotGit)) return;
  await git.init({ fs, dir, defaultBranch });
}

export async function setRemote(dir: string, url: string, name = 'origin'): Promise<void> {
  // Replace any existing remote of this name (idempotent).
  try {
    await git.deleteRemote({ fs, dir, remote: name });
  } catch { /* not present, fine */ }
  await git.addRemote({ fs, dir, remote: name, url });
}

export async function getCurrentBranch(dir: string): Promise<string | undefined> {
  return (await git.currentBranch({ fs, dir, fullname: false })) || undefined;
}

export async function checkoutBranch(dir: string, branch: string): Promise<void> {
  // Create local branch if missing.
  const branches = await git.listBranches({ fs, dir });
  if (!branches.includes(branch)) {
    await git.branch({ fs, dir, ref: branch, checkout: true });
  } else {
    await git.checkout({ fs, dir, ref: branch });
  }
}

// Stage every changed/new file (respecting .gitignore) and commit.
// Returns null if there's nothing to commit.
export async function commitAll(
  ctx: GitContext,
  message: string,
): Promise<CommitResult | null> {
  const status = await git.statusMatrix({ fs, dir: ctx.dir });
  // Status matrix rows: [filepath, HEAD, WORKDIR, STAGE]
  // 1 = unmodified, 0 = absent, 2 = modified, 3 = added (different from staged)
  // We want: anything where WORKDIR (col 2) differs from HEAD (col 1) OR
  // is absent (deleted).
  const changed: string[] = [];
  for (const [filepath, head, workdir, stage] of status) {
    if (head === workdir && workdir === stage) continue;  // unchanged
    changed.push(filepath);
    if (workdir === 0) {
      // File deleted from workdir → remove from index.
      await git.remove({ fs, dir: ctx.dir, filepath });
    } else {
      await git.add({ fs, dir: ctx.dir, filepath });
    }
  }
  if (changed.length === 0) return null;

  const oid = await git.commit({
    fs,
    dir: ctx.dir,
    message,
    author: { name: ctx.authorName, email: ctx.authorEmail },
  });
  return { oid, filesChanged: changed };
}

export async function push(ctx: GitContext, branch: string, remote = 'origin'): Promise<void> {
  await git.push({
    fs,
    http,
    dir: ctx.dir,
    remote,
    ref: branch,
    onAuth: () => ({ username: 'x-access-token', password: ctx.token }),
  });
}

// Fast-forward only pull. If the remote has diverged, this throws and
// the caller decides what to do (v1: surface a warning; v2: conflict UI).
export async function fastForwardPull(
  ctx: GitContext,
  branch: string,
  remote = 'origin',
): Promise<{ updated: boolean }> {
  // Check whether the remote ref exists at all (fresh repo with no
  // upstream commits will fail otherwise).
  let beforeOid: string | undefined;
  try {
    beforeOid = await git.resolveRef({ fs, dir: ctx.dir, ref: `refs/remotes/${remote}/${branch}` });
  } catch { /* no remote tracking yet */ }

  try {
    await git.pull({
      fs,
      http,
      dir: ctx.dir,
      remote,
      ref: branch,
      fastForwardOnly: true,
      singleBranch: true,
      author: { name: ctx.authorName, email: ctx.authorEmail },
      onAuth: () => ({ username: 'x-access-token', password: ctx.token }),
    });
  } catch (err) {
    // Empty remote ("Could not find HEAD") is fine on first push.
    const msg = err instanceof Error ? err.message : String(err);
    if (/HEAD|empty|reference does not exist/i.test(msg)) {
      return { updated: false };
    }
    throw err;
  }

  let afterOid: string | undefined;
  try {
    afterOid = await git.resolveRef({ fs, dir: ctx.dir, ref: `refs/remotes/${remote}/${branch}` });
  } catch { /* shouldn't happen post-pull, but be defensive */ }

  return { updated: beforeOid !== afterOid };
}

export async function clone(
  url: string,
  dir: string,
  token: string,
  branch?: string,
): Promise<void> {
  await git.clone({
    fs,
    http,
    dir,
    url,
    ref: branch,
    singleBranch: !!branch,
    depth: 1,
    onAuth: () => ({ username: 'x-access-token', password: token }),
  });
}

// Detect whether the workspace already contains a working tree (so we
// don't clobber it with init) — used by the "open existing repo" flow.
export function hasGitDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'));
}
