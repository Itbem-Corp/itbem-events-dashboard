import { expect, test } from '@playwright/test'

test.use({ storageState: undefined })

const projectID = 'project-task-repository'
const now = new Date().toISOString()
const session = {
  application: { id: 'application-itbem', code: 'itbem', name: 'ITBEM', product_label: 'Agent operations', modules: ['home', 'users', 'organizations', 'metrics', 'automation'], allows_platform_admin: true, is_active: true },
  user: { id: 'user-task-repository', email: 'task-repository@example.test', first_name: 'Task', last_name: 'Repository', is_active: true, is_root: true, root_level: 1 },
  organizations: [],
  capabilities: ['dashboard:view', 'automation:view', 'automation:manage', 'organizations:view'],
}

function repository(id: string, name: string, role: string) {
  return {
    id, kind: 'repository', name, reference: `workspace://${id}`, revision: `${id}-sha`, status: 'ready',
    metadata: {
      repository_role: role, repository_kind: id === 'backend' ? 'backend_api' : 'frontend',
      workspace_capabilities: ['repository:read', 'worktree:create', 'patch:apply'],
      workspace_harness: { validation_command_count: 1, qa_command_count: 1, artifact_collection: true },
    },
    captured_at: now,
  }
}

function envelope(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

test('una solicitud puede elegir frontend como repositorio principal sin cambiar el mapa del proyecto', async ({ page }) => {
  const project = {
    id: projectID, client_id: 'client-task-repository', name: 'Producto de dos repos', slug: 'producto-dos-repos',
    summary: 'Backend y frontend separados', status: 'active', monthly_budget_microusd: 1_000_000,
    budget_alert_percent: 80, created_at: now, updated_at: now,
    client: { id: 'client-task-repository', name: 'Cliente', code: 'CLIENTE' },
    context: [repository('backend', 'Backend local', 'primary'), repository('frontend', 'Frontend local', 'supporting')],
    members: [], releases: [], work_items: [], preparation: { version: 1, checks: [] },
    requests: [{ id: 'request-web', project_id: projectID, requested_by: session.user.id, title: 'Construir interfaz', body: 'Interfaz inicial', priority: 'normal', constraints: '', expected_outcome: 'Una interfaz usable', status: 'open', created_at: now }],
  }
  await page.context().addCookies([{ name: 'session', value: 'task-repository-session', url: String(test.info().project.use.baseURL), httpOnly: true }])
  await page.route(/\/api\/auth\/token(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'task-repository-token', session }) }))
  await page.route(new RegExp(`/automation-bridge/automation/projects/${projectID}(?:\\?.*)?$`), (route) => route.fulfill(envelope(project)))
  await page.route(new RegExp(`/automation-bridge/automation/projects/${projectID}/work-items$`), (route) => {
    if (route.request().method() !== 'POST') return route.fulfill(envelope([]))
    expect(route.request().postDataJSON()).toMatchObject({
      request_id: 'request-web', context_source_ids: ['backend', 'frontend'], primary_repository_source_id: 'frontend',
    })
    return route.fulfill(envelope({ id: 'work-item-web', project_id: projectID, title: 'Construir interfaz', state: 'planning', created_at: now, updated_at: now }))
  })
  await page.route(/\/automation-bridge\/automation\/work-items\/work-item-web\/agent-runs$/, (route) => route.fulfill(envelope({ id: 'plan-web', operation: 'delivery.plan', status: 'queued' })))
  await page.route(/\/automation-bridge\/.*$/, (route) => {
    if (route.request().url().includes(`/automation/projects/${projectID}`) || route.request().url().includes('/automation/work-items/work-item-web/agent-runs')) return route.fallback()
    return route.fulfill(envelope([]))
  })

  await page.goto(`/automation/projects/${projectID}`)
  await page.getByRole('button', { name: 'Configurar proyecto' }).click()
  const requestRow = page.getByRole('listitem').filter({ hasText: 'Construir interfaz' })
  await requestRow.getByRole('combobox', { name: 'Repositorio principal' }).selectOption('frontend')
  const created = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith(`/automation/projects/${projectID}/work-items`))
  await requestRow.getByRole('button', { name: 'Proponer plan' }).click()
  await created
})
