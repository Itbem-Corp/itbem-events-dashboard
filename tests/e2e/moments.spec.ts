/**
 * moments.spec.ts — Full E2E for the Moments Wall
 *
 * Prerequisites (must be running before npm run test:e2e):
 *   - Dashboard:       npm run dev         → http://localhost:3000
 *   - Public frontend: npm run dev         → http://localhost:4321  (cafetton-casero)
 *   - Backend:         running at localhost:8080
 *   - .env.local:      TEST_EMAIL + TEST_PASSWORD
 *
 * Flow:
 *   1.  Create test event
 *   2.  Enable QR shared uploads
 *   3.  Upload photo as guest via public frontend
 *   4.  Verify moment appears as pending
 *   5.  Approve the moment
 *   6.  Verify it appears in Aprobados + Fotos tabs
 *   7.  Multi-select bulk actions
 *   8.  Lightbox open / close
 *   9.  ZIP split dropdown options
 *   10. Por hora grouping toggle
 *   11. Cleanup
 */

import { test, expect, type Page } from '@playwright/test'
import path from 'path'

test.use({ storageState: 'tests/e2e/.auth/session.json' })

// ─── Shared state ────────────────────────────────────────────────────────────

let eventId         = ''
let eventIdentifier = ''
const FIXTURE_PHOTO = path.join(process.cwd(), 'tests/e2e/fixtures/test-photo.jpg')
const PUBLIC_URL    = process.env.PUBLIC_URL ?? 'http://localhost:4321'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function goToEvent(page: Page) {
  await page.goto(`/events/${eventId}`)
  await page.waitForLoadState('networkidle')
}

// ─── Suite ───────────────────────────────────────────────────────────────────

test.describe.serial('Moments Wall — flujo completo', () => {

  // ── 1. Create event ─────────────────────────────────────────────────────

  test('crear evento de prueba', async ({ page }) => {
    await page.goto('/events')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'Crear evento' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByLabel('Nombre del evento').fill('E2E Test Moments')

    // datetime-local input
    const dtInput = page.locator('input[type="datetime-local"]')
    if (await dtInput.isVisible()) {
      await dtInput.fill('2026-12-31T20:00')
    } else {
      await page.getByLabel('Fecha y hora').fill('2026-12-31T20:00')
    }

    // Timezone default is America/Mexico_City — no change needed
    await page.getByTestId('submit-event-form').click()

    // Wait for navigation to new event page
    await page.waitForURL(/\/events\/[a-z0-9-]{36}/, { timeout: 20_000 })
    await page.waitForLoadState('networkidle')

    // Capture event ID
    const url = page.url()
    const idMatch = url.match(/\/events\/([a-z0-9-]{36})/)
    expect(idMatch, 'Event ID not found in URL').not.toBeNull()
    eventId = idMatch![1]

    // Capture identifier from "Ver en eventiapp" or preview links on the page
    const links = await page.locator('a[href*="/e/"]').all()
    for (const link of links) {
      const href = await link.getAttribute('href') ?? ''
      const m = href.match(/\/e\/([^/?#]+)/)
      if (m) { eventIdentifier = m[1]; break }
    }

    // Fallback: fetch identifier from API
    if (!eventIdentifier) {
      const resp = await page.request.get(`http://localhost:8080/api/events/${eventId}`)
      if (resp.ok()) {
        const body = await resp.json()
        eventIdentifier = body.data?.identifier ?? body.identifier ?? ''
      }
    }

    expect(eventIdentifier, 'Event identifier not found').toBeTruthy()
    await expect(page.getByRole('heading', { name: 'E2E Test Moments' })).toBeVisible()
  })

  // ── 2. Enable QR uploads ─────────────────────────────────────────────────

  test('habilitar subida QR compartida', async ({ page }) => {
    await goToEvent(page)

    // Look for the toggle in the MomentsWall toolbar
    const enableBtn  = page.getByTitle('Habilitar subida QR')
    const activeBtn  = page.getByTitle(/subida qr activa/i)

    const alreadyOn = await activeBtn.isVisible()
    if (!alreadyOn) {
      await enableBtn.click()
      await expect(activeBtn).toBeVisible({ timeout: 10_000 })
    }

    await expect(activeBtn).toBeVisible()
  })

  // ── 3. Upload photo as guest ─────────────────────────────────────────────

  test('subir foto como invitado (app pública)', async ({ browser }) => {
    const guestCtx  = await browser.newContext()
    const guestPage = await guestCtx.newPage()

    const uploadUrl = `${PUBLIC_URL}/events/${eventIdentifier}/upload`
    await guestPage.goto(uploadUrl)
    await guestPage.waitForLoadState('networkidle')

    // Page must show the upload UI (not the "uploads disabled" screen)
    await expect(
      guestPage.getByText(/Seleccionar de galería|Agrega tus fotos/i)
        .or(guestPage.locator('[class*="border-dashed"]').first())
    ).toBeVisible({ timeout: 15_000 })

    // Set file on hidden input
    const fileInput = guestPage.locator('input[type="file"]').first()
    await fileInput.setInputFiles(FIXTURE_PHOTO)

    // Wait for file preview (file shown in list or thumbnail)
    await expect(
      guestPage.getByText(/test-photo\.jpg/i)
        .or(guestPage.locator('[class*="aspect-square"] img, [class*="aspect-square"] canvas').first())
    ).toBeVisible({ timeout: 10_000 })

    // Click submit
    const submitBtn = guestPage.getByRole('button', {
      name: /Compartir \d+ momento|Compartir momento/i,
    })
    await expect(submitBtn).toBeVisible({ timeout: 5_000 })
    await submitBtn.click()

    // Wait for success
    await expect(guestPage.getByText(/¡Momento compartido!/i)).toBeVisible({ timeout: 30_000 })
    await guestCtx.close()
  })

  // ── 4. Moment appears as pending in dashboard ────────────────────────────

  test('el momento aparece en Pendientes', async ({ page }) => {
    await goToEvent(page)

    // Poll until pendingCount > 0 (Lambda processing may take a few seconds)
    await expect(async () => {
      await page.reload()
      await page.waitForLoadState('networkidle')
      const pendingTab = page.getByRole('tab', { name: /Pendientes/ })
      await expect(pendingTab).toBeVisible()
      const tabText = await pendingTab.textContent() ?? ''
      expect(tabText).toMatch(/[1-9]/)
    }).toPass({ timeout: 90_000, intervals: [6_000] })

    await page.getByRole('tab', { name: /Pendientes/ }).click()
    const card = page.locator('div.group.aspect-square, [class*="aspect-square"][class*="rounded"]').first()
    await expect(card).toBeVisible({ timeout: 8_000 })
  })

  // ── 5. Approve the moment ────────────────────────────────────────────────

  test('aprobar el momento', async ({ page }) => {
    await goToEvent(page)
    await page.getByRole('tab', { name: /Pendientes/ }).click()
    await page.waitForTimeout(500)

    const card = page.locator('div.group.aspect-square').first()
    await card.hover()
    await page.waitForTimeout(300) // CSS transition
    await page.getByRole('button', { name: /^Aprobar$/ }).first().click({ force: true })

    await expect(page.getByText(/Momento aprobado/i)).toBeVisible({ timeout: 10_000 })

    // Aprobados count now ≥ 1
    await expect(async () => {
      const tabText = await page.getByRole('tab', { name: /Aprobados/ }).textContent() ?? ''
      expect(tabText).toMatch(/[1-9]/)
    }).toPass({ timeout: 10_000, intervals: [1_000] })
  })

  // ── 6. Fotos tab ─────────────────────────────────────────────────────────

  test('el momento aprobado aparece en la tab Fotos', async ({ page }) => {
    await goToEvent(page)

    await expect(page.getByRole('tab', { name: /Fotos/ })).toBeVisible({ timeout: 8_000 })
    await page.getByRole('tab', { name: /Fotos/ }).click()

    const card = page.locator('div.group.aspect-square').first()
    await expect(card).toBeVisible({ timeout: 5_000 })
  })

  // ── 7. Multi-select ──────────────────────────────────────────────────────

  test('multi-select activa botones de bulk action', async ({ page }) => {
    await goToEvent(page)
    await page.getByRole('tab', { name: /Aprobados/ }).click()
    await page.waitForTimeout(400)

    await page.getByTitle('Seleccionar momentos').click()
    await expect(page.getByText('Seleccionar todo')).toBeVisible()

    // Check "Seleccionar todo"
    await page.getByRole('checkbox').click()

    await expect(page.getByText(/Aprobar selección|Eliminar selección/i)).toBeVisible({ timeout: 4_000 })

    // Exit select mode
    await page.getByTitle(/cancelar selección/i).click()
    await expect(page.getByText('Seleccionar todo')).not.toBeVisible({ timeout: 3_000 })
  })

  // ── 8. Lightbox ──────────────────────────────────────────────────────────

  test('lightbox abre y cierra correctamente', async ({ page }) => {
    await goToEvent(page)
    await page.getByRole('tab', { name: /Aprobados/ }).click()
    await page.waitForTimeout(400)

    const card = page.locator('div.group.aspect-square').first()
    await card.click()

    // Lightbox portal — a fixed inset-0 overlay
    const overlay = page.locator('div.fixed.inset-0').last()
    await expect(overlay).toBeVisible({ timeout: 5_000 })

    // Close via Escape
    await page.keyboard.press('Escape')
    await expect(overlay).not.toBeVisible({ timeout: 4_000 })
  })

  // ── 9. ZIP split dropdown ────────────────────────────────────────────────

  test('ZIP split muestra opciones de descarga', async ({ page }) => {
    await goToEvent(page)

    const chevronBtn = page.getByTitle('Opciones de descarga')
    await expect(chevronBtn).toBeVisible()
    await chevronBtn.click()

    await expect(page.getByRole('button', { name: 'Solo fotos' })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByRole('button', { name: 'Solo vídeos' })).toBeVisible()

    // Dismiss
    await page.keyboard.press('Escape')
  })

  // ── 10. Por hora toggle ──────────────────────────────────────────────────

  test('Por hora agrupa los momentos con cabeceras de tiempo', async ({ page }) => {
    await goToEvent(page)
    await page.getByRole('tab', { name: /Aprobados/ }).click()
    await page.waitForTimeout(400)

    await page.getByTitle('Agrupar por hora').click()

    // Time bucket label like "20:30" or "14:00"
    await expect(page.locator('text=/\\d{2}:\\d{2}/').first()).toBeVisible({ timeout: 5_000 })

    // Toggle back off
    await page.getByTitle('Agrupar por hora').click()
  })

  // ── 11. Cleanup ──────────────────────────────────────────────────────────

  test('limpiar evento de prueba', async ({ page, request }) => {
    if (!eventId) return

    // Try DELETE via backend API
    const deleteResp = await request.delete(
      `http://localhost:8080/api/events/${eventId}`,
    )

    if (deleteResp.ok()) {
      console.log(`[cleanup] Event ${eventId} deleted via API`)
    } else {
      // Fallback: just note the ID for manual cleanup
      console.warn(`[cleanup] Could not delete event ${eventId} (${deleteResp.status()}) — clean up manually`)
    }
  })
})
