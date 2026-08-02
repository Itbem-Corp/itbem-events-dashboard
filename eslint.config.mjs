import { defineConfig, globalIgnores } from 'eslint/config'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

export default defineConfig([
  globalIgnores([
    '.next/**',
    '.next-*/**',
    'coverage/**',
    'playwright-report/**',
    'public/sw.js',
    'test-results/**',
  ]),
  ...nextCoreWebVitals,
  {
    rules: {
      '@next/next/no-img-element': 'off',
      // These checks enforce React Compiler invariants. Keep them disabled
      // until the compiler is explicitly enabled and the existing hooks are
      // migrated as a dedicated performance change.
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/refs': 'off',
    },
  },
])
