import { expect, test, type Page } from '@playwright/test'

// Product-level hermetic proof for the Automation Center read model. It uses
// the real route and components while keeping Cognito, providers and writes
// outside the test boundary.
test.use({ storageState: undefined })

const now = new Date().toISOString()
const workItemID = 'portfolio-e2e-work-item'

const session = {
  application: {
    id: 'application-itbem', code: 'itbem', name: 'ITBEM', product_label: 'Agent operations',
    modules: ['home', 'users', 'organizations', 'metrics', 'automation'], allows_platform_admin: true, is_active: true,
  },
  user: { id: 'portfolio-e2e-user', email: 'portfolio-e2e@example.test', first_name: 'Portfolio', last_name: 'Operator', is_active: true, is_root: true, root_level: 1 },
  organizations: [],
  capabilities: [
    'dashboard:view',
    'automation:view',
    'automation:manage',
    'organizations:view',
    'metrics:view',
    'platform:users:view',
    'audit:view',
  ],
}

const portfolio = {
  schema_version: 1,
  generated_at: now,
  revision: 'portfolio-revision-1',
  totals: { projects: 1, work_items: 1, active_work_items: 1, decisions_required: 0, blocked_work_items: 0, automation_tasks: 1, queued_tasks: 0, running_tasks: 1, attention_tasks: 0 },
  projects: [{
    id: 'portfolio-e2e-project', client_id: 'portfolio-e2e-client', name: 'Portal de operaciones', status: 'active', updated_at: now,
    client: { id: 'portfolio-e2e-client', name: 'Cliente Demo' }, work_item_count: 1, active_work_items: 1, decisions_required: 0, blocked_work_items: 0,
    automation_tasks: 1, queued_tasks: 0, running_tasks: 1, attention_tasks: 0, work_items_truncated: false,
    work_items: [{
      id: workItemID, project_id: 'portfolio-e2e-project', title: 'Entrega del portal', state: 'implementation', created_at: now, updated_at: now,
      automation_task_count: 1, automation_tasks_truncated: false, gate_summary: { total: 0, approved: 0, changes_requested: 0 }, evidence_count: 1,
      automation_tasks: [{ id: 'portfolio-task', operation: 'delivery.implementation', status: 'running', attempt_count: 1, created_at: now, updated_at: now }],
      workflow_projection: {
        schema_version: 1, stage: 'build', state_kind: 'active', state: 'implementation', summary: 'El agente está construyendo el cambio', detail: 'La siguiente decisión segura es revisar la evidencia.',
        current_operation: 'delivery.implementation', current_task_id: 'portfolio-task', last_activity_at: now, stale_after_seconds: 180, stale: false,
        actor: { type: 'agent', operation: 'delivery.implementation', provider: 'minimax', model: 'MiniMax-M3' }, evidence: { total: 1, validations: 1, has_result: false, has_changes: true, has_human_gate: false },
        recovery: { mode: 'repair', title: 'Ver actividad del intento', detail: 'Consulta la señal durable.', action_id: 'open_activity', requires_human_review: false }, available_actions: [], can_continue: false,
      },
    }],
  }],
}
const portfolioWithTwoClients = {
  ...portfolio,
  totals: { ...portfolio.totals, projects: 2 },
  projects: [
    portfolio.projects[0],
    {
      ...portfolio.projects[0],
      id: 'portfolio-e2e-second-project',
      client_id: 'portfolio-e2e-second-client',
      name: 'Aplicación secundaria',
      client: { id: 'portfolio-e2e-second-client', name: 'Segundo cliente' },
      work_item_count: 0,
      active_work_items: 0,
      decisions_required: 0,
      blocked_work_items: 0,
      automation_tasks: 0,
      queued_tasks: 0,
      running_tasks: 0,
      attention_tasks: 0,
      work_items: [],
    },
  ],
}

function envelope(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

async function installFixtures(page: Page, snapshot = portfolio) {
  await page.context().addCookies([{ name: 'session', value: 'portfolio-e2e-session', url: String(test.info().project.use.baseURL), httpOnly: true }])
  await page.route(/\/api\/auth\/token(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'portfolio-e2e-token', session }) }))
  await page.route(/\/automation-bridge\/automation\/portfolio(?:\?.*)?$/, (route) => route.fulfill(envelope(snapshot)))
  await page.route(/\/automation-bridge\/automation\/tasks(?:\?.*)?$/, (route) => route.fulfill(envelope([])))
  await page.route(/\/automation-bridge\/automation\/health$/, (route) => route.fulfill(envelope({
    operational_telemetry_available: true, active_workers: 1, worker_capacity: 1, active_tasks: 1, global_active_limit: 4,
    workers: [{ provider: 'minimax', model: 'MiniMax-M3', last_seen_at: now, capabilities: ['delivery.implementation'], workspace_readiness: [{ isolation_mode: 'docker_container', sandbox_ready: true }] }],
    operation_readiness: [{ operation: 'delivery.implementation', worker_count: 1, worker_capacity: 1, ready: true }],
  })))
  await page.route(new RegExp(`/automation-bridge/automation/work-items/${workItemID}/execution-graph(?:\\?.*)?$`), (route) => route.fulfill(envelope({ work_item_id: workItemID, revision: 'graph-1', nodes: [], edges: [] })))
  await page.route(new RegExp(`/automation-bridge/automation/work-items/${workItemID}/stream$`), (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: snapshot\\ndata: ${JSON.stringify({ work_item_id: workItemID, revision: 'stream-1', state: 'implementation', active_tasks: 1, last_activity_at: now, generated_at: now })}\\n\\n` }))
  await page.route(/\/automation-bridge\/.*$/, async (route) => {
    const url = route.request().url()
    if (url.includes('/automation/portfolio') || url.includes('/automation/tasks') || url.includes('/automation/health') || url.includes(`/automation/work-items/${workItemID}/`)) return route.fallback()
    if (route.request().method() !== 'GET') return route.abort('blockedbyclient')
    await route.fulfill(envelope([]))
  })
}

test('muestra el portafolio como centro operativo y refleja sandbox del worker', async ({ page }) => {
  await installFixtures(page)
  await page.goto('/automation')

  await expect(page.getByRole('heading', { name: 'Centro de automatización' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Flujos prioritarios' })).toBeVisible()
  await expect(page.getByText('Entrega del portal')).toBeVisible()
  await expect(page.getByText('Cliente Demo')).toBeVisible()
  await expect(page.getByText('Docker · aislado')).toBeVisible()
  await expect(page.getByLabel('Aislamiento de workers: Docker · aislado')).toBeVisible()
  await expect(page.getByLabel('Detalle de Entrega del portal').getByText('El agente está construyendo el cambio', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Abrir resultado' })).toBeVisible()

  // ITBEM is the control plane for the whole team, not an isolated automation
  // page. Keep the cross-product navigation contract visible and explicit so
  // an operator can move from live work to governance without losing context.
  await expect(page.getByRole('link', { name: 'Métricas', exact: true })).toHaveAttribute('href', '/metrics')
  await expect(page.getByRole('link', { name: 'Usuarios', exact: true })).toHaveAttribute('href', '/users')
  await expect(page.getByRole('link', { name: 'Auditoría', exact: true })).toHaveAttribute('href', '/audit')
  await expect(page.getByRole('link', { name: 'Organizaciones', exact: true })).toHaveAttribute('href', '/clients')
  await expect(page.getByRole('link', { name: 'Centro de automatización', exact: true })).toHaveAttribute('href', '/automation')
  await expect(page.getByRole('link', { name: 'Proyectos', exact: true })).toHaveAttribute('href', '/automation/projects')
  await expect(page.getByRole('link', { name: 'Portafolio', exact: true })).toHaveAttribute('href', '/automation/clients')
  await expect(page.getByRole('link', { name: 'Uso y costos', exact: true })).toHaveAttribute('href', '/automation/costs')

  const screenshotPath = test.info().outputPath('automation-portfolio-live-sandbox.png')
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await test.info().attach('automation-portfolio-live-sandbox', { path: screenshotPath, contentType: 'image/png' })
})

test('no oculta gates humanos cuando el agregado compacto se queda corto', async ({ page }) => {
  const pendingPlan = {
    ...portfolio.projects[0].work_items[0],
    id: 'portfolio-plan-review', title: 'Revisar plan de API', state: 'plan_review',
    automation_tasks: [{ id: 'portfolio-plan-task', operation: 'delivery.plan', status: 'completed', attempt_count: 1, created_at: now, updated_at: now }],
  }
  const pendingQA = {
    ...portfolio.projects[0].work_items[0],
    id: 'portfolio-qa-review', title: 'Validar QA de API', state: 'qa_review',
    automation_tasks: [{ id: 'portfolio-qa-task', operation: 'delivery.qa', status: 'completed', attempt_count: 1, created_at: now, updated_at: now }],
  }
  const undercountedPortfolio = {
    ...portfolio,
    totals: { ...portfolio.totals, work_items: 2, active_work_items: 0, decisions_required: 1, automation_tasks: 2, queued_tasks: 0, running_tasks: 0 },
    projects: [{
      ...portfolio.projects[0], work_item_count: 2, active_work_items: 0,
      // Deliberately stale compact count: the visible durable list has two
      // review gates and must win for the operator's actionable queue.
      decisions_required: 1, automation_tasks: 2, queued_tasks: 0, running_tasks: 0,
      work_items: [pendingPlan, pendingQA],
    }],
  }
  await installFixtures(page, undercountedPortfolio)
  await page.goto('/automation/clients')

  await expect(page.getByLabel('Pulso del portafolio').getByText('2', { exact: true })).toBeVisible()
  const interventionQueue = page.locator('aside')
  await expect(interventionQueue.getByText('2', { exact: true })).toBeVisible()
  await expect(interventionQueue.getByRole('link', { name: 'Abrir gate' })).toHaveCount(2)
  await expect(page.getByText('Revisar plan de API')).toBeVisible()
  await expect(page.getByText('Validar QA de API')).toBeVisible()
})

test('conecta cada cliente con sus proyectos y conserva el filtro al navegar', async ({ page }) => {
  await installFixtures(page, portfolioWithTwoClients)
  await page.goto('/automation/clients')

  const clientProjects = page.getByRole('group', { name: 'Proyectos de Cliente Demo' })
  await expect(clientProjects).toBeVisible()
  await expect(clientProjects.getByRole('link', { name: /Portal de operaciones/ })).toHaveAttribute('href', '/automation/projects/portfolio-e2e-project')
  await clientProjects.getByRole('link', { name: 'Ver todos los proyectos de Cliente Demo' }).click()

  await expect(page).toHaveURL(/\/automation\/projects\?client=portfolio-e2e-client$/)
  await expect(page.getByLabel('Filtrar proyectos por cliente')).toHaveValue('portfolio-e2e-client')
  await expect(page.getByText('Portal de operaciones')).toBeVisible()
  await expect(page.getByText('Aplicación secundaria')).toHaveCount(0)
  await expect(page.getByText(/Viendo proyectos de Cliente Demo/)).toBeVisible()

  await page.getByLabel('Filtrar proyectos por cliente').selectOption('portfolio-e2e-second-client')
  await expect(page).toHaveURL(/\/automation\/projects\?client=portfolio-e2e-second-client$/)
  await expect(page.getByText('Aplicación secundaria')).toBeVisible()
  await expect(page.getByText('Portal de operaciones')).toHaveCount(0)
})
