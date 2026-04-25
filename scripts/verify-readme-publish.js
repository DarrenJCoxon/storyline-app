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

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {} // synchronous; fine for a one-shot lifecycle script
}

function postflight() {
  console.log('');
  console.log('README publish guard (post):');

  const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'));
  const spec = `${pkg.name}@${pkg.version}`;

  // npm's registry can take 30-90s to process and expose a new publish via
  // `npm view`. Checking after 5s routinely returns a stale empty README,
  // which was firing the LOUD warning incorrectly on every single publish.
  // We now wait 45s up front, then retry up to 3 times at 20s intervals
  // before concluding the README is genuinely missing.
  const INITIAL_WAIT_MS = 45_000;
  const RETRY_WAIT_MS = 20_000;
  const MAX_RETRIES = 3;

  console.log(`  waiting ${INITIAL_WAIT_MS / 1000}s for npm registry to process the publish...`);
  sleep(INITIAL_WAIT_MS);

  let readme = '';
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    try {
      readme = execSync(`npm view ${spec} readme`, { encoding: 'utf-8' });
    } catch (e) {
      console.warn(YELLOW(`  attempt ${attempt + 1}: could not fetch ${spec} — ${e.message}`));
    }
    if (Buffer.byteLength(readme || '', 'utf-8') >= MIN_REGISTRY_README_BYTES) break;

    if (attempt < MAX_RETRIES) {
      console.log(`  attempt ${attempt + 1}: README not visible yet, retrying in ${RETRY_WAIT_MS / 1000}s...`);
      sleep(RETRY_WAIT_MS);
    }
    attempt++;
  }

  const readmeBytes = Buffer.byteLength(readme || '', 'utf-8');
  if (readmeBytes < MIN_REGISTRY_README_BYTES) {
    // npmjs.com web UI can take a few extra minutes to update even after
    // the registry API returns the README. Before concluding there is a
    // real problem, wait a little and check manually:
    //   npm view storyline-vsc@<version> readme | head -5
    // If that returns content, the README is fine — npmjs.com just needs
    // more time to propagate. Only bump and republish if `npm view` is
    // also empty after ~5 minutes.
    console.error('');
    console.error(YELLOW('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.error(YELLOW(`  WARNING — could not confirm README for ${spec} after retries`));
    console.error(YELLOW('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.error('');
    console.error(`  Registry-side README size: ${readmeBytes} bytes after ${MAX_RETRIES + 1} attempts.`);
    console.error('');
    console.error('  VERIFY FIRST (the registry may just need more time):');
    console.error(`    npm view ${spec} readme | head -5`);
    console.error('');
    console.error('  If that command returns content → README is fine, npmjs.com will');
    console.error('  update within a few minutes. No action needed.');
    console.error('');
    console.error('  If that command returns NOTHING → bump and republish:');
    const [maj, min, pat] = pkg.version.split('.').map(Number);
    console.error(`    1. Bump version: ${pkg.version} → ${maj}.${min}.${pat + 1}`);
    console.error('    2. Re-run npm publish');
    console.error('');
    console.error(YELLOW('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.error('');
    process.exitCode = 2;
    return;
  }

  ok(`registry README for ${spec}: ${readmeBytes.toLocaleString()} bytes — confirmed`);
  console.log('');
  console.log(GREEN('README is live on the registry. npmjs.com web UI may take a few more minutes to show it.'));
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
