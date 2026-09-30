import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: undefined })

const PROJECT_ID = 'project-needs-preparation'
const now = new Date().toISOString()
const session = {
  application: { id: 'application-itbem', code: 'itbem', name: 'ITBEM', product_label: 'Agent operations', modules: ['home', 'users', 'organizations', 'metrics', 'automation'], allows_platform_admin: true, is_active: true },
  user: { id: 'user-preparation', email: 'preparation@example.test', first_name: 'Preparation', last_name: 'Operator', is_active: true, is_root: true, root_level: 1 },
  organizations: [],
  capabilities: ['dashboard:view', 'automation:view', 'automation:manage', 'organizations:view'],
}

const project = {
  id: PROJECT_ID,
  client_id: 'client-needs-preparation',
  name: 'Proyecto sin preparación',
  slug: 'proyecto-sin-preparacion',
  summary: '',
  status: 'active',
  monthly_budget_microusd: 1_200_000,
  budget_alert_percent: 80,
  created_at: now,
  updated_at: now,
  client: { id: 'client-needs-preparation', name: 'Cliente con pendientes', code: 'CLIENTE-PENDIENTE' },
  context: [],
  members: [],
  requests: [],
  releases: [],
  work_items: [],
  preparation: {
    version: 1,
    checks: [
      { key: 'objective', state: 'missing', title: 'Objetivo', detail: 'Define qué debe conseguir este proyecto.' },
      { key: 'repositories', state: 'missing', title: 'Código editable', detail: 'Conecta un workspace registrado.' },
      { key: 'runtime', state: 'unknown', title: 'Capacidad de ejecución', detail: 'Se comprobará al iniciar.' },
      { key: 'acceptance', state: 'unknown', title: 'Aceptación del encargo', detail: 'Cada trabajo necesita criterios verificables.' },
      { key: 'budget', state: 'unknown', title: 'Presupuesto', detail: 'Se valida antes de llamar al modelo.' },
      { key: 'remote_sync', state: 'unknown', title: 'Sincronización remota', detail: 'No hay una referencia GitHub lista.' },
      { key: 'sandbox', state: 'missing', title: 'Aislamiento de ejecución', detail: 'Falta un sandbox Docker verificable.' },
    ],
  },
}

function envelope(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

async function installFixtures(page: Page) {
  await page.context().addCookies([{ name: 'session', value: 'automation-preparation-session', url: String(test.info().project.use.baseURL), httpOnly: true }])
  await page.route(/\/api\/auth\/token(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'automation-preparation-token', session }) }))
  await page.route(new RegExp(`/automation-bridge/automation/projects/${PROJECT_ID}(?:\\?.*)?$`), (route) => route.fulfill(envelope(project)))
  await page.route(/\/automation-bridge\/.*$/, (route) => {
    const url = route.request().url()
    if (url.includes(`/automation/projects/${PROJECT_ID}`)) return route.fallback()
    if (route.request().method() !== 'GET') return route.abort('blockedbyclient')
    return route.fulfill(envelope([]))
  })
}

test('expone pendientes de preparación y una acción concreta sin presentar autorización', async ({ page }) => {
  await installFixtures(page)
  await page.goto(`/automation/projects/${PROJECT_ID}`)

  await expect(page.getByText('Proyecto sin preparación')).toBeVisible()
  await expect(page.getByLabel('Progreso de preparación').getByText('Preparar fuentes y configuración', { exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: 'Requisitos listos' })).toHaveAttribute('aria-valuenow', '0')
  await expect(page.getByRole('status', { name: 'Siguiente acción de preparación' })).toContainText('Preparar fuentes y configuración')
  await expect(page.getByText('Falta acción')).toHaveCount(3)
  await expect(page.getByText('Por comprobar', { exact: true })).toHaveCount(4)
  await expect(page.getByText(/guardar un encargo no inicia una ejecución/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preparar fuentes y configuración' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Describir un encargo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preparar siguiente plan' })).toHaveCount(0)
})
