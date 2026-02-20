/**
 * orders.spec.ts — Módulo de órdenes (placeholder)
 *
 * QA Agent: Actualizar cuando se conecte el módulo de pagos real.
 * Por ahora cubre que la página existe, es accesible y muestra el placeholder.
 */

import { test, expect } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test.describe('Órdenes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')
  })

  test('muestra el heading Órdenes', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Órdenes' })).toBeVisible()
  })

  test('muestra los headers de la tabla', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'Número de orden' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Fecha de compra' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Evento' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Monto' })).toBeVisible()
  })

  test('muestra mensaje de módulo próximamente', async ({ page }) => {
    await expect(page.getByText(/próximamente/i)).toBeVisible()
  })

  test('la página no muestra errores', async ({ page }) => {
    await expect(page.locator('[data-testid="error"]')).not.toBeVisible()
    await expect(page.getByText(/Error/i)).not.toBeVisible()
  })
})
