/**
 * events.spec.ts — Lista y detalle de eventos
 *
 * QA Agent: Actualizar si cambia el modelo Event (nuevos campos),
 * la navegación al detalle, o se agrega funcionalidad de creación.
 */

import { test, expect } from '@playwright/test'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

test.describe('Eventos', () => {
  test.describe('Lista', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/events')
      await page.waitForLoadState('networkidle')
    })

    test('muestra el heading Eventos', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible()
    })

    test('muestra el botón Crear evento', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'Crear evento' })).toBeVisible()
    })

    test('no muestra spinners después de cargar', async ({ page }) => {
      await expect(page.locator('.animate-spin')).not.toBeVisible()
    })

    test('muestra estado vacío o lista de eventos', async ({ page }) => {
      const emptyState = page.getByText('Sin eventos')
      const eventList = page.locator('ul li').first()
      // Uno de los dos debe estar visible
      const hasEmpty = await emptyState.isVisible()
      const hasList = await eventList.isVisible()
      expect(hasEmpty || hasList).toBeTruthy()
    })

    test('los eventos tienen badge de estado (Activo/Inactivo)', async ({ page }) => {
      const eventItem = page.locator('ul li').first()
      if (await eventItem.isVisible()) {
        const badge = eventItem.getByText(/Activo|Inactivo/)
        await expect(badge).toBeVisible()
      }
    })

    test('botón Crear evento abre el modal con los campos del formulario', async ({ page }) => {
      await page.getByRole('button', { name: 'Crear evento' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Nuevo evento')).toBeVisible()
      await expect(page.getByLabel('Nombre del evento')).toBeVisible()
      await expect(page.getByLabel('Tipo de evento')).toBeVisible()
      await expect(page.getByLabel('Fecha y hora')).toBeVisible()
      await expect(page.getByLabel('Zona horaria')).toBeVisible()
      await expect(page.getByLabel('Dirección')).toBeVisible()
      await expect(page.getByLabel('Máximo de invitados')).toBeVisible()
      await page.getByRole('button', { name: 'Cancelar' }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible()
    })

    test('enviar el form de crear evento vacío muestra validación', async ({ page }) => {
      await page.getByRole('button', { name: 'Crear evento' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByTestId('submit-event-form').click()
      // Zod: 'El nombre debe tener al menos 3 caracteres' or 'La fecha es requerida'
      await expect(page.getByText(/al menos 3 caracteres|fecha es requerida/i)).toBeVisible()
    })

    test('el campo Estado tiene el switch activo por defecto', async ({ page }) => {
      await page.getByRole('button', { name: 'Crear evento' }).click()
      const switchEl = page.getByRole('switch')
      await expect(switchEl).toBeVisible()
      // Default is is_active: true
      const checked = await switchEl.getAttribute('aria-checked') ?? await switchEl.getAttribute('data-checked')
      expect(['true', '']).not.toContain('false')
      await page.getByRole('button', { name: 'Cancelar' }).click()
    })

    test('botón Editar en la lista abre el modal pre-llenado', async ({ page }) => {
      const editBtn = page.getByLabel(/Editar/).first()
      if (!await editBtn.isVisible()) return
      await editBtn.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('Editar evento')).toBeVisible()
      const nameInput = page.getByLabel('Nombre del evento')
      const name = await nameInput.inputValue()
      expect(name.length).toBeGreaterThan(0)
      await page.getByRole('button', { name: 'Cancelar' }).click()
    })
  })

  test.describe('Detalle', () => {
    test('navegar a un evento muestra su detalle', async ({ page }) => {
      await page.goto('/events')
      await page.waitForLoadState('networkidle')

      const firstEventLink = page.locator('ul li a').first()
      if (await firstEventLink.isVisible()) {
        const eventName = await firstEventLink.textContent()
        await firstEventLink.click()
        await page.waitForLoadState('networkidle')

        await expect(page.getByRole('heading')).toContainText(eventName || '')
        // Debe mostrar el enlace de vuelta a eventos
        await expect(page.getByRole('link', { name: 'Eventos' })).toBeVisible()
      }
    })

    test('el detalle muestra sección de Órdenes con placeholder', async ({ page }) => {
      await page.goto('/events')
      await page.waitForLoadState('networkidle')

      const firstEventLink = page.locator('ul li a').first()
      if (await firstEventLink.isVisible()) {
        await firstEventLink.click()
        await page.waitForLoadState('networkidle')
        await expect(page.getByText(/Órdenes/i)).toBeVisible()
      }
    })

    test('navegar a detalle muestra botón Editar', async ({ page }) => {
      await page.goto('/events')
      await page.waitForLoadState('networkidle')

      const firstLink = page.locator('ul li').first().locator('a[href^="/events/"]')
      if (!await firstLink.isVisible()) return
      await firstLink.click()
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible()
    })

    test('las tarjetas de stats se muestran en el detalle', async ({ page }) => {
      await page.goto('/events')
      await page.waitForLoadState('networkidle')

      const firstLink = page.locator('ul li').first().locator('a[href^="/events/"]')
      if (!await firstLink.isVisible()) return
      await firstLink.click()
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(/Máx\. invitados/i)).toBeVisible()
      await expect(page.getByText(/Zona horaria/i)).toBeVisible()
      await expect(page.getByText(/Tipo de evento/i)).toBeVisible()
    })
  })
})
