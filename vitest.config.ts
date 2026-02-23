import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./tests/unit/setup.ts'],
        exclude: ['tests/e2e/**', 'node_modules/**'],
        coverage: {
            enabled: false,
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            reportsDirectory: './coverage',
            exclude: [
                'node_modules/**',
                'tests/e2e/**',
                '*.config.*',
                'src/app/**',         // Next.js pages — tested via E2E
                'src/components/ui/catalyst/**', // Design system, not authored code
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
})
