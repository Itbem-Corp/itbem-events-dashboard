import { expect, test } from '@playwright/test'

test.use({ storageState: undefined })

const projectID = 'project-breakdown'
const requestID = 'request-breakdown'
const now = new Date().toISOString()
const session = {
  application: { id: 'application-itbem', code: 'itbem', name: 'ITBEM', product_label: 'Agent operations', modules: ['home', 'users', 'organizations', 'metrics', 'automation'], allows_platform_admin: true, is_active: true },
  user: { id: 'user-breakdown', email: 'breakdown@example.test', first_name: 'Task', last_name: 'Owner', is_active: true, is_root: true, root_level: 1 },
  organizations: [], capabilities: ['dashboard:view', 'automation:view', 'automation:manage', 'organizations:view'],
}

const repository = (id: string, role: string) => ({
  id, kind: 'repository', name: `${id} local`, reference: `workspace://${id}`, revision: `${id}-sha`, status: 'ready',
  metadata: { repository_role: role, repository_kind: id === 'backend' ? 'backend_api' : 'frontend', workspace_capabilities: ['repository:read', 'worktree:create', 'patch:apply'], workspace_harness: { validation_command_count: 1, qa_command_count: 1, artifact_collection: true } },
  captured_at: now,
})

const envelope = (data: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) })

test('divide una solicitud en tareas de dos repos con dependencia y aprobación explícita', async ({ page }) => {
  let proposal: Record<string, unknown> | null = null
  let applied = false
  const project = {
    id: projectID, client_id: 'client-breakdown', name: 'Producto completo', slug: 'producto-completo', summary: 'Backend y frontend separados', status: 'active',
    monthly_budget_microusd: 1_000_000, budget_alert_percent: 80, created_at: now, updated_at: now,
    client: { id: 'client-breakdown', name: 'Cliente', code: 'CLIENTE' },
    context: [repository('backend', 'primary'), repository('frontend', 'supporting')], members: [], releases: [],
    work_items: [], preparation: { version: 1, checks: [] },
    requests: [{ id: requestID, project_id: projectID, requested_by: session.user.id, title: 'Crear producto', body: 'API y web', priority: 'normal', constraints: '', expected_outcome: 'Producto usable', status: 'open', created_at: now }],
  }
  await page.context().addCookies([{ name: 'session', value: 'breakdown-session', url: String(test.info().project.use.baseURL), httpOnly: true }])
  await page.route(/\/api\/auth\/token(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'breakdown-token', session }) }))
  await page.route(new RegExp(`/automation-bridge/automation/projects/${projectID}(?:\\?.*)?$`), (route) => route.fulfill(envelope(project)))
  await page.route(new RegExp(`/automation-bridge/automation/projects/${projectID}/requests/${requestID}/decompositions$`), (route) => {
    if (route.request().method() === 'GET') return route.fulfill(envelope(proposal ? [proposal] : []))
    const structured = route.request().postDataJSON().structured
    expect(structured.tasks).toHaveLength(2)
    expect(structured.tasks[0]).toMatchObject({ primary_repository_ref: 'workspace://backend', depends_on: [], budget_microusd: 20_000 })
    expect(structured.tasks[1]).toMatchObject({ primary_repository_ref: 'workspace://frontend', depends_on: ['task-1'], budget_microusd: 20_000 })
    proposal = { id: 'proposal-1', version: 1, status: 'proposed', summary: structured.summary, structured_result: JSON.stringify(structured) }
    return route.fulfill(envelope(proposal))
  })
  await page.route(new RegExp(`/automation-bridge/automation/projects/${projectID}/requests/${requestID}/decompositions/proposal-1/apply$`), (route) => {
    expect(route.request().postDataJSON().comment).toContain('Apruebo')
    applied = true
    proposal = { ...proposal, status: 'applied' }
    return route.fulfill(envelope({ created_count: 2 }))
  })
  await page.route(/\/automation-bridge\/.*$/, (route) => {
    if (route.request().url().includes(`/automation/projects/${projectID}`)) return route.fallback()
    return route.fulfill(envelope([]))
  })

  await page.goto(`/automation/projects/${projectID}`)
  await page.getByRole('button', { name: 'Configurar proyecto' }).click()
  const requestRow = page.getByRole('listitem').filter({ hasText: 'Crear producto' })
  await requestRow.getByRole('button', { name: 'Dividir en tareas' }).click()
  const first = requestRow.getByRole('group', { name: 'Tarea 1' })
  await first.getByRole('textbox', { name: 'Título' }).fill('Crear API')
  await first.getByRole('textbox', { name: 'Resultado esperado' }).fill('API verificable')
  await first.getByRole('textbox', { name: /Alcance incluido/ }).fill('Rutas HTTP')
  await first.getByRole('textbox', { name: /Criterios de aceptación/ }).fill('Pruebas de API pasan')
  const second = requestRow.getByRole('group', { name: 'Tarea 2' })
  await second.getByRole('textbox', { name: 'Título' }).fill('Crear web')
  await second.getByRole('textbox', { name: 'Resultado esperado' }).fill('Web conectada a API')
  await second.getByRole('textbox', { name: /Alcance incluido/ }).fill('Página inicial')
  await second.getByRole('textbox', { name: /Criterios de aceptación/ }).fill('La web consume API')
  await second.getByRole('combobox', { name: 'Repositorio principal' }).selectOption('workspace://frontend')
  await requestRow.getByRole('button', { name: 'Guardar propuesta para revisión' }).click()
  await expect(requestRow.getByText('Propuesta v1')).toBeVisible()
  await expect(requestRow.getByText('Pruebas de API pasan')).toBeVisible()
  await expect(requestRow.getByText('Límite IA: USD 0.020', { exact: false }).first()).toBeVisible()
  expect(applied).toBe(false)
  await requestRow.getByRole('textbox', { name: 'Motivo de aprobación' }).fill('Apruebo alcance, repositorios y dependencia.')
  await requestRow.getByRole('button', { name: 'Aprobar y crear tareas' }).click()
  await expect(requestRow.getByText('Tareas creadas con sus dependencias.', { exact: false })).toBeVisible()
  expect(applied).toBe(true)
})
