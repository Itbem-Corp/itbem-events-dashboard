import { expect, test, type Page, type TestInfo } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

interface RuntimeIssue {
  kind: 'console' | 'page' | 'request' | 'response'
  route: string
  detail: string
}

function observeRuntimeHealth(page: Page) {
  const issues: RuntimeIssue[] = []
  let currentRoute = '/'

  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.push({ kind: 'console', route: currentRoute, detail: message.text() })
    }
  })
  page.on('pageerror', (error) => {
    issues.push({ kind: 'page', route: currentRoute, detail: error.message })
  })
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown failure'
    // Next cancels speculative RSC prefetches when a full navigation starts.
    if (failure === 'net::ERR_ABORTED' && request.url().includes('_rsc=')) return
    issues.push({ kind: 'request', route: currentRoute, detail: `${failure} ${request.url()}` })
  })
  page.on('response', (response) => {
    if (response.status() >= 500) {
      issues.push({ kind: 'response', route: currentRoute, detail: `${response.status()} ${response.url()}` })
    }
  })

  return {
    issues,
    setRoute(route: string) {
      currentRoute = route
    },
  }
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(100)
}

async function visitPrimaryRoute(page: Page, route: string, heading: string) {
  await page.goto(route)
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  await settle(page)
}

test('keeps the authenticated workspace free of runtime and server errors', async ({ page }, testInfo: TestInfo) => {
  const health = observeRuntimeHealth(page)

  const primaryRoutes = [
    { route: '/', heading: 'Dashboard' },
    { route: '/events', heading: 'Eventos' },
    { route: '/users', heading: 'Usuarios' },
    { route: '/clients', heading: 'Clientes' },
    { route: '/settings/profile', heading: 'Mi perfil' },
  ]

  for (const destination of primaryRoutes) {
    health.setRoute(destination.route)
    await visitPrimaryRoute(page, destination.route, destination.heading)
  }

  health.setRoute('/events')
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()
  await settle(page)
  const eventLink = page.locator('main ul li a[href^="/events/"]').first()
  await expect(eventLink, 'The local test account needs an event to audit operational routes').toBeVisible()
  const eventHref = await eventLink.getAttribute('href')
  expect(eventHref).toMatch(/^\/events\/[^/?#]+$/)

  health.setRoute(eventHref!)
  await page.goto(eventHref!)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await settle(page)

  health.setRoute(`${eventHref}/checkin`)
  await page.goto(`${eventHref}/checkin`)
  await expect(page.getByRole('searchbox', { name: 'Buscar invitado por nombre o mesa' })).toBeVisible()
  await settle(page)

  health.setRoute(`${eventHref}/studio`)
  await page.goto(`${eventHref}/studio`)
  await expect(page.getByRole('button', { name: /Publicar evento|Publicado|Preparando Studio/ })).toBeVisible()
  await settle(page)

  await testInfo.attach('runtime-health.json', {
    body: JSON.stringify(health.issues, null, 2),
    contentType: 'application/json',
  })
  expect(health.issues).toEqual([])
})

test('keeps page motion brief and disables it when the user requests reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()
  const transition = page.locator('.page-transition').first()
  await expect(transition).toBeVisible()
  const motion = await transition.evaluate((element) => {
    const style = getComputedStyle(element)
    return { name: style.animationName, duration: style.animationDuration }
  })
  expect(motion).toEqual({ name: 'page-enter', duration: '0.16s' })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible()
  expect(await transition.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
})
