// Sync canonical lib/ into the extension's two embedded copies.
//
// Background: the extension dynamic-imports a small set of lib/ files
// at runtime (compile pipeline, doctor, manuscript ops). esbuild can't
// statically resolve dynamic imports across package boundaries, so
// those .js files must ship as actual files inside the .vsix install.
// Everything else the extension needs from lib/ is either ported to
// @storyline/core (bundled via esbuild) or unused. This script keeps
// the two trees in lockstep until CB-01 fully eliminates the shadow
// copy by extracting lib/ into a published workspace package.
//
// Wired into extension/package.json's build:dist so every `npm run
// package` (and therefore every `npm run ship`) starts by mirroring
// the latest source.

import { cpSync, existsSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const targets = [
  {
    label: 'extension/lib (runtime-loaded compile pipeline + helpers)',
    src: resolve(root, 'lib'),
    dst: resolve(root, 'extension', 'lib'),
  },
  {
    label: 'extension/resources/chapter-openers (live-preview opener CSS)',
    src: resolve(root, 'lib', 'compile', 'chapter-openers'),
    dst: resolve(root, 'extension', 'resources', 'chapter-openers'),
  },
  {
    label: 'extension/resources/book-styles (live-preview 6 book styles)',
    src: resolve(root, 'lib', 'compile', 'book-styles'),
    dst: resolve(root, 'extension', 'resources', 'book-styles'),
  },
  {
    label: 'extension/resources/fonts (bundled WOFF2 fonts for live-preview)',
    src: resolve(root, 'lib', 'compile', 'fonts'),
    dst: resolve(root, 'extension', 'resources', 'fonts'),
  },
]

for (const { label, src, dst } of targets) {
  if (!existsSync(src)) {
    console.error(`[sync-extension-lib] missing source: ${src}`)
    process.exit(1)
  }
  // Wipe the destination first so deletions in the canonical source
  // propagate. Without this, files removed from lib/ linger in
  // extension/lib/ and ship in the VSIX as stale code — exactly the
  // class of bug that nearly caught the v0.2.19 stage-doc patch.
  // Delete-then-copy ensures the destination is a true mirror.
  rmSync(dst, { recursive: true, force: true })
  cpSync(src, dst, { recursive: true })
  console.log(`[sync-extension-lib] ${label}`)
  console.log(`[sync-extension-lib]   ${src}`)
  console.log(`[sync-extension-lib]   → ${dst}`)
}

console.log('[sync-extension-lib] done')
