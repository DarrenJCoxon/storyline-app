// esbuild config — bundles both the extension host (dist/extension.js)
// and the webview (dist/webview.js).
//
// The host bundle inlines all npm deps (markdown-it and its transitive
// tree) so the .vsix doesn't need to ship node_modules. VS Code loads
// dist/extension.js at activation; everything the host code imports
// is already in that single file. Only `vscode` itself is external
// (VS Code provides it at runtime).
//
// tsc still runs (via npm run compile:host) for type-checking only —
// it emits to out/ but those files aren't used at runtime. We could
// switch tsc to noEmit, but keeping out/ around is harmless and makes
// stack traces occasionally more readable during dev.

import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ['webview/src/main.tsx'],
  outfile: 'dist/webview.js',
  bundle: true,
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  loader: {
    '.css': 'css',
  },
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const hostConfig = {
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  target: ['node18'],
  // `vscode` is provided by VS Code at runtime; never try to bundle it.
  // Puppeteer is only invoked by the CLI (nw compile), never imported
  // by the extension host, so it doesn't need to be external here.
  external: ['vscode'],
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
};

if (watch) {
  const [wctx, hctx] = await Promise.all([
    esbuild.context(webviewConfig),
    esbuild.context(hostConfig),
  ]);
  await Promise.all([wctx.watch(), hctx.watch()]);
  console.log('[esbuild] watching webview + host sources…');
} else {
  await Promise.all([
    esbuild.build(webviewConfig),
    esbuild.build(hostConfig),
  ]);
  console.log('[esbuild] webview built → dist/webview.js, host built → dist/extension.js');
}
