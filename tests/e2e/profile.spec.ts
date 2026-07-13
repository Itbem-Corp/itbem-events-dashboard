/**
 * profile.spec.ts — Perfil de usuario
 *
 * QA Agent: Actualizar si cambia el formulario de perfil,
 * se agregan nuevos campos, o cambia el comportamiento del avatar.
 */

import { expect, test } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test.describe('Perfil', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/profile')
    await page.waitForLoadState('networkidle')
  })

  test('muestra el heading Mi Perfil', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Mi Perfil' })).toBeVisible()
  })

  test('muestra los campos Nombre, Apellidos y Correo electrónico', async ({ page }) => {
    await expect(page.getByLabel('Nombre')).toBeVisible()
    await expect(page.getByLabel('Apellidos')).toBeVisible()
    await expect(page.getByLabel('Correo electrónico')).toBeVisible()
  })

  test('el campo de correo está deshabilitado', async ({ page }) => {
    const emailInput = page.getByLabel('Correo electrónico')
    await expect(emailInput).toBeDisabled()
  })

  test('muestra el botón Guardar cambios', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible()
  })

  test('guarda el nombre y muestra toast de éxito', async ({ page }) => {
    const firstNameInput = page.getByLabel('Nombre')
    const originalValue = await firstNameInput.inputValue()

    // Modificar el nombre
    await firstNameInput.fill('TestNombre')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()

    // Toast de éxito debe aparecer
    await expect(page.getByText('Perfil guardado correctamente')).toBeVisible({ timeout: 5000 })

    // Restaurar valor original
    await firstNameInput.fill(originalValue)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
  })

  test('muestra sección de foto de perfil', async ({ page }) => {
    await expect(page.getByText('Foto de perfil')).toBeVisible()
  })

  test('carga el editor de avatar solamente cuando se solicita', async ({ page }) => {
    await expect(page.locator('input[type="file"]')).toHaveCount(0)

    await page.getByRole('button', { name: 'Cambiar foto' }).click()

    const modalTitle = page.getByRole('heading', { name: 'Actualizar foto de perfil' })
    await expect(modalTitle).toBeVisible()
    await expect(page.locator('input[type="file"]')).toHaveCount(1)

    await page.getByRole('button', { name: 'Cerrar' }).click()
    await expect(modalTitle).not.toBeVisible()
  })

  test('precarga el perfil desde la intenciÃ³n del menÃº mÃ³vil', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Este contrato cubre la superficie mÃ³vil')
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
    await page.waitForTimeout(750)

    const accountButton = page.locator('button[aria-label="Abrir menÃº de cuenta"]:visible').last()
    await expect(accountButton).toBeVisible()
    await accountButton.focus()
    await page.keyboard.press('Enter')

    const profileItem = page.getByRole('menuitem', { name: 'Mi Perfil' })
    await expect(profileItem).toBeVisible()
    await profileItem.hover()

    const startedAt = performance.now()
    await profileItem.click()
    await expect(page).toHaveURL('/settings/profile')
    await expect(page.getByRole('heading', { name: 'Mi perfil', exact: true })).toBeVisible()
    const durationMs = performance.now() - startedAt

    await testInfo.attach('profile-intent-navigation.json', {
      body: JSON.stringify({ durationMs }, null, 2),
      contentType: 'application/json',
    })
    expect(durationMs, `El perfil tardÃ³ ${Math.round(durationMs)}ms en mostrar contenido`).toBeLessThan(1_500)
  })
})
