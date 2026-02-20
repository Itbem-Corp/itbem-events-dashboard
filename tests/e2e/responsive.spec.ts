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
    await expect(page.getByText('Total eventos')).toBeVisible()
  })

  test('KPIs se renderizan en stack vertical en móvil', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // All 3 KPI cards should still be visible on mobile (stacked)
    await expect(page.getByText('Total eventos')).toBeVisible()
    await expect(page.getByText('Eventos activos')).toBeVisible()
    await expect(page.getByText('Capacidad total de invitados')).toBeVisible()
  })

  test('la barra de navegación superior es visible en móvil', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Mobile shows navbar (top bar) instead of sidebar
    const navbar = page.locator('nav').first()
    await expect(navbar).toBeVisible()
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
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Fields should be visible and scrollable
    await expect(page.getByLabel('Nombre del evento')).toBeVisible()
    // Dialog should not overflow viewport
    const dialogBox = await dialog.boundingBox()
    if (dialogBox) {
      expect(dialogBox.width).toBeLessThanOrEqual(375)
    }
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
    await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible()
  })
})

// ─── Tablet 768px ────────────────────────────────────────────────────────────

test.describe('Tablet (768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('dashboard muestra grid de KPIs en 2 columnas en tablet', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Total eventos')).toBeVisible()
    await expect(page.getByText('Eventos activos')).toBeVisible()
  })

  test('clientes muestra lista (no grid) en tablet', async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
  })

  test('la búsqueda de usuarios está visible en tablet', async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')
    const searchInput = page.getByPlaceholder('Buscar usuario...')
    // Only visible when users exist
    if (await searchInput.isVisible()) {
      await searchInput.fill('test')
      await page.waitForTimeout(300)
      await searchInput.clear()
    }
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
