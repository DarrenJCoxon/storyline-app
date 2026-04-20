import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const config = {
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

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('[esbuild] watching webview sources…');
} else {
  await esbuild.build(config);
  console.log('[esbuild] webview built → dist/webview.js');
}
