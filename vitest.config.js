// Root vitest config — scopes the root `npm test` job to tests/ only.
// Without this, vitest auto-discovers test files anywhere in the repo
// (extension/src/__tests__, packages/core/, backend/) and runs them
// against the root's package.json deps — which don't include @storyline/core
// dist/ or fs-extra hoisting, so those workspace tests fail with module
// resolution errors. Each workspace has its own vitest invocation in CI;
// the root job exists only to run the cross-cutting drift / fiction /
// NF / pipeline tests in tests/.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,ts,mjs}'],
    exclude: [
      'node_modules/**',
      'extension/**',
      'packages/**',
      'backend/**',
      'site/**',
      'installer/**',
    ],
  },
})
