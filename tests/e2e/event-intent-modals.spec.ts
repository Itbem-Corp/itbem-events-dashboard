import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

async function hasResource(page: import('@playwright/test').Page, pattern: RegExp) {
  return page.evaluate(
    (source) => performance.getEntriesByType('resource').some((entry) => new RegExp(source, 'i').test(entry.name)),
    pattern.source
  )
}

test.describe('Modales de evento bajo intención', () => {
  test('precarga, abre y cancela creación y duplicación sin mutar datos', async ({ page }) => {
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()

    expect(await hasResource(page, /event-form-modal/)).toBe(false)
    expect(await hasResource(page, /event-duplicate-modal/)).toBe(false)

    const formCatalogRequests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.endsWith('/event-types')) formCatalogRequests.push(url.href)
      if (url.pathname.endsWith('/clients') && url.searchParams.get('page_size') === '25') formCatalogRequests.push(url.href)
    })

    const createEvent = page.getByRole('button', { name: 'Crear evento' })
    await createEvent.focus()
    await expect(createEvent).toBeFocused()
    await expect.poll(() => hasResource(page, /event-form-modal/)).toBe(true)
    await expect.poll(() => formCatalogRequests.some((url) => new URL(url).pathname.endsWith('/event-types'))).toBe(true)
    await page.waitForLoadState('networkidle')
    const catalogRequestCountBeforeOpen = formCatalogRequests.length
    await page.keyboard.press('Enter')

    const createTitle = page.getByRole('heading', { name: 'Nuevo evento' })
    await expect(createTitle).toBeVisible()
    await expect(page.getByLabel('Nombre del evento')).toBeVisible()
    await expect(page.getByLabel('Organización')).toBeVisible()
    await expect(page.getByLabel('Tipo de evento')).toBeVisible()
    await page.waitForTimeout(250)
    expect(formCatalogRequests).toHaveLength(catalogRequestCountBeforeOpen)

    let dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 2)

    await page.keyboard.press('Escape')
    await expect(createTitle).not.toBeVisible()
    await expect(createEvent).toBeFocused()

    const eventActions = page.getByRole('button', { name: /Más acciones para/i }).first()
    await expect(eventActions).toBeVisible()
    await eventActions.focus()
    await expect.poll(() => hasResource(page, /event-list-actions-menu/)).toBe(true)
    expect(await hasResource(page, /event-duplicate-modal/)).toBe(false)
    await page.keyboard.press('Enter')

    const duplicateAction = page.getByRole('menuitem', { name: 'Duplicar evento' }).first()
    await expect(duplicateAction).toBeVisible()
    await duplicateAction.focus()
    await expect.poll(() => hasResource(page, /event-duplicate-modal/)).toBe(true)
    await duplicateAction.click()

    const duplicateTitle = page.getByRole('heading', { name: 'Duplicar evento' })
    await expect(duplicateTitle).toBeVisible()
    await expect(page.getByLabel('Nombre del nuevo evento')).toHaveValue(/\(copia\)$/)
    await expect(page.getByLabel('Fecha y hora')).not.toHaveValue('')

    dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 2)

    await page.keyboard.press('Escape')
    await expect(duplicateTitle).not.toBeVisible()
    await expect(duplicateAction).toBeFocused()
  })

  test('busca organizaciones remotamente al crear un evento sin descargar el catálogo completo', async ({ page }) => {
    const clients = Array.from({ length: 80 }, (_, index) => ({
      id: `event-client-${index + 1}`,
      name: `Event Org ${String(index + 1).padStart(2, '0')}`,
      code: `event-org-${index + 1}`,
      client_type_id: 'agency-type',
      client_type: { id: 'agency-type', code: 'AGENCY', name: 'Agencia' },
    }))
    const clientRequests: string[] = []

    await page.route(/localhost:8080\/api\/clients(?:\?.*)?$/, (route) => {
      const url = new URL(route.request().url())
      clientRequests.push(url.search)
      const pageSize = Number(url.searchParams.get('page_size') ?? clients.length)
      const query = (url.searchParams.get('search') ?? '').toLowerCase()
      const matches = clients.filter((client) => client.name.toLowerCase().includes(query))

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 200,
          data: {
            data: matches.slice(0, pageSize),
            total: matches.length,
            page: 1,
            page_size: pageSize,
            total_pages: Math.max(Math.ceil(matches.length / pageSize), 1),
          },
        }),
      })
    })

    await page.goto('/events')
    await page.getByRole('button', { name: 'Crear evento' }).click()
    const organization = page.getByRole('combobox', { name: /Organizaci/ }).first()
    await expect(organization).toBeVisible()
    expect(clientRequests).toContain('?page=1&page_size=25')
    expect(clientRequests).not.toContain('')

    await organization.fill('Event Org 80')
    await expect.poll(() => clientRequests.some((request) => request.includes('search=Event+Org+80'))).toBe(true)
    await expect(page.getByRole('option', { name: 'Event Org 80' })).toBeVisible()
    await page.getByRole('option', { name: 'Event Org 80' }).click()
    await expect(organization).toHaveValue('Event Org 80')
  })
})
