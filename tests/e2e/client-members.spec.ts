import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test.describe('Gestor de miembros de cliente', () => {
  test('abre por teclado, conserva el foco y no desborda el viewport', async ({ page }) => {
    await page.goto('/clients')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
    const resourcesBeforeIntent = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name),
    )
    expect(resourcesBeforeIntent.some((url) => /client-members-modal/i.test(url))).toBe(false)

    const actions = page.getByRole('button', { name: /Más acciones para/i }).first()
    await expect(actions).toBeVisible()
    await actions.focus()
    await expect(actions).toBeFocused()
    await page.keyboard.press('Enter')

    const manageMembers = page.getByRole('menuitem', { name: 'Gestionar miembros' }).first()
    await expect(manageMembers).toBeVisible()
    await manageMembers.click()

    const title = page.getByRole('heading', { name: /Miembros —/i })
    await expect(title).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invitar existente' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Crear usuario' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cerrar' })).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() =>
          performance
            .getEntriesByType('resource')
            .some((entry) => /client-members-modal/i.test(entry.name)),
        ),
      )
      .toBe(true)

    await page.getByRole('button', { name: 'Invitar existente' }).click()
    await expect(page.getByText('Invitar miembro', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Correo electrónico')).toBeVisible()
    await expect(page.getByLabel('Rol')).toBeVisible()

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 2)

    await page.keyboard.press('Escape')
    await expect(title).not.toBeVisible()
    await expect(manageMembers).toBeFocused()
  })

  test('pagina y busca equipos grandes sin descargar todos los miembros', async ({ page }) => {
    const members = Array.from({ length: 45 }, (_, index) => ({
      id: `member-${index + 1}`,
      user_id: `user-${index + 1}`,
      client_id: 'client-test',
      first_name: `Member ${String(index + 1).padStart(2, '0')}`,
      last_name: 'Scale',
      email: `member${index + 1}@example.com`,
      role_id: 'role-member',
      role_code: 'MEMBER',
      role_name: 'Miembro',
      user: { id: `user-${index + 1}`, first_name: `Member ${String(index + 1).padStart(2, '0')}`, last_name: 'Scale', email: `member${index + 1}@example.com`, is_active: true },
    }))
    const requests: URL[] = []
    await page.route(/localhost:8080\/api\/clients\/members(?:\?.*)?$/, (route) => {
      const url = new URL(route.request().url())
      if (route.request().method() !== 'GET') return route.continue()
      requests.push(url)
      const pageNumber = Number(url.searchParams.get('page') ?? '1')
      const pageSize = Number(url.searchParams.get('page_size') ?? members.length)
      const search = (url.searchParams.get('search') ?? '').toLowerCase()
      const matches = members.filter((member) => `${member.first_name} ${member.last_name} ${member.email}`.toLowerCase().includes(search))
      const data = matches.slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { data, total: matches.length, page: pageNumber, page_size: pageSize, total_pages: Math.ceil(matches.length / pageSize) } }) })
    })

    await page.goto('/clients')
    const actions = page.getByRole('button', { name: /Más acciones para/i }).first()
    await actions.focus()
    await page.keyboard.press('Enter')
    const manageMembers = page.getByRole('menuitem', { name: 'Gestionar miembros' }).first()
    await expect(manageMembers).toBeVisible()
    await manageMembers.click()
    await expect(page.getByText('Member 01 Scale')).toBeVisible()
    await expect(page.getByText('Member 20 Scale')).toBeVisible()
    await expect(page.getByText('Member 21 Scale')).not.toBeVisible()
    expect(requests.every((url) => url.searchParams.get('page_size') === '20')).toBe(true)

    await page.getByRole('button', { name: /siguiente/i }).click()
    await expect(page.getByText('Member 21 Scale')).toBeVisible()
    const search = page.getByRole('searchbox', { name: 'Buscar miembro' })
    await search.fill('Member 45')
    await expect(page.getByText('Member 45 Scale')).toBeVisible()
    await expect.poll(() => requests.some((url) => url.searchParams.get('search') === 'Member 45')).toBe(true)
  })

  test('actualiza y remueve miembros de forma optimista', async ({ page }) => {
    let roleId = 'role-member'
    let removed = false
    const member = {
      id: 'membership-1', user_id: 'user-1', client_id: 'client-test',
      first_name: 'Persona', last_name: 'Equipo', email: 'persona@example.com',
      role_id: roleId, role_code: 'MEMBER', role_name: 'Miembro',
      user: { id: 'user-1', first_name: 'Persona', last_name: 'Equipo', email: 'persona@example.com', is_active: true },
    }

    await page.route(/localhost:8080\/api\/catalogs\/roles(?:\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: [
        { id: 'role-admin', code: 'ADMIN', name: 'Administrador', hierarchy: 2 },
        { id: 'role-member', code: 'MEMBER', name: 'Miembro', hierarchy: 3 },
      ] }) }),
    )
    await page.route(/localhost:8080\/api\/clients\/members(?:\/[^?]+)?(?:\?.*)?$/, async (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        const data = removed ? [] : [{ ...member, role_id: roleId, role_code: roleId === 'role-admin' ? 'ADMIN' : 'MEMBER', role_name: roleId === 'role-admin' ? 'Administrador' : 'Miembro' }]
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: { data, total: data.length, page: 1, page_size: 20, total_pages: data.length } }) })
      }
      await new Promise((resolve) => setTimeout(resolve, 700))
      if (method === 'PUT') roleId = 'role-admin'
      if (method === 'DELETE') removed = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data: null }) })
    })

    await page.goto('/clients')
    await page.getByRole('button', { name: /acciones para/i }).first().click()
    await page.getByRole('menuitem', { name: 'Gestionar miembros' }).first().click()
    await expect(page.getByText('Persona Equipo')).toBeVisible()

    await page.getByLabel('Editar rol').click()
    await page.getByRole('combobox', { name: 'Rol' }).selectOption('role-admin')
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.getByText('Administrador')).toBeVisible({ timeout: 400 })

    await page.getByLabel('Remover miembro').click()
    await page.getByRole('button', { name: 'Remover', exact: true }).click()
    await expect(page.getByText('Persona Equipo')).not.toBeVisible({ timeout: 400 })
  })
})
