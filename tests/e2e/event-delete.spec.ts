import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test('elimina un evento desde el portafolio y actualiza la lista sin recargar', async ({ page }) => {
  const event = {
    id: 'delete-contract-event',
    name: 'Evento para eliminar',
    identifier: 'evento-para-eliminar',
    is_active: true,
    event_date_time: '2026-08-15T18:00:00-06:00',
    timezone: 'America/Mexico_City',
    max_guests: 100,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
  const rollbackEvent = { ...event, id: 'rollback-contract-event', name: 'Evento para restaurar' }
  const deletedIds = new Set<string>()
  let deleteRequests = 0

  await page.route(/localhost:8080\/api\/events(?:\?.*)?$/, (route) => {
    const items = [event, rollbackEvent].filter((item) => !deletedIds.has(item.id))
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        data: {
          data: items,
          total: items.length,
          page: 1,
          page_size: 12,
          total_pages: 1,
          counts: { all: items.length, upcoming: items.length, today: 0, past: 0 },
        },
      }),
    })
  })
  await page.route('**/api/moments/summary?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: [] }) })
  )
  await page.route('**/api/events/*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    deleteRequests += 1
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const eventId = new URL(route.request().url()).pathname.split('/').at(-1)!
    if (eventId === rollbackEvent.id) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 500, message: 'Falla simulada' }),
      })
    }
    deletedIds.add(eventId)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200 }) })
  })

  await page.goto('/events')
  await expect(page.getByRole('link', { name: event.name, exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Más acciones para Evento para eliminar/i }).click()
  await page.getByRole('menuitem', { name: 'Eliminar evento' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('dejará de estar disponible públicamente')
  const startedAt = await page.evaluate(() => performance.now())
  await dialog.getByRole('button', { name: 'Eliminar evento' }).evaluate((button: HTMLButtonElement) => button.click())

  await expect(page.getByRole('link', { name: event.name, exact: true })).not.toBeVisible()
  const latency = await page.evaluate((start) => performance.now() - start, startedAt)
  expect(latency).toBeLessThan(400)
  expect(deleteRequests).toBe(1)

  await expect(page.getByRole('link', { name: 'Evento para restaurar', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /acciones para Evento para restaurar/i }).click()
  await page.getByRole('menuitem', { name: 'Eliminar evento' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar evento' }).evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.getByRole('link', { name: 'Evento para restaurar', exact: true })).not.toBeVisible()
  await expect.poll(() => deleteRequests).toBe(2)
  await expect(page.getByRole('link', { name: 'Evento para restaurar', exact: true })).toBeVisible({ timeout: 3000 })
})
