import { defineConfig } from 'vitest/config';

// Statistical physics-fairness tests. Excluded from the default `npm test`
// fast gate; run explicitly via `npm run test:stats`.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.stats.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**'],
    testTimeout: 120000
  }
});
