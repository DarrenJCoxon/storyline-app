#!/bin/bash
# Reset Storyline extension for fresh install

set -e

echo "1. Removing extension directory..."
rm -rf ~/.vscode/extensions/darrenjcoxon.storyline-extension-* 2>/dev/null || true

echo "2. Clearing globalStorage..."
sqlite3 "$HOME/Library/Application Support/Code/User/globalStorage/state.vscdb" \
  "DELETE FROM ItemTable WHERE key LIKE '%storyline%';" 2>/dev/null || true

echo "3. Clearing workspaceStorage..."
for db in "$HOME/Library/Application Support/Code/User/workspaceStorage"/*/state.vscdb; do
  sqlite3 "$db" "DELETE FROM ItemTable WHERE key LIKE '%storyline%';" 2>/dev/null || true
done

echo "4. Clearing keychain secrets..."
security dump-keychain 2>/dev/null | \
  grep -o 'svce.*="[^"]*storyline[^"]*"' | \
  sed 's/.*="\([^"]*\)".*/\1/' | sort -u | \
  while read svc; do security delete-generic-password -s "$svc" 2>/dev/null || true; done

echo "5. Cleaning extensions.json..."
cat ~/.vscode/extensions/extensions.json 2>/dev/null | \
  jq 'map(select(.identifier.id != "darrenjcoxon.storyline-extension"))' \
  > ~/.vscode/extensions/extensions.json.tmp 2>/dev/null && \
  mv ~/.vscode/extensions/extensions.json.tmp ~/.vscode/extensions/extensions.json 2>/dev/null || true

echo "6. Removing .storyline test dirs..."
find ~/Documents/Codebases/tests -name ".storyline" -type d -exec rm -rf {} + 2>/dev/null || true

echo "Done. Now fully quit VS Code (Cmd+Q) and reinstall."
