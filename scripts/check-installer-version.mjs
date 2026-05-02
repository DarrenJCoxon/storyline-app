#!/usr/bin/env node
// Guards against the silent-404 download trap on the homepage.
//
// site/app/DownloadCard.tsx hard-codes the installer's version into the
// asset filenames it points at (e.g. Storyline.Installer_0.1.0_aarch64.dmg).
// GitHub's /releases/latest/download/ pattern only redirects to assets that
// match that exact name, so if installer/src-tauri/tauri.conf.json bumps
// without DownloadCard.tsx being updated in the same PR, every download
// button on the homepage silently 404s for end users.
//
// This script extracts both versions and exits 1 if they differ.

import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const tauriConfPath = resolve(repoRoot, 'installer/src-tauri/tauri.conf.json')
const downloadCardPath = resolve(repoRoot, 'site/app/DownloadCard.tsx')

const tauriConfRaw = await readFile(tauriConfPath, 'utf8')
const tauriConf = JSON.parse(tauriConfRaw)
const installerVersion = tauriConf.version

if (!installerVersion) {
  console.error(`✗ Could not read .version from ${tauriConfPath}`)
  process.exit(1)
}

const downloadCardSrc = await readFile(downloadCardPath, 'utf8')

// Match Storyline.Installer_<version>_<arch>.<ext> across all three buttons.
const filenameRegex = /Storyline\.Installer_(\d+\.\d+\.\d+)_/g
const matches = [...downloadCardSrc.matchAll(filenameRegex)]

if (matches.length === 0) {
  console.error(`✗ No Storyline.Installer_*.* asset filenames found in ${downloadCardPath}`)
  process.exit(1)
}

const cardVersions = [...new Set(matches.map(m => m[1]))]
const mismatched = cardVersions.filter(v => v !== installerVersion)

if (cardVersions.length > 1) {
  console.error(
    `✗ DownloadCard.tsx references multiple installer versions: ${cardVersions.join(', ')}\n`
    + `  All asset filenames must use the same version.`,
  )
  process.exit(1)
}

if (mismatched.length > 0) {
  console.error(
    `✗ Installer version mismatch.\n`
    + `  installer/src-tauri/tauri.conf.json → ${installerVersion}\n`
    + `  site/app/DownloadCard.tsx           → ${cardVersions[0]}\n\n`
    + `  Update the three Storyline.Installer_*.* filenames in DownloadCard.tsx\n`
    + `  to match the installer version, or revert the tauri.conf.json bump.\n`
    + `  Mismatch causes every homepage download button to silently 404.`,
  )
  process.exit(1)
}

console.log(
  `✓ Installer version ${installerVersion} matches DownloadCard.tsx asset filenames `
  + `(${matches.length} references).`,
)
