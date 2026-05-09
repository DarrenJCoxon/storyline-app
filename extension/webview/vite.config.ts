import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        planning:      resolve(__dirname, 'planning.html'),
        onboarding:    resolve(__dirname, 'onboarding.html'),
        editor:        resolve(__dirname, 'editor.html'),
        compile:       resolve(__dirname, 'compile.html'),
        cover:         resolve(__dirname, 'cover.html'),
        illustrations: resolve(__dirname, 'illustrations.html'),
        manuscript:    resolve(__dirname, 'manuscript.html'),
        research:      resolve(__dirname, 'research.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
})
