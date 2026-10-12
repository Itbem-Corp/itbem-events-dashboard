import { defineConfig, devices } from '@playwright/test'
import { chromiumLoopbackHostResolverRules } from './tests/e2e/fixtures/local-auth'

const ephemeralLocalAuth = !!process.env.E2E_ID_TOKEN?.trim()
const loopbackHostResolverRules = chromiumLoopbackHostResolverRules(process.env.E2E_LOOPBACK_HOSTS_JSON)
const chromiumLoopbackLaunchOptions = loopbackHostResolverRules
  ? { launchOptions: { args: [`--host-resolver-rules=${loopbackHostResolverRules}`] } }
  : {}

export default defineConfig({
  testDir: './tests/e2e',
  globalTeardown: './tests/e2e/fixtures/auth.teardown.ts',
  fullyParallel: false, // sequential — comparten auth state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html'], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: ephemeralLocalAuth ? 'off' : 'on-first-retry',
    screenshot: ephemeralLocalAuth ? 'off' : 'only-on-failure',
    video: ephemeralLocalAuth ? 'off' : 'on-first-retry',
  },
  projects: [
    {
      name: 'personas',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        ...chromiumLoopbackLaunchOptions,
      },
      testMatch: '**/role-capability-matrix.spec.ts',
    },
    {
      // Opt-in visual and request parity for Cafetton House against a
      // baseline recorded from the previous build on the same machine.
      name: 'cafetton-parity',
      use: {
        ...devices['Desktop Chrome'],
        ...chromiumLoopbackLaunchOptions,
      },
      testMatch: '**/cafetton-shell-parity.spec.ts',
      snapshotPathTemplate: '.playwright-baselines/{projectName}/{arg}{ext}',
    },
    {
      name: 'setup',
      testMatch: '**/fixtures/auth.setup.ts',
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        ...chromiumLoopbackLaunchOptions,
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
      },
      dependencies: ['setup'],
      testMatch: '**/*.spec.ts', // all specs run on mobile too
    },
  ],
})
