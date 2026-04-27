import { build } from 'esbuild'

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
})
