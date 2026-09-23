import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: undefined })

const client = { id: 'client-onboarding', name: 'Cliente de prueba', code: 'ITBEM', is_active: true, client_type: { code: 'CUSTOMER', name: 'Cliente' } }
const session = {
  application: { id: 'application-itbem', code: 'itbem', name: 'ITBEM', product_label: 'Agent operations', modules: ['home', 'users', 'organizations', 'metrics', 'automation'], allows_platform_admin: true, is_active: true },
  user: { id: 'user-onboarding', email: 'onboarding@example.test', first_name: 'Onboarding', last_name: 'Operator', is_active: true, is_root: true, root_level: 1 },
  organizations: [],
  capabilities: ['dashboard:view', 'automation:view', 'automation:manage', 'organizations:view'],
}

function envelope(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

async function installFixtures(page: Page, options: { clients?: typeof client[] } = {}) {
  const availableClients = options.clients ?? [client]
  const customerType = { id: '11111111-1111-4111-8111-111111111111', code: 'CUSTOMER', name: 'Cliente' }
  await page.context().addCookies([{ name: 'session', value: 'automation-onboarding-session', url: String(test.info().project.use.baseURL), httpOnly: true }])
  await page.route(/\/api\/auth\/token(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'automation-onboarding-token', session }) }))
  await page.route(/\/automation-bridge\/automation\/portfolio(?:\?.*)?$/, (route) => route.fulfill(envelope({ projects: [], totals: { projects: 0, work_items: 0, active_work_items: 0, decisions_required: 0, blocked_work_items: 0, attention_tasks: 0 } })))
  await page.route(/\/automation-bridge\/catalogs\/client-types(?:\?.*)?$/, (route) => route.fulfill(envelope([customerType])))
  await page.route(/\/automation-bridge\/clients(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill(envelope({ ...client, id: 'client-created', name: 'Cliente nuevo', client_type: customerType }))
    }
    return route.fulfill(envelope({ data: availableClients, total: availableClients.length, page: 1, page_size: 100, total_pages: 1 }))
  })
  await page.route(/\/automation-bridge\/automation\/projects$/, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { client_id?: string; name?: string; summary?: string }
      expect(body).toMatchObject({ client_id: client.id, name: 'Portal de prueba', summary: 'Preparar una entrega revisable' })
      return route.fulfill(envelope({ id: 'project-created', client_id: client.id, name: body.name, summary: body.summary, status: 'active', updated_at: new Date().toISOString() }))
    }
    return route.fulfill(envelope([]))
  })
  await page.route(/\/automation-bridge\/.*$/, (route) => {
    const url = route.request().url()
    // Let the explicit fixtures above handle the routes that drive this flow.
    // The generic guard must not turn a missing/encoded query into an empty
    // client list, otherwise the dialog correctly enters its unavailable state.
    if (url.includes('/automation-bridge/clients') || url.includes('/automation-bridge/catalogs/client-types') || url.includes('/automation-bridge/automation/portfolio') || url.includes('/automation-bridge/automation/projects')) return route.fallback()
    if (route.request().method() !== 'GET') return route.abort('blockedbyclient')
    return route.fulfill(envelope([]))
  })
}

test('crea proyecto sin lanzar agente y conserva la separación cliente → proyecto', async ({ page }) => {
  await installFixtures(page)
  await page.goto('/automation/projects?create=1')

  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Destino listo:')).toBeVisible()
  await page.getByLabel('Nombre del proyecto').fill('Portal de prueba')
  await page.getByLabel('¿Qué resultado necesitas?').fill('Preparar una entrega revisable')
  // The auth store may hydrate after the server-rendered dialog is visible.
  // Assert the controlled fields survived hydration before submitting.
  await expect(page.getByLabel('Nombre del proyecto')).toHaveValue('Portal de prueba')
  await expect(page.getByLabel('¿Qué resultado necesitas?')).toHaveValue('Preparar una entrega revisable')
  await expect(page.getByRole('button', { name: 'Crear proyecto', exact: true })).toBeEnabled()
  await expect(page.getByText(/no ejecuta al agente/i)).toBeVisible()

  const projectRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/automation-bridge/automation/projects'))
  await page.getByRole('button', { name: 'Crear proyecto', exact: true }).click()
  const request = await projectRequest
  expect(request.headers()['idempotency-key']).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/)
  await expect(page).toHaveURL(/\/automation\/projects\/project-created$/)
})

test('crea un cliente desde el alta de proyecto y lo deja seleccionado sin lanzar trabajo', async ({ page }) => {
  await installFixtures(page, { clients: [] })
  await page.goto('/automation/projects?create=1')

  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Necesitas una organización ITBEM para automatizar')).toBeVisible()
  await page.getByRole('button', { name: 'Crear cliente aquí' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Nueva organización' })).toBeVisible()

  await page.getByLabel('Nombre Legal o Comercial').fill('Cliente nuevo')
  await page.getByLabel('Tipo de Organización').selectOption('11111111-1111-4111-8111-111111111111')
  const clientRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/automation-bridge/clients'))
  await page.getByTestId('submit-client-form').click()
  await clientRequest

  await expect(page.getByText('Cliente creado y seleccionado. Puedes continuar con el proyecto.')).toBeVisible()
  await expect(page.getByLabel('Nombre del proyecto')).toBeVisible()
  await page.getByLabel('Nombre del proyecto').fill('Proyecto del cliente nuevo')
  await page.getByLabel('¿Qué resultado necesitas?').fill('Preparar su primera entrega revisable')
  await expect(page.getByRole('button', { name: 'Crear proyecto', exact: true })).toBeEnabled()
})

test('mantiene visibles pero bloqueadas las organizaciones de productos protegidos', async ({ page }) => {
  await installFixtures(page, {
    clients: [
      { ...client, id: 'client-eventiapp', name: 'EventiApp', code: 'eventiapp' },
      client,
      { ...client, id: 'client-itbem-2', name: 'ITBEM Sandbox', code: 'itbem' },
    ],
  })
  await page.goto('/automation/projects?create=1')

  await expect(page.getByRole('dialog')).toBeVisible()
  const protectedOption = page.getByRole('option', { name: /EventiApp.*protegido/i })
  // Chromium exposes the disabled state on the native option element, while
  // Playwright's generic toBeDisabled matcher only checks form controls.
  await expect(protectedOption).toHaveAttribute('disabled', '')
  await expect(page.getByText(/destinos protegidos se muestran/i)).toBeVisible()
})
