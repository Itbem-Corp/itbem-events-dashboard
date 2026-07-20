import { FlatCompat } from '@eslint/eslintrc'
import { defineConfig, globalIgnores } from 'eslint/config'

const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

export default defineConfig([
  globalIgnores([
    '.next/**',
    '.next-*/**',
    'coverage/**',
    'playwright-report/**',
    'public/sw.js',
    'test-results/**',
  ]),
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
])
