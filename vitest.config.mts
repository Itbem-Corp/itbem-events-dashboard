import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/unit/setup.ts'],
    // The product contract is validated by its own Node test runner. Keep its
    // checkout out of the dashboard's Vitest discovery and coverage scope.
    exclude: ['tests/e2e/**', 'node_modules/**', '.contracts/**'],
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        '.contracts/**',
        'tests/e2e/**',
        '*.config.*',
        'src/app/**',
        'src/components/ui/catalyst/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
