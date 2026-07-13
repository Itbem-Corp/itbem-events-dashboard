import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

async function firstEventHref(page: import('@playwright/test').Page) {
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()

  const links = page.locator('a[href^="/events/"]')
  await expect.poll(() => links.count(), { message: 'waiting for the paginated event list' }).toBeGreaterThan(0)
  for (let index = 0; index < (await links.count()); index += 1) {
    const href = await links.nth(index).getAttribute('href')
    if (href && /^\/events\/[^/?#]+$/.test(href)) return href
  }
  throw new Error('No event was available for the check-in test')
}

test('precarga lista y estados antes de entrar desde el detalle', async ({ page }, testInfo) => {
  const eventHref = await firstEventHref(page)
  const eventId = eventHref.split('/')[2]
  await page.goto(eventHref)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const legacyRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes(`/guests/checkin:${eventId}`) || request.url().endsWith('/catalogs/guest-statuses')) {
      legacyRequests.push(request.url())
    }
  })
  const workspaceRequest = page.waitForRequest((request) =>
    request.url().endsWith(`/events/${eventId}/checkin-workspace`)
  )
  const checkin = page.getByRole('link', { name: 'Check-in' })
  await checkin.focus()
  await workspaceRequest
  expect(legacyRequests).toEqual([])
  const startedAt = performance.now()
  await checkin.click()

  await expect(page.getByRole('searchbox', { name: 'Buscar invitado por nombre o mesa' })).toBeVisible()
  const durationMs = performance.now() - startedAt
  const budgetMs = testInfo.project.name === 'mobile' ? 1_500 : 750
  expect(durationMs, `Check-in tardÃ³ ${Math.round(durationMs)}ms en mostrar operaciÃ³n`).toBeLessThan(budgetMs)
})

test('precarga cámara por intención y restaura el foco al cerrar', async ({ page }) => {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      (message.text().includes('[QRScanner]') || message.text().includes('[ErrorBoundary]'))
    ) {
      consoleErrors.push(message.text())
    }
  })
  const eventHref = await firstEventHref(page)
  await page.goto(`${eventHref}/checkin`)

  const checkin = page.getByRole('main')
  await expect(checkin.getByRole('searchbox', { name: 'Buscar invitado por nombre o mesa' })).toBeVisible()

  const scannerButton = checkin.getByRole('button', { name: 'Escanear QR' })
  await expect(scannerButton).toBeEnabled()
  await scannerButton.focus()
  await expect(scannerButton).toBeFocused()

  await scannerButton.click()
  const scannerDialog = page.getByRole('dialog', { name: 'Escanear QR del invitado' })
  await expect(scannerDialog.or(page.getByRole('heading', { name: 'Algo salió mal' }))).toBeVisible()
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
  await expect(scannerDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(scannerDialog).not.toBeVisible()
  await expect(scannerButton).toBeFocused()
})

test('mantiene búsqueda y comunica el modo offline sin permitir cambios', async ({ page, context }) => {
  const eventHref = await firstEventHref(page)
  await page.goto(`${eventHref}/checkin`)

  const search = page.getByRole('searchbox', { name: 'Buscar invitado por nombre o mesa' })
  await expect(search).toBeVisible()
  await expect(page.getByText(/\d+ invitado/)).toBeVisible()
  await search.fill('invitado-que-no-existe-987654')
  await expect(search).toHaveValue('invitado-que-no-existe-987654')
  await expect(page.getByText('Ningún invitado coincide con la búsqueda.')).toBeVisible()

  const expectedFilter = page.getByRole('button', { name: /Esperados/ })
  await expectedFilter.click()
  await expect(expectedFilter).toHaveAttribute('aria-pressed', 'true')

  await context.setOffline(true)
  await expect(page.getByRole('status')).toContainText('Sin conexión')
  await expect(page.getByRole('button', { name: 'Escanear QR' })).toBeDisabled()
  await expect(search).toBeDisabled()
  await expect(page.getByText('Sin conexión · cambios pausados')).toBeVisible()

  await context.setOffline(false)
  await expect(page.getByText('Sin conexión · cambios pausados')).not.toBeVisible()
})
