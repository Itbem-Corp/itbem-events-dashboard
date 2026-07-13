import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

async function hasResource(page: import('@playwright/test').Page, pattern: RegExp) {
  return page.evaluate(
    (source) => performance.getEntriesByType('resource').some((entry) => new RegExp(source, 'i').test(entry.name)),
    pattern.source
  )
}

test.describe('Interacciones administrativas bajo intención', () => {
  test('precarga los flujos de clientes sin penalizar la entrada', async ({ page }) => {
    await page.goto('/clients')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()

    expect(await hasResource(page, /client-form-modal/)).toBe(false)
    expect(await hasResource(page, /delete-client-modal/)).toBe(false)
    expect(await hasResource(page, /client-members-modal/)).toBe(false)

    let clientTypeRequests = 0
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/catalogs/client-types')) clientTypeRequests += 1
    })

    const createClient = page.getByRole('button', { name: 'Nuevo Cliente' })
    await createClient.focus()
    await expect.poll(() => hasResource(page, /client-form-modal/)).toBe(true)
    await expect.poll(() => clientTypeRequests).toBeGreaterThan(0)
    await page.waitForLoadState('networkidle')
    const clientTypeRequestsBeforeOpen = clientTypeRequests
    await page.keyboard.press('Enter')

    const createTitle = page.getByRole('heading', { name: 'Nueva Organización' })
    await expect(createTitle).toBeVisible()
    await expect(page.getByLabel('Nombre Legal o Comercial')).toBeVisible()
    await expect(page.getByLabel('Tipo de Organización')).toBeVisible()
    await page.waitForTimeout(250)
    expect(clientTypeRequests).toBe(clientTypeRequestsBeforeOpen)

    await page.keyboard.press('Escape')
    await expect(createTitle).not.toBeVisible()
    await expect(createClient).toBeFocused()

    const actions = page.getByRole('button', { name: /Más acciones para/i }).first()
    await actions.focus()
    await expect.poll(() => hasResource(page, /client-list-actions-menu/)).toBe(true)
    expect(await hasResource(page, /delete-client-modal/)).toBe(false)
    expect(await hasResource(page, /client-members-modal/)).toBe(false)
    await page.keyboard.press('Enter')

    const manageMembers = page.getByRole('menuitem', { name: 'Gestionar miembros' }).first()
    await expect(manageMembers).toBeVisible()
    await manageMembers.focus()
    await expect.poll(() => hasResource(page, /client-members-modal/)).toBe(true)
    await manageMembers.click()
    await expect(page.getByRole('heading', { name: /Miembros/ })).toBeVisible()
  })

  test('muestra controles inmediatos y precarga los flujos de usuarios', async ({ page }) => {
    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible()

    expect(await hasResource(page, /user-form-modal/)).toBe(false)
    expect(await hasResource(page, /delete-user-modal/)).toBe(false)

    const createUser = page.getByRole('button', { name: 'Nuevo Usuario' })
    await createUser.focus()
    await expect.poll(() => hasResource(page, /user-form-modal/)).toBe(true)
    await page.keyboard.press('Enter')

    const createTitle = page.getByRole('heading', { name: 'Invitar usuario' })
    await expect(createTitle).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Nombre')).toBeVisible()
    await expect(page.getByLabel('Apellido')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(createTitle).not.toBeVisible()
    await expect(createUser).toBeFocused()

    const actions = page.getByRole('button', { name: /Más acciones para/i }).first()
    await actions.focus()
    await expect.poll(() => hasResource(page, /user-list-actions-menu/)).toBe(true)
    expect(await hasResource(page, /delete-user-modal/)).toBe(false)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menuitem', { name: 'Editar usuario' }).first()).toBeVisible()
  })
})
