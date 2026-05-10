import { build } from 'esbuild'

// Banner is injected at the absolute top of the output bundle, BEFORE any
// module init code runs. It synchronously writes a "bundle-start" line to
// the boot log so we can tell whether the extension host even finished
// requiring the bundle. If boot.log exists with this line but nothing
// after, the hang is in module-init (one of our requires). If the file
// doesn't exist at all, the bundle didn't get this far either, which
// would be an even earlier hang (e.g. dlopen of a native module the
// runtime tries to load before user JS runs).
//
// CB-17: gated behind STORYLINE_BOOT_LOG=1. The require-tracing hook
// was indispensable while we were chasing the Windows DPAPI hang but on
// a stable build it does ~30 sync appendFileSync calls per activation
// for a log file no one reads. Off-by-default; flip the env var when
// chasing a new activation issue.
//
// Self-contained — uses only Node built-ins via require so it can't
// itself fail to initialise.
const bootBanner = `"use strict";
(function(){
  if (process.env.STORYLINE_BOOT_LOG !== '1') return;
  try {
    var __fs = require('fs');
    var __os = require('os');
    var __path = require('path');
    var __Module = require('module');
    var __dir = process.platform === 'win32'
      ? __path.join(process.env.LOCALAPPDATA || __os.tmpdir(), 'Storyline')
      : __os.homedir();
    var __file = process.platform === 'win32'
      ? __path.join(__dir, 'boot.log')
      : __path.join(__dir, '.storyline-boot.log');
    try { __fs.mkdirSync(__dir, { recursive: true }); } catch(_){}
    var __t0 = Date.now();
    var __append = function(line){
      try { __fs.appendFileSync(__file, line, 'utf8'); } catch(_){}
    };
    __append('\\n=== bundle-start ' + new Date().toISOString() +
      ' pid=' + process.pid +
      ' platform=' + process.platform +
      ' arch=' + process.arch +
      ' node=' + process.version +
      ' ===\\n');
    globalThis.__storylineBootLog = function(msg){
      __append('+' + (Date.now() - __t0) + 'ms  ' + msg + '\\n');
    };
    // Trace every require so the LAST line written before the hang names
    // the module that's blocking. The hook also logs completion so we can
    // see whether the require started but never returned (the smoking gun
    // for a sync init that hangs on Windows).
    var __orig = __Module._load;
    var __depth = 0;
    __Module._load = function(request, parent, isMain){
      var indent = '';
      for (var i = 0; i < __depth; i++) indent += '  ';
      __append('+' + (Date.now() - __t0) + 'ms  ' + indent + 'require> ' + request + '\\n');
      __depth++;
      try {
        var __res = __orig.apply(this, arguments);
        __depth--;
        __append('+' + (Date.now() - __t0) + 'ms  ' + indent + 'require< ' + request + '\\n');
        return __res;
      } catch (e) {
        __depth--;
        __append('+' + (Date.now() - __t0) + 'ms  ' + indent + 'require! ' + request + ' :: ' + (e && e.message || e) + '\\n');
        throw e;
      }
    };
  } catch(_){}
})();
`

await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/extension.js',
  // `vscode` is provided by the host. `sharp` is a native module loaded via
  // dynamic await import() from illustration code only — keep it external so
  // its native binaries resolve at runtime from node_modules. Everything else
  // (chalk, fs-extra, isomorphic-git, vectra, etc.) MUST be bundled — vsce
  // package is invoked with --no-dependencies in the release workflow, so
  // non-native external deps throw "Cannot find module" at activation on a
  // fresh user machine.
  //
  // (Historical: NT-01..21 originally used @nusoft/nuvector — a Rust NAPI
  //  binary — for the semantic-memory store. The binary exit-code-5'd inside
  //  VS Code's Electron-bundled Node despite working in standalone Node,
  //  forcing a swap to vectra. vectra is pure JS, bundles cleanly, and
  //  doesn't need external treatment.)
  external: [
    'vscode',
    'sharp',
    // vectra ships an optional TransformersEmbeddings module that requires
    // @huggingface/transformers (heavy ML dep). We use OpenAI embeddings via
    // our own client, never construct a TransformersEmbeddings instance, so
    // the require is dead code — but esbuild still needs the resolution to
    // succeed. Marking external lets the unused require live in the bundle
    // without Hugging Face being installed.
    '@huggingface/transformers',
  ],
  // Workspace deps in ../packages/core and ../lib import fs-extra/chalk via
  // require()/import. esbuild resolves those from the importing file's
  // location and won't find them in extension/node_modules without this
  // hint. Without nodePaths, the CI build fails with "Could not resolve
  // 'fs-extra'" because npm only installs deps listed in extension's own
  // package.json into extension/node_modules.
  nodePaths: ['node_modules'],
  sourcemap: false,
  minify: true,
  treeShaking: true,
  logLevel: 'info',
  banner: { js: bootBanner },
})
