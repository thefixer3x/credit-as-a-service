import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./setup/vitest.setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/playwright/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'setup/',
        'fixtures/',
        'mocks/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/dist/**'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 4
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../'),
      '@tests': resolve(__dirname, './'),
      '@mocks': resolve(__dirname, './mocks'),
      '@fixtures': resolve(__dirname, './fixtures'),
      '@utils': resolve(__dirname, './utils'),
      '@services': resolve(__dirname, '../services'),
      '@apps': resolve(__dirname, '../apps'),
      '@libs': resolve(__dirname, '../libs'),
      '@caas/common': resolve(__dirname, '../packages/common/src'),
      '@caas/config': resolve(__dirname, '../packages/config/src'),
      '@caas/types': resolve(__dirname, '../packages/types/src'),
      '@caas/shared': resolve(__dirname, '../packages/shared/src'),
      '@caas/cache': resolve(__dirname, '../libs/cache/src'),
      '@caas/database': resolve(__dirname, '../services/database/src'),
      '@caas/sme-integration': resolve(__dirname, '../services/sme-integration/src'),
      '@caas/auth': resolve(__dirname, '../services/auth/src')
    }
  }
});
