import { expect, test, type Page } from '@playwright/test'

// Hermetic smoke coverage for the ITBEM operating shell. The test deliberately
// uses valid empty read models: an empty organization, audit log or cost ledger
// is a supported product state, not a network error or a reason to fake data.
test.use({ storageState: undefined })

const session = {
  application: {
    id: 'application-itbem',
    code: 'itbem',
    name: 'ITBEM',
    product_label: 'Agent operations',
    modules: ['home', 'users', 'organizations', 'metrics', 'automation'],
    allows_platform_admin: true,
    is_active: true,
  },
  user: {
    id: 'operations-sections-user',
    email: 'operations-sections@example.test',
    first_name: 'Operations',
    last_name: 'Operator',
    is_active: true,
    is_root: true,
    root_level: 1,
  },
  organizations: [],
  capabilities: [
    'dashboard:view',
    'metrics:view',
    'platform:users:view',
    'audit:view',
    'organizations:view',
    'automation:view',
    'automation:manage',
  ],
}

function envelope(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

async function installFixtures(page: Page) {
  await page.context().addCookies([
    {
      name: 'session',
      value: 'operations-sections-session',
      url: String(test.info().project.use.baseURL),
      httpOnly: true,
    },
  ])

  await page.route(/\/api\/auth\/token(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'operations-sections-token', session }),
    }),
  )

  await page.route(/\/automation-bridge\/.*$/, async (route) => {
    if (route.request().method() !== 'GET') {
      return route.abort('blockedbyclient')
    }

    const url = route.request().url()
    if (url.includes('/metrics/portfolio')) {
      return route.fulfill(envelope({
        from: '2026-08-23',
        to: '2026-09-21',
        summaries: [],
        timeline: [],
        inventory: { organizations: 0, users: 0, events: 0 },
      }))
    }
    if (url.includes('/users')) {
      return route.fulfill(envelope({ data: [], total: 0, page: 1, page_size: 10, total_pages: 1 }))
    }
    if (url.includes('/clients')) {
      return route.fulfill(envelope({ data: [], total: 0, page: 1, page_size: 12, total_pages: 1 }))
    }
    if (url.includes('/audit')) {
      return route.fulfill(envelope({ data: [], total: 0, page: 1, page_size: 30, total_pages: 1 }))
    }
    if (url.includes('/automation/costs')) {
      return route.fulfill(envelope({ range_days: 30, summary: {}, guardrails: [], recent_executions: [] }))
    }
    return route.fulfill(envelope([]))
  })
}

test('carga las superficies operativas ITBEM con estados vacíos honestos', async ({ page }) => {
  await installFixtures(page)
  const responses: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('automation-bridge') || response.status() >= 400) {
      responses.push(`${response.status()} ${response.url()}`)
    }
  })

  const routes = [
    { path: '/metrics', heading: 'Métricas de producto' },
    { path: '/users', heading: 'Usuarios' },
    { path: '/audit', heading: 'Auditoría' },
    { path: '/clients', heading: 'Clientes' },
    { path: '/automation/costs', heading: 'Uso y costos' },
  ]

  for (const destination of routes) {
    await page.goto(destination.path, { waitUntil: 'domcontentloaded' })
    const heading = page.getByRole('heading', { name: destination.heading, exact: true })
    try {
      await expect(heading).toBeVisible({ timeout: 15_000 })
    } catch (error) {
      throw new Error(`${destination.path} did not render ${destination.heading}. Responses:\n${responses.join('\n')}`, { cause: error })
    }
  }
})
