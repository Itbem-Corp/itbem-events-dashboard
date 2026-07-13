import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

const EVENT_ID = '33333333-3333-4333-8333-333333333333'

test('usa el contrato paginado real para el portafolio de invitados', async ({ page }) => {
  const eventId = process.env.TEST_EVENT_ID
  test.skip(!eventId, 'TEST_EVENT_ID is required for the real local contract')

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === `/api/guests/page:${eventId}` && url.searchParams.get('page_size') === '50'
  })
  await page.goto(`/events/${eventId}?tab=invitados`)
  const response = await responsePromise
  expect(response.status()).toBe(200)
  const payload = await response.json()
  expect(payload?.data).toMatchObject({
    data: expect.any(Array),
    total: expect.any(Number),
    page: 1,
    page_size: 50,
    total_pages: expect.any(Number),
  })
  expect(payload.data.data.length).toBeLessThanOrEqual(50)
})

test('conserva estado y mesa en la consulta paginada real', async ({ request }) => {
  const tokenResponse = await request.get('http://localhost:3000/api/auth/token')
  expect(tokenResponse.status()).toBe(200)
  const { token } = await tokenResponse.json()
  const headers = { Authorization: `Bearer ${token}` }
  const eventsResponse = await request.get('http://localhost:8080/api/events?page=1&page_size=25', { headers })
  expect(eventsResponse.status()).toBe(200)
  const eventsPayload = await eventsResponse.json()
  const events = eventsPayload?.data?.data ?? []

  let guests: Array<Record<string, unknown>> = []
  for (const event of events) {
    const response = await request.get(
      `http://localhost:8080/api/guests/page:${event.id}?page=1&page_size=12&sort=name&direction=asc`,
      { headers }
    )
    if (response.status() !== 200) continue
    const payload = await response.json()
    if (payload?.data?.data?.length) {
      guests = payload.data.data
      break
    }
  }
  test.skip(guests.length === 0, 'No guests are available for the local account')

  for (const guest of guests) {
    expect(guest.status).toMatchObject({ id: guest.status_id, code: expect.any(String) })
    if (guest.table_id) {
      expect(guest.table).toMatchObject({ id: guest.table_id, name: expect.any(String) })
    }
  }
})

test('acota DOM y red al paginar, buscar, filtrar y ordenar invitados', async ({ page }, testInfo) => {
  const guests = Array.from({ length: 125 }, (_, index) => {
    const number = index + 1
    const status = number <= 40 ? 'CONFIRMED' : number <= 100 ? 'PENDING' : 'DECLINED'
    return {
      id: `guest-${number}`,
      event_id: EVENT_ID,
      first_name: `Invitado ${String(number).padStart(3, '0')}`,
      last_name: 'Portafolio',
      email: `guest${number}@example.test`,
      phone: `555${String(number).padStart(7, '0')}`,
      table_number: `Mesa ${Math.ceil(number / 10)}`,
      guests_count: 1,
      status_id: `status-${status.toLowerCase()}`,
      status: { id: `status-${status.toLowerCase()}`, code: status },
      rsvp_status: status.toLowerCase(),
    }
  })
  const requests: URL[] = []
  let fullListRequests = 0
  let bulkStatusWrites = 0
  let deleteWrites = 0

  await page.route(`**/api/events/${EVENT_ID}/detail`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        data: { id: EVENT_ID, name: 'Evento portafolio', identifier: 'evento-portafolio', is_active: true },
      }),
    })
  )
  await page.route(`**/api/guests/summary:${EVENT_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        data: { total: 125, confirmed: 40, pending: 60, declined: 25, total_attendees: 40 },
      }),
    })
  )
  await page.route('**/api/catalogs/guest-statuses', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        data: ['CONFIRMED', 'PENDING', 'DECLINED'].map((code) => ({
          id: `status-${code.toLowerCase()}`,
          code,
          name: code,
        })),
      }),
    })
  )
  await page.route(`**/api/guests/all:${EVENT_ID}`, (route) => {
    fullListRequests += 1
    return route.abort()
  })
  await page.route('**/api/guests/guest-*', async (route) => {
    if (route.request().method() === 'DELETE') {
      deleteWrites += 1
      await new Promise((resolve) => setTimeout(resolve, 1500))
      if (deleteWrites === 2) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ status: 500, message: 'Falla simulada' }),
        })
      }
      const guestId = new URL(route.request().url()).pathname.split('/').at(-1)
      const index = guests.findIndex((guest) => guest.id === guestId)
      if (index >= 0) guests.splice(index, 1)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200 }) })
    }
    if (route.request().method() !== 'PUT') return route.fallback()
    await new Promise((resolve) => setTimeout(resolve, 700))
    guests[124].status = { id: 'status-confirmed', code: 'CONFIRMED' }
    guests[124].status_id = 'status-confirmed'
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 200, data: null }),
    })
  })
  await page.route('**/api/guests/bulk/status', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    bulkStatusWrites += 1
    const body = route.request().postDataJSON() as { ids: string[]; rsvp_status: string }
    await new Promise((resolve) => setTimeout(resolve, 1500))
    if (bulkStatusWrites === 2) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: 500, message: 'Falla simulada' }),
      })
    }
    for (const guest of guests.filter((item) => body.ids.includes(item.id))) {
      guest.status = { id: `status-${body.rsvp_status}`, code: body.rsvp_status.toUpperCase() }
      guest.status_id = `status-${body.rsvp_status}`
      guest.rsvp_status = body.rsvp_status
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 200, data: { updated: body.ids.length } }),
    })
  })
  await page.route(`**/api/guests/page:${EVENT_ID}?*`, (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const currentPage = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('page_size') ?? '50')
    const search = (url.searchParams.get('search') ?? '').toLowerCase()
    const filter = url.searchParams.get('filter') ?? 'ALL'
    const direction = url.searchParams.get('direction') === 'desc' ? -1 : 1
    const matches = guests
      .filter((guest) => {
        const matchesSearch = `${guest.first_name} ${guest.last_name} ${guest.email} ${guest.table_number}`
          .toLowerCase()
          .includes(search)
        return matchesSearch && (filter === 'ALL' || guest.status.code === filter)
      })
      .sort((a, b) => a.first_name.localeCompare(b.first_name) * direction)
    const data = matches.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        data: {
          data,
          total: matches.length,
          page: currentPage,
          page_size: pageSize,
          total_pages: Math.max(Math.ceil(matches.length / pageSize), 1),
        },
      }),
    })
  })

  await page.goto(`/events/${EVENT_ID}?tab=invitados`)
  await expect(page.getByText('Invitado 001', { exact: false })).toBeVisible()
  await expect(page.getByText('Invitado 051', { exact: false })).not.toBeVisible()
  expect(fullListRequests).toBe(0)
  expect(requests[0].searchParams.get('page_size')).toBe('50')

  const nextPage = page.getByRole('button', { name: /siguiente/i })
  await nextPage.focus()
  await expect.poll(() => requests.some((url) => url.searchParams.get('page') === '2')).toBe(true)
  await nextPage.click()
  await expect(page.getByText('Invitado 051', { exact: false })).toBeVisible()

  if (testInfo.project.name !== 'mobile') {
    await page.getByRole('button', { name: 'Ordenar por Nombre' }).click()
    await expect.poll(() => requests.some((url) => url.searchParams.get('direction') === 'desc')).toBe(true)
  }

  await page.getByRole('button', { name: 'Dec.' }).click()
  await expect.poll(() => requests.some((url) => url.searchParams.get('filter') === 'DECLINED')).toBe(true)
  await page.getByRole('searchbox', { name: 'Buscar invitados' }).fill('Invitado 125')
  await expect.poll(() => requests.some((url) => url.searchParams.get('search') === 'Invitado 125')).toBe(true)
  await expect(page.getByText('Invitado 125', { exact: false })).toBeVisible()

  if (testInfo.project.name !== 'mobile') {
    const requestsBeforeStatusChange = requests.length
    const statusSelect = page.getByRole('combobox', { name: 'Estado de Invitado 125 Portafolio' })
    await statusSelect.selectOption('CONFIRMED')
    await expect(statusSelect).toHaveValue('CONFIRMED', { timeout: 400 })
    await expect.poll(() => requests.length).toBeGreaterThan(requestsBeforeStatusChange)
    await expect(page.getByText('Invitado 125', { exact: false })).not.toBeVisible()

    await page.getByRole('searchbox', { name: 'Buscar invitados' }).fill('Invitado 124')
    await expect(page.getByText('Invitado 124', { exact: false })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Seleccionar a Invitado 124 Portafolio' }).check()
    const bulkStartedAt = await page.evaluate(() => performance.now())
    await page.getByRole('button', { name: 'Confirmar', exact: true }).evaluate((button: HTMLButtonElement) => button.click())
    await expect(page.getByRole('combobox', { name: 'Estado de Invitado 124 Portafolio' })).toHaveValue('CONFIRMED')
    const bulkLatency = await page.evaluate((start) => performance.now() - start, bulkStartedAt)
    expect(bulkLatency).toBeLessThan(400)
    await expect.poll(() => bulkStatusWrites).toBe(1)
    await expect(page.getByText('1 invitado actualizado')).toBeVisible({ timeout: 3000 })

    await page.getByRole('searchbox', { name: 'Buscar invitados' }).fill('Invitado 123')
    await expect(page.getByText('Invitado 123', { exact: false })).toBeVisible()
    await page.getByRole('checkbox', { name: 'Seleccionar a Invitado 123 Portafolio' }).check()
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
    const rollbackSelect = page.getByRole('combobox', { name: 'Estado de Invitado 123 Portafolio' })
    await expect(rollbackSelect).toHaveValue('CONFIRMED')
    await expect.poll(() => bulkStatusWrites).toBe(2)
    await expect(rollbackSelect).toHaveValue('DECLINED', { timeout: 3000 })
  }

  await page.getByRole('searchbox', { name: 'Buscar invitados' }).fill('Invitado 122')
  await expect(page.getByText('Invitado 122', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Eliminar a Invitado 122' }).click()
  const deleteStartedAt = await page.evaluate(() => performance.now())
  await page.getByRole('button', { name: 'Eliminar invitado' }).evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.getByRole('button', { name: 'Eliminar a Invitado 122' })).not.toBeVisible()
  const deleteLatency = await page.evaluate((start) => performance.now() - start, deleteStartedAt)
  expect(deleteLatency).toBeLessThan(400)
  await expect(page.getByText('Invitado eliminado')).toBeVisible({ timeout: 3000 })

  await page.getByRole('searchbox', { name: 'Buscar invitados' }).fill('Invitado 121')
  await expect(page.getByText('Invitado 121', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Eliminar a Invitado 121' }).click()
  await page.getByRole('button', { name: 'Eliminar invitado' }).evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.getByRole('button', { name: 'Eliminar a Invitado 121' })).not.toBeVisible()
  await expect.poll(() => deleteWrites).toBe(2)
  await expect(page.getByRole('button', { name: 'Eliminar a Invitado 121' })).toBeVisible({ timeout: 3000 })
})
