import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test('elimina usuarios al instante y revierte si falla la red', async ({ page }) => {
  const users = [
    {
      id: 'user-1',
      email: 'ana@example.test',
      first_name: 'Ana',
      last_name: 'Uno',
      is_active: true,
      is_root: false,
      clients: 0,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'user-2',
      email: 'beto@example.test',
      first_name: 'Beto',
      last_name: 'Dos',
      is_active: true,
      is_root: false,
      clients: 0,
      created_at: '2026-01-01T00:00:00Z',
    },
  ]
  let deleteWrites = 0

  await page.route('**/api/users/all?*', (route) => {
    const url = new URL(route.request().url())
    const search = (url.searchParams.get('search') ?? '').toLowerCase()
    const matches = users.filter((user) => `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(search))
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        data: { data: matches, total: matches.length, page: 1, page_size: 10, total_pages: 1 },
      }),
    })
  })
  await page.route('**/api/users/user-*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    deleteWrites += 1
    await new Promise((resolve) => setTimeout(resolve, 1500))
    if (deleteWrites === 2) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 500, message: 'Falla simulada' }),
      })
    }
    users.splice(0, 1)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200 }) })
  })

  await page.goto('/users')
  await expect(page.getByText('Ana Uno', { exact: true })).toBeVisible()
  await expect(page.getByRole('switch').first()).toBeVisible()
  await expect(page.getByLabel('Cargando control de acceso')).toHaveCount(0)

  await page.getByRole('button', { name: /acciones para Ana Uno/i }).click()
  await page.getByRole('menuitem', { name: 'Eliminar usuario' }).click()
  const startedAt = await page.evaluate(() => performance.now())
  await page.getByTestId('confirm-delete-user').evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.getByText('Ana Uno', { exact: true })).not.toBeVisible()
  const latency = await page.evaluate((start) => performance.now() - start, startedAt)
  expect(latency).toBeLessThan(400)
  await expect(page.getByText('Usuario eliminado')).toBeVisible({ timeout: 3000 })

  await page.getByRole('button', { name: /acciones para Beto Dos/i }).click()
  await page.getByRole('menuitem', { name: 'Eliminar usuario' }).click()
  await page.getByTestId('confirm-delete-user').evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.getByText('Beto Dos', { exact: true })).not.toBeVisible()
  await expect.poll(() => deleteWrites).toBe(2)
  await expect(page.getByText('Beto Dos', { exact: true })).toBeVisible({ timeout: 3000 })
})
