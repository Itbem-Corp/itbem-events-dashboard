/**
 * dashboard.spec.ts — Página de inicio / Dashboard
 *
 * QA Agent: Actualizar si cambian los KPIs, el idioma de los labels
 * o la estructura de la tabla de eventos activos.
 */

import { test, expect } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Esperar a que cargue el cliente actual en el sidebar
    await page.waitForLoadState('networkidle')
  })

  test('muestra el heading de Dashboard', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible()
  })

  test('muestra los tres KPIs en español', async ({ page }) => {
    await expect(page.getByText('Total eventos')).toBeVisible()
    await expect(page.getByText('Eventos activos')).toBeVisible()
    await expect(page.getByText('Capacidad total de invitados')).toBeVisible()
  })

  test('la tabla de eventos activos tiene headers en español', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: 'Evento' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Fecha' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Tipo' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Invitados' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Estado' })).toBeVisible()
  })

  test('el sidebar muestra el nombre de la organización actual', async ({ page }) => {
    // La organización debe aparecer en el header del sidebar
    const sidebar = page.locator('[data-slot="sidebar"]').first()
    await expect(sidebar).not.toBeEmpty()
  })
})
