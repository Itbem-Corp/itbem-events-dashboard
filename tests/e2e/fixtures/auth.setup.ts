/**
 * auth.setup.ts — Shared login fixture
 *
 * Runs once before all tests. Logs in via Cognito hosted UI and saves
 * cookies/localStorage to .auth/session.json so all specs reuse the
 * session without re-authenticating.
 *
 * Prerequisites:
 *   - App running at http://localhost:3000 (npm run dev)
 *   - TEST_EMAIL and TEST_PASSWORD set in .env.local
 *   - User exists in Cognito staging pool
 */

import { test as setup, expect } from '@playwright/test'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const authFile = path.join(__dirname, '../.auth/session.json')

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD

  if (!email || !password) {
    throw new Error(
      'TEST_EMAIL and TEST_PASSWORD must be set in .env.local\n' +
      'Create a test user in Cognito staging and add credentials.'
    )
  }

  // Navigate to login — app redirects to Cognito hosted UI
  await page.goto('/login')

  // Wait for Cognito hosted UI redirect
  await page.waitForURL(/stagingauth\.eventiapp\.com\.mx/, { timeout: 10_000 })

  // Fill Cognito hosted UI (standard selectors)
  await page.fill('#signInFormUsername', email)
  await page.fill('#signInFormPassword', password)
  await page.click('[name="signInSubmitButton"]')

  // Wait for OAuth callback and app load
  await page.waitForURL('http://localhost:3000/**', { timeout: 15_000 })
  await expect(page).not.toHaveURL(/login/)

  // Save auth state — reused by all test specs
  await page.context().storageState({ path: authFile })
})
