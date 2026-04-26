import * as vscode from 'vscode';
import * as https from 'https';

// GitHub Device Flow auth — no callback server needed in the extension.
// We register an OAuth App on github.com and use its client_id (public,
// safe to ship). The user opens a URL, types a short code, and GitHub
// returns a token we store in VS Code SecretStorage.
//
// SecretStorage encrypts at rest using the OS keychain (Keychain on
// macOS, Credential Manager on Windows, libsecret on Linux). The token
// never touches plaintext disk and is scoped to this extension only.

// Public OAuth App client_id for the "Storyline VSCode" GitHub App.
// NOT a secret — it identifies the app, not the user. Device Flow has
// no client secret by design, so it's safe to ship in the bundle.
// Managed at https://github.com/settings/developers.
const GITHUB_CLIENT_ID = 'Ov23limhPrrBGriiDxC2';

const SECRET_KEY = 'storyline.github.token';
const SECRET_USER_KEY = 'storyline.github.user';

const SCOPES = ['repo', 'user:email', 'read:user'].join(' ');

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  interval?: number;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export class GitHubAuth {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getToken(): Promise<string | null> {
    return (await this.context.secrets.get(SECRET_KEY)) ?? null;
  }

  async getStoredUser(): Promise<GitHubUser | null> {
    const raw = await this.context.secrets.get(SECRET_USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GitHubUser;
    } catch {
      return null;
    }
  }

  async isConnected(): Promise<boolean> {
    return (await this.getToken()) !== null;
  }

  async disconnect(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
    await this.context.secrets.delete(SECRET_USER_KEY);
  }

  // Full Device Flow: request a device code, show it to the user,
  // poll for the token, fetch the user profile, persist both.
  // Returns the authenticated user, or null if the user cancelled.
  async connect(): Promise<GitHubUser | null> {
    const device = await this.requestDeviceCode();

    // Show the code in a modal-style notification while polling. The
    // user copies the code, the verification URL opens in the browser,
    // GitHub asks them to approve.
    const COPY = 'Copy Code & Open GitHub';
    const CANCEL = 'Cancel';
    const choice = await vscode.window.showInformationMessage(
      `Storyline: connect to GitHub.\n\nYour code: ${device.user_code}\n\nClick the button to copy the code and open the GitHub authorization page.`,
      { modal: true },
      COPY, CANCEL,
    );
    if (choice !== COPY) return null;

    await vscode.env.clipboard.writeText(device.user_code);
    await vscode.env.openExternal(vscode.Uri.parse(device.verification_uri));

    const token = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Storyline: waiting for GitHub authorisation (code ${device.user_code})…`,
        cancellable: true,
      },
      (_progress, cancelToken) => this.pollForToken(device, cancelToken),
    );
    if (!token) return null;

    await this.context.secrets.store(SECRET_KEY, token);
    const user = await fetchUser(token);
    await this.context.secrets.store(SECRET_USER_KEY, JSON.stringify(user));
    return user;
  }

  private async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const body = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      scope: SCOPES,
    }).toString();
    const res = await httpsRequest({
      method: 'POST',
      hostname: 'github.com',
      path: '/login/device/code',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body).toString(),
        'User-Agent': 'storyline-vscode',
      },
    }, body);
    return JSON.parse(res) as DeviceCodeResponse;
  }

  private async pollForToken(
    device: DeviceCodeResponse,
    cancelToken: vscode.CancellationToken,
  ): Promise<string | null> {
    const expiresAt = Date.now() + device.expires_in * 1000;
    let interval = device.interval;

    while (Date.now() < expiresAt) {
      if (cancelToken.isCancellationRequested) return null;
      await sleep(interval * 1000);

      const body = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        device_code: device.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString();
      const raw = await httpsRequest({
        method: 'POST',
        hostname: 'github.com',
        path: '/login/oauth/access_token',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body).toString(),
          'User-Agent': 'storyline-vscode',
        },
      }, body);
      const result = JSON.parse(raw) as TokenResponse;

      if (result.access_token) return result.access_token;
      if (result.error === 'authorization_pending') continue;
      if (result.error === 'slow_down') {
        // GitHub asks us to back off; bump interval.
        interval = (result.interval ?? interval) + 1;
        continue;
      }
      if (result.error === 'expired_token' || result.error === 'access_denied') {
        return null;
      }
      // Unknown error — surface and stop.
      vscode.window.showErrorMessage(
        `Storyline: GitHub auth failed (${result.error ?? 'unknown'}): ${result.error_description ?? ''}`,
      );
      return null;
    }
    vscode.window.showWarningMessage('Storyline: GitHub authorisation timed out. Run "Storyline: Connect GitHub" to try again.');
    return null;
  }
}

async function fetchUser(token: string): Promise<GitHubUser> {
  const raw = await httpsRequest({
    method: 'GET',
    hostname: 'api.github.com',
    path: '/user',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'storyline-vscode',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  return JSON.parse(raw) as GitHubUser;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpsRequest(
  options: https.RequestOptions,
  body?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
          return;
        }
        resolve(raw);
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
