import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test('accepts the disposable identity only on the isolated automation workspace', async ({ page }) => {
  test.skip(!process.env.E2E_ID_TOKEN, 'Only runs against the loopback qualification identity')

  await page.goto('/automation')
  await expect(page).toHaveURL(/\/automation$/)
  await expect(page.getByRole('heading', { name: 'Centro de automatización' })).toBeVisible()
  await expect(page).not.toHaveURL(/\/login/)

  const tokenResponse = await page.evaluate(async () => {
    const response = await fetch('/api/auth/token', { method: 'POST', cache: 'no-store' })
    return {
      status: response.status,
      cacheControl: response.headers.get('cache-control') ?? '',
    }
  })
  expect(tokenResponse.status).toBe(200)
  expect(tokenResponse.cacheControl).toContain('no-store')
})
