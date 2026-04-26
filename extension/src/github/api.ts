import * as https from 'https';

// Thin GitHub REST client — only the endpoints Storyline needs.
// All requests go through the same Bearer token auth and JSON parsing.
// Errors throw with the response body so callers can show them verbatim.

export type RepoVisibility = 'private' | 'public';

export interface Repo {
  name: string;
  full_name: string;          // "owner/repo"
  html_url: string;
  ssh_url: string;
  clone_url: string;          // https URL we'll use for push (token-auth)
  private: boolean;
  default_branch: string;
  updated_at: string;
}

export class GitHubApi {
  constructor(private readonly token: string) {}

  async createRepo(name: string, visibility: RepoVisibility, description?: string): Promise<Repo> {
    const body = JSON.stringify({
      name,
      description: description ?? 'Storyline novel project',
      private: visibility === 'private',
      auto_init: false,
    });
    const raw = await this.request('POST', '/user/repos', body);
    return JSON.parse(raw) as Repo;
  }

  // GET /repos/{owner}/{repo} — used to detect collisions before create.
  async getRepo(owner: string, name: string): Promise<Repo | null> {
    try {
      const raw = await this.request('GET', `/repos/${owner}/${name}`);
      return JSON.parse(raw) as Repo;
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    }
  }

  // PUT /repos/{owner}/{repo}/collaborators/{username}
  // Sends a collaboration invite. Permission defaults to "push" so the
  // collaborator can edit + push. Storyline's "share with publisher" use
  // case typically wants read+comment access — pass 'pull' for that.
  async addCollaborator(
    owner: string,
    repo: string,
    username: string,
    permission: 'pull' | 'push' | 'admin' = 'push',
  ): Promise<void> {
    const body = JSON.stringify({ permission });
    await this.request('PUT', `/repos/${owner}/${repo}/collaborators/${username}`, body);
  }

  async removeCollaborator(owner: string, repo: string, username: string): Promise<void> {
    await this.request('DELETE', `/repos/${owner}/${repo}/collaborators/${username}`);
  }

  // GET /repos/{owner}/{repo}/collaborators — list of users with direct
  // access. Pending invitations don't show up here (separate endpoint).
  async listCollaborators(owner: string, repo: string): Promise<{ login: string; permissions?: Record<string, boolean> }[]> {
    const raw = await this.request('GET', `/repos/${owner}/${repo}/collaborators?per_page=100`);
    return JSON.parse(raw);
  }

  // PATCH /repos/{owner}/{repo} — used to flip visibility (private ↔ public).
  async setVisibility(owner: string, repo: string, visibility: RepoVisibility): Promise<void> {
    const body = JSON.stringify({ private: visibility === 'private', visibility });
    await this.request('PATCH', `/repos/${owner}/${repo}`, body);
  }

  // GET /user/repos?affiliation=owner&per_page=100 — scoped to repos the
  // user owns. Caller filters down to "looks like a Storyline project".
  async listOwnedRepos(): Promise<Repo[]> {
    const raw = await this.request('GET', '/user/repos?affiliation=owner&sort=updated&per_page=100');
    return JSON.parse(raw) as Repo[];
  }

  private async request(method: string, path: string, body?: string): Promise<string> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${this.token}`,
      'User-Agent': 'storyline-vscode',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body).toString();
    }
    return githubRequest({ method, hostname: 'api.github.com', path, headers }, body);
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function githubRequest(options: https.RequestOptions, body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        const status = res.statusCode ?? 0;
        if (status >= 200 && status < 300) {
          resolve(raw);
        } else if (status === 204) {
          resolve('');
        } else {
          reject(new HttpError(status, `GitHub API ${options.method} ${options.path} → ${status}: ${raw}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
