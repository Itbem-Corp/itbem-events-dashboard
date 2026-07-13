import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test('usa el contrato paginado real del backend local', async ({ page }) => {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/clients' && url.searchParams.get('page_size') === '12'
  })

  await page.goto('/clients')
  const response = await responsePromise
  expect(response.status()).toBe(200)
  const payload = await response.json()
  expect(payload?.data).toMatchObject({
    data: expect.any(Array),
    total: expect.any(Number),
    page: 1,
    page_size: 12,
    total_pages: expect.any(Number),
  })
  expect(payload.data.data.length).toBeLessThanOrEqual(12)
  for (const client of payload.data.data) {
    expect(client.client_type).toMatchObject({ id: expect.any(String), code: expect.any(String) })
    if (client.parent_id) expect(client.parent).toMatchObject({ id: client.parent_id, name: expect.any(String) })
  }
})

test('conserva usuarios y roles en la página real de miembros', async ({ request }) => {
  const tokenResponse = await request.get('http://localhost:3000/api/auth/token')
  expect(tokenResponse.status()).toBe(200)
  const { token } = await tokenResponse.json()
  const headers = { Authorization: `Bearer ${token}` }

  const clientsResponse = await request.get('http://localhost:8080/api/clients?page=1&page_size=12', { headers })
  expect(clientsResponse.status()).toBe(200)
  const clientsPayload = await clientsResponse.json()
  const clientId = clientsPayload?.data?.data?.[0]?.id
  test.skip(!clientId, 'No client is available for the local account')

  const membersResponse = await request.get(
    `http://localhost:8080/api/clients/members?client_id=${encodeURIComponent(clientId)}&page=1&page_size=12`,
    { headers }
  )
  expect(membersResponse.status()).toBe(200)
  const payload = await membersResponse.json()
  expect(payload?.data).toMatchObject({
    data: expect.any(Array),
    total: expect.any(Number),
    page: 1,
    page_size: 12,
    total_pages: expect.any(Number),
  })
  for (const member of payload.data.data) {
    expect(member.user).toMatchObject({
      id: member.user_id,
      email: expect.any(String),
      is_active: expect.any(Boolean),
    })
    expect(member).toMatchObject({
      role_id: expect.any(String),
      role_code: expect.any(String),
      role_name: expect.any(String),
    })
  }
})

test('pagina, busca y precarga organizaciones con payloads acotados', async ({ page }) => {
  const clients = Array.from({ length: 25 }, (_, index) => {
    const number = index + 1
    return {
      id: `client-${number}`,
      name: `Organización ${String(number).padStart(2, '0')}`,
      code: `organizacion-${number}`,
      client_type_id: 'type-agency',
      client_type: { id: 'type-agency', code: 'AGENCY', name: 'Agencia' },
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
  })
  const requestedPages: number[] = []
  const searches: string[] = []
  let deleteWrites = 0

  await page.route(/localhost:8080\/api\/clients\/client-\d+$/, async (route) => {
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
    const clientId = new URL(route.request().url()).pathname.split('/').at(-1)
    const index = clients.findIndex((client) => client.id === clientId)
    if (index >= 0) clients.splice(index, 1)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200 }) })
  })

  await page.route(/localhost:8080\/api\/clients(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url())
    const currentPage = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('page_size') ?? '12')
    const search = (url.searchParams.get('search') ?? '').toLowerCase()
    requestedPages.push(currentPage)
    searches.push(search)
    const matches = clients.filter((client) => `${client.name} ${client.code}`.toLowerCase().includes(search))
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

  await page.goto('/clients')
  await expect(page.getByText('Organización 01', { exact: true })).toBeVisible()
  await expect(page.getByText('Organización 12', { exact: true })).toBeVisible()
  await expect(page.getByText('Organización 13', { exact: true })).not.toBeVisible()

  const nextPage = page.getByRole('button', { name: /siguiente/i })
  await nextPage.focus()
  await expect.poll(() => requestedPages.filter((value) => value === 2).length).toBe(1)
  await nextPage.click()
  await expect(page).toHaveURL('/clients?page=2')
  await expect(page.getByText('Organización 13', { exact: true })).toBeVisible()

  const search = page.getByRole('searchbox', { name: 'Buscar cliente' })
  await search.fill('Organización 25')
  await expect.poll(() => searches).toContain('organización 25')
  await expect(page.getByText('Organización 25', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/clients\?q=Organizaci%C3%B3n\+25/)

  await page.getByRole('button', { name: /acciones para .*25/i }).click()
  await page.getByRole('menuitem', { name: /Eliminar organizaci/i }).click()
  const deleteStartedAt = await page.evaluate(() => performance.now())
  await page.getByTestId('confirm-delete-client').evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.locator('h2').filter({ hasText: /25$/ })).not.toBeVisible()
  const optimisticLatency = await page.evaluate((startedAt) => performance.now() - startedAt, deleteStartedAt)
  expect(optimisticLatency).toBeLessThan(400)
  await expect.poll(() => deleteWrites).toBe(1)
  await expect(page.getByText('Cliente eliminado')).toBeVisible({ timeout: 3000 })

  await search.fill('organizacion-24')
  await expect(page.locator('h2').filter({ hasText: /24$/ })).toBeVisible()
  await page.getByRole('button', { name: /acciones para .*24/i }).click()
  await page.getByRole('menuitem', { name: /Eliminar organizaci/i }).click()
  await page.getByTestId('confirm-delete-client').click()
  await expect(page.locator('h2').filter({ hasText: /24$/ })).not.toBeVisible()
  await expect.poll(() => deleteWrites).toBe(2)
  await expect(page.locator('h2').filter({ hasText: /24$/ })).toBeVisible({ timeout: 3000 })
})

test('el selector global busca organizaciones remotamente sin cargar el catálogo completo', async ({ page }) => {
  const clients = Array.from({ length: 125 }, (_, index) => ({
    id: `switcher-client-${index + 1}`,
    name: `Switcher Org ${String(index + 1).padStart(3, '0')}`,
    code: `switcher-org-${index + 1}`,
    client_type: { code: 'AGENCY' },
  }))
  const requests: string[] = []

  await page.route(/localhost:8080\/api\/clients(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url())
    requests.push(url.search)
    const pageSize = Number(url.searchParams.get('page_size') ?? clients.length)
    const search = (url.searchParams.get('search') ?? '').toLowerCase()
    const matches = clients.filter((client) => `${client.name} ${client.code}`.toLowerCase().includes(search))

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

  await page.goto('/')
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole('button', { name: 'Abrir navegación' }).click()
  }
  await page.getByRole('button', { name: /Todas las organizaciones/ }).click()
  const search = page.getByRole('searchbox', { name: /Buscar organizaci/ })
  await expect(search).toBeVisible()
  await expect(page.getByText('50 de 125 organizaciones')).toBeVisible()
  expect(requests).toContain('?page=1&page_size=50')
  expect(requests).not.toContain('')

  await search.fill('Switcher Org 125')
  await expect.poll(() => requests.some((request) => request.includes('search=Switcher+Org+125'))).toBe(true)
  await expect(page.getByText('Switcher Org 125', { exact: true })).toBeVisible()
  await expect(page.getByText('1 de 1 organizaciones')).toBeVisible()
})

test('precarga la misma página acotada que consume Clientes y reutiliza su caché al navegar', async ({ page }) => {
  const requests: string[] = []
  await page.route(/localhost:8080\/api\/clients(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url())
    requests.push(url.search)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 200,
        data: { data: [], total: 0, page: 1, page_size: 12, total_pages: 1 },
      }),
    })
  })

  await page.goto('/')
  const isMobile = (page.viewportSize()?.width ?? 1280) < 1024
  const clientsLink = isMobile
    ? page.getByRole('navigation', { name: /Navegaci/ }).getByRole('link', { name: 'Clientes' })
    : page.getByRole('link', { name: 'Clientes' }).first()
  if (isMobile) await clientsLink.focus()
  else await clientsLink.hover()
  await expect.poll(() => requests.filter((request) => request === '?page=1&page_size=12').length).toBe(1)
  expect(requests).not.toContain('')

  await clientsLink.click()
  await expect(page).toHaveURL('/clients')
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible()
  expect(requests.filter((request) => request === '?page=1&page_size=12')).toHaveLength(1)
  expect(requests).not.toContain('')
})
