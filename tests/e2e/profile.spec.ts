/**
 * profile.spec.ts — Perfil de usuario
 *
 * QA Agent: Actualizar si cambia el formulario de perfil,
 * se agregan nuevos campos, o cambia el comportamiento del avatar.
 */

import { test, expect } from '@playwright/test'

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
})
