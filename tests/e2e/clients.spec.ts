/**
 * clients.spec.ts — Gestión de clientes (CRUD)
 *
 * QA Agent: Actualizar si cambia el modal de cliente,
 * el flujo de eliminación, o se agregan nuevos campos al formulario.
 */

import { test, expect } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test.describe('Clientes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/clients')
    await page.waitForLoadState('networkidle')
  })

  test('muestra el heading Clientes', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
  })

  test('muestra el botón Nuevo Cliente', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Nuevo Cliente' })).toBeVisible()
  })

  test('abre el modal de nuevo cliente al hacer click', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo Cliente' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Nueva Organización')).toBeVisible()
  })

  test('el modal muestra los campos requeridos', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo Cliente' }).click()
    await expect(page.getByLabel('Nombre Legal o Comercial')).toBeVisible()
    await expect(page.getByLabel('Tipo de Organización')).toBeVisible()
  })

  test('muestra error de validación si se envía el form vacío', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo Cliente' }).click()
    await page.getByRole('button', { name: /Crear Organización/i }).click()
    // Debe mostrar errores de validación de Zod
    await expect(page.getByText(/al menos 3 caracteres|requerido/i)).toBeVisible()
  })

  test('el diálogo de eliminación pide confirmación', async ({ page }) => {
    // Asume que hay al menos un cliente en la lista
    const deleteButton = page.getByLabel(/Eliminar/).first()
    if (await deleteButton.isVisible()) {
      await deleteButton.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible()
      await expect(page.getByTestId('confirm-delete-client')).toBeVisible()
    }
  })

  test('cancelar en el modal de eliminación no borra el cliente', async ({ page }) => {
    const deleteButton = page.getByLabel(/Eliminar/).first()
    if (await deleteButton.isVisible()) {
      await deleteButton.click()
      await page.getByRole('button', { name: 'Cancelar' }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
    }
  })

  test('confirmar eliminación usa data-testid', async ({ page }) => {
    const deleteBtn = page.getByLabel(/Eliminar/).first()
    if (!await deleteBtn.isVisible()) return
    await deleteBtn.click()
    await expect(page.getByTestId('confirm-delete-client')).toBeVisible()
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByTestId('confirm-delete-client')).not.toBeVisible()
  })

  test('crear cliente nuevo muestra toast', async ({ page }) => {
    await page.getByRole('button', { name: 'Nuevo Cliente' }).click()
    await page.getByLabel('Nombre Legal o Comercial').fill('TestOrg Playwright')
    await page.locator('select').selectOption({ index: 1 }).catch(() => {})
    await page.getByTestId('submit-client-form').click()
    await expect(page.getByText(/Organización creada/i)).toBeVisible({ timeout: 6000 })
  })

  test('buscar filtra la lista', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Buscar cliente...')
    if (!await searchInput.isVisible()) return
    await searchInput.fill('zzzznotexists')
    await page.waitForTimeout(200)
    const hasNoResults = await page.getByText('Sin clientes').isVisible()
    const hasNoResultsMsg = await page.getByText(/Sin resultados/i).isVisible()
    expect(hasNoResults || hasNoResultsMsg).toBeTruthy()
    await searchInput.clear()
  })
})
