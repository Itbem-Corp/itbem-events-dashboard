import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

async function firstEvent(page: import('@playwright/test').Page) {
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()

  const links = page.locator('a[href^="/events/"]')
  await expect.poll(() => links.count(), { message: 'waiting for the paginated event list' }).toBeGreaterThan(0)
  for (let index = 0; index < (await links.count()); index += 1) {
    const link = links.nth(index)
    const href = await link.getAttribute('href')
    if (href && /^\/events\/[^/?#]+$/.test(href)) {
      return { href, name: (await link.innerText()).trim() }
    }
  }

  throw new Error('No event detail link was available for the loading-boundary test')
}

async function hasResource(page: import('@playwright/test').Page, pattern: RegExp) {
  return page.evaluate(
    (source) => performance.getEntriesByType('resource').some((entry) => new RegExp(source, 'i').test(entry.name)),
    pattern.source
  )
}

test('difiere configuración y precarga paneles desde la intención', async ({ page }) => {
  const event = await firstEvent(page)
  const apiRequests: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.includes('/api/')) apiRequests.push(path)
  })

  await page.goto(event.href)
  await expect(page.getByRole('heading', { name: event.name })).toBeVisible()

  expect(apiRequests.some((path) => /\/events\/[^/]+\/config$/.test(path))).toBe(false)
  expect(await hasResource(page, /event-detail-actions-menu/)).toBe(false)

  const moreActions = page.getByRole('button', { name: 'Más acciones' })
  await moreActions.focus()
  await expect.poll(() => hasResource(page, /event-detail-actions-menu/)).toBe(true)

  const moments = page.getByRole('tab', { name: /Momentos/i })
  await moments.focus()
  await expect.poll(() => hasResource(page, /moments-wall/)).toBe(true)
  expect(apiRequests.some((path) => /\/events\/[^/]+\/config$/.test(path))).toBe(false)

  await page.keyboard.press('Enter')
  await expect(moments).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/tab=momentos/)

  const studio = page.getByRole('link', { name: 'Studio' })
  const legacyStudioRequestsBeforeIntent = apiRequests.filter((path) => /\/events\/[^/]+\/(?:detail|sections)$/.test(path)).length
  await studio.focus()
  await expect.poll(() => apiRequests.some((path) => /\/events\/[^/]+\/studio-workspace$/.test(path))).toBe(true)
  expect(apiRequests.filter((path) => /\/events\/[^/]+\/(?:detail|sections)$/.test(path))).toHaveLength(legacyStudioRequestsBeforeIntent)
  await expect.poll(() => hasResource(page, /draggable-section-list/)).toBe(true)

  const startedAt = performance.now()
  await studio.click()
  await expect(page.getByText(event.name, { exact: true })).toBeVisible()
  const durationMs = performance.now() - startedAt
  expect(durationMs, `Studio tardÃ³ ${Math.round(durationMs)}ms en mostrar el editor`).toBeLessThan(750)
})

test.describe('Studio móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('no crea token ni iframe hasta abrir la vista previa', async ({ page }) => {
    const event = await firstEvent(page)
    const previewTokenRequests: string[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (/\/events\/[^/]+\/preview-token$/.test(path)) previewTokenRequests.push(path)
    })

    await page.goto(`${event.href}/studio`)
    await expect(page.getByText(event.name, { exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Secciones' })).toHaveAttribute('aria-selected', 'true')

    expect(previewTokenRequests).toHaveLength(0)
    await expect(page.locator('iframe[title^="Vista previa"]')).toHaveCount(0)

    await page.getByRole('button', { name: 'Ver preview' }).click()
    await expect.poll(() => previewTokenRequests.length).toBeGreaterThan(0)
    await expect(page.locator('iframe[title^="Vista previa"]')).toBeVisible()

    await page.getByRole('button', { name: 'Volver al editor' }).click()
    await expect(page.locator('iframe[title^="Vista previa"]')).toHaveCount(0)
  })
})

test('cambia el estado del evento de forma optimista', async ({ page }) => {
  const event = await firstEvent(page)
  const eventId = event.href.split('/')[2]
  await page.goto(event.href)
  await expect(page.getByRole('heading', { name: event.name })).toBeVisible()

  await page.route(`**/api/events/${eventId}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    await new Promise((resolve) => setTimeout(resolve, 700))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 200, data: null }),
    })
  })

  await page.getByRole('button', { name: /acciones/i }).click()
  const activeSwitch = page.getByRole('switch')
  const initialState = await activeSwitch.getAttribute('aria-checked')
  const expectedState = initialState === 'true' ? 'false' : 'true'

  await activeSwitch.click()
  await expect(activeSwitch).toHaveAttribute('aria-checked', expectedState, { timeout: 400 })
  await expect(page.getByText(/activado|desactivado/i)).toBeVisible()
})

test.describe('Studio escritorio', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('carga la vista previa visible sin interacción adicional', async ({ page }) => {
    const event = await firstEvent(page)
    const previewTokenRequests: string[] = []
    let workspaceReady = false
    const legacyBootstrapRequests: string[] = []
    const tokenCoreState: Array<{ eventReady: boolean; configReady: boolean }> = []
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname
      if (/\/events\/[^/]+\/studio-workspace$/.test(path) && response.ok()) workspaceReady = true
    })
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (/\/events\/[^/]+\/(?:detail|config|sections)$/.test(path)) legacyBootstrapRequests.push(path)
      if (/\/events\/[^/]+\/preview-token$/.test(path)) {
        previewTokenRequests.push(path)
        tokenCoreState.push({ eventReady: workspaceReady, configReady: workspaceReady })
      }
    })

    await page.goto(`${event.href}/studio`)
    await expect(page.getByText(event.name, { exact: true })).toBeVisible()
    await expect.poll(() => previewTokenRequests.length).toBeGreaterThan(0)
    expect(tokenCoreState[0]).toEqual({ eventReady: true, configReady: true })
    expect(legacyBootstrapRequests).toEqual([])
    await expect(page.locator('iframe[title^="Vista previa"]')).toBeVisible()
    expect(previewTokenRequests).toHaveLength(1)

    await page.getByRole('link', { name: 'Volver' }).click()
    await expect(page.getByRole('heading', { level: 1, name: event.name, exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Studio' }).click()
    await expect(page.locator('iframe[title^="Vista previa"]')).toBeVisible()
    expect(previewTokenRequests).toHaveLength(1)
  })
})
