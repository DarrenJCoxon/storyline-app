#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/notarise-mac.sh <path/to/Storyline-Installer.dmg>
# Required env: APPLE_ID, APPLE_TEAM_ID, APPLE_APP_SPECIFIC_PASSWORD

DMG="${1:?usage: notarise-mac.sh <path/to/installer.dmg>}"
APPLE_ID="${APPLE_ID:?missing env APPLE_ID}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:?missing env APPLE_TEAM_ID}"
APPLE_APP_SPECIFIC_PASSWORD="${APPLE_APP_SPECIFIC_PASSWORD:?missing env APPLE_APP_SPECIFIC_PASSWORD}"

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

echo "✓ Notarised and stapled: $DMG"
