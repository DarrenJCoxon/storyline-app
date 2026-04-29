// Sync canonical lib/ into the extension's two embedded copies.
//
// The extension ships its own copy of lib/ (extension/lib/) which the
// compile pipeline dynamic-imports at runtime, AND a separate copy of
// the chapter-opener CSS (extension/resources/chapter-openers/) which
// the live-preview command loads. Without this sync, edits to the
// canonical lib/ in the project root silently miss the extension —
// you ship a vsix that runs stale code.
//
// Wired into extension/package.json's build:dist so every `npm run
// package` (and therefore every `npm run ship`) starts by mirroring
// the latest source.

import { cpSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const targets = [
  {
    label: 'extension/lib (compile pipeline + AI/critique/output helpers)',
    src: resolve(root, 'lib'),
    dst: resolve(root, 'extension', 'lib'),
  },
  {
    label: 'extension/resources/chapter-openers (live-preview opener CSS)',
    src: resolve(root, 'lib', 'compile', 'chapter-openers'),
    dst: resolve(root, 'extension', 'resources', 'chapter-openers'),
  },
]

for (const { label, src, dst } of targets) {
  if (!existsSync(src)) {
    console.error(`[sync-extension-lib] missing source: ${src}`)
    process.exit(1)
  }
  cpSync(src, dst, { recursive: true })
  console.log(`[sync-extension-lib] ${label}`)
  console.log(`[sync-extension-lib]   ${src}`)
  console.log(`[sync-extension-lib]   → ${dst}`)
}

console.log('[sync-extension-lib] done')
