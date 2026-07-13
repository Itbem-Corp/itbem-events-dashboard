import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test('rehidrata el shell persistido sin divergencias SSR', async ({ page }) => {
  const hydrationErrors: string[] = []
  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error' && /hydrated|hydration mismatch/i.test(text)) hydrationErrors.push(text)
  })

  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('eventi-storage'))).not.toBeNull()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
  const mobileNavigation = page.getByRole('button', { name: 'Abrir navegación' })
  if (await mobileNavigation.isVisible()) await mobileNavigation.click()
  await expect(page.getByRole('link', { name: 'Clientes' })).toBeVisible()

  expect(hydrationErrors).toEqual([])
})
