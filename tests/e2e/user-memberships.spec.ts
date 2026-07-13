import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

async function hasResource(page: import('@playwright/test').Page, pattern: RegExp) {
  return page.evaluate(
    (source) => performance.getEntriesByType('resource').some((entry) => new RegExp(source, 'i').test(entry.name)),
    pattern.source
  )
}

test.describe('Membresías de usuario', () => {
  test('abre el detalle sin overflow y conserva acciones accesibles', async ({ page }) => {
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible()

    const detailRequests: string[] = []
    const legacySummaryRequests: string[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (/\/users\/[^/]+\/clients$/.test(path)) detailRequests.push(path)
      if (/\/users\/[^/]+$/.test(path) && !path.endsWith('/users/all')) legacySummaryRequests.push(path)
    })

    const membershipsButton = page.getByRole('link', { name: /Ver clientes de/i }).first()
    await expect(membershipsButton).toBeVisible()
    await membershipsButton.focus()
    await expect.poll(() => detailRequests.length).toBeGreaterThan(0)
    await membershipsButton.click()

    await expect(page).toHaveURL(/\/users\/[^/]+\/clients$/)
    await expect(page.getByText('Membresías del usuario')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Resumen de membresías' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Administrar clientes' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('link', { name: 'Usuarios' })).toBeVisible()
    expect(legacySummaryRequests).toEqual([])

    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 2)

    const search = page.getByRole('searchbox', { name: 'Buscar organización' })
    const emptyState = page.getByRole('heading', { name: 'Sin organizaciones asignadas' })
    if (await search.isVisible()) {
      expect(await hasResource(page, /client-members-modal/)).toBe(false)
      const memberRequests: URL[] = []
      page.on('request', (request) => {
        const url = new URL(request.url())
        if (url.pathname === '/api/clients/members') memberRequests.push(url)
      })
      const manage = page.getByRole('button', { name: /Gestionar miembros de/i }).first()
      await manage.focus()
      await expect.poll(() => hasResource(page, /client-members-modal/)).toBe(true)
      await expect.poll(() => memberRequests.length).toBeGreaterThan(0)
      expect(memberRequests.every((url) => url.searchParams.get('page_size') === '20')).toBe(true)
      await manage.click()
      await expect(page.getByRole('heading', { name: /Miembros/ })).toBeVisible()
      await page.keyboard.press('Escape')

      await search.fill('sin-coincidencias-e2e')
      await expect(page.getByText('Sin coincidencias')).toBeVisible()
      await page.getByRole('button', { name: 'Limpiar búsqueda' }).click()
      await expect(search).toHaveValue('')
    } else {
      await expect(emptyState).toBeVisible()
      await expect(page.getByRole('link', { name: 'Ir a Clientes' })).toBeVisible()
    }
  })

  test('separa identidad y pagina portafolios grandes sin perder métricas', async ({ page }) => {
    await page.goto('/users')
    const detailLink = page.getByRole('link', { name: /Ver clientes de/i }).first()
    const href = await detailLink.getAttribute('href')
    expect(href).toBeTruthy()
    const userId = href!.split('/')[2]
    const clients = Array.from({ length: 55 }, (_, index) => ({
      id: `portfolio-client-${index + 1}`,
      name: `Portfolio Org ${String(index + 1).padStart(2, '0')}`,
      code: `portfolio-${index + 1}`,
      is_active: index < 40,
      client_type_id: 'type-customer',
      client_type: { id: 'type-customer', code: 'CUSTOMER', name: 'Cliente' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }))
    const portfolioRequests: URL[] = []

    await page.route(new RegExp(`localhost:8080/api/users/${userId}/clients(?:\\?.*)?$`), (route) => {
      const url = new URL(route.request().url())
      portfolioRequests.push(url)
      const pageNumber = Number(url.searchParams.get('page') ?? '1')
      const pageSize = Number(url.searchParams.get('page_size') ?? clients.length)
      const search = (url.searchParams.get('search') ?? '').toLowerCase()
      const matches = clients.filter((client) => `${client.name} ${client.code}`.toLowerCase().includes(search))
      const data = matches.slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { user: { id: userId, email: 'portfolio@example.com', first_name: 'Portfolio', last_name: 'User', is_active: true, is_root: false, created_at: '2026-01-01T00:00:00Z' }, data, total: matches.length, page: pageNumber, page_size: pageSize, total_pages: Math.ceil(matches.length / pageSize), active: 40, inactive: 15 } }) })
    })

    await page.goto(href!)
    await expect(page.getByText('Portfolio User')).toBeVisible()
    await expect(page.getByText('Portfolio Org 01')).toBeVisible()
    await expect(page.getByText('Portfolio Org 20')).toBeVisible()
    await expect(page.getByText('Portfolio Org 21')).not.toBeVisible()
    expect(portfolioRequests.every((url) => url.searchParams.get('page_size') === '20')).toBe(true)
    await page.getByRole('button', { name: /siguiente/i }).click()
    await expect(page.getByText('Portfolio Org 21')).toBeVisible()
    await page.getByRole('searchbox', { name: /Buscar organizaci/ }).fill('Portfolio Org 55')
    await expect(page.getByText('Portfolio Org 55')).toBeVisible()
    await expect.poll(() => portfolioRequests.some((url) => url.searchParams.get('search') === 'Portfolio Org 55')).toBe(true)
  })
})
