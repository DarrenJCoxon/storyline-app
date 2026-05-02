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
// Self-contained — uses only Node built-ins via require so it can't
// itself fail to initialise.
const bootBanner = `"use strict";
(function(){
  try {
    var __fs = require('fs');
    var __os = require('os');
    var __path = require('path');
    var __dir = process.platform === 'win32'
      ? __path.join(process.env.LOCALAPPDATA || __os.tmpdir(), 'Storyline')
      : __os.homedir();
    var __file = process.platform === 'win32'
      ? __path.join(__dir, 'boot.log')
      : __path.join(__dir, '.storyline-boot.log');
    try { __fs.mkdirSync(__dir, { recursive: true }); } catch(_){}
    __fs.appendFileSync(__file,
      '\\n=== bundle-start ' + new Date().toISOString() +
      ' pid=' + process.pid +
      ' platform=' + process.platform +
      ' arch=' + process.arch +
      ' node=' + process.version +
      ' ===\\n', 'utf8');
    globalThis.__storylineBootLog = function(msg){
      try { __fs.appendFileSync(__file, '+banner ' + msg + '\\n', 'utf8'); } catch(_){}
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
  external: ['vscode', 'sharp', 'chalk', 'fs-extra'],
  sourcemap: false,
  minify: true,
  treeShaking: true,
  logLevel: 'info',
  banner: { js: bootBanner },
})
