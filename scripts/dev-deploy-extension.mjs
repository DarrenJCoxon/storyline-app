// Runs automatically after `npm run package` in extension/.
// Copies the freshly-built vsix to the Tauri installer resources and
// force-installs it into whichever editor owns this terminal session.
// --force means version number is irrelevant — no manual bumps needed.

import { readdirSync, copyFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { resolveEditorCLI, tryInstallVsix } from './install-vscode-extension.js'

// Known editor CLI paths on macOS — fallback when not running inside an
// editor's integrated terminal (e.g. external terminal, Claude Code shell).
const MAC_FALLBACKS = [
  { path: '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',    name: 'VS Code'   },
  { path: '/Applications/Cursor.app/Contents/Resources/app/bin/cursor',              name: 'Cursor'    },
  { path: '/Applications/Windsurf.app/Contents/Resources/app/bin/windsurf',          name: 'Windsurf'  },
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const extDir = resolve(root, 'extension')
const resourcesDst = resolve(root, 'installer', 'src-tauri', 'resources', 'storyline.vsix')

// Pick the newest vsix in extension/
const vsixFiles = readdirSync(extDir)
  .filter(f => f.endsWith('.vsix'))
  .sort()
  .reverse()

if (vsixFiles.length === 0) {
  console.error('[deploy] No .vsix found in extension/ — package step may have failed')
  process.exit(1)
}

const vsixPath = resolve(extDir, vsixFiles[0])
console.log(`[deploy] Using ${vsixFiles[0]}`)

// 1. Copy to installer so next Tauri build picks it up
copyFileSync(vsixPath, resourcesDst)
console.log('[deploy] Copied → installer/src-tauri/resources/storyline.vsix')

// 2. Force-install into the active editor (--force bypasses version check)
//    Try env-detected editor first (works when running inside an editor terminal),
//    then fall back to known macOS app paths.
let installed = false
const editor = resolveEditorCLI()
const result = tryInstallVsix(vsixPath, editor)

if (result === 'ok') {
  installed = true
  console.log(`[deploy] Installed into ${editor.name}`)
  console.log('[deploy] Reload the window: ⌘⇧P → Developer: Reload Window')
} else if (process.platform === 'darwin') {
  for (const fb of MAC_FALLBACKS) {
    if (!existsSync(fb.path)) continue
    const fbResult = tryInstallVsix(vsixPath, fb)
    if (fbResult === 'ok') {
      installed = true
      console.log(`[deploy] Installed into ${fb.name}`)
      console.log('[deploy] Reload the window: ⌘⇧P → Developer: Reload Window')
      break
    }
  }
}

if (!installed) {
  console.warn('[deploy] Auto-install failed — install manually:')
  console.warn(`[deploy]   code --install-extension "${vsixPath}" --force`)
}
