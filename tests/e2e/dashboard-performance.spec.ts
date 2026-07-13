import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

async function hasResource(page: import('@playwright/test').Page, pattern: RegExp) {
  return page.evaluate(
    (source) => performance.getEntriesByType('resource').some((entry) => new RegExp(source, 'i').test(entry.name)),
    pattern.source
  )
}

test.describe('Dashboard performance contracts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()
    await page.waitForLoadState('networkidle')
  })

  test('embeds pending moment counts without an initial summary round trip', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()

    const summaryRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/moments/summary')) summaryRequests.push(request.url())
    })

    const listResponse = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'GET' && url.pathname === '/api/events' && url.searchParams.has('page')
    })
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()
    const payload = await (await listResponse).json()
    const events = payload?.data?.data ?? payload?.data ?? []

    expect(Array.isArray(events)).toBe(true)
    for (const event of events) {
      expect(event).toHaveProperty('pending_moment_count')
      expect(event.event_type).toMatchObject({ id: expect.any(String), name: expect.any(String) })
    }
    expect(summaryRequests).toEqual([])
  })

  test('warms event detail data from pointer intent', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Pointer hover intent is a desktop contract')

    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')

    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const eventId = href!.split('/')[2]

    const summaryRequests: string[] = []
    let detailRequests = 0
    page.on('request', (request) => {
      if (request.url().includes(`/guests/summary:${eventId}`)) summaryRequests.push(request.url())
      if (request.url().includes(`/events/${eventId}/detail`)) detailRequests += 1
    })
    const detailResponse = page.waitForResponse((response) => response.url().includes(`/events/${eventId}/detail`))

    await eventLink.hover()
    const response = await detailResponse
    expect((await response.json())?.data?.guest_summary).toMatchObject({
      total: expect.any(Number),
      confirmed: expect.any(Number),
      pending: expect.any(Number),
    })
    expect(summaryRequests).toEqual([])
    expect(detailRequests).toBe(1)

    await eventLink.click()
    await expect(page).toHaveURL(`/events/${eventId}`)
    await page.waitForTimeout(500)
    expect(detailRequests).toBe(1)
  })

  test('loads direct event detail and guest KPIs from one composed response', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')
    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const eventId = href!.split('/')[2]
    const summaryRequests: string[] = []
    const eventTypeCatalogRequests: string[] = []
    const eventConfigRequests: string[] = []
    const momentActivityRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes(`/guests/summary:${eventId}`)) summaryRequests.push(request.url())
      if (new URL(request.url()).pathname.endsWith('/event-types')) eventTypeCatalogRequests.push(request.url())
      if (new URL(request.url()).pathname.endsWith(`/events/${eventId}/config`)) eventConfigRequests.push(request.url())
      if (new URL(request.url()).pathname.endsWith('/moments/activity')) momentActivityRequests.push(request.url())
    })
    const detailResponse = page.waitForResponse((response) => response.url().includes(`/events/${eventId}/detail`))

    await page.goto(href!)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const payload = await (await detailResponse).json()
    expect(payload?.data?.guest_summary).toMatchObject({
      total: expect.any(Number),
      confirmed: expect.any(Number),
      pending: expect.any(Number),
      declined: expect.any(Number),
    })
    expect(payload?.data?.event_type).toMatchObject({ id: expect.any(String), name: expect.any(String) })
    expect(payload?.data?.event_config).toMatchObject({ id: expect.any(String) })
    expect(payload?.data?.guest_share_summary).toMatchObject({
      total: expect.any(Number),
      with_email: expect.any(Number),
      with_phone: expect.any(Number),
      pending_with_email: expect.any(Number),
    })
    const momentsPageResponse = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname.endsWith('/moments') && url.searchParams.has('page')
    })
    await page.getByRole('tab', { name: /Momentos/ }).click()
    const momentsPayload = await (await momentsPageResponse).json()
    expect(momentsPayload?.data?.in_flight).toEqual(expect.any(Array))
    expect(momentsPayload?.data?.reoptimizing).toEqual(expect.any(Array))
    await page.waitForLoadState('networkidle')
    expect(summaryRequests).toEqual([])
    expect(eventTypeCatalogRequests).toEqual([])
    expect(eventConfigRequests).toEqual([])
    expect(momentActivityRequests).toEqual([])
  })

  test('reuses the initial guest page between Guests and RSVP workspaces', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')
    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const eventId = href!.split('/')[2]

    await page.goto(href!)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const initialPageRequests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (
        request.method() === 'GET' &&
        url.pathname.endsWith(`/guests/page:${eventId}`) &&
        url.searchParams.get('page') === '1' &&
        url.searchParams.get('page_size') === '50' &&
        url.searchParams.get('filter') === 'ALL' &&
        url.searchParams.get('sort') === 'name'
      ) {
        initialPageRequests.push(url.href)
      }
    })

    const firstGuestPage = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname.endsWith(`/guests/page:${eventId}`) && url.searchParams.get('page') === '1'
    })
    await page.getByRole('tab', { name: /Invitados/ }).click()
    await firstGuestPage
    await expect(page.locator('#event-panel-invitados')).toBeVisible()

    await page.getByRole('tab', { name: /^RSVP/ }).click()
    await expect(page.locator('#event-panel-rsvp')).toBeVisible()
    await page.waitForTimeout(300)

    expect(initialPageRequests).toHaveLength(1)
  })

  test('paints event detail from the list snapshot while fresh data is still loading', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')

    const href = await eventLink.getAttribute('href')
    const eventName = (await eventLink.innerText()).trim()
    expect(href).toBeTruthy()
    expect(eventName).toBeTruthy()
    const eventId = href!.split('/')[2]

    let releaseDetail: (() => void) | undefined
    const detailGate = new Promise<void>((resolve) => {
      releaseDetail = resolve
    })
    let markDetailStarted: (() => void) | undefined
    const detailStarted = new Promise<void>((resolve) => {
      markDetailStarted = resolve
    })

    await page.route(`**/api/events/${eventId}/detail`, async (route) => {
      markDetailStarted?.()
      await detailGate
      await route.continue()
    })

    await eventLink.hover()
    await detailStarted

    await eventLink.click()
    await expect(page).toHaveURL(href!)
    await expect(page.getByRole('heading', { level: 1, name: eventName, exact: true })).toBeVisible({ timeout: 1_000 })

    releaseDetail?.()
    await page.unrouteAll({ behavior: 'wait' })
  })

  test('keeps a composed event detail authoritative on repeated hover intent', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')
    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const eventId = href!.split('/')[2]

    await eventLink.hover()
    await eventLink.click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/invitados/).first()).toBeVisible()

    await page.getByRole('link', { name: 'Eventos', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()

    const repeatedDetailRequests: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'GET' && request.url().includes(`/events/${eventId}/detail`)) {
        repeatedDetailRequests.push(request.url())
      }
    })

    const sameEventLink = page.locator(`main a[href="${href}"]`).first()
    await sameEventLink.hover()
    await page.waitForTimeout(200)

    expect(repeatedDetailRequests).toEqual([])
  })

  test('exports the complete filtered guest collection from one server request', async ({ page }) => {
    const eventHrefs = await page.locator('main ul li a[href^="/events/"]').evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute('href')).filter((href): href is string => Boolean(href)))]
    )
    test.skip(eventHrefs.length === 0, 'No events available for the local account')

    let exportButton = page.getByRole('button', { name: 'CSV completo' })
    for (const href of eventHrefs.slice(0, 8)) {
      await page.goto(href)
      const guestsResponse = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return url.pathname.includes('/guests/page:') && url.searchParams.get('page') === '1'
      })
      await page.getByRole('tab', { name: /Invitados/ }).click()
      const payload = await (await guestsResponse).json()
      if ((payload?.data?.total ?? 0) > 0) {
        exportButton = page.getByRole('button', { name: 'CSV completo' })
        await expect(exportButton).toBeVisible()
        break
      }
    }
    test.skip((await exportButton.count()) === 0, 'No local event has guests to export')

    const responsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname.endsWith('/guests/export') && response.status() === 200
    )
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const [response, download] = await Promise.all([responsePromise, downloadPromise])

    const url = new URL(response.url())
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')
    expect(url.searchParams.has('page')).toBe(false)
    expect(url.searchParams.has('page_size')).toBe(false)
    expect(download.suggestedFilename()).toMatch(/^invitados-.*\.csv$/)
  })

  test('does not run the repair transaction for intentionally omitted relations', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')

    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const repairRequests: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/repair')) repairRequests.push(request.url())
    })

    await page.goto(href!)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')

    expect(repairRequests).toEqual([])
  })

  test('loads cover management only after explicit intent', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')

    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    await page.goto(href!)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    await expect(page.locator('input[type="file"]')).toHaveCount(0)
    await page.getByRole('button', { name: /(?:Agregar|Administrar) portada/ }).click()
    await expect(page.getByRole('heading', { name: 'Administrar portada' })).toBeVisible()
    await expect(page.locator('input[type="file"]')).toHaveCount(1)

    await page.getByRole('button', { name: 'Cerrar' }).click()
    await expect(page.getByRole('heading', { name: 'Administrar portada' })).not.toBeVisible()
  })

  test('switches event workspaces instantly without an RSC navigation', async ({ page }, testInfo) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    await expect(eventLink, 'The local test account needs an event for workspace navigation').toBeVisible()
    const eventHref = await eventLink.getAttribute('href')
    expect(eventHref).toMatch(/^\/events\/[^/?#]+$/)

    await page.goto(eventHref!)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const routeRequests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.origin === 'http://localhost:3000' && url.pathname === eventHref && request.headers().rsc === '1') {
        routeRequests.push(url.href)
      }
    })

    const startedAt = performance.now()
    await page.getByRole('tab', { name: /Invitados/ }).click()
    await expect(page).toHaveURL(`${eventHref}?tab=invitados`)
    await expect(page.locator('#event-panel-invitados')).toBeVisible()
    const durationMs = performance.now() - startedAt

    await page.goBack()
    await expect(page).toHaveURL(eventHref!)
    await expect(page.locator('#event-panel-resumen')).toBeVisible()

    await page.goto(`${eventHref}?tab=configuracion`)
    const settingsTab = page.getByRole('tab', { name: 'Configuración' })
    await expect(settingsTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#event-panel-configuracion')).toBeVisible()
    await page.waitForTimeout(500)
    const horizontalState = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('[role="tablist"][aria-label="Secciones del evento"]')!
      const tab = document.querySelector<HTMLElement>('#event-tab-configuracion')!
      const listRect = list.getBoundingClientRect()
      const tabRect = tab.getBoundingClientRect()
      return {
        scrollLeft: list.scrollLeft,
        scrollWidth: list.scrollWidth,
        clientWidth: list.clientWidth,
        listLeft: listRect.left,
        listRight: listRect.right,
        tabLeft: tabRect.left,
        tabRight: tabRect.right,
        visible: tabRect.left >= listRect.left && tabRect.right <= listRect.right,
      }
    })
    expect(horizontalState.visible, JSON.stringify(horizontalState)).toBe(true)
    if ((page.viewportSize()?.width ?? 0) >= 1280) {
      expect(horizontalState.scrollWidth, JSON.stringify(horizontalState)).toBeLessThanOrEqual(horizontalState.clientWidth)
    }
    if (horizontalState.scrollWidth > horizontalState.clientWidth) expect(horizontalState.scrollLeft).toBeGreaterThan(0)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    await testInfo.attach('workspace-tab-navigation.json', {
      body: JSON.stringify({ durationMs, routeRequests, horizontalState }, null, 2),
      contentType: 'application/json',
    })
    expect(routeRequests).toEqual([])
    expect(durationMs, `Workspace tab took ${Math.round(durationMs)}ms to become visible`).toBeLessThan(500)
  })

  test('bounds analytics background downloads for heavy collections', async ({ page }, testInfo) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')

    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const eventId = href!.split('/')[2]
    await page.goto(href!)

    const requests = { analytics: 0, fullGuests: 0, analyticsGuests: 0, moments: 0 }
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.endsWith(`/events/${eventId}/analytics`)) requests.analytics += 1
      if (url.pathname.endsWith(`/guests/all:${eventId}`)) requests.fullGuests += 1
      if (url.pathname.endsWith(`/guests/analytics:${eventId}`)) requests.analyticsGuests += 1
      if (url.pathname.endsWith('/moments') && url.searchParams.get('event_id') === eventId) requests.moments += 1
    })

    const compactAnalyticsResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(`/events/${eventId}/analytics`)
    )
    await page.getByRole('tab', { name: /Anal.ticas/ }).click()
    const compactResponse = await compactAnalyticsResponse
    expect(compactResponse.status()).toBe(200)
    const compactPayload = JSON.stringify(await compactResponse.json())
    for (const excludedField of ['pretty_token', 'email', 'phone', 'image_url', 'bio', 'notes']) {
      expect(compactPayload).not.toContain(`"${excludedField}"`)
    }
    expect(compactPayload).toContain('"guests"')
    await expect(page.locator('#event-panel-analiticas')).toBeVisible()
    await expect(page.getByText('Tasa respuesta')).toBeVisible()
    await page.waitForTimeout(12_000)

    expect(requests.analytics).toBeGreaterThanOrEqual(1)
    expect(requests.analytics).toBeLessThanOrEqual(2)
    expect(requests.fullGuests).toBe(0)
    expect(requests.analyticsGuests).toBe(0)
    expect(requests.moments).toBe(0)

    await testInfo.attach('analytics-compact-payload.json', {
      body: JSON.stringify({ bytes: new TextEncoder().encode(compactPayload).byteLength, requests }, null, 2),
      contentType: 'application/json',
    })
  })

  test('warms Momentos code without downloading the full media collection on hover', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')
    const href = await eventLink.getAttribute('href')
    const eventId = href!.split('/')[2]
    await page.goto(href!)

    let momentRequests = 0
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.endsWith('/moments') && url.searchParams.get('event_id') === eventId) momentRequests += 1
    })
    const momentsTab = page.getByRole('tab', { name: /Momentos/ })
    await momentsTab.hover()
    await page.waitForTimeout(350)
    expect(momentRequests).toBe(0)

    const firstPageResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname.endsWith('/moments') && url.searchParams.get('event_id') === eventId
    })
    await momentsTab.click()
    const firstPageResponse = await firstPageResponsePromise
    await expect.poll(() => momentRequests).toBe(1)
    const firstPageUrl = new URL(firstPageResponse.url())
    expect(firstPageUrl.searchParams.get('page')).toBe('1')
    expect(firstPageUrl.searchParams.get('page_size')).toBe('40')
    expect(firstPageResponse.status()).toBe(200)
    const payload = await firstPageResponse.json()
    expect(payload?.data?.data.length).toBeLessThanOrEqual(40)
    expect(payload?.data?.counts).toMatchObject({ total: expect.any(Number) })
    await expect(page.locator('#event-panel-momentos')).toBeVisible()
  })

  test('opens settings from embedded config and share summary', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')

    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const eventId = href!.split('/')[2]
    await page.goto(href!)

    let fullGuestRequests = 0
    let configRequests = 0
    let shareRequests = 0
    let sectionRequests = 0
    let designWorkspaceRequests = 0
    let legacyDesignCatalogRequests = 0
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname
      if (pathname.endsWith(`/guests/all:${eventId}`)) fullGuestRequests += 1
      if (pathname.endsWith(`/events/${eventId}/config`)) configRequests += 1
      if (pathname.endsWith(`/guests/share:${eventId}`)) shareRequests += 1
      if (pathname.endsWith(`/events/${eventId}/sections`)) sectionRequests += 1
      if (pathname.endsWith('/catalogs/design-workspace')) designWorkspaceRequests += 1
      if (/\/catalogs\/(?:design-templates|color-palettes|font-sets)$/.test(pathname)) legacyDesignCatalogRequests += 1
    })

    await page.getByRole('tab', { name: 'Configuración' }).click()
    await expect(page.getByText('Compartir evento')).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(fullGuestRequests).toBe(0)
    expect(configRequests).toBe(0)
    expect(shareRequests).toBe(0)
    expect(sectionRequests).toBe(0)
    expect(designWorkspaceRequests).toBe(1)
    expect(legacyDesignCatalogRequests).toBe(0)
  })

  test('boots check-in from one composed workspace without chained reads', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')

    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const eventId = href!.split('/')[2]
    const reads = { workspace: 0, detail: 0, statuses: 0, guests: 0 }
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.endsWith(`/events/${eventId}/checkin-workspace`)) reads.workspace += 1
      if (url.pathname.endsWith(`/events/${eventId}/detail`)) reads.detail += 1
      if (url.pathname.endsWith('/catalogs/guest-statuses')) reads.statuses += 1
      if (url.pathname.endsWith(`/guests/checkin:${eventId}`)) reads.guests += 1
    })

    await page.goto(`${href}/checkin`)
    await expect(page.getByText('Modo check-in', { exact: true })).toBeVisible()
    await page.waitForLoadState('networkidle')

    expect(reads).toEqual({ workspace: 1, detail: 0, statuses: 0, guests: 0 })
  })

  test('bounds invitation and RSVP DOM for large guest collections', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')

    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const eventId = href!.split('/')[2]
    const guests = Array.from({ length: 120 }, (_, index) => ({
      id: `synthetic-guest-${index + 1}`,
      event_id: eventId,
      invitation_id: `synthetic-invitation-${index + 1}`,
      first_name: `Invitado ${String(index + 1).padStart(3, '0')}`,
      last_name: 'Escala',
      email: `guest${index + 1}@example.test`,
      phone: `555000${String(index + 1).padStart(4, '0')}`,
      pretty_token: `TOKEN${index + 1}`,
      rsvp_status: 'pending',
      guests_count: 1,
      max_guests: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }))
    let fullGuestRequests = 0
    let invitationShareRequests = 0
    let legacySeatingRequests = 0
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname
      if (pathname.endsWith(`/guests/share:${eventId}`)) invitationShareRequests += 1
      if (pathname.endsWith(`/guests/seating:${eventId}`) || pathname.endsWith(`/events/${eventId}/tables`)) {
        legacySeatingRequests += 1
      }
    })
    await page.route(`**/guests/all:${eventId}`, async (route) => {
      fullGuestRequests += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: guests }) })
    })
    await page.route(`**/guests/seating:${eventId}`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: guests }) })
    })
    await page.route(`**/events/${eventId}/seating-workspace`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 200, data: { tables: [], guests } }),
      })
    })
    await page.route(`**/guests/page:${eventId}*`, async (route) => {
      const url = new URL(route.request().url())
      const pageNumber = Number(url.searchParams.get('page') ?? '1')
      const pageSize = Number(url.searchParams.get('page_size') ?? '50')
      const start = (pageNumber - 1) * pageSize
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 200,
          data: {
            data: guests.slice(start, start + pageSize),
            total: guests.length,
            page: pageNumber,
            page_size: pageSize,
            total_pages: Math.ceil(guests.length / pageSize),
          },
        }),
      })
    })
    await page.route(`**/guests/invitations:${eventId}*`, async (route) => {
      const url = new URL(route.request().url())
      const pageNumber = Number(url.searchParams.get('page') ?? '1')
      const pageSize = Number(url.searchParams.get('page_size') ?? '25')
      const start = (pageNumber - 1) * pageSize
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 200,
          data: {
            data: guests.slice(start, start + pageSize),
            total: guests.length,
            page: pageNumber,
            page_size: pageSize,
            total_pages: Math.ceil(guests.length / pageSize),
            share_summary: {
              total: guests.length,
              with_email: guests.length,
              with_phone: guests.length,
              pending_with_email: guests.length,
            },
          },
        }),
      })
    })
    await page.goto(href!)

    await page.getByRole('tab', { name: /Invitaciones/ }).click()
    await expect(page.locator('#event-panel-invitaciones')).toBeVisible()
    await expect(page.getByRole('button', { name: /Ver QR/ })).toHaveCount(25)
    expect(invitationShareRequests).toBe(0)

    await page.getByRole('tab', { name: 'RSVP' }).click()
    await expect(page.locator('[data-rsvp-layout]')).toHaveCount(1)
    const layout = page.locator('[data-rsvp-layout]')
    if ((await layout.getAttribute('data-rsvp-layout')) === 'desktop') {
      await expect(layout.locator('tbody tr')).toHaveCount(50)
    } else {
      await expect(layout.locator(':scope > div')).toHaveCount(50)
    }
    expect(fullGuestRequests).toBe(0)

    await page.getByRole('tab', { name: 'Mesas' }).click()
    await expect(page.locator('[data-unassigned-list]')).toHaveCount(1)
    await expect(page.locator('[data-unassigned-list] > div')).toHaveCount(30)
    expect(fullGuestRequests).toBe(0)
    expect(legacySeatingRequests).toBe(0)
  })

  test('loads invitation rows and channel summary from one real response', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')
    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const eventId = href!.split('/')[2]
    await page.goto(href!)

    const legacyShareRequests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith(`/guests/share:${eventId}`)) legacyShareRequests.push(request.url())
    })
    const workspaceResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(`/guests/invitations:${eventId}`)
    )

    await page.getByRole('tab', { name: /Invitaciones/ }).click()
    const response = await workspaceResponse
    const payload = await response.json()
    expect(response.status()).toBe(200)
    expect(payload?.data?.data).toEqual(expect.any(Array))
    expect(payload?.data?.share_summary).toMatchObject({
      total: expect.any(Number),
      with_email: expect.any(Number),
      with_phone: expect.any(Number),
      pending_with_email: expect.any(Number),
    })
    expect(legacyShareRequests).toEqual([])
  })

  test('loads tables and compact guests from one real seating workspace', async ({ page }) => {
    const eventLink = page.locator('main ul li a[href^="/events/"]').first()
    test.skip((await eventLink.count()) === 0, 'No events available for the local account')
    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const eventId = href!.split('/')[2]
    await page.goto(href!)

    const legacyRequests: string[] = []
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname
      if (pathname.endsWith(`/events/${eventId}/tables`) || pathname.endsWith(`/guests/seating:${eventId}`)) {
        legacyRequests.push(request.url())
      }
    })
    const workspaceResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(`/events/${eventId}/seating-workspace`)
    )

    await page.getByRole('tab', { name: 'Mesas' }).click()
    const response = await workspaceResponse
    const payload = await response.json()
    expect(response.status()).toBe(200)
    expect(payload?.data?.tables).toEqual(expect.any(Array))
    expect(payload?.data?.guests).toEqual(expect.any(Array))
    expect(legacyRequests).toEqual([])
  })

  test('exports the complete filtered invitation collection', async ({ page }) => {
    const eventHrefs = await page.locator('main ul li a[href^="/events/"]').evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute('href')).filter((href): href is string => Boolean(href)))]
    )
    test.skip(eventHrefs.length === 0, 'No events available for the local account')

    let exportButton = page.getByRole('button', { name: 'CSV completo' })
    for (const href of eventHrefs.slice(0, 8)) {
      await page.goto(href)
      const invitationsResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname.includes('/guests/invitations:')
      )
      await page.getByRole('tab', { name: /Invitaciones/ }).click()
      const payload = await (await invitationsResponse).json()
      if ((payload?.data?.total ?? 0) > 0) {
        exportButton = page.getByRole('button', { name: 'CSV completo' })
        await expect(exportButton).toBeVisible()
        break
      }
    }
    test.skip((await exportButton.count()) === 0, 'No local event has invitations to export')

    const responsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/guests/export')
    )
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const [response, download] = await Promise.all([responsePromise, downloadPromise])
    const url = new URL(response.url())

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')
    expect(url.searchParams.get('view')).toBe('invitations')
    expect(url.searchParams.has('page')).toBe(false)
    expect(url.searchParams.has('page_size')).toBe(false)
    expect(download.suggestedFilename()).toMatch(/^invitaciones-.*\.csv$/)
  })

  test('exports the complete filtered RSVP collection', async ({ page }) => {
    const eventHrefs = await page.locator('main ul li a[href^="/events/"]').evaluateAll((links) =>
      [...new Set(links.map((link) => link.getAttribute('href')).filter((href): href is string => Boolean(href)))]
    )
    test.skip(eventHrefs.length === 0, 'No events available for the local account')

    let exportButton = page.getByRole('button', { name: 'CSV completo' })
    for (const href of eventHrefs.slice(0, 8)) {
      await page.goto(href)
      const guestsResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname.includes('/guests/page:')
      )
      await page.getByRole('tab', { name: 'RSVP' }).click()
      const payload = await (await guestsResponse).json()
      if ((payload?.data?.total ?? 0) > 0) {
        exportButton = page.getByRole('button', { name: 'CSV completo' })
        await expect(exportButton).toBeVisible()
        break
      }
    }
    test.skip((await exportButton.count()) === 0, 'No local event has RSVP rows to export')

    const responsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/guests/export')
    )
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const [response, download] = await Promise.all([responsePromise, downloadPromise])
    const url = new URL(response.url())

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/csv')
    expect(url.searchParams.get('view')).toBe('rsvp')
    expect(url.searchParams.has('page')).toBe(false)
    expect(url.searchParams.has('page_size')).toBe(false)
    expect(download.suggestedFilename()).toMatch(/^rsvp-.*\.csv$/)
  })

  test('updates a guest selection through one authorized bulk status request', async ({ page, request }) => {
    await page.goto('/events')
    const eventLinks = page.locator('main ul li a[href^="/events/"]')
    await expect.poll(() => eventLinks.count()).toBeGreaterThan(0)
    const eventIds = await eventLinks.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')?.split('/')[2]).filter((id): id is string => Boolean(id))
    )
    const tokenResponse = await request.get('http://localhost:3000/api/auth/token')
    expect(tokenResponse.status()).toBe(200)
    const { token } = await tokenResponse.json()
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    let guest: { id: string; status_id?: string; guest_status_id?: string; rsvp_status?: string } | undefined
    let eventId: string | undefined
    for (const candidate of eventIds) {
      const response = await request.get(
        `http://localhost:8080/api/guests/page:${candidate}?page=1&page_size=1&sort=name&direction=asc`,
        { headers }
      )
      if (response.status() !== 200) continue
      const payload = await response.json()
      const candidateGuest = payload?.data?.data?.[0]
      if (candidateGuest) {
        guest = candidateGuest
        eventId = candidate
        break
      }
    }
    test.skip(!guest || !eventId, 'No guest is available for the local account')

    const statusesResponse = await request.get('http://localhost:8080/api/catalogs/guest-statuses', { headers })
    expect(statusesResponse.status()).toBe(200)
    const statusesPayload = await statusesResponse.json()
    const normalizedStatus =
      String(guest!.rsvp_status ?? '')
        .trim()
        .toUpperCase() || 'PENDING'
    const status = statusesPayload?.data?.find(
      (candidate: { code?: string; Code?: string }) =>
        String(candidate.code ?? candidate.Code ?? '').toUpperCase() === normalizedStatus
    ) as { id?: string; ID?: string } | undefined
    const statusId = status?.id ?? status?.ID
    expect(statusId).toEqual(expect.any(String))

    const response = await request.patch('http://localhost:8080/api/guests/bulk/status', {
      headers,
      data: {
        event_id: eventId,
        ids: [guest!.id],
        status_id: statusId,
        guest_status_id: statusId,
        rsvp_status: normalizedStatus.toLowerCase(),
        rsvp_method: 'host',
      },
    })
    expect(response.status()).toBe(200)
  })
})

test.describe('Home performance contracts', () => {
  test('uses a constant-size operations summary instead of the full event portfolio', async ({ page }, testInfo) => {
    const listRequests: string[] = []
    const guestSummaryRequests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname === '/api/events') listRequests.push(url.href)
      if (url.pathname.startsWith('/api/guests/summary:')) guestSummaryRequests.push(url.href)
    })
    const overviewResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/events/dashboard'
    )

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    const response = await overviewResponse
    expect(response.status()).toBe(200)
    const payload = await response.json()
    const overview = payload?.data

    expect(overview?.metrics).toMatchObject({
      total: expect.any(Number),
      active: expect.any(Number),
      upcoming: expect.any(Number),
      past_active: expect.any(Number),
      total_capacity: expect.any(Number),
    })
    expect(overview?.active_events?.length ?? 0).toBeLessThanOrEqual(5)
    for (const event of overview?.active_events ?? []) {
      expect(event.event_type).toMatchObject({ id: expect.any(String), name: expect.any(String) })
    }
    if (overview?.next_event) {
      expect(overview.next_event.event_type).toMatchObject({ id: expect.any(String), name: expect.any(String) })
      expect(overview?.next_event_guest_summary).toMatchObject({
        total: expect.any(Number),
        confirmed: expect.any(Number),
        pending: expect.any(Number),
        declined: expect.any(Number),
        total_attendees: expect.any(Number),
      })
    }
    expect(JSON.stringify(overview)).not.toContain('cover_view_url')
    await page.waitForLoadState('networkidle')
    expect(listRequests).toEqual([])
    expect(guestSummaryRequests).toEqual([])

    await testInfo.attach('dashboard-overview-payload.json', {
      body: JSON.stringify({ bytes: new TextEncoder().encode(JSON.stringify(payload)).byteLength, overview }, null, 2),
      contentType: 'application/json',
    })
  })

  test('opens event creation directly and preloads its modal from intent', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    expect(await hasResource(page, /event-form-modal/)).toBe(false)

    const create = page.getByRole('link', { name: 'Crear evento' })
    await create.focus()
    await expect.poll(() => hasResource(page, /event-form-modal/)).toBe(true)
    await create.click()

    await expect(page).toHaveURL('/events')
    await expect(page.getByRole('heading', { name: 'Nuevo evento' })).toBeVisible()
  })

  test('warms event detail from the home list before navigation', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    const eventLink = page.locator('main a[href^="/events/"]').filter({ hasNotText: 'Studio' }).first()
    test.skip((await eventLink.count()) === 0, 'No active events available for the local account')
    const href = await eventLink.getAttribute('href')
    expect(href).toBeTruthy()
    const eventId = href!.split('/')[2]

    let detailRequests = 0
    page.on('request', (request) => {
      if (request.url().includes(`/events/${eventId}/detail`)) detailRequests += 1
    })
    const detailRequest = page.waitForRequest((request) => request.url().includes(`/events/${eventId}/detail`))
    await eventLink.hover()
    await detailRequest
    await expect.poll(() => detailRequests).toBe(1)

    await eventLink.click()
    await expect(page).toHaveURL(`/events/${eventId}`)
    await page.waitForTimeout(500)
    expect(detailRequests).toBe(1)
  })
})

test.describe('Shell notification performance', () => {
  test('shows honest loading and warms an event workspace from notification intent', async ({ page }) => {
    const localDay = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    const event = {
      id: 'notification-event-1',
      name: 'Evento desde notificaciones',
      identifier: 'notification-event-1',
      event_date_time: `${localDay}T12:00:00-06:00`,
      timezone: 'America/Mexico_City',
      is_active: true,
      max_guests: 100,
    }

    let releaseEvents: (() => void) | undefined
    const eventsGate = new Promise<void>((resolve) => {
      releaseEvents = resolve
    })
    let fullEventRequests = 0
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname === '/api/events' && !url.searchParams.get('page_size')) fullEventRequests += 1
    })
    await page.route(/localhost:8080\/api\/events\/notifications(?:\?.*)?$/, async (route) => {
      await eventsGate
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 200, data: [event] }),
      })
    })

    await page.goto('/settings/profile')
    await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
    await page.getByRole('button', { name: 'Notificaciones' }).click()
    await expect(page.getByRole('status', { name: 'Cargando notificaciones' })).toBeVisible()
    await expect(page.getByText('Sin notificaciones activas')).toHaveCount(0)

    releaseEvents?.()
    const notification = page.getByRole('link', { name: /Evento desde notificaciones/ })
    await expect(notification).toBeVisible()
    expect(fullEventRequests).toBe(0)

    const detailRequest = page.waitForRequest((request) =>
      request.url().includes('/events/notification-event-1/detail')
    )
    await notification.hover()
    await detailRequest
  })
})

test.describe('Global search performance', () => {
  test('bounds event and user search instead of downloading full collections', async ({ page }) => {
    const eventRequests: URL[] = []
    const userRequests: URL[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname === '/api/events') eventRequests.push(url)
      if (url.pathname === '/api/users/all') userRequests.push(url)
    })

    await page.goto('/settings/profile')
    await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible()
    const initialEvents = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return (
        url.pathname === '/api/events' && url.searchParams.get('page_size') === '6' && !url.searchParams.get('search')
      )
    })
    const globalSearch = page.getByRole('button', { name: /Buscar/ })
    await globalSearch.focus()
    const initialPayload = await (await initialEvents).json()
    expect(initialPayload?.data?.data?.length ?? 0).toBeLessThanOrEqual(6)
    expect(userRequests).toHaveLength(0)
    const initialEventRequestCount = eventRequests.length
    await globalSearch.click()
    await page.waitForTimeout(250)
    expect(eventRequests).toHaveLength(initialEventRequestCount)

    const input = page.getByPlaceholder(/Buscar eventos, usuarios, comandos/)
    const searchedEvents = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/events' && url.searchParams.get('search') === 'andres'
    })
    const searchedUsers = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/users/all' && url.searchParams.get('search') === 'andres'
    })
    await input.fill('andres')
    const [eventResponse, userResponse] = await Promise.all([searchedEvents, searchedUsers])
    const [eventPayload, userPayload] = await Promise.all([eventResponse.json(), userResponse.json()])

    expect(eventPayload?.data?.data?.length ?? 0).toBeLessThanOrEqual(6)
    expect(userPayload?.data?.data?.length ?? 0).toBeLessThanOrEqual(4)
    expect(eventRequests.every((url) => url.searchParams.get('page_size') === '6')).toBe(true)
    expect(userRequests.every((url) => url.searchParams.get('page_size') === '4')).toBe(true)
  })
})

test.describe('Cross-route request budgets', () => {
  test('loads only one authorized event page from PostgreSQL', async ({ page }) => {
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/api/events' && url.searchParams.get('page_size') === '12'
    })

    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()
    const response = await responsePromise
    expect(response.status()).toBe(200)
    const payload = await response.json()
    const eventsPage = payload?.data

    expect(eventsPage).toMatchObject({
      data: expect.any(Array),
      total: expect.any(Number),
      page: 1,
      page_size: 12,
      total_pages: expect.any(Number),
      counts: {
        all: expect.any(Number),
        upcoming: expect.any(Number),
        today: expect.any(Number),
        past: expect.any(Number),
      },
    })
    expect(eventsPage.data.length).toBeLessThanOrEqual(12)
  })

  test('bounds the event portfolio DOM and moment summaries to the visible page', async ({ page }) => {
    const events = Array.from({ length: 25 }, (_, index) => {
      const number = index + 1
      return {
        id: `portfolio-event-${number}`,
        name: `Evento ${String(number).padStart(2, '0')}`,
        identifier: `evento-${number}`,
        is_active: true,
        event_date_time: `2026-08-${String((number % 20) + 1).padStart(2, '0')}T18:00:00-06:00`,
        timezone: 'America/Mexico_City',
        max_guests: 100,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }
    })
    const summaryBatches: string[][] = []
    const requestedPages: number[] = []

    await page.route(/localhost:8080\/api\/events(?:\?.*)?$/, (route) => {
      const url = new URL(route.request().url())
      const currentPage = Number(url.searchParams.get('page') ?? '1')
      const pageSize = Number(url.searchParams.get('page_size') ?? '12')
      requestedPages.push(currentPage)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 200,
          data: {
            data: events.slice((currentPage - 1) * pageSize, currentPage * pageSize),
            total: events.length,
            page: currentPage,
            page_size: pageSize,
            total_pages: Math.ceil(events.length / pageSize),
            counts: { all: events.length, upcoming: events.length, today: 0, past: 0 },
          },
        }),
      })
    })
    await page.route(/localhost:8080\/api\/moments\/summary(?:\?.*)?$/, (route) => {
      const ids = new URL(route.request().url()).searchParams.get('event_ids')?.split(',') ?? []
      summaryBatches.push(ids)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 200,
          data: ids.map((eventId) => ({ event_id: eventId, pending_count: 0 })),
        }),
      })
    })

    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()
    const eventRows = page.locator('main ul > li')
    await expect(eventRows).toHaveCount(12)
    await expect(page.getByText('Evento 01', { exact: true })).toBeVisible()
    expect(requestedPages.filter((pageNumber) => pageNumber === 1)).toHaveLength(1)
    expect(summaryBatches).toEqual([])

    const nextPage = page.getByRole('button', { name: /siguiente/i })
    await nextPage.focus()
    await expect.poll(() => requestedPages.filter((pageNumber) => pageNumber === 2).length).toBe(1)
    expect(requestedPages.filter((pageNumber) => pageNumber === 2)).toHaveLength(1)
    expect(summaryBatches).toEqual([])

    await nextPage.click()
    await expect(page).toHaveURL('/events?page=2')
    await expect(eventRows).toHaveCount(12)
    await expect(page.getByText('Evento 13', { exact: true })).toBeVisible()
    await expect.poll(() => requestedPages.filter((pageNumber) => pageNumber === 3).length).toBe(1)
    expect(requestedPages.filter((pageNumber) => pageNumber === 2)).toHaveLength(1)
    expect(requestedPages.filter((pageNumber) => pageNumber === 3)).toHaveLength(1)
    expect(summaryBatches).toEqual([])

    await nextPage.click()
    await expect(page).toHaveURL('/events?page=3')
    await expect(page.getByText('Evento 25', { exact: true })).toBeVisible()
    await expect(eventRows).toHaveCount(1)
    await page.waitForTimeout(250)
    expect(summaryBatches).toHaveLength(0)
    expect(requestedPages.filter((pageNumber) => pageNumber === 3)).toHaveLength(1)
  })

  test('preloads the next remote users page before pagination activates it', async ({ page }, testInfo) => {
    const requestedPages: number[] = []
    await page.route('**/api/users/all?*', async (route) => {
      const url = new URL(route.request().url())
      const currentPage = Number(url.searchParams.get('page') ?? '1')
      requestedPages.push(currentPage)
      const start = (currentPage - 1) * 10 + 1
      const users = Array.from({ length: currentPage === 3 ? 5 : 10 }, (_, index) => {
        const number = start + index
        return {
          id: `pagination-user-${number}`,
          email: `user${number}@example.com`,
          first_name: 'Usuario',
          last_name: String(number),
          is_active: true,
          is_root: false,
          clients: 0,
          created_at: '2026-01-01T00:00:00Z',
        }
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 200,
          data: { data: users, total: 25, page: currentPage, page_size: 10, total_pages: 3 },
        }),
      })
    })

    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible()
    await expect(page.getByText('Usuario 1', { exact: true })).toBeVisible()

    const nextPage = page.getByRole('button', { name: /siguiente/i })
    const preloadResponse = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname.endsWith('/api/users/all') && url.searchParams.get('page') === '2'
    })
    await nextPage.focus()
    await preloadResponse
    expect(requestedPages.filter((pageNumber) => pageNumber === 2)).toHaveLength(1)

    const startedAt = performance.now()
    await nextPage.click()
    await expect(page).toHaveURL('/users?page=2')
    await expect(page.getByText('Usuario 11', { exact: true })).toBeVisible()
    const durationMs = performance.now() - startedAt
    await page.waitForTimeout(250)

    await testInfo.attach('users-pagination-preload.json', {
      body: JSON.stringify({ durationMs, requestedPages }, null, 2),
      contentType: 'application/json',
    })
    expect(requestedPages.filter((pageNumber) => pageNumber === 2)).toHaveLength(1)
    expect(durationMs, `Preloaded users page took ${Math.round(durationMs)}ms to render`).toBeLessThan(500)
  })

  test('preserves list context in the URL without an RSC navigation', async ({ page }) => {
    const rscRequests: string[] = []
    page.on('request', (request) => {
      if (request.headers().rsc === '1') rscRequests.push(request.url())
    })

    const views = [
      {
        route: '/events',
        heading: 'Eventos',
        searchName: 'Buscar evento',
        filterName: 'Pasados',
        filterParam: 'past',
      },
      {
        route: '/users',
        heading: 'Usuarios',
        searchName: 'Buscar usuario',
        filterName: 'Inactivos',
        filterParam: 'INACTIVE',
      },
      {
        route: '/clients',
        heading: 'Clientes',
        searchName: 'Buscar cliente',
      },
    ] as const

    for (const view of views) {
      await page.goto(view.route)
      await expect(page.getByRole('heading', { name: view.heading, exact: true })).toBeVisible()
      await page.waitForLoadState('networkidle')
      rscRequests.length = 0

      const search = page.getByRole('searchbox', { name: view.searchName })
      await search.fill('contexto e2e')
      if ('filterName' in view) {
        await page.getByRole('button', { name: new RegExp(`^${view.filterName}`) }).click()
        await expect(page.getByRole('button', { name: new RegExp(`^${view.filterName}`) })).toHaveAttribute(
          'aria-pressed',
          'true'
        )
      }

      await expect
        .poll(() =>
          page.evaluate(() => ({
            filter: new URLSearchParams(window.location.search).get(
              window.location.pathname === '/events' ? 'filter' : 'status'
            ),
            q: new URLSearchParams(window.location.search).get('q'),
          }))
        )
        .toEqual({ filter: 'filterParam' in view ? view.filterParam : null, q: 'contexto e2e' })
      await page.waitForTimeout(250)
      expect(rscRequests, `${view.route} issued an RSC request while editing list state`).toEqual([])

      await page.getByRole('link', { name: 'Inicio', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
      await page.goBack()
      await expect(page).toHaveURL(new RegExp(`${view.route.replace('/', '\\/')}\\?`))
      await expect(page.getByRole('heading', { name: view.heading, exact: true })).toBeVisible()
      await expect(page.getByRole('searchbox', { name: view.searchName })).toHaveValue('contexto e2e')
      if ('filterName' in view) {
        await expect(page.getByRole('button', { name: new RegExp(`^${view.filterName}`) })).toHaveAttribute(
          'aria-pressed',
          'true'
        )
      }
    }
  })

  test('fetches the HttpOnly session token once per document, not once per route', async ({ page }) => {
    let tokenRequests = 0
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/auth/token') tokenRequests += 1
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(tokenRequests).toBe(1)

    tokenRequests = 0
    for (const destination of [
      { link: 'Eventos', heading: 'Eventos' },
      { link: 'Usuarios', heading: 'Usuarios' },
      { link: 'Clientes', heading: 'Clientes' },
    ]) {
      await page.getByRole('link', { name: destination.link, exact: true }).click()
      await expect(page.getByRole('heading', { name: destination.heading, exact: true })).toBeVisible()
    }

    expect(tokenRequests).toBe(0)
  })

  test('keeps warm primary workspace navigation below one second per view', async ({ page }, testInfo) => {
    const destinations = [
      { href: '/events', heading: 'Eventos', link: 'Eventos' },
      { href: '/users', heading: 'Usuarios', link: 'Usuarios' },
      { href: '/clients', heading: 'Clientes', link: 'Clientes' },
      { href: '/', heading: 'Dashboard', link: 'Inicio' },
    ]

    // Compile every route before measuring so this contract tracks product
    // navigation rather than the local development compiler.
    for (const destination of destinations) {
      await page.goto(destination.href)
      await expect(page.getByRole('heading', { name: destination.heading, exact: true })).toBeVisible()
    }

    const measurements: Array<{ href: string; durationMs: number }> = []
    for (const destination of destinations) {
      const sidebarLink = page.getByRole('link', { name: destination.link, exact: true })
      await expect(sidebarLink).toBeVisible()
      const startedAt = performance.now()
      await sidebarLink.click()
      await expect(page).toHaveURL(destination.href)
      await expect(page.getByRole('heading', { name: destination.heading, exact: true })).toBeVisible()
      measurements.push({ href: destination.href, durationMs: performance.now() - startedAt })
    }

    await testInfo.attach('warm-navigation-latency.json', {
      body: JSON.stringify(measurements, null, 2),
      contentType: 'application/json',
    })

    for (const measurement of measurements) {
      expect(
        measurement.durationMs,
        `${measurement.href} took ${Math.round(measurement.durationMs)}ms to show its primary content`
      ).toBeLessThan(1_000)
    }
  })

  test('does not duplicate backend reads while navigating the primary workspace', async ({ page }) => {
    const backendReads: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET' || !request.url().startsWith('http://localhost:8080/api/')) return
      backendReads.push(new URL(request.url()).pathname + new URL(request.url()).search)
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    await page.waitForLoadState('networkidle')

    const destinations = [
      { href: '/events', heading: 'Eventos' },
      { href: '/clients', heading: 'Clientes' },
      { href: '/users', heading: 'Usuarios' },
    ]

    for (const destination of destinations) {
      const transitionStart = backendReads.length
      const sidebarLink = page.locator(`nav a[href="${destination.href}"]:visible`)
      await expect(sidebarLink).toHaveCount(1)
      await sidebarLink.click()
      await expect(page).toHaveURL(destination.href)
      await expect(page.getByRole('heading', { name: destination.heading, exact: true })).toBeVisible()
      await page.waitForLoadState('networkidle')

      const transitionReads = backendReads.slice(transitionStart)
      const duplicateReads = transitionReads.filter((path, index) => transitionReads.indexOf(path) !== index)
      expect(duplicateReads, `${destination.href} repeated backend reads: ${duplicateReads.join(', ')}`).toEqual([])
    }
  })
})

test.describe('Primary data recovery', () => {
  test('recovers the events portfolio in place after a network failure', async ({ page }) => {
    const eventsApi = /localhost:8080\/api\/events(?:\?.*)?$/
    await page.route(eventsApi, (route) => route.abort('failed'))

    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'No pudimos cargar los eventos', exact: true })).toBeVisible()

    await page.unroute(eventsApi)
    await page.getByRole('button', { name: 'Reintentar' }).click()

    await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()
  })
})
