// Copies theme CSS and chapter opener CSS from the CLI's lib/compile/
// directories into the extension's resources/ directory at build time. The
// extension reads these at runtime to render the live chapter preview —
// using the same CSS the compile pipeline uses means writers see consistent
// typography in preview and compiled output.
//
// Run by `npm run compile` (wired via the "copy-assets" script in
// package.json). Auto-discovers every directory under lib/compile/themes/
// and lib/compile/chapter-openers/ so new themes/openers just drop in —
// no need to edit this script.

import { mkdir, copyFile, readdir, stat } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const themesSrc = resolve(repoRoot, 'lib', 'compile', 'themes');
const resourcesDir = resolve(here, '..', 'resources', 'themes');
const openersSrc = resolve(repoRoot, 'lib', 'compile', 'chapter-openers');
const openersResourcesDir = resolve(here, '..', 'resources', 'chapter-openers');

// Files we try to copy from each theme dir. theme.css and theme.json are
// required; theme-print-pdf.css is optional (only present for themes that
// customise print layout on top of a shared EPUB base).
const THEME_REQUIRED = ['theme.css', 'theme.json'];
const THEME_OPTIONAL = ['theme-print-pdf.css'];

// Files we try to copy from each opener dir. opener.css and opener.json are
// required; opener-print-pdf.css is optional.
const OPENER_REQUIRED = ['opener.css', 'opener.json'];
const OPENER_OPTIONAL = ['opener-print-pdf.css'];

async function dirExists(p) {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

// ── Themes ────────────────────────────────────────────────────────────────

const themeDirs = (await readdir(themesSrc))
  .filter(name => !name.startsWith('.'))
  .filter(async name => await dirExists(resolve(themesSrc, name)));

if (themeDirs.length === 0) {
  console.error('[copy-theme-assets] no themes found in lib/compile/themes/');
  process.exit(1);
}

let copied = 0;
for (const themeId of themeDirs) {
  for (const filename of THEME_REQUIRED) {
    const src = resolve(themesSrc, themeId, filename);
    if (!(await fileExists(src))) {
      console.error(`[copy-theme-assets] ${themeId}/${filename} missing — required`);
      process.exit(1);
    }
    const dest = resolve(resourcesDir, themeId, filename);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    console.log(`[copy-theme-assets] ${themeId}/${filename} → resources/themes/`);
    copied++;
  }
  for (const filename of THEME_OPTIONAL) {
    const src = resolve(themesSrc, themeId, filename);
    if (!(await fileExists(src))) continue;
    const dest = resolve(resourcesDir, themeId, filename);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    console.log(`[copy-theme-assets] ${themeId}/${filename} → resources/themes/`);
    copied++;
  }
}

// ── Chapter Openers ───────────────────────────────────────────────────────
// The chapter-openers directory may not exist on first run (it is created by
// the compile pipeline as a separate step). If it is missing we warn and
// continue rather than failing — themes are the critical path.

let copiedOpeners = 0;
let openerDirCount = 0;

if (!(await dirExists(openersSrc))) {
  console.warn('[copy-theme-assets] lib/compile/chapter-openers/ not found — skipping opener copy (run again after the compile pipeline creates it)');
} else {
  const openerDirs = (await readdir(openersSrc))
    .filter(name => !name.startsWith('.'))
    .filter(async name => await dirExists(resolve(openersSrc, name)));

  openerDirCount = openerDirs.length;

  for (const openerId of openerDirs) {
    for (const filename of OPENER_REQUIRED) {
      const src = resolve(openersSrc, openerId, filename);
      if (!(await fileExists(src))) {
        console.error(`[copy-theme-assets] ${openerId}/${filename} missing — required`);
        process.exit(1);
      }
      const dest = resolve(openersResourcesDir, openerId, filename);
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(src, dest);
      console.log(`[copy-theme-assets] ${openerId}/${filename} → resources/chapter-openers/`);
      copiedOpeners++;
    }
    for (const filename of OPENER_OPTIONAL) {
      const src = resolve(openersSrc, openerId, filename);
      if (!(await fileExists(src))) continue;
      const dest = resolve(openersResourcesDir, openerId, filename);
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(src, dest);
      console.log(`[copy-theme-assets] ${openerId}/${filename} → resources/chapter-openers/`);
      copiedOpeners++;
    }
  }
}

const themeSummary = `${copied} file${copied === 1 ? '' : 's'} across ${themeDirs.length} theme${themeDirs.length === 1 ? '' : 's'}`;
const openerSummary = openerDirCount > 0
  ? `, ${copiedOpeners} file${copiedOpeners === 1 ? '' : 's'} across ${openerDirCount} opener${openerDirCount === 1 ? '' : 's'}`
  : '';
console.log(`[copy-theme-assets] done — ${themeSummary}${openerSummary}`);
