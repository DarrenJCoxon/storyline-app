#!/bin/bash
# Wipe every trace of Storyline from this machine so the next install
# starts from a true clean slate. Run from anywhere; uses absolute paths.
#
# This will remove:
#  - the Storyline VS Code extension (and its sqlite/keychain state)
#  - the Storyline Installer.app (Tauri installer)
#  - the locally-downloaded Visual Studio Code in ~/Applications (the one
#    our installer puts there — your /Applications copy is untouched)
#  - the ~/Documents/Storyline workspace folder
#  - boot logs and temp downloads
#
# It will NOT remove /Applications/Visual Studio Code.app (system-wide
# install) or any of your novel projects outside ~/Documents/Storyline.
#
# Usage:
#   bash ~/Documents/Codebases/current-projects/storyline-app/scripts/reset-storyline.sh
# or:
#   cat ~/Documents/Codebases/current-projects/storyline-app/scripts/reset-storyline.sh | bash

set -u

echo "==> Storyline full reset"
echo

# 1. Storyline VS Code extension(s)
echo "[1/9] Removing extension directory…"
rm -rf "$HOME/.vscode/extensions/darrenjcoxon.storyline-extension"* 2>/dev/null || true

# 2. VS Code globalStorage rows
echo "[2/9] Clearing VS Code globalStorage entries…"
sqlite3 "$HOME/Library/Application Support/Code/User/globalStorage/state.vscdb" \
  "DELETE FROM ItemTable WHERE key LIKE '%storyline%';" 2>/dev/null || true

# 3. VS Code workspaceStorage rows
echo "[3/9] Clearing VS Code workspaceStorage entries…"
for db in "$HOME/Library/Application Support/Code/User/workspaceStorage"/*/state.vscdb; do
  [ -f "$db" ] && sqlite3 "$db" "DELETE FROM ItemTable WHERE key LIKE '%storyline%';" 2>/dev/null || true
done

# 4. Keychain (DPAPI/Credential Manager on Windows would go here too)
echo "[4/9] Clearing keychain entries containing 'storyline'…"
security dump-keychain 2>/dev/null \
  | grep -o 'svce.*="[^"]*[Ss]toryline[^"]*"' \
  | sed 's/.*="\([^"]*\)".*/\1/' | sort -u \
  | while read -r svc; do
      [ -n "$svc" ] && security delete-generic-password -s "$svc" >/dev/null 2>&1 || true
    done

# 5. extensions.json registry
echo "[5/9] Cleaning extensions.json registry…"
if [ -f "$HOME/.vscode/extensions/extensions.json" ] && command -v jq >/dev/null 2>&1; then
  jq 'map(select(.identifier.id != "darrenjcoxon.storyline-extension"))' \
    "$HOME/.vscode/extensions/extensions.json" \
    > "$HOME/.vscode/extensions/extensions.json.tmp" 2>/dev/null \
    && mv "$HOME/.vscode/extensions/extensions.json.tmp" "$HOME/.vscode/extensions/extensions.json"
fi

# 6. Storyline Installer.app
echo "[6/9] Removing Storyline Installer.app…"
rm -rf "/Applications/Storyline Installer.app" 2>/dev/null || true
rm -rf "$HOME/Applications/Storyline Installer.app" 2>/dev/null || true

# 7. The user-local Visual Studio Code our installer downloads
echo "[7/9] Removing user-local VS Code (~/Applications/Visual Studio Code.app)…"
rm -rf "$HOME/Applications/Visual Studio Code.app" 2>/dev/null || true

# 8. Workspace folder + boot log + temp downloads
echo "[8/9] Removing workspace + boot log + temp installer files…"
rm -rf "$HOME/Documents/Storyline" 2>/dev/null || true
rm -f  "$HOME/.storyline-boot.log" 2>/dev/null || true
rm -f  "$HOME/.storyline-licence.json" 2>/dev/null || true
rm -rf "$HOME/Library/Application Support/Storyline" 2>/dev/null || true
rm -rf "$HOME/Library/Caches/app.storyline.installer" 2>/dev/null || true
rm -rf "$HOME/Library/WebKit/app.storyline.installer" 2>/dev/null || true
rm -rf "$HOME/Library/HTTPStorages/app.storyline.installer"* 2>/dev/null || true
rm -f  /tmp/vscode-installer-*.zip 2>/dev/null || true
rm -rf /tmp/vscode-installer-extracted 2>/dev/null || true

# 9. Quarantine attribute on any leftover .dmg/.app the user downloaded
echo "[9/9] Clearing quarantine on any leftover Storyline downloads…"
for f in "$HOME/Downloads"/Storyline.Installer*.dmg "$HOME/Downloads"/Storyline*.app; do
  [ -e "$f" ] && xattr -d com.apple.quarantine "$f" 2>/dev/null || true
done

# 10. (optional) Wipe the backend machineId guard so a fresh
# /free-plan/issue mints a new 150-credit key. Skipped unless the
# STORYLINE_ADMIN_KEY env var is set — production users never have
# this, so this step is a no-op for them.
#
# Without this step, the /free-plan/issue machineId guard (intentional
# anti-farming protection) returns the existing licence with whatever
# balance you've burned down to during testing. CB-15 from
# docs/backlog/codebase-improvements.md.
if [ -n "${STORYLINE_ADMIN_KEY:-}" ] && command -v node >/dev/null 2>&1; then
  echo "[10/10] Resetting backend machineId guard (admin)…"
  MACHINE_ID="$(node -e 'try { console.log(require("crypto").createHash("sha256").update(require("os").hostname()+require("os").userInfo().username).digest("hex")) } catch { process.exit(1) }' 2>/dev/null)"
  # Note: vscode.env.machineId is a hash of the macOS IOPlatformUUID,
  # not derivable from a shell. We use the same OS+user fingerprint as
  # a reasonable proxy for testing. If you know your real machineId
  # (printed in the boot log on first activation), pass it explicitly
  # via STORYLINE_MACHINE_ID env var.
  MACHINE_ID="${STORYLINE_MACHINE_ID:-$MACHINE_ID}"
  BACKEND_URL="${STORYLINE_BACKEND_URL:-https://api.storyline.my}"
  if [ -n "$MACHINE_ID" ]; then
    curl -sS -X POST "$BACKEND_URL/free-plan/reset" \
      -H "Authorization: Bearer $STORYLINE_ADMIN_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"machineId\":\"$MACHINE_ID\"}" \
      | head -c 500
    echo
  else
    echo "[10/10] (skipped — couldn't derive machineId)"
  fi
fi

echo
echo "✓ Done. Quit VS Code fully (Cmd+Q) before downloading the installer again."
