// Copies theme CSS from the CLI's lib/compile/themes/ into the extension's
// resources/ directory at build time. The extension reads these at runtime
// to render the live chapter preview — using the same CSS the compile
// pipeline uses means writers see consistent typography in preview and
// compiled output.
//
// Run by `npm run compile` (wired via the "copy-assets" script in
// package.json). Auto-discovers every directory under lib/compile/themes/
// so new themes just drop in — no need to edit this script.

import { mkdir, copyFile, readdir, stat } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const themesSrc = resolve(repoRoot, 'lib', 'compile', 'themes');
const resourcesDir = resolve(here, '..', 'resources', 'themes');

// Files we try to copy from each theme dir. theme.css and theme.json are
// required; theme-print-pdf.css is optional (only present for themes that
// customise print layout on top of a shared EPUB base).
const REQUIRED = ['theme.css', 'theme.json'];
const OPTIONAL = ['theme-print-pdf.css'];

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

const themeDirs = (await readdir(themesSrc))
  .filter(name => !name.startsWith('.'))
  .filter(async name => await dirExists(resolve(themesSrc, name)));

if (themeDirs.length === 0) {
  console.error('[copy-theme-assets] no themes found in lib/compile/themes/');
  process.exit(1);
}

let copied = 0;
for (const themeId of themeDirs) {
  for (const filename of REQUIRED) {
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
  for (const filename of OPTIONAL) {
    const src = resolve(themesSrc, themeId, filename);
    if (!(await fileExists(src))) continue;
    const dest = resolve(resourcesDir, themeId, filename);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    console.log(`[copy-theme-assets] ${themeId}/${filename} → resources/themes/`);
    copied++;
  }
}

console.log(`[copy-theme-assets] done — ${copied} file${copied === 1 ? '' : 's'} across ${themeDirs.length} theme${themeDirs.length === 1 ? '' : 's'}`);
