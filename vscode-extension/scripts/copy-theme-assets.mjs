// Copies theme CSS from the CLI's lib/compile/themes/ into the extension's
// resources/ directory at build time. The extension reads these at runtime
// to render the live chapter preview — using the same CSS the compile
// pipeline uses means writers see consistent typography in preview and
// compiled output.
//
// Run by `npm run compile` (wired via the "copy-assets" script in
// package.json). When new themes land in M6, add them here.

import { mkdir, copyFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const themesSrc = resolve(repoRoot, 'lib', 'compile', 'themes');
const resourcesDir = resolve(here, '..', 'resources', 'themes');

const copies = [
  ['classic-serif/theme.css', 'classic-serif/theme.css'],
  ['classic-serif/theme.json', 'classic-serif/theme.json'],
  // Print-PDF variant is used by the compile pipeline only, not live
  // preview, but copy it too so future preview modes (full-book?) can
  // reference it.
  ['classic-serif/theme-print-pdf.css', 'classic-serif/theme-print-pdf.css'],
];

for (const [from, to] of copies) {
  const src = resolve(themesSrc, from);
  const dest = resolve(resourcesDir, to);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`[copy-theme-assets] ${from} → resources/themes/${to}`);
}
