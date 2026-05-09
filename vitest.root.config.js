// Root vitest config — scopes the root `npm test` job to tests/ only.
// Without this, vitest auto-discovers test files anywhere in the repo
// (extension/src/__tests__, packages/core/, backend/) and runs them
// against the root's package.json deps — which don't include @storyline/core
// dist/ or fs-extra hoisting, so those workspace tests fail with module
// resolution errors. Each workspace has its own vitest invocation in CI;
// the root job exists only to run the cross-cutting drift / fiction /
// NF / pipeline tests in tests/.
//
// Filename intentionally NOT vitest.config.js. vitest auto-discovers any
// `vitest.config.*` walking up from cwd, so a config at the repo root
// would also get applied to extension/, packages/core/, and backend/
// when those run their own `vitest`. Each of those packages has only
// `vitest` in its own node_modules — they can't resolve `vitest` at the
// root path, so loading our root config fails with ERR_MODULE_NOT_FOUND.
// Using a non-default filename + `-c vitest.root.config.js` in package.json
// keeps this config scoped strictly to the root invocation.
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
