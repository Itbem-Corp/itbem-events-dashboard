import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

const EVENT_ID = '11111111-1111-4111-8111-111111111111'

test('usa el contrato paginado real de check-in', async ({ page }) => {
  let eventId = process.env.TEST_EVENT_ID
  if (!eventId) {
    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()
    const href = await page.locator('main a[href^="/events/"]').first().getAttribute('href')
    test.skip(!href, 'The local account needs an event for the real check-in contract')
    eventId = href!.split('/')[2]
  }

  const summaryRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes(`/api/guests/summary:${eventId}`)) summaryRequests.push(request.url())
  })
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === `/api/events/${eventId}/checkin-workspace`
  })
  await page.goto(`/events/${eventId}/checkin`)
  const response = await responsePromise
  expect(response.status()).toBe(200)
  const payload = await response.json()
  expect(payload?.data?.guests).toMatchObject({
    data: expect.any(Array),
    total: expect.any(Number),
    page: 1,
    page_size: 60,
    total_pages: expect.any(Number),
    summary: {
      total: expect.any(Number),
      confirmed: expect.any(Number),
      pending: expect.any(Number),
      declined: expect.any(Number),
    },
  })
  expect(payload.data.event).toMatchObject({ id: eventId, name: expect.any(String) })
  expect(payload.data.statuses).toEqual(expect.any(Array))
  expect(payload.data.guests.data.length).toBeLessThanOrEqual(60)
  expect(payload.data.guests.total).toBe(payload.data.guests.summary.total)
  expect(summaryRequests).toEqual([])
})

test('mantiene check-in acotado y delega búsqueda y filtros al backend', async ({ page }) => {
  const guests = Array.from({ length: 125 }, (_, index) => {
    const number = index + 1
    const confirmed = number <= 40
    return {
      id: `22222222-2222-4222-8${String(number).padStart(3, '0')}-222222222222`.slice(0, 36),
      event_id: EVENT_ID,
      first_name: `Invitado ${String(number).padStart(3, '0')}`,
      last_name: 'Escala',
      email: `guest${number}@example.test`,
      phone: `555${String(number).padStart(7, '0')}`,
      table_number: `Mesa ${Math.ceil(number / 10)}`,
      guests_count: 1,
      status_id: confirmed ? 'status-confirmed' : 'status-pending',
      status: { id: confirmed ? 'status-confirmed' : 'status-pending', code: confirmed ? 'CONFIRMED' : 'PENDING' },
      rsvp_status: confirmed ? 'confirmed' : 'pending',
    }
  })
  const requests: URL[] = []
  let legacyRequests = 0
  let checkinWrites = 0

  await page.route(`**/api/events/${EVENT_ID}/checkin-workspace`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        data: {
          event: { id: EVENT_ID, name: 'Evento escala', is_active: true },
          statuses: [
            { id: 'status-confirmed', code: 'CONFIRMED', name: 'Confirmado' },
            { id: 'status-pending', code: 'PENDING', name: 'Pendiente' },
          ],
          guests: { data: guests.slice(0, 60), total: 125, page: 1, page_size: 60, total_pages: 3, summary: { total: 125, confirmed: 40, pending: 85, declined: 0, total_attendees: 40 } },
        },
      }),
    })
  )
  await page.route(`**/api/guests/all:${EVENT_ID}`, (route) => {
    legacyRequests += 1
    return route.abort()
  })
  await page.route(`**/api/guests/checkin:${EVENT_ID}?*`, (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const currentPage = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('page_size') ?? '60')
    const search = (url.searchParams.get('search') ?? '').toLowerCase()
    const filter = url.searchParams.get('filter') ?? 'ALL'
    const matches = guests.filter((guest) => {
      const matchesSearch = `${guest.first_name} ${guest.last_name} ${guest.email} ${guest.table_number}`
        .toLowerCase()
        .includes(search)
      const matchesFilter = filter === 'ALL' || guest.status.code === filter
      return matchesSearch && matchesFilter
    })
    const confirmedCount = guests.filter((guest) => guest.status.code === 'CONFIRMED').length
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
          summary: {
            total: 125,
            confirmed: confirmedCount,
            pending: 125 - confirmedCount,
            declined: 0,
            total_attendees: confirmedCount,
          },
        },
      }),
    })
  })
  await page.route('**/api/guests/*', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    checkinWrites += 1
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const guestId = new URL(route.request().url()).pathname.split('/').at(-1)
    const updatedGuest = guests.find((guest) => guest.id === guestId) ?? guests[40]
    updatedGuest.status_id = 'status-confirmed'
    updatedGuest.status = { id: 'status-confirmed', code: 'CONFIRMED' }
    updatedGuest.rsvp_status = 'confirmed'
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        data: {
          ...updatedGuest,
          status_id: 'status-confirmed',
          status: { id: 'status-confirmed', code: 'CONFIRMED' },
          rsvp_status: 'confirmed',
        },
      }),
    })
  })

  await page.goto(`/events/${EVENT_ID}/checkin`)
  await expect(page.getByText('Invitado 001', { exact: false })).toBeVisible()
  await expect(page.getByText('Invitado 061', { exact: false })).not.toBeVisible()
  expect(legacyRequests).toBe(0)
  expect(requests).toHaveLength(0)

  const nextPage = page.getByRole('button', { name: /siguiente/i })
  await nextPage.focus()
  await expect.poll(() => requests.some((url) => url.searchParams.get('page') === '2')).toBe(true)
  expect(requests.every((url) => url.searchParams.get('page_size') === '60')).toBe(true)
  await nextPage.click()
  await expect(page.getByText('Invitado 061', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: /Esperados/ }).click()
  await expect.poll(() => requests.some((url) => url.searchParams.get('filter') === 'PENDING')).toBe(true)
  await page.getByRole('searchbox', { name: 'Buscar invitado por nombre o mesa' }).fill('Invitado 125')
  await expect.poll(() => requests.some((url) => url.searchParams.get('search') === 'Invitado 125')).toBe(true)
  await expect(page.getByText('Invitado 125', { exact: false })).toBeVisible()

  const readsBeforeCheckin = requests.length
  const checkinStartedAt = Date.now()
  await page.getByRole('button', { name: 'Marcar llegada de Invitado 125 Escala' }).click()
  await expect.poll(() => checkinWrites).toBe(1)
  await expect(page.getByText('41 / 125', { exact: true })).toBeVisible()
  expect(Date.now() - checkinStartedAt).toBeLessThan(400)
  await expect(page.getByRole('button', { name: 'Desmarcar llegada de Invitado 125 Escala' })).toBeEnabled()
  expect(requests).toHaveLength(readsBeforeCheckin)
})
