import { defineConfig, devices } from '@playwright/test'

const ephemeralLocalAuth = !!process.env.E2E_ID_TOKEN?.trim()

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
      },
      testMatch: '**/role-capability-matrix.spec.ts',
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
