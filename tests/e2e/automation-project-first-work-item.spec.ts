import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: undefined })

const PROJECT_ID = 'project-prepared'
const CLIENT_ID = 'client-prepared'
const CONTEXT_ID = 'context-ready'
const now = new Date().toISOString()

const session = {
  application: { id: 'application-itbem', code: 'itbem', name: 'ITBEM', product_label: 'Agent operations', modules: ['home', 'users', 'organizations', 'metrics', 'automation'], allows_platform_admin: true, is_active: true },
  user: { id: 'user-first-work-item', email: 'first-work-item@example.test', first_name: 'First', last_name: 'Work Item', is_active: true, is_root: true, root_level: 1 },
  organizations: [],
  capabilities: ['dashboard:view', 'automation:view', 'automation:manage', 'organizations:view'],
}

const readyRepository = {
  id: CONTEXT_ID,
  kind: 'repository',
  name: 'Dashboard local',
  reference: 'workspace://dashboard',
  revision: 'abc1234',
  status: 'ready',
  metadata: {
    workspace_capabilities: ['repository:read', 'worktree:create', 'patch:apply'],
    workspace_harness: { validation_command_count: 1, qa_command_count: 1, artifact_collection: true, screenshot_mode: 'responsive_default', semantic_qa_mode: 'disabled' },
    workspace_architecture: { runtime_hints: ['node'], entrypoint_paths: ['src/app'], test_roots: ['tests'], documentation_paths: ['README.md'] },
  },
  captured_at: now,
}

const preparation = {
  version: 1,
  checks: [
    { key: 'client', state: 'ready', title: 'Cliente definido', detail: 'El resultado tiene un cliente operativo.' },
    { key: 'repository', state: 'ready', title: 'Repositorio preparado', detail: 'El workspace local tiene un checkpoint verificable.' },
    { key: 'harness', state: 'ready', title: 'Harness verificable', detail: 'Hay validaciones registradas para el workspace.' },
    { key: 'budget', state: 'ready', title: 'Presupuesto definido', detail: 'El proyecto tiene límites de uso.' },
  ],
}

const project = {
  id: PROJECT_ID,
  client_id: CLIENT_ID,
  name: 'Proyecto preparado',
  slug: 'proyecto-preparado',
  summary: 'Proyecto listo para crear su primer encargo.',
  status: 'active',
  monthly_budget_microusd: 1_200_000,
  budget_alert_percent: 80,
  created_at: now,
  updated_at: now,
  client: { id: CLIENT_ID, name: 'Cliente preparado', code: 'CLIENTE-PREPARADO' },
  context: [readyRepository],
  members: [],
  requests: [],
  releases: [],
  work_items: [],
  preparation,
}

function envelope(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

async function installFixtures(page: Page) {
  const state = {
    project: { ...structuredClone(project), requests: [] as Array<Record<string, unknown>>, work_items: [] as Array<Record<string, unknown>> },
    request: null as null | Record<string, unknown>,
    workItem: null as null | Record<string, unknown>,
  }
  await page.context().addCookies([{ name: 'session', value: 'automation-first-work-item-session', url: String(test.info().project.use.baseURL), httpOnly: true }])
  await page.route(/\/api\/auth\/token(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'automation-first-work-item-token', session }) }))
  await page.route(new RegExp(`/automation-bridge/automation/projects/${PROJECT_ID}(?:\\?.*)?$`), (route) => route.fulfill(envelope(state.project)))
  await page.route(new RegExp(`/automation-bridge/automation/projects/${PROJECT_ID}/requests$`), async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill(envelope(state.project.requests))
    const body = route.request().postDataJSON() as { body?: string; priority?: string }
    expect(body).toMatchObject({ body: 'Revisar la experiencia de entrega en móvil', priority: 'normal' })
    state.request = { id: 'request-first-work-item', project_id: PROJECT_ID, requested_by: session.user.id, title: 'Revisar entrega móvil', body: body.body, priority: body.priority, constraints: '', expected_outcome: 'Una entrega revisable desde el teléfono', status: 'open', created_at: now }
    state.project.requests = [state.request]
    return route.fulfill(envelope(state.request))
  })
  await page.route(new RegExp(`/automation-bridge/automation/projects/${PROJECT_ID}/work-items$`), async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill(envelope(state.project.work_items))
    const body = route.request().postDataJSON() as { request_id?: string; context_source_ids?: string[]; title?: string; expected_outcome?: string }
    expect(body).toMatchObject({ request_id: 'request-first-work-item', context_source_ids: [CONTEXT_ID], title: 'Revisar entrega móvil', expected_outcome: 'Una entrega revisable desde el teléfono' })
    state.workItem = { id: 'work-item-created', project_id: PROJECT_ID, title: body.title, description: 'Revisar la experiencia de entrega en móvil', expected_outcome: body.expected_outcome, state: 'planning', created_at: now, updated_at: now }
    state.project.work_items = [state.workItem]
    return route.fulfill(envelope(state.workItem))
  })
  await page.route(/\/automation-bridge\/automation\/work-items\/work-item-created\/agent-runs$/, async (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toMatchObject({ phase: 'plan' })
    return route.fulfill(envelope({ id: 'task-plan-created', status: 'queued', operation: 'delivery.plan' }))
  })
  await page.route(/\/automation-bridge\/.*$/, (route) => {
    const url = route.request().url()
    if (url.includes(`/automation/projects/${PROJECT_ID}`) || url.includes('/automation/work-items/work-item-created/agent-runs')) return route.fallback()
    if (route.request().method() !== 'GET') return route.abort('blockedbyclient')
    return route.fulfill(envelope([]))
  })
}

test('convierte una solicitud humana en el primer encargo y arranca sólo la fase de plan', async ({ page }) => {
  await installFixtures(page)
  await page.goto(`/automation/projects/${PROJECT_ID}`)

  await expect(page.getByText('Proyecto preparado')).toBeVisible()
  await expect(page.getByText('Preparado para crear trabajo')).toHaveCount(0)
  const intentLauncher = page.getByRole('button', { name: 'Describe el resultado que necesitas' })
  await expect(intentLauncher).toHaveCount(1)
  await intentLauncher.scrollIntoViewIfNeeded()
  await intentLauncher.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Resultado que necesitas').fill('Revisar la experiencia de entrega en móvil')

  const requestPost = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes(`/automation-bridge/automation/projects/${PROJECT_ID}/requests`))
  await dialog.getByRole('button', { name: 'Crear solicitud', exact: true }).click()
  await requestPost
  await expect(page.getByText('Solicitud registrada. Agrega o verifica el contexto y pide al agente que proponga el plan; tú conservas el gate de aprobación.')).toBeVisible()

  const planButton = page.getByRole('button', { name: 'Preparar siguiente plan' })
  await expect(planButton).toBeVisible()
  const workItemPost = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes(`/automation-bridge/automation/projects/${PROJECT_ID}/work-items`))
  const agentRunPost = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/automation-bridge/automation/work-items/work-item-created/agent-runs'))
  await planButton.click()
  await workItemPost
  await agentRunPost
  await expect(page).toHaveURL(/\/automation\/work-items\/work-item-created\?from_project=project-prepared$/)
})
