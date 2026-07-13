import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

const operationalRoot = {
  id: 'root-2',
  email: 'root2@example.test',
  first_name: 'Root',
  last_name: 'Operativo',
  is_active: true,
  is_root: true,
  root_level: 2,
}

const event = {
  id: 'event-operational',
  name: 'Evento de soporte',
  identifier: 'evento-soporte',
  is_active: true,
  event_date_time: '2026-12-10T18:00:00.000Z',
  timezone: 'America/Mexico_City',
  event_type_id: 'type-1',
  client_id: 'client-1',
}

const checkinUser = {
  id: 'checkin-1',
  email: 'checkin@example.test',
  first_name: 'Equipo',
  last_name: 'Check-in',
  is_active: true,
  is_root: false,
}

const checkinClient = {
  id: 'client-1',
  name: 'Organización de prueba',
  code: 'CHECKIN',
  is_active: true,
  access_role: 'CHECKIN',
  client_type_id: 'type-client',
  client_type: { id: 'type-client', code: 'CUSTOMER', name: 'Cliente' },
}

async function mockOperationalRoot(page: Page) {
  await page.route('**/api/users', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: operationalRoot }) }),
  )
  await page.route('**/api/users/all?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { data: [], total: 0, page: 1, page_size: 10, total_pages: 0 } }) }),
  )
  await page.route('**/api/clients?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { data: [], total: 0, page: 1, page_size: 50, total_pages: 0 } }) }),
  )
  await page.route('**/api/events?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { data: [event], total: 1, page: 1, page_size: 12, total_pages: 1, counts: { all: 1, upcoming: 1, today: 0, past: 0 } } }) }),
  )
}

async function mockCheckin(page: Page) {
  await page.route('**/api/users', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: checkinUser }) }),
  )
  await page.route('**/api/clients?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { data: [checkinClient], total: 1, page: 1, page_size: 50, total_pages: 1 } }) }),
  )
  await page.route('**/api/events?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { data: [event], total: 1, page: 1, page_size: 12, total_pages: 1, counts: { all: 1, upcoming: 1, today: 0, past: 0 } } }) }),
  )
}

async function mockAnalyst(page: Page) {
  await page.route('**/api/users', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { ...checkinUser, id: 'analyst-1', email: 'analyst@example.test', first_name: 'Ana', last_name: 'Analista' } }) }),
  )
  await page.route('**/api/events/event-operational/capabilities', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { 'event:manage': false, 'guest:manage': false, 'checkin:run': false, 'analytics:view': true, 'members:manage': false } }) }),
  )
  await page.route('**/api/events/event-operational/detail', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { ...event, guest_summary: { total: 0, confirmed: 0, pending: 0 }, guest_share_summary: { total: 0, with_email: 0, with_phone: 0, pending_with_email: 0 }, event_sections: [] } }) }),
  )
}

async function mockOwner(page: Page) {
  await page.addInitScript(() => localStorage.removeItem('eventi-storage'))
  await page.route('**/api/users', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { ...checkinUser, id: 'owner-1', email: 'owner@example.test', first_name: 'Olivia', last_name: 'Owner' } }) }),
  )
  await page.route('**/api/clients?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { data: [{ ...checkinClient, access_role: 'OWNER' }], total: 1, page: 1, page_size: 50, total_pages: 1 } }) }),
  )
  await page.route('**/api/clients', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: [{ ...checkinClient, access_role: 'OWNER' }] }) }),
  )
  await page.route('**/api/events?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { data: [event], total: 1, page: 1, page_size: 12, total_pages: 1, counts: { all: 1, upcoming: 1, today: 0, past: 0 } } }) }),
  )
}

test.describe('Matriz visual de capacidades', () => {
  test('Root 2 no recibe controles de gobierno de plataforma ni de eventos', async ({ page }) => {
    await mockOperationalRoot(page)

    await page.goto('/clients')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
    await expect(page.getByText('Root Operativo', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Nueva plataforma' })).toHaveCount(0)

    await page.goto('/events?create=1')
    await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
    await expect(page.getByText(/Vista operativa/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear evento' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Más acciones para Evento de soporte' })).toHaveCount(0)

    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible()
    await expect(page.getByText(/Modo operativo/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Root' })).toHaveCount(0)
  })

  test('Check-in puede ver su evento pero no recibe acciones de estructura', async ({ page }) => {
    await mockCheckin(page)

    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Evento de soporte' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear evento' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Más acciones para Evento de soporte' })).toHaveCount(0)
  })

  test('Analyst recibe únicamente su superficie de analítica', async ({ page }) => {
    await mockAnalyst(page)

    await page.goto('/events/event-operational')
    await expect(page.getByRole('heading', { name: 'Evento de soporte' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Analíticas' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Invitados' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Configuración' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0)
  })

  test('Owner conserva gestión de eventos dentro de su organización', async ({ page }) => {
    await mockOwner(page)

    await page.goto('/events')
    await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear evento' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Más acciones para Evento de soporte' })).toBeVisible()
  })
})
