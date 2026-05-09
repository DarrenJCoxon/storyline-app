#!/usr/bin/env node
// Regression guard against hard-coded installer filenames in the site.
//
// Original problem (now solved): site/app/DownloadCard.tsx used to
// hard-code `Storyline.Installer_<version>_<arch>.<ext>` URLs against
// GitHub's /releases/latest/download/ pattern. Tauri bakes the version
// into the asset name, so any installer version bump that wasn't
// matched by a DownloadCard.tsx update silently 404'd every download
// button on the homepage.
//
// Current architecture: DownloadCard.tsx receives a `downloads` prop
// resolved at request time by site/app/getDownloads.ts, which queries
// the GitHub Releases API and walks the asset list. No version is
// hard-coded anywhere in site/, so a tauri.conf.json bump propagates
// to the homepage automatically on the next build.
//
// This guard now fails the build if anyone reintroduces a hard-coded
// `Storyline.Installer_<x.y.z>_*` filename anywhere under site/. Prevents
// the silent-404 regression class from coming back.
//
// Scope: site/**/*.{ts,tsx,js,jsx,mjs,mdx,md}. node_modules and .next
// build outputs are excluded.

import { readFile, readdir } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const siteRoot = resolve(repoRoot, 'site')

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.md', '.mdx'])
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', '.turbo', '.cache'])

const HARDCODED_REGEX = /Storyline\.Installer_(\d+\.\d+\.\d+)_/g

async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.')
      if (dot >= 0 && SCAN_EXTENSIONS.has(entry.name.slice(dot))) yield full
    }
  }
}

// Match Storyline.Installer_X.Y.Z_ in code lines only — strip single-line
// comments (`//`) and block-comment-continuation lines (`*`) so docs that
// reference example asset filenames don't trigger the guard.
function findCodeMatches(src) {
  const matches = []
  for (const line of src.split('\n')) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    // Strip an inline `// …` comment so e.g. `const x = 1 // see Storyline.Installer_X.Y.Z_…`
    // doesn't false-positive either.
    const codeOnly = line.replace(/\/\/.*$/, '')
    for (const m of codeOnly.matchAll(HARDCODED_REGEX)) matches.push(m)
  }
  return matches
}

const offenders = []
for await (const file of walk(siteRoot)) {
  const src = await readFile(file, 'utf8')
  const matches = findCodeMatches(src)
  if (matches.length > 0) {
    const versions = [...new Set(matches.map(m => m[1]))]
    offenders.push({ file, versions })
  }
}

if (offenders.length > 0) {
  console.error(
    '✗ Hard-coded installer filenames detected in site/.\n\n'
    + offenders.map(o => `  ${o.file.replace(repoRoot + '/', '')} → versions [${o.versions.join(', ')}]`).join('\n')
    + '\n\nResolve installer download URLs from the GitHub Releases API\n'
    + '(see site/app/getDownloads.ts) instead of hard-coding the version.\n'
    + 'Hard-coded URLs silently 404 every time tauri.conf.json bumps.',
  )
  process.exit(1)
}

console.log('✓ No hard-coded installer filenames in site/. Downloads resolve from the GitHub Releases API.')
