import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test('usa la proyección compacta real para el workspace de mesas', async ({ page }) => {
  const eventId = process.env.TEST_EVENT_ID
  test.skip(!eventId, 'TEST_EVENT_ID is required for the real local contract')

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === `/api/events/${eventId}/seating-workspace`
  })
  await page.goto(`/events/${eventId}?tab=asientos`)
  const response = await responsePromise

  expect(response.status()).toBe(200)
  const payload = await response.json()
  expect(payload?.data?.tables).toEqual(expect.any(Array))
  expect(payload?.data?.guests).toEqual(expect.any(Array))
  for (const guest of payload.data.guests) {
    expect(guest).toMatchObject({
      id: expect.any(String),
      first_name: expect.any(String),
      last_name: expect.any(String),
      rsvp_status: expect.any(String),
      rsvp_guest_count: expect.any(Number),
      guests_count: expect.any(Number),
    })
    expect(guest).not.toHaveProperty('bio')
    expect(guest).not.toHaveProperty('image_url')
    expect(guest).not.toHaveProperty('notes')
    expect(guest).not.toHaveProperty('pretty_token')
    expect(guest).not.toHaveProperty('invitation_id')
  }
  await expect(page.getByRole('button', { name: 'Nueva Mesa' })).toBeVisible()
})

test('guarda y limpia un plano con una sola solicitud transaccional por operación', async ({ page, request }) => {
  await page.goto('/events')
  const eventLinks = page.locator('main ul li a[href^="/events/"]')
  await expect.poll(() => eventLinks.count()).toBeGreaterThan(0)
  const eventHrefs = await eventLinks.evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')).filter((href): href is string => Boolean(href))
  )
  test.skip(eventHrefs.length === 0, 'No events available for the local account')
  let href: string | undefined
  for (const candidate of eventHrefs) {
    await page.goto(candidate)
    await page.getByRole('tab', { name: 'Mesas' }).click()
    await expect(page.locator('#event-panel-asientos')).toBeVisible()
    if ((await page.getByRole('button', { name: 'Nueva Mesa' }).count()) > 0) {
      href = candidate
      break
    }
  }
  if (!href) {
    const eventId = eventHrefs[0].split('/')[2]
    const tokenResponse = await request.get('http://localhost:3000/api/auth/token')
    expect(tokenResponse.status()).toBe(200)
    const { token } = await tokenResponse.json()
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const tableName = `Codex QA ${Date.now()}`
    const createResponse = await request.put(`http://localhost:8080/api/events/${eventId}/tables/plan`, {
      headers,
      data: {
        created: [{ temp_id: 'temp-e2e', name: tableName, capacity: 8, sort_order: 999 }],
        updated: [],
        deleted_ids: [],
        assignments: [],
      },
    })
    expect(createResponse.status()).toBe(200)
    const createdPayload = await createResponse.json()
    const createdTable = createdPayload?.data?.tables?.find((table: { name?: string }) => table.name === tableName)
    expect(createdTable?.id).toEqual(expect.any(String))
    const deleteResponse = await request.put(`http://localhost:8080/api/events/${eventId}/tables/plan`, {
      headers,
      data: { created: [], updated: [], deleted_ids: [createdTable.id], assignments: [] },
    })
    expect(deleteResponse.status()).toBe(200)
    return
  }
  const newTableButton = page.getByRole('button', { name: 'Nueva Mesa' })

  const eventId = href!.split('/')[2]
  let planRequests = 0
  let legacyMutationRequests = 0
  let workspaceReads = 0
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (request.method() === 'GET' && pathname === `/api/events/${eventId}/seating-workspace`) {
      workspaceReads += 1
      return
    }
    if (!['POST', 'PUT', 'DELETE'].includes(request.method())) return
    if (pathname === `/api/events/${eventId}/tables/plan`) planRequests += 1
    else if (
      pathname === `/api/events/${eventId}/tables` ||
      pathname === `/api/events/${eventId}/tables/assign` ||
      /^\/api\/tables\/[^/]+$/.test(pathname)
    )
      legacyMutationRequests += 1
  })

  const tableName = `Codex QA ${Date.now()}`
  await newTableButton.click()
  await page.getByLabel('Nombre de la mesa').fill(tableName)
  await page.getByLabel('Capacidad (asistentes)').fill('8')
  await page.getByRole('button', { name: 'Crear mesa' }).click()

  const createResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/api/events/${eventId}/tables/plan`
  )
  await page.getByRole('button', { name: /Guardar cambios \(1\)/ }).click()
  expect((await createResponsePromise).status()).toBe(200)
  expect(planRequests).toBe(1)
  expect(legacyMutationRequests).toBe(0)
  expect(workspaceReads).toBe(0)
  await expect(page.getByText(tableName, { exact: true })).toBeVisible()

  const tableCard = page
    .getByText(tableName, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await tableCard.getByRole('button', { name: 'Opciones de mesa' }).click()
  await page.getByRole('menuitem', { name: 'Eliminar mesa' }).click()

  const deleteResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/api/events/${eventId}/tables/plan`
  )
  await page.getByRole('button', { name: /Guardar cambios \(1\)/ }).click()
  expect((await deleteResponsePromise).status()).toBe(200)
  expect(planRequests).toBe(2)
  expect(legacyMutationRequests).toBe(0)
  expect(workspaceReads).toBe(0)
  await expect(page.getByText(tableName, { exact: true })).toHaveCount(0)
})
