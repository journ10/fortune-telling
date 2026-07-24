/// <reference types="vitest/config" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  base: '/fortune-telling/',
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // three 单独成 chunk，与应用代码并行缓存；
            // Rapier 通过动态 import 自动拆出，首屏不加载。
            { name: 'three', test: /node_modules[\\/]three[\\/]/ }
          ]
        }
      }
    }
  },
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
