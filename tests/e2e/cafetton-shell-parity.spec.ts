import { expect, test, type Page, type Request, type Route } from '@playwright/test'

// Cafetton House must look and behave exactly as before the EventiApp shell
// policy. Run it twice with the same machine and browser:
//
//   1. Against a build of the previous main branch, to record the baseline:
//      CAFETTON_PARITY_BASE_URL=http://dashboard.cafettonhouse.localhost:<main-port> \
//        npx playwright test --project=cafetton-parity --update-snapshots
//   2. Against this build, to compare:
//      CAFETTON_PARITY_BASE_URL=http://dashboard.cafettonhouse.localhost:<port> \
//        npx playwright test --project=cafetton-parity
//
// Baselines are machine-specific and stay out of git (.playwright-baselines/).
// The API is mocked; no real login or backend is used.

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

const organizations = [
  { id: 'org-cafetton-a', name: 'Cafetería Centro', code: 'cafettonhouse', is_active: true, client_type: { code: 'CUSTOMER' } },
  { id: 'org-cafetton-b', name: 'Cafetería Norte', code: 'cafetton-norte', is_active: true, client_type: { code: 'CUSTOMER' } },
]

const capabilities = ['dashboard:view', 'organizations:view', 'members:manage', 'metrics:view']

const user = {
  id: 'user-cafetton-owner',
  email: 'owner@cafetton.example.test',
  first_name: 'Persona',
  last_name: 'Cafetton',
  is_active: true,
  is_root: false,
  root_level: 0,
}

const session = {
  application: {
    id: 'application-cafettonhouse',
    code: 'cafettonhouse',
    name: 'Cafetton House',
    product_label: 'Client operations',
    modules: ['home', 'users', 'organizations', 'metrics'],
    allows_platform_admin: false,
    is_active: true,
  },
  user,
  organizations: organizations.map((organization) => ({ ...organization, access_role: 'OWNER', capabilities })),
  capabilities,
}

function response(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

function isPageRequest(request: Request) {
  const url = new URL(request.url())
  return (
    request.resourceType() === 'document' ||
    url.pathname.startsWith('/_next') ||
    url.searchParams.has('_rsc') ||
    request.headers()['rsc'] !== undefined
  )
}

async function mockApi(page: Page, pattern: RegExp, handler: (route: Route) => Promise<void> | void) {
  await page.route(pattern, (route) => (isPageRequest(route.request()) ? route.fallback() : handler(route)))
}

async function installCafettonSession(page: Page, baseURL: string) {
  await page.context().addCookies([{ name: 'session', value: 'persona-cafetton', url: baseURL, httpOnly: true }])
  await page.addInitScript(() => window.localStorage.removeItem('eventi-storage'))
  // Stable rendering: no animations and a fixed clock for relative dates.
  await page.clock.install({ time: new Date('2026-10-12T15:00:00.000Z') })

  await mockApi(page, /\/api\/auth\/token(?:\?.*)?$/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'persona-token', session }) })
  )
  await mockApi(page, /\/session(?:\?.*)?$/, (route) => route.fulfill(response(session)))
  await mockApi(page, /\/session\/organization-context(?:\?.*)?$/, (route) => {
    const body = route.request().postDataJSON() as { organization_id?: string } | null
    return route.fulfill(response({
      token: 'context-token',
      organization_id: body?.organization_id ?? organizations[0].id,
      expires_at: '2026-10-12T15:05:00.000Z',
    }))
  })
  await mockApi(page, /\/users(?:\?.*)?$/, (route) => route.fulfill(response(user)))
  await mockApi(page, /\/clients(?:\?.*)?$/, (route) =>
    route.fulfill(response({
      data: organizations.map((organization) => ({ ...organization, access_role: 'OWNER' })),
      total: organizations.length,
      page: 1,
      page_size: 50,
      total_pages: 1,
    }))
  )
  await mockApi(page, /\/metrics\/portfolio(?:\?.*)?$/, (route) => route.fulfill(response({ summaries: [], daily: [] })))
}

test.describe('Cafetton House shell parity', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'cafetton-parity', 'Runs only in the cafetton-parity project')
  })

  for (const viewport of VIEWPORTS) {
    test(`Inicio at ${viewport.width}px matches the previous build`, async ({ page }) => {
      const baseURL = process.env.CAFETTON_PARITY_BASE_URL
      test.skip(!baseURL, 'CAFETTON_PARITY_BASE_URL is not set')
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await installCafettonSession(page, baseURL!)
      const apiRequests: string[] = []
      page.on('request', (request) => {
        if (isPageRequest(request)) return
        const url = new URL(request.url())
        if (url.origin === new URL(baseURL!).origin && !url.pathname.startsWith('/automation-bridge') && !url.pathname.startsWith('/api/')) return
        apiRequests.push(`${request.method()} ${url.pathname.replace(/^\/automation-bridge/, '')}${url.search}`)
      })

      await page.goto(new URL('/', baseURL).toString())
      await expect(page.getByText('Espacio de trabajo', { exact: true })).toBeVisible()
      await page.waitForLoadState('networkidle')

      await expect(page).toHaveScreenshot(`cafetton-home-${viewport.name}.png`, { fullPage: true, animations: 'disabled', caret: 'hide' })
      // Same requests, in the same order, with the same query strings.
      expect(apiRequests.join('\n')).toMatchSnapshot(`cafetton-home-${viewport.name}-requests.txt`)
    })
  }
})
