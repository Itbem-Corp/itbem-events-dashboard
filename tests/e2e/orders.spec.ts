import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test.describe('Rutas heredadas de órdenes', () => {
  test('/orders redirige al módulo operativo de eventos', async ({ page }) => {
    await page.goto('/orders')
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/\/events$/)
    await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
  })

  test('/orders/[id] también redirige sin mostrar una acción de reembolso falsa', async ({ page }) => {
    await page.goto('/orders/legacy-order-id')
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/\/events$/)
    await expect(page.getByText(/refund payment/i)).toHaveCount(0)
  })
})
