/**
 * users.spec.ts — Gestión de usuarios
 *
 * QA Agent: Actualizar si cambia el modal de invitación,
 * el toggle de activo/inactivo, o la navegación a /users/:id/clients.
 */

import { test, expect } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test.describe('Usuarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/users')
    await page.waitForLoadState('networkidle')
  })

  test('muestra el heading Usuarios', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible()
  })

  test('muestra el botón Nuevo Usuario', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Nuevo Usuario' })).toBeVisible()
  })

  test('abre el modal de invitación al hacer click', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo Usuario' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Invitar usuario')).toBeVisible()
  })

  test('el modal de invitación tiene los campos Email, Nombre y Apellido', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo Usuario' }).click()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Nombre')).toBeVisible()
    await expect(page.getByLabel('Apellido')).toBeVisible()
  })

  test('muestra validación si se envía el form de invitación vacío', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo Usuario' }).click()
    await page.getByRole('button', { name: 'Enviar invitación' }).click()
    await expect(page.getByText(/inválido|requerido/i)).toBeVisible()
  })

  test('la lista de usuarios carga sin spinners', async ({ page }) => {
    // Verifica que no haya spinners en la página después de cargar
    await expect(page.locator('.animate-spin')).not.toBeVisible()
  })

  test('el badge ROOT aparece en usuarios root', async ({ page }) => {
    // Si existen usuarios root, deben tener el badge
    const rootBadge = page.getByText('ROOT')
    if (await rootBadge.count() > 0) {
      await expect(rootBadge.first()).toBeVisible()
    }
  })

  test('invitar usuario con datos válidos muestra toast', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo Usuario' }).click()
    await page.getByLabel('Email').fill(`pw+${Date.now()}@test.com`)
    await page.getByLabel('Nombre').fill('Playwright')
    await page.getByLabel('Apellido').fill('Test')
    await page.getByTestId('submit-user-form').click()
    await expect(page.getByText(/Invitación enviada/i)).toBeVisible({ timeout: 8000 })
  })

  test('toggle activo/inactivo en primer usuario', async ({ page }) => {
    const toggle = page.getByRole('switch').first()
    if (!await toggle.isVisible()) return
    await toggle.click()
    await expect(page.getByText(/activado|desactivado/i)).toBeVisible({ timeout: 5000 })
  })

  test('confirmar eliminación de usuario usa data-testid', async ({ page }) => {
    const deleteBtn = page.getByLabel(/Eliminar/).first()
    if (!await deleteBtn.isVisible()) return
    await deleteBtn.click()
    await expect(page.getByTestId('confirm-delete-user')).toBeVisible()
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByTestId('confirm-delete-user')).not.toBeVisible()
  })
})
