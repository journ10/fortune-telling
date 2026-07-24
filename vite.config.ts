/// <reference types="vitest/config" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  base: '/fortune-telling/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true,
    exclude: [
      ...configDefaults.exclude,
      '**/.worktrees/**',
      '**/dist/**',
      'src/**/*.stats.test.ts'
    ]
  }
});
