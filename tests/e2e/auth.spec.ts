/**
 * auth.spec.ts — Flujo de autenticación
 *
 * QA Agent: Actualizar si cambia el flujo de login/logout,
 * se agregan métodos de auth (MFA, SSO, etc.), o se modifican
 * las reglas de redirección de rutas protegidas.
 */

import { test, expect } from '@playwright/test'

// ─────────────────────────────────────────────────────────────
// Sin sesión — flujo de redirección
// ─────────────────────────────────────────────────────────────
test.describe('Auth sin sesión', () => {
  test('redirige a login si no hay sesión', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/login/)
  })

  test('página de login muestra el botón de acceso', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('link', { name: /Iniciar sesión|Sign in|Acceder/i })).toBeVisible()
  })

  test('/logout redirige al login', async ({ page }) => {
    await page.goto('/logout')
    await expect(page).toHaveURL(/login|localhost:3000\/$/)
  })
})

// ─────────────────────────────────────────────────────────────
// Rutas protegidas sin sesión — todas deben redirigir
// ─────────────────────────────────────────────────────────────
test.describe('Rutas protegidas sin sesión', () => {
  const protectedRoutes = ['/users', '/clients', '/events', '/settings']

  for (const route of protectedRoutes) {
    test(`${route} redirige a login`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/login/, { timeout: 8000 })
    })
  }
})

// ─────────────────────────────────────────────────────────────
// Con sesión — flujo de logout real desde la UI
// ─────────────────────────────────────────────────────────────
test.describe('Auth autenticado', () => {
  test.use({ storageState: 'tests/e2e/.auth/session.json' })

  test('logout desde el menú del sidebar limpia la sesión', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Click en el menú de usuario (sidebar footer o navbar) y luego en "Cerrar sesión"
    const logoutLink = page.getByText('Cerrar sesión')
    if (!await logoutLink.isVisible()) {
      // Intenta abrir el dropdown del usuario primero
      await page.locator('[data-slot="sidebar-footer"] button').first().click().catch(() => {})
      await page.locator('.navbar button').last().click().catch(() => {})
    }

    await logoutLink.click()
    await expect(page).toHaveURL(/login/, { timeout: 10000 })
  })

  test('usuario autenticado puede acceder al dashboard', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveURL(/login/)
    await expect(page.getByRole('heading', { name: /inicio|dashboard/i })).toBeVisible()
  })
})
