# M6.5 — Installer Wrapper

> **Position:** ships between M6 (polish-beta) and M7 (Tauri desktop app). Goal is to
> deliver a "single download, just works" experience on top of VS Code while M7 is
> still months away. Once M7 is live, M6.5's installer can either be retired or
> repurposed as the "VS Code-flavoured" distribution channel for power users.

> **Release scope (decided 2026-04-26):**
> - **Beta:** macOS signed + notarised (existing Apple Developer ID reused, no new
>   cost), Windows unsigned with documented SmartScreen workaround, Linux unsigned
>   `.deb` + AppImage, OpenVSX only. Net cost: $0. Skips ~$400/year and ~3 days of
>   Windows-signing CI work. See [Signing walkthrough](#signing-walkthrough-macos)
>   below.
> - **GA prerequisites:** Windows EV Authenticode + MS Marketplace publishing.
>   Triggered when the beta has produced enough paying users to justify the spend
>   and SmartScreen abandonment is a measured drag rather than a hypothetical one.
>   See [GA prerequisites](#ga-prerequisites-promote-from-beta) below.

## Goal

A writer who has never seen VS Code can:

1. Visit `storyline.app/download`
2. Click **Download for Mac / Windows / Linux**
3. Double-click the downloaded file
4. See a single Storyline-branded installer GUI: "Setting up Storyline…"
5. Have VS Code installed (if not already), our extension installed, and Storyline
   open at the welcome screen — without ever seeing a terminal, an "Install
   Extensions" page, or any VS Code-specific UI

The user is told that Storyline runs on top of VS Code. This is honest framing —
they end up with VS Code in their dock — but the installation experience belongs
to Storyline, not Microsoft.

## Why this and not skip-to-M7

- **Time to market.** M6.5 ships in 1–2 weeks. M7 is 6–10 weeks plus signing,
  updater infrastructure, and ongoing maintenance.
- **Validates demand.** We need real users paying real money before we know the
  custom-app investment is justified.
- **Lower technical risk.** Microsoft handles all the host stability, security
  patches, and accessibility for VS Code itself. Our installer is just the
  bootstrapping ceremony.
- **Reuses the current VSIX.** Zero changes to extension code. The installer is
  a separate, throwaway-able artefact.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Storyline Installer  (single signed native binary per OS)   │
│                                                              │
│  1. Welcome screen (Storyline branding)                      │
│  2. Detect: is VS Code already installed?                    │
│       YES → skip to step 4                                   │
│       NO  → step 3                                           │
│  3. Download VS Code from Microsoft's CDN                    │
│       - Detect arch (Apple Silicon / Intel / x64 / ARM)      │
│       - Show progress bar                                    │
│       - Verify SHA against Microsoft's published hash        │
│       - Install (mac: drag /Applications; win: silent MSI;   │
│         linux: dpkg/rpm)                                     │
│  4. Install bundled storyline-extension-x.y.z.vsix           │
│       - Run `code --install-extension <path> --force`        │
│  5. Launch VS Code with the Storyline walkthrough open       │
│       - `code --install-extension … && code <empty-folder>`  │
│  6. Optional: write a desktop shortcut "Storyline" that runs │
│     `code <last-project>` with our welcome flow              │
└──────────────────────────────────────────────────────────────┘
```

The installer is a tiny app of its own (~15 MB), shipping the VSIX inside its
own resources and downloading VS Code on demand. It is not the same as the
extension itself; it just bootstraps the extension into a VS Code install.

## Tech choice — Electron vs Tauri vs native

For the installer GUI: **Tauri**. Reasons:

- 3–5 MB binary vs 80+ MB for Electron
- Same Rust + WebView stack we'll use for M7 — the Tauri experience pays off twice
- Cross-platform from one codebase
- Native code signing tooling already in our M7 plans

The webview UI is React + Vite (matches our existing webview pattern). Three
screens: Welcome → Progress → Done.

For the actual VS Code download + install logic:

| OS | VS Code install method | Tooling |
|---|---|---|
| macOS | Download `.zip` from MS CDN → unzip → `mv Visual\ Studio\ Code.app /Applications` | Tauri shell + native `unzip` |
| Windows | Download `VSCodeUserSetup-x64.exe` → run with `/SILENT /MERGETASKS=!runcode` | Tauri command + system PowerShell |
| Linux | Download `.deb` (or `.rpm` / AppImage) → `pkexec dpkg -i` (or distro equivalent) | Tauri command + polkit |

**Microsoft VS Code CDN URLs** (well-known, redirects to actual file):

- macOS Universal: `https://code.visualstudio.com/sha/download?build=stable&os=darwin-universal`
- macOS Apple Silicon: `?os=darwin-arm64`
- macOS Intel: `?os=darwin`
- Windows x64 user installer: `?os=win32-x64-user`
- Linux .deb x64: `?os=linux-deb-x64`
- Linux .rpm x64: `?os=linux-rpm-x64`

We download from these directly. The license is permissive (MS allows redistribution
of the official VS Code installer, but we're not redistributing — we're prompting
the user's own machine to download it).

## VSIX bundling

The installer ships our latest VSIX inside its `resources/` folder. Build pipeline:

```
┌──────────────────────────────────┐    ┌─────────────────────────┐
│  extension/ (current repo)       │    │  installer/ (new)        │
│  npm run build:dist              │ ─► │  embed VSIX, build,     │
│  → storyline-extension-x.y.z.vsix│    │  sign, notarise         │
│                                  │    │  → Storyline-Setup.dmg  │
│                                  │    │  → Storyline-Setup.exe  │
│                                  │    │  → Storyline-Setup.deb  │
└──────────────────────────────────┘    └─────────────────────────┘
```

The installer ALSO knows the VSIX version. On future runs (e.g. user keeps the
installer around) it can re-install the bundled VSIX if VS Code's extension
version is older — gives us a manual update path independent of VS Code's
auto-update.

## Code signing — beta scope

| OS | Beta plan | Cert source | Cost (incremental) |
|---|---|---|---|
| **macOS** | **Sign + notarise from v1** | Reuse existing Apple Developer ID from prior Electron app | **$0** (already paid) |
| **Windows** | **Unsigned**; document SmartScreen workaround on the download page | n/a | $0 |
| **Linux** | Unsigned `.deb` + AppImage | n/a (optional GPG later) | $0 |

**Rationale for skipping Windows signing in beta:**

- Standard Authenticode (~$80/year) doesn't actually bypass SmartScreen — you have
  to build download reputation first, which takes hundreds of installs. So you pay
  $80 and *still* see warnings during the beta period anyway.
- EV Authenticode ($300-500/year) bypasses SmartScreen immediately but is real
  spend that's hard to justify before paying users exist.
- Beta audience is self-selected and tech-curious. Documented click-through is fine.
- Windows abandonment data from beta tells us whether to invest in EV later.

## Signing walkthrough (macOS)

Detailed step-by-step for when we get to the macOS signing task — written for
"it's been a while" recall.

### 0. Prerequisites checklist (do once, before signing the first build)

- [ ] Apple Developer ID Application certificate present in macOS Keychain
  - Verify with `security find-identity -v -p codesigning`
  - Look for a line like `1) ABC123… "Developer ID Application: <Your Name> (TEAMID)"`
  - If present (it will be, from your Electron app), no action needed
- [ ] Apple ID + app-specific password for notarisation
  - Same Apple ID as your Electron app
  - App-specific password: appleid.apple.com → Sign-In and Security → App-Specific Passwords
  - If you remember the one from the Electron app, reuse it; otherwise generate a new one labelled `storyline-installer-notarytool`
- [ ] Team ID (10-character string, e.g. `AB12CDE34F`)
  - Find it in your existing Electron app's signed `.app` via
    `codesign -dv --verbose=4 /path/to/electron.app 2>&1 | grep TeamIdentifier`

Store the three values somewhere safe (1Password / macOS Keychain) — they go into
GitHub Actions secrets later.

### 1. Decide bundle ID

Pick a unique reverse-DNS bundle ID for the installer — different from the
Electron app's bundle ID and from any future Tauri app. Recommendation:

```
app.storyline.installer
```

(Reserves `app.storyline.app` for the eventual M7 Tauri build.)

Set this in `installer/src-tauri/tauri.conf.json` under `tauri.bundle.identifier`.

### 2. Tauri signing config

In `installer/src-tauri/tauri.conf.json`, the macOS section should look like:

```json
{
  "tauri": {
    "bundle": {
      "identifier": "app.storyline.installer",
      "macOS": {
        "signingIdentity": "Developer ID Application: <Your Name> (TEAMID)",
        "hardenedRuntime": true,
        "entitlements": "src-tauri/entitlements.mac.plist",
        "providerShortName": null
      }
    }
  }
}
```

The `signingIdentity` value must match the Keychain entry exactly (run
`security find-identity` to copy-paste it).

### 3. Entitlements

Create `installer/src-tauri/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Download VS Code from Microsoft's CDN -->
  <key>com.apple.security.network.client</key>
  <true/>

  <!-- Read/write the .zip during download + extraction -->
  <key>com.apple.security.files.downloads.read-write</key>
  <true/>

  <!-- We are NOT sandboxed — we need to write to /Applications -->
  <key>com.apple.security.app-sandbox</key>
  <false/>
</dict>
</plist>
```

A non-sandboxed app can still notarise — sandboxing is optional for Developer ID
distribution (mandatory only for the Mac App Store).

### 4. Universal binary

We want a single .dmg that runs on both Apple Silicon and Intel Macs. In
`installer/`:

```bash
# Add Rust targets if not present
rustup target add aarch64-apple-darwin x86_64-apple-darwin

# Tauri builds both arches and lipos them together
npm run tauri build -- --target universal-apple-darwin
```

Output: `installer/src-tauri/target/universal-apple-darwin/release/bundle/dmg/Storyline-Installer_<version>_universal.dmg`.

### 5. Notarisation

Tauri 1.x doesn't notarise automatically; we wrap with `xcrun notarytool`.
Add a script to `installer/scripts/notarise-mac.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

DMG="$1"   # path to the .dmg from step 4
APPLE_ID="${APPLE_ID:?missing}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:?missing}"
APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:?missing}"

echo "→ Submitting $DMG to Apple notary service…"
xcrun notarytool submit "$DMG" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait

echo "→ Stapling notarisation ticket to $DMG…"
xcrun stapler staple "$DMG"

echo "→ Verifying staple…"
xcrun stapler validate "$DMG"

echo "✓ Notarised and stapled."
```

Run it locally first (`./scripts/notarise-mac.sh path/to/Storyline-Installer.dmg`)
to validate the credentials work, then promote to CI.

First submission typically takes 5–10 minutes. Apple emails you the result; the
script also blocks until done with `--wait`.

### 6. Verify

On any Mac (including a fresh VM with no Xcode):

```bash
# Should report: "the staple and validate action worked!"
xcrun stapler validate Storyline-Installer.dmg

# Should report: "accepted" with no warnings
spctl -a -t open --context context:primary-signature -v Storyline-Installer.dmg
```

If either fails, the user will see a Gatekeeper warning. Don't ship without both
passing.

### 7. GitHub Actions CI

Three repository secrets needed:

- `APPLE_ID` — your Apple ID email
- `APPLE_TEAM_ID` — the 10-char team ID
- `APPLE_APP_SPECIFIC_PASSWORD` — the notarisation password
- `APPLE_CERTIFICATE_BASE64` — your Developer ID Application cert exported from
  Keychain as `.p12`, then base64-encoded
- `APPLE_CERTIFICATE_PASSWORD` — the password you set on the .p12 export

Workflow snippet (`installer/.github/workflows/build-mac.yml`):

```yaml
- uses: apple-actions/import-codesign-certs@v2
  with:
    p12-file-base64: ${{ secrets.APPLE_CERTIFICATE_BASE64 }}
    p12-password: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}

- run: npm run tauri build -- --target universal-apple-darwin

- run: ./scripts/notarise-mac.sh src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg
  env:
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
```

GitHub's macOS runners have `xcrun` and `codesign` preinstalled — no extra setup.

### 8. Common pitfalls (from past Electron experience)

- **"errSecInternalComponent"** during signing — usually means the Keychain isn't
  unlocked in CI. The `apple-actions/import-codesign-certs` step handles this if
  used; manual setup needs `security unlock-keychain`.
- **"The executable does not have the hardened runtime enabled"** during
  notarisation — `hardenedRuntime: true` missing from tauri.conf.json or
  entitlements.plist not being applied.
- **Bundle ID mismatch** — if you reuse the Electron app's bundle ID by
  accident, notarisation succeeds but the Mac may show "an app with this
  identifier is already installed". Pick a fresh bundle ID per app.
- **App-specific password expired** — they're not actually expirable, but they
  vanish if you change your Apple ID password. Regenerate if you see a
  "401 Unauthorized" from notarytool.

## Windows beta UX (unsigned)

Without Authenticode, Windows users see SmartScreen on first run:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognised app from starting.
> Running this app might put your PC at risk.

The "More info" link (small, easy to miss) reveals a "Run anyway" button. We
mitigate the friction with a clear download-page section:

- **Inline GIF** showing exactly where "More info" is and what to click
- **A short paragraph** explaining honestly: "Storyline is a small indie product
  in beta. We haven't yet purchased the EV signing certificate that bypasses
  this warning — but the installer is safe and you can verify the SHA-256 hash
  below matches what we publish."
- **SHA-256 hash** of the .exe, displayed beside the download button
- **Optional** VirusTotal report link (free, automatic) so users can verify our
  binary against 60+ AV engines

This is a temporary cost. Once the first paying users are real, we buy the EV
cert (see GA prerequisites). The data we collect during beta — what % of Windows
users abandon at SmartScreen vs proceed — directly informs the urgency of that
spend.

## Auto-update

For M6.5 the installer does NOT auto-update itself. The pattern is:

- VS Code auto-updates itself (Microsoft's responsibility)
- The Storyline extension auto-updates within VS Code (we publish to OpenVSX or
  Microsoft Marketplace; users get updates same day)
- The installer is a throwaway — only relevant on first run

This sidesteps the entire updater-infrastructure problem until M7. It's a
deliberate compromise.

## Distribution

- `storyline.app/download` → static HTML page with three OS buttons
- Each button hits a Cloudflare R2 / S3 URL serving the signed installer
- File names: `Storyline-Setup-mac.dmg`, `Storyline-Setup-win.exe`,
  `Storyline-Setup-linux.deb`
- A small JSON manifest (`storyline.app/installers.json`) lists current versions
  and SHA-256 hashes — the marketing site can show "Latest: 1.0.3 (April 2026)"
  automatically

## Marketplace question — beta scope

For beta we publish to **OpenVSX only**. Reasons:

- OpenVSX accepts within hours, no brand review.
- Microsoft Marketplace review can take 1–3 weeks and is stricter on brand
  guidelines (specific requirements about how "VS Code" is mentioned in the
  listing).
- The installer's `code --install-extension` step uses the bundled VSIX (offline
  install), so marketplace status doesn't gate the installer flow at all. It's
  only relevant for users who later look up "Storyline" inside VS Code's
  extensions panel.
- Microsoft Marketplace is a GA prerequisite (see below), not a beta blocker.

## Tasks (beta scope)

| # | Task | Estimate |
|---|---|---|
| 1 | Scaffold Tauri installer project (`installer/`) with React UI shell | 2 days |
| 2 | Welcome / Progress / Done screens with Storyline branding | 2 days |
| 3 | macOS: VS Code detection + download + extract + /Applications install | 2 days |
| 4 | Windows: detection + silent installer download + execution | 2 days |
| 5 | Linux: detection + .deb / .rpm / AppImage handling | 1 day |
| 6 | VSIX install via `code --install-extension` | 1 day |
| 7 | Final-step launch with Storyline walkthrough | 1 day |
| 8 | macOS signing + notarisation CI (see [Signing walkthrough](#signing-walkthrough-macos)) | 2 days |
| 9 | Marketing site download page + installers.json + Windows SmartScreen GIF + SHA-256 display | 2 days |
| 10 | End-to-end test on clean macOS / Windows / Linux VMs | 2 days |
| **Total** | | **~17 working days (3–4 calendar weeks)** |

Critical path: macOS signing/notarisation (item 8) blocks the macOS public
release; Apple's review can take 24–48h on first submission. Windows and Linux
have no signing dependencies, so they can ship first if needed.

**Removed from beta scope** (compared with original plan): Windows Authenticode
CI (~1 day). Net delta: ~$400/year cert savings + 1 day faster delivery.

## Risks

1. **Microsoft changes VS Code download URLs.** The CDN URLs above are stable and
   documented but technically not contractual. Mitigation: weekly health-check
   that fetches each URL's HEAD response; if any 404s, switch to fallback download
   page detection.
2. **Antivirus false positives on Windows.** Custom installers without
   reputation get flagged. Mitigation: EV cert (not standard); submit our binary
   to Microsoft Defender's whitelist proactively.
3. **VS Code already installed but very old version.** User has VS Code 1.50 from
   2020. Our extension requires `vscode: ^1.85.0`. Mitigation: detect version on
   step 2, prompt the user to let us update VS Code (calls VS Code's own
   updater).
4. **User cancels mid-download.** VS Code is partially extracted. Mitigation:
   download to a temp dir; rename to final location only after SHA verifies and
   extraction completes.
5. **macOS Gatekeeper prompt anyway.** Even with Developer ID + notarisation,
   first-launch shows a "Storyline downloaded from the internet — open?" dialog.
   Mitigation: that's fine, the user clicks Open once and it's done. Document it
   in the welcome flow.

## Definition of done

- A clean macOS VM, never having had VS Code, can install Storyline by
  double-clicking `Storyline-Setup-mac.dmg`. From double-click to Storyline
  welcome screen ≤ 60 seconds (depending on download speed).
- Same for Windows.
- Same for Ubuntu LTS.
- The signed binaries are hosted at `storyline.app/download` with SHA-256 hashes
  visible.
- The marketing page mentions "Powered by Visual Studio Code" in small text at
  the bottom (good faith attribution to Microsoft).
- A user who already has VS Code installed sees the bundled extension show up
  next to their existing extensions, opens a project, and the planning chat
  works exactly as it does today in our manual-VSIX-install flow.

## What gets cut from M6.5 (deliberately)

- **Auto-update for the installer itself.** Users re-download to get new
  installer versions. The extension itself updates via VS Code's marketplace.
- **Deep file-association integration** ("open .storyline files with
  Storyline"). M7's job; M6.5 just gets you running.
- **Custom dock icon / taskbar branding when running.** Once the user is in VS
  Code, they see VS Code branding. M7 fixes that with its own shell.
- **Offline install fallback.** If the user has no internet on first run, they
  see "We couldn't reach the VS Code download server. Check your connection and
  try again." Acceptable for v1.

## GA prerequisites (promote from beta)

Things deferred during beta that must land before "GA" — i.e. before we drop
the "beta" label from the marketing site, do paid acquisition, or list on
ProductHunt:

### Required

1. **Windows EV Authenticode certificate.** ~$300-500/year, 3-7 day verification
   process with the issuer (DigiCert / Sectigo / SSL.com). Bypasses SmartScreen
   immediately on first install — no reputation-building wait.
2. **Windows signing CI.** Roughly 1 day of work: Windows GitHub Actions
   workflow, secret management for the cert, `signtool sign /f cert.pfx /p $PWD
   /t http://timestamp.digicert.com` against the .exe, smoke-test on a clean
   Windows VM.
3. **Microsoft VS Code Marketplace listing.** Application requires Microsoft
   Partner Network membership (free, ~1 week setup), brand-guideline compliance
   for the listing copy, and screenshots. The VSIX itself is unchanged.
4. **VirusTotal reputation.** Submit each release's .exe to
   `developer.microsoft.com/microsoft-edge/wdrtc/` (Microsoft Defender's
   developer reputation portal) — free, but takes 1–2 days after each release.

### Conditionally required (depends on beta data)

5. **Optional: Linux package signing.** Only matters if we want users to install
   via `apt install storyline` from a custom repo (Phase 2 distribution). Needs
   a GPG key + repo-signing infrastructure. Skip until/unless distros ask.
6. **Optional: macOS App Store distribution.** Different signing flow (sandboxed,
   different cert), much stricter review, but unlocks discovery. Decide based
   on whether App Store search drives meaningful sign-ups in the beta period.

### What "ready for GA" means

- Beta has produced N paying users (set this number before launch — suggest 25
  for hobby pricing, 100+ for pro pricing) so we know unit economics work.
- Windows abandonment-at-SmartScreen is a measured number, not a guess. If
  >30% abandon, EV cert is high priority. If <10%, defer further.
- Bug-fix backlog is below "release-blocker" threshold for at least two
  consecutive weeks.
- Documentation site has FAQ + troubleshooting based on real beta-user questions.

## Sequencing inside the launch

| Phase | Work | When |
|---|---|---|
| 0 | Backend deploy (Worker → api.storyline.app, Stripe live, error tracking, ToS/privacy, marketing site) | Before M6.5 |
| 1 | M6.5 installer build (mac signed, win unsigned, linux unsigned) + ship | 3–4 weeks |
| 2 | **Beta launch** — invite list, soft Discord/Twitter announce. Collect Windows abandonment data. | After Phase 1 |
| 3 | Iterate on M6.5 bugs found by real users | 4–6 weeks of polish |
| 4 | **GA prerequisites** — Windows EV cert + signing CI, MS Marketplace listing, doc site polish | 1–2 weeks once Phase 3 stabilises |
| 5 | **GA launch** — drop beta label, ProductHunt, paid acquisition | After Phase 4 |
| 6 | M7 (Tauri desktop) starts — informed by what M6.5 friction proved | Q2/Q3 next year |
