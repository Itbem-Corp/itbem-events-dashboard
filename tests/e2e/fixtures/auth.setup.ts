/**
 * auth.setup.ts — Shared login fixture
 *
 * Runs once before all tests. Logs in through the custom dashboard BFF,
 * which uses Cognito as its identity engine, and saves
 * cookies/localStorage to .auth/session.json so all specs reuse the
 * session without re-authenticating.
 *
 * Prerequisites:
 *   - App running at the configured project baseURL (npm run dev)
 *   - TEST_EMAIL and TEST_PASSWORD set in .env.local
 *   - User exists in Cognito staging pool
 */

import { test as setup, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { assertStorageStateTarget } from './auth-state-target'
import { localAuthTargets, requireEphemeralIDToken } from './local-auth'
import { AUTH_COOKIE_NAMES } from '../../../src/lib/auth-session'

// dotenvx intercepts dotenv.config() and doesn't actually set process.env.
// Bypass it by reading the file directly and assigning vars manually.
const envPath = path.join(process.cwd(), '.env.local')
if (!process.env.E2E_ID_TOKEN?.trim()) {
  try {
    const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'))
    for (const [key, val] of Object.entries(parsed)) {
      if (!process.env[key]) process.env[key] = val
    }
  } catch { /* .env.local not found — vars must be set externally */ }
}

const authFile = path.join(__dirname, '../.auth/session.json')

setup.setTimeout(60_000)

setup('authenticate', async ({ page, request }, testInfo) => {
  if (process.env.E2E_ID_TOKEN?.trim()) {
    const targets = localAuthTargets(process.env.PLAYWRIGHT_BASE_URL, process.env.E2E_BACKEND_URL)
    const configuredOrigin = new URL(String(testInfo.project.use.baseURL)).origin
    if (configuredOrigin !== targets.dashboard.origin) throw new Error('Ephemeral identity project origin mismatch')
    const token = requireEphemeralIDToken(process.env.E2E_ID_TOKEN)
    const response = await request.get(new URL('/api/session', targets.backend).toString(), {
      headers: { Authorization: `Bearer ${token}` },
      maxRedirects: 0,
    })
    // Do not attach the request or token to an assertion failure/report.
    const status = response.status()
    await response.dispose()
    if (status !== 200) throw new Error(`Ephemeral backend identity rejected (${status})`)
    await page.context().addCookies([{
      name: AUTH_COOKIE_NAMES.session, value: token, url: targets.dashboard.origin,
      httpOnly: true, secure: targets.dashboard.protocol === 'https:', sameSite: 'Lax',
    }])
    await page.goto('/automation')
    await expect(page.getByRole('heading', { name: 'Centro de automatización' })).toBeVisible()
    const storageState = await page.context().storageState()
    assertStorageStateTarget(storageState, configuredOrigin)
    await page.context().storageState({ path: authFile })
    return
  }
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
  // Keep this bound to the actual project baseURL. The default authenticated
  // suite is EventiApp on localhost:3000; ITBEM suites must opt into their
  // isolated dashboard.itbem.localhost:3017 project explicitly.
  const configuredOrigin = new URL(String(testInfo.project.use.baseURL || 'http://localhost:3000')).origin
  await page.waitForURL((url) => url.origin === configuredOrigin && url.pathname !== '/login', { timeout: 15_000 })
  await expect(page).not.toHaveURL(/\/login(?:$|\?)/)

  await page.waitForFunction(async () => {
    const response = await fetch('/api/auth/token', { method: 'POST', cache: 'no-store' })
    return response.ok
  }, undefined, { timeout: 15_000 })

  // Validate before writing. A stale session from another local tenant must
  // never become the shared state consumed by all authenticated specs.
  const storageState = await page.context().storageState()
  assertStorageStateTarget(storageState, configuredOrigin)
  await page.context().storageState({ path: authFile })
})
