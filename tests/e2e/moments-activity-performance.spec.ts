import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test('consolida el polling de actividad de Momentos en una sola solicitud', async ({ page }) => {
  const eventId = process.env.TEST_EVENT_ID
  test.skip(!eventId, 'TEST_EVENT_ID is required for the real local contract')

  let legacyActivityRequests = 0
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (pathname === '/api/moments/in-flight' || pathname === '/api/moments/reoptimizing') {
      legacyActivityRequests += 1
    }
  })
  const activityResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/moments/activity' && url.searchParams.get('event_id') === eventId
  })

  await page.goto(`/events/${eventId}?tab=momentos`)
  const response = await activityResponse
  expect(response.status()).toBe(200)
  const payload = await response.json()
  expect(payload?.data).toMatchObject({ in_flight: expect.any(Array), reoptimizing: expect.any(Array) })
  expect(legacyActivityRequests).toBe(0)
})
