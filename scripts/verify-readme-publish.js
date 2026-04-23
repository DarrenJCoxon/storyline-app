// README publish guard — prevents the recurring "0-byte README on npm"
// regression that has bitten 1.1.7 and 1.5.0 publishes.
//
// Symptom: README.md exists locally, is non-trivial, and `npm pack`
// includes it. But after `npm publish`, the npm registry shows an
// empty `readme` field for that version — the npmjs.com web UI then
// renders the package as "This package does not have a README."
// Strongly suspected to be an interaction with a transient .npmignore
// or with `npm publish`'s own packaging pass differing from `npm pack`.
//
// This script runs in two modes:
//
//   pre   — runs from `prepublishOnly`. Asserts on local state:
//             1. README.md exists, is > 1 KB, starts with "# Storyline".
//             2. No .npmignore at the project root (the known-bad signal).
//             3. `npm pack --dry-run --json` includes README.md with a
//                non-trivial size in the would-be tarball.
//           Any failure aborts the publish loud and fast.
//
//   post  — runs from `postpublish`. Fetches the just-published version's
//           registry metadata and asserts the `readme` field came through
//           with non-trivial content. This catches the case where the
//           tarball was correct but the registry-side extractor failed.
//           A failure here cannot be undone (you can't unpublish), but it
//           prints a LOUD warning telling the user to bump and republish.

import { readFileSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const MIN_README_BYTES = 1024;          // README must be > 1 KB
const MIN_REGISTRY_README_BYTES = 1000; // some leeway for what npm normalises to

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;

function fail(msg) {
  console.error('');
  console.error(RED('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.error(RED('  README publish guard — FAIL'));
  console.error(RED('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.error('');
  console.error(`  ${msg}`);
  console.error('');
  console.error(RED('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.error('');
  process.exit(1);
}

function ok(msg) {
  console.log(GREEN('✓'), msg);
}

function preflight() {
  console.log('');
  console.log('README publish guard (pre):');

  // 1. .npmignore — the historical culprit
  const npmIgnorePath = resolve(projectRoot, '.npmignore');
  if (existsSync(npmIgnorePath)) {
    fail(
      `An .npmignore file exists at the project root.\n  ` +
      `This has been the cause of empty-README publishes in the past — npm's\n  ` +
      `per-publish README extractor is unreliable when .npmignore is present.\n  ` +
      `The "files" array in package.json is authoritative; .npmignore is\n  ` +
      `redundant and harmful here. Delete it and try the publish again.`
    );
  }
  ok('no .npmignore present');

  // 2. README.md on disk
  const readmePath = resolve(projectRoot, 'README.md');
  if (!existsSync(readmePath)) {
    fail('README.md does not exist at the project root.');
  }
  const readmeSize = statSync(readmePath).size;
  if (readmeSize < MIN_README_BYTES) {
    fail(`README.md is only ${readmeSize} bytes — expected > ${MIN_README_BYTES}.`);
  }
  const readmeHead = readFileSync(readmePath, 'utf-8').slice(0, 120);
  if (!/^#\s+Storyline/.test(readmeHead)) {
    fail(
      `README.md does not start with "# Storyline".\n  ` +
      `First 120 chars: ${JSON.stringify(readmeHead)}`
    );
  }
  ok(`README.md present, ${readmeSize.toLocaleString()} bytes, starts with "# Storyline"`);

  // 3. README is in the would-be tarball (npm pack --dry-run)
  let packJson;
  try {
    const raw = execSync('npm pack --dry-run --json', { cwd: projectRoot, encoding: 'utf-8' });
    packJson = JSON.parse(raw);
  } catch (e) {
    fail(`npm pack --dry-run failed: ${e.message}`);
  }
  const tarball = Array.isArray(packJson) ? packJson[0] : packJson;
  const readmeEntry = (tarball?.files || []).find(f => /^readme(\.md)?$/i.test(f.path));
  if (!readmeEntry) {
    fail(
      `README.md was not in the npm pack --dry-run file list.\n  ` +
      `The "files" array in package.json must include "README.md" (or a\n  ` +
      `glob that covers it). Tarball file count: ${tarball?.entryCount ?? 'unknown'}.`
    );
  }
  if ((readmeEntry.size || 0) < MIN_README_BYTES) {
    fail(
      `README.md in the tarball is only ${readmeEntry.size} bytes —\n  ` +
      `expected > ${MIN_README_BYTES}. Something is rewriting the file at\n  ` +
      `pack time. Check for prepack hooks or lint autofix.`
    );
  }
  ok(`README.md in tarball at ${readmeEntry.size.toLocaleString()} bytes`);

  console.log('');
  console.log(GREEN('All README publish-guard pre-flight checks passed.'));
  console.log('');
}

function postflight() {
  console.log('');
  console.log('README publish guard (post):');

  // Read package.json for name + version
  const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'));
  const spec = `${pkg.name}@${pkg.version}`;

  // npm CDN propagation — give the registry a moment.
  console.log(`  waiting 5s for npm registry propagation...`);
  const wait = Date.now() + 5000;
  while (Date.now() < wait) {} // small busy-wait; fine for a one-shot script

  let readme;
  try {
    readme = execSync(`npm view ${spec} readme`, { encoding: 'utf-8' });
  } catch (e) {
    console.warn(YELLOW(`  could not fetch ${spec} from registry: ${e.message}`));
    console.warn(YELLOW('  skipping post-publish check (registry may not have propagated yet)'));
    return;
  }

  const readmeBytes = Buffer.byteLength(readme || '', 'utf-8');
  if (readmeBytes < MIN_REGISTRY_README_BYTES) {
    // Cannot fail the script — the publish has already happened. Print
    // a LOUD warning telling the user what to do.
    console.error('');
    console.error(RED('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.error(RED(`  CRITICAL — npm registry has empty README for ${spec}`));
    console.error(RED('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.error('');
    console.error(`  Registry-side README size: ${readmeBytes} bytes (expected > ${MIN_REGISTRY_README_BYTES}).`);
    console.error(`  npmjs.com will display "This package does not have a README."`);
    console.error('');
    console.error('  IMMEDIATE ACTION:');
    console.error(`    1. Bump the version (e.g. ${pkg.version} → patch+1)`);
    console.error('    2. Re-run npm publish');
    console.error('');
    console.error('  This is a known intermittent npm-side bug. Republishing the same');
    console.error('  tarball under a new version usually succeeds.');
    console.error('');
    console.error(RED('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.error('');
    process.exitCode = 2; // signal failure but don't throw
    return;
  }

  ok(`registry README for ${spec}: ${readmeBytes.toLocaleString()} bytes`);
  console.log('');
}

const mode = process.argv[2];
if (mode === 'pre') {
  preflight();
} else if (mode === 'post') {
  postflight();
} else {
  console.error('Usage: node scripts/verify-readme-publish.js (pre|post)');
  process.exit(1);
}
