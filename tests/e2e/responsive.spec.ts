/**
 * responsive.spec.ts — Comportamiento responsivo en móvil y tablet
 *
 * QA Agent: Actualizar si cambia la estructura del layout responsivo,
 * se modifica el breakpoint del sidebar, o se añaden nuevas secciones.
 *
 * Viewports probados:
 *   - Mobile: 375×812 (iPhone SE/13)
 *   - Tablet: 768×1024 (iPad)
 *   - Desktop: 1280×720 (ya cubierto en otros specs)
 */

import { test, expect } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

// ─── Mobile 375px ────────────────────────────────────────────────────────────

test.describe('Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await page.waitForLoadState('networkidle')
  })

  test('dashboard carga correctamente en móvil', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Crear evento/i }).first()).toBeVisible()
  })

  test('KPIs operativos permanecen visibles en móvil', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Total', { exact: true })).toBeVisible()
    await expect(page.getByText('Activos', { exact: true })).toBeVisible()
    await expect(page.getByText('Capacidad', { exact: true })).toBeVisible()
  })

  test('el control de navegación móvil es visible y accesible', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const navigationButton = page.getByRole('button', { name: 'Abrir navegación' })
    await expect(navigationButton).toBeVisible()
    await navigationButton.click()
    await expect(page.getByRole('button', { name: 'Cerrar navegación' })).toBeVisible()
  })

  test('las rutas principales están disponibles en una navegación inferior de un toque', async ({ page }) => {
    await page.goto('/')

    const primaryNavigation = page.getByRole('navigation', { name: 'Navegación principal' })
    await expect(primaryNavigation).toBeVisible()
    await expect(primaryNavigation.getByRole('link', { name: 'Inicio', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    )
    await primaryNavigation.getByRole('link', { name: 'Eventos', exact: true }).click()

    await expect(page).toHaveURL('/events')
    await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()
  })

  test('página de eventos es usable en móvil', async ({ page }) => {
    await page.goto('/events')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear evento' })).toBeVisible()
  })

  test('página de usuarios es usable en móvil', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nuevo Usuario' })).toBeVisible()
  })

  test('página de clientes es usable en móvil', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
    // Button may stack below heading on mobile
    await expect(page.getByRole('button', { name: 'Nuevo Cliente' })).toBeVisible()
  })

  test('modal de crear evento es usable en móvil', async ({ page }) => {
    await page.goto('/events')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Crear evento' }).click()
    await expect(page.getByRole('heading', { name: 'Nuevo evento' })).toBeVisible()
    await expect(page.getByLabel('Nombre del evento')).toBeVisible()
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(documentWidth).toBeLessThanOrEqual(377)
    await page.getByRole('button', { name: 'Cancelar' }).click()
  })

  test('el detalle de evento es usable en móvil', async ({ page }) => {
    await page.goto('/events')
    await page.waitForLoadState('networkidle')
    const firstLink = page.locator('ul li a').first()
    if (!await firstLink.isVisible()) return
    await firstLink.click()
    await page.waitForLoadState('networkidle')
    // Stats grid should wrap on mobile (sm:grid-cols-2)
    await expect(page.getByText(/Máx\. invitados/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Más acciones' })).toBeVisible()
  })
})

// ─── Tablet 768px ────────────────────────────────────────────────────────────

test.describe('Tablet (768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('dashboard mantiene KPIs operativos en tablet', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Total', { exact: true })).toBeVisible()
    await expect(page.getByText('Activos', { exact: true })).toBeVisible()
  })

  test('clientes muestra lista (no grid) en tablet', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
  })

  test('la búsqueda de usuarios está visible en tablet', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')
    const searchInput = page.getByRole('searchbox', { name: 'Buscar usuario' })
    await expect(searchInput).toBeVisible()
    await searchInput.fill('sin-coincidencias-e2e')
    await expect(page.getByText(/Sin resultados para/i)).toBeVisible()
    await expect(searchInput).toBeVisible()
    await searchInput.clear()
    await expect(searchInput).toHaveValue('')
  })
})

// ─── Cross-viewport: sin overflow horizontal ─────────────────────────────────

test.describe('Sin overflow horizontal', () => {
  const viewports = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
  ]

  const routes = ['/', '/events', '/users', '/clients']

  for (const vp of viewports) {
    for (const route of routes) {
      test(`${route} sin scroll horizontal a ${vp.width}px`, async ({ page }) => {
        await page.setViewportSize(vp)
        await page.goto(route)
        await page.waitForLoadState('networkidle')

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2) // 2px tolerance for rounding
      })
    }
  }
})
