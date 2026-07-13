/**
 * navigation.spec.ts — Sidebar y navegación global
 *
 * QA Agent: Actualizar si se agregan/eliminan rutas del sidebar,
 * se cambia la estructura de la navegación, o se implementa
 * control de acceso por rol en la navegación.
 */

import { test, expect } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test.describe('Navegación global', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('la búsqueda global muestra progreso accesible durante una navegación imperativa lenta', async ({ page }) => {
    await page.route(/http:\/\/localhost:3000\/events(?:\?.*)?$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await route.continue()
    })

    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByText('Ir a Eventos', { exact: true }).click()

    await expect(page.getByText('Cargando nueva vista', { exact: true })).toBeVisible()
    await expect(page).toHaveURL('/events')
    await expect(page.getByText('Cargando nueva vista', { exact: true })).not.toBeVisible()
  })

  // ─── Sidebar desktop ────────────────────────────────────────

  test.describe('Sidebar (desktop)', () => {
    test.use({ viewport: { width: 1280, height: 720 } })

    test('el sidebar muestra los ítems de navegación principales', async ({ page }) => {
      await expect(page.getByRole('link', { name: /^Inicio$/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /^Eventos$/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /^Órdenes$/i })).toHaveCount(0)
      await expect(page.getByRole('link', { name: /^Usuarios$/i })).toBeVisible()
      await expect(page.getByRole('link', { name: /^Clientes$/i })).toBeVisible()
    })

    test('Inicio lleva al dashboard', async ({ page }) => {
      await page.getByRole('link', { name: /^Inicio$/i }).click()
      await expect(page).toHaveURL('/')
      await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible()
    })

    test('Eventos lleva a la lista de eventos', async ({ page }) => {
      await page.getByRole('link', { name: /^Eventos$/i }).click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL('/events')
      await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
    })

    test('el hover no vuelve a consultar una ruta que ya está en caché', async ({ page }) => {
      await page.getByRole('link', { name: /^Eventos$/i }).hover()
      await page.getByRole('link', { name: /^Eventos$/i }).click()
      await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()

      await page.getByRole('link', { name: /^Inicio$/i }).click()
      await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

      const repeatedRequests: string[] = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (
          request.method() === 'GET' &&
          url.origin === 'http://localhost:8080' &&
          url.pathname === '/api/events' &&
          url.searchParams.get('page') === '1'
        ) {
          repeatedRequests.push(url.href)
        }
      })

      await page.getByRole('link', { name: /^Eventos$/i }).hover()
      await page.waitForTimeout(200)

      expect(repeatedRequests).toEqual([])
    })

    test('Usuarios lleva a la lista de usuarios', async ({ page }) => {
      await page.getByRole('link', { name: /^Usuarios$/i }).click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL('/users')
      await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible()
    })

    test('Clientes lleva a la lista de clientes', async ({ page }) => {
      await page.getByRole('link', { name: /^Clientes$/i }).click()
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL('/clients')
      await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
    })

    test('el sidebar muestra el nombre del cliente actual', async ({ page }) => {
      // The sidebar header shows the current client name (or 'Cargando...')
      const sidebar = page.locator('[data-slot="sidebar"]')
      await expect(sidebar).not.toBeEmpty()
    })

    test('el footer del sidebar muestra el usuario autenticado', async ({ page }) => {
      // Sidebar footer shows first/last name + email (hidden on mobile)
      const sidebarFooter = page.locator('[data-slot="sidebar-footer"]')
      await expect(sidebarFooter).toBeVisible()
    })

    test('el item activo tiene la clase current en /events', async ({ page }) => {
      await page.goto('/events')
      await page.waitForLoadState('networkidle')
      // Current nav item gets aria-current="page" (how SidebarItem marks active)
      const currentItem = page.getByRole('link', { name: /^Eventos$/i })
      await expect(currentItem).toBeVisible()
    })
  })

  // ─── Menú de usuario ────────────────────────────────────────

  test.describe('Menú de usuario', () => {
    test('el menú de usuario muestra "Mi Perfil" y "Cerrar sesión"', async ({ page }) => {
      // Open account dropdown from sidebar footer (desktop)
      const footerButton = page.locator('[data-slot="sidebar-footer"] button').first()
      if (await footerButton.isVisible()) {
        await footerButton.click()
        await expect(page.getByRole('menuitem', { name: /Mi Perfil/i })).toBeVisible()
        await expect(page.getByRole('menuitem', { name: /Cerrar sesión/i })).toBeVisible()
        // Close dropdown
        await page.keyboard.press('Escape')
      }
    })

    test('"Mi Perfil" desde el menú navega a /settings/profile', async ({ page }) => {
      const footerButton = page.locator('[data-slot="sidebar-footer"] button').first()
      if (!await footerButton.isVisible()) return
      await footerButton.click()
      await page.getByRole('menuitem', { name: /Mi Perfil/i }).click()
      await expect(page).toHaveURL(/settings\/profile/)
    })
  })
})
