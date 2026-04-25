# M7 — Tauri Desktop App

## Goal

True standalone desktop app. Writers download it, double-click, and it opens.
No VS Code required. No terminal. No npm.

macOS, Windows, and Linux from one codebase. Auto-updates silently in the
background. Passes macOS Gatekeeper and Windows SmartScreen.

## Why Tauri over Electron

- Binary size: ~10–15MB vs 200MB+ (Electron ships Chromium)
- Memory: uses the system WebView (WKWebView on macOS, WebView2 on Windows)
- Build: Rust backend — safer, faster, smaller
- The webview code (React + Vite) from the VS Code extension ports almost
  unchanged — same HTML/CSS/JS, different host APIs

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Tauri shell (Rust)                                  │
│  - Window management                                 │
│  - File system access (tauri-plugin-fs)              │
│  - System keychain (tauri-plugin-keychain)           │
│  - HTTP client (tauri-plugin-http)                   │
│  - Auto-update (tauri-plugin-updater)                │
│  - Native menus                                      │
│                                                      │
│  ┌───────────────────────────────────────────────┐   │
│  │  WebView (system — WKWebView / WebView2)      │   │
│  │  Same React + Vite code as VS Code extension  │   │
│  │  Tauri JS API replaces vscode.* calls         │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

The VS Code extension uses `vscode.workspace.fs`, `vscode.SecretStorage`,
`vscode.window.createWebviewPanel` etc. In the Tauri app, a thin compatibility
shim maps these calls to Tauri plugin equivalents. Most webview code is shared.

## Deliverables

### Tauri project

`tauri/` directory in the monorepo. Single `tauri.conf.json` targeting all
three platforms.

### File system migration

| VS Code API | Tauri equivalent |
|-------------|-----------------|
| `vscode.workspace.fs.readFile` | `@tauri-apps/plugin-fs` `readFile` |
| `vscode.workspace.fs.writeFile` | `@tauri-apps/plugin-fs` `writeFile` |
| `vscode.workspace.workspaceFolders` | `@tauri-apps/api/path` `homeDir` + project picker |

Project folder is selected via a native folder picker dialog on first launch
(`@tauri-apps/plugin-dialog` `open({ directory: true })`). Recent projects
stored in Tauri store (`@tauri-apps/plugin-store`).

### Secrets migration

| VS Code API | Tauri equivalent |
|-------------|-----------------|
| `vscode.SecretStorage` | `@tauri-apps/plugin-keychain` (OS keychain) |

Supabase session JWT and BYOK API keys stored in the OS keychain — same
security level as the VS Code extension.

### Native menu bar

```
Storyline
  About Storyline
  Check for Updates
  ─────
  Preferences...
  ─────
  Quit

File
  New Project...
  Open Project...
  Open Recent ▶
  ─────
  Close Project

View
  Toggle Planning Chat   ⌘⇧P
  Toggle File Tree       ⌘⇧E
  ─────
  Zoom In / Out / Reset

Help
  Quick Start Guide
  Stage Reference
  Send Feedback
  ─────
  View Logs
```

### Auto-update

Tauri updater checks for updates on launch and every 24 hours. Update
notification shown in the app ("A new version is available — restart to
update"). Silent download, applies on next restart. Update endpoint hosted
on a simple HTTPS JSON endpoint (can be GitHub Releases).

### Build pipeline

GitHub Actions matrix build on every push to `release/*` branch:

```yaml
strategy:
  matrix:
    os: [macos-latest, windows-latest, ubuntu-latest]
```

Outputs:
- macOS: `.dmg` (universal binary — Apple Silicon + Intel)
- Windows: `.msi` (x64)
- Linux: `.AppImage` (x64)

### Code signing

**macOS:**
- Developer ID Application certificate (Apple Developer Program)
- Notarization via `notarytool`
- Stapling (offline Gatekeeper verification)

**Windows:**
- EV Code Signing certificate (DigiCert or Sectigo)
- Signed `.msi` passes SmartScreen without warning

### Three-column layout in Tauri

Without VS Code's panel system, the three-column layout is managed in React:

```
<App>
  <FileTree />          {/* custom file tree component */}
  <EditorPane />        {/* TipTap */}
  <ChatPane />          {/* planning conversation */}
</App>
```

Resizable panels via `react-resizable-panels`. Column widths persisted in
Tauri store.

The file tree is a custom component — reads the project directory via Tauri fs,
shows `manuscript/`, `docs/`, `output/`. No full VS Code file explorer needed
(writers don't need to navigate arbitrary directories from within Storyline).

## Technical tasks

- [ ] Init Tauri project in `tauri/`
- [ ] Port webview code from extension to Tauri-compatible build
- [ ] Build `vscode-compat.ts` shim mapping VS Code APIs to Tauri equivalents
- [ ] Implement project picker (native folder dialog, recent projects)
- [ ] Port file system operations to `tauri-plugin-fs`
- [ ] Port secrets storage to `tauri-plugin-keychain`
- [ ] Implement native menu bar
- [ ] Build custom file tree component for `manuscript/`, `docs/`, `output/`
- [ ] Implement `react-resizable-panels` three-column layout
- [ ] Persist column widths in Tauri store
- [ ] Set up auto-update endpoint (GitHub Releases JSON)
- [ ] Wire `tauri-plugin-updater` with in-app notification
- [ ] Set up GitHub Actions build matrix (mac/win/linux)
- [ ] macOS: configure Developer ID signing + notarization in CI
- [ ] Windows: configure code signing in CI
- [ ] Linux: test AppImage on Ubuntu LTS
- [ ] End-to-end test: install on clean macOS VM, complete onboarding, save Stage 1

## Dependencies

M1–M6 complete (the VS Code extension must be stable before abstracting the
platform layer — port after the product is proven, not before).

## Success criteria

- App installs from `.dmg` / `.msi` on a clean machine with no other software
- macOS Gatekeeper passes (no "unidentified developer" warning)
- Windows SmartScreen passes
- Auto-update downloads and applies correctly end-to-end
- Binary size: macOS `.dmg` under 30MB
- Cold start time: app open and interactive in under 3 seconds on M1 Mac
- Full planning conversation through Stage 5 works identically to the
  VS Code extension version
