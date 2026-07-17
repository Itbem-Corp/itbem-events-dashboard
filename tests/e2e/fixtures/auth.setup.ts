/**
 * auth.setup.ts — Shared login fixture
 *
 * Runs once before all tests. Logs in through the custom dashboard BFF,
 * which uses Cognito as its identity engine, and saves
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
import fs from 'fs'
import dotenv from 'dotenv'

// dotenvx intercepts dotenv.config() and doesn't actually set process.env.
// Bypass it by reading the file directly and assigning vars manually.
const envPath = path.join(process.cwd(), '.env.local')
try {
  const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'))
  for (const [key, val] of Object.entries(parsed)) {
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* .env.local not found — vars must be set externally */ }

const authFile = path.join(__dirname, '../.auth/session.json')

setup.setTimeout(60_000)

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD

  if (!email || !password) {
    throw new Error(
      'TEST_EMAIL and TEST_PASSWORD must be set in .env.local\n' +
      'Create a test user in Cognito staging and add credentials.'
    )
  }

  // The product owns the form; credentials are submitted server-side to the
  // dedicated Cognito client selected by hostname.
  await page.goto('/login')
  await page.getByRole('textbox', { name: /correo|email/i }).fill(email)
  await page.getByLabel(/contraseña|password/i).fill(password)
  await page.getByRole('button', { name: /iniciar sesión|acceder|sign in/i }).click()

  // Wait for Cognito authentication, application-access verification and app load.
  await page.waitForURL('http://localhost:3000/**', { timeout: 15_000 })
  await expect(page).not.toHaveURL(/login/)

  await page.waitForFunction(() => {
    const persisted = window.localStorage.getItem('eventi-storage')
    if (!persisted) return false
    try {
      const state = JSON.parse(persisted)?.state
      return Boolean(state?.user && (state.user.is_root || state.currentClient?.id))
    } catch {
      return false
    }
  }, undefined, { timeout: 15_000 })

  // Save auth state — reused by all test specs
  await page.context().storageState({ path: authFile })
})
