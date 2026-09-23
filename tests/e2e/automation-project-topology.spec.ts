import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: undefined })

const PROJECT_ID = 'project-topology'
const PRIMARY_ID = 'context-api'
const now = new Date().toISOString()

const session = {
  application: { id: 'application-itbem', code: 'itbem', name: 'ITBEM', product_label: 'Agent operations', modules: ['home', 'users', 'organizations', 'metrics', 'automation'], allows_platform_admin: true, is_active: true },
  user: { id: 'user-topology', email: 'topology@example.test', first_name: 'Topology', last_name: 'Operator', is_active: true, is_root: true, root_level: 1 },
  organizations: [],
  capabilities: ['dashboard:view', 'automation:view', 'automation:manage', 'organizations:view'],
}

const primaryRepository = {
  id: PRIMARY_ID,
  kind: 'repository',
  name: 'API local',
  reference: 'workspace://api',
  revision: 'api-sha-1',
  status: 'ready',
  metadata: {
    repository_role: 'primary',
    repository_kind: 'backend_api',
    workspace_capabilities: ['repository:read', 'worktree:create', 'patch:apply'],
    workspace_harness: { validation_command_count: 1, qa_command_count: 1, artifact_collection: true },
  },
  captured_at: now,
}

function envelope(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

async function installFixtures(page: Page) {
  const state = {
    project: {
      id: PROJECT_ID,
      client_id: 'client-topology',
      name: 'Proyecto topology',
      slug: 'proyecto-topology',
      summary: 'Proyecto multirepo y monorepo',
      status: 'active',
      monthly_budget_microusd: 1_200_000,
      budget_alert_percent: 80,
      created_at: now,
      updated_at: now,
      client: { id: 'client-topology', name: 'Cliente topology', code: 'TOPOLOGY' },
      context: [structuredClone(primaryRepository)] as Array<Record<string, unknown>>,
      members: [],
      requests: [],
      releases: [],
      work_items: [],
      preparation: { version: 1, checks: [] },
    },
  }

  await page.context().addCookies([{ name: 'session', value: 'automation-topology-session', url: String(test.info().project.use.baseURL), httpOnly: true }])
  await page.route(/\/api\/auth\/token(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'automation-topology-token', session }) }))
  await page.route(new RegExp(`/automation-bridge/automation/projects/${PROJECT_ID}(?:\\?.*)?$`), (route) => route.fulfill(envelope(state.project)))
  await page.route(new RegExp(`/automation-bridge/automation/projects/${PROJECT_ID}/context$`), async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill(envelope(state.project.context))
    const body = route.request().postDataJSON() as { kind?: string; name?: string; reference?: string; revision?: string; metadata?: Record<string, unknown> }
    expect(body).toMatchObject({
      kind: 'repository',
      name: 'Dashboard remoto',
      reference: 'github://Itbem-Corp/dashboard',
      revision: 'dashboard-sha-1',
      metadata: {
        repository_role: 'supporting',
        repository_kind: 'frontend',
      },
    })
    state.project.context.push({
      id: 'context-dashboard',
      kind: body.kind ?? '',
      name: body.name ?? '',
      reference: body.reference ?? '',
      revision: body.revision ?? '',
      status: 'ready',
      metadata: body.metadata ?? {},
      captured_at: now,
    })
    return route.fulfill(envelope(state.project.context.at(-1)))
  })
  await page.route(new RegExp(`/automation-bridge/automation/projects/${PROJECT_ID}/context/[^/]+$`), async (route) => {
    expect(route.request().method()).toBe('PATCH')
    const body = route.request().postDataJSON() as { metadata?: Record<string, unknown> }
    expect(body).toEqual({
      metadata: {
        repository_role: 'supporting',
        repository_kind: 'frontend',
        repository_responsibility: 'Experiencia visual del dashboard',
        depends_on_repositories: ['workspace://api'],
        allowed_paths: ['apps/dashboard', 'packages/ui'],
      },
    })
    const dashboard = state.project.context.find((source) => source.id === 'context-dashboard')
    if (dashboard) dashboard.metadata = body.metadata
    return route.fulfill(envelope(dashboard))
  })
  await page.route(/\/automation-bridge\/automation\/health(?:\?.*)?$/, (route) => route.fulfill(envelope({
    workers: [{
      workspace_readiness: [{
        id: 'api',
        ready: false,
        sandbox_ready: false,
        dependency_state: 'kvm_permission_denied',
        dependency_reason: 'El usuario WSL no puede leer/escribir /dev/kvm.',
        dependency_next_action: 'Concede acceso controlado a /dev/kvm y reinicia la sesión WSL.',
        qa_ready: false,
        visual_qa_ready: false,
        publication_ready: false,
        validation_command_count: 1,
        qa_command_count: 1,
      }],
    }],
  })))
  await page.route(/\/automation-bridge\/.*$/, (route) => {
    const url = route.request().url()
    if (url.includes(`/automation/projects/${PROJECT_ID}`) && route.request().method() === 'GET') return route.fulfill(envelope(state.project))
    if (url.includes(`/automation/projects/${PROJECT_ID}`)) return route.fallback()
    if (url.includes('/automation/health')) return route.fulfill(envelope({
      workers: [{
        workspace_readiness: [{
          id: 'api',
          ready: false,
          sandbox_ready: false,
          dependency_state: 'kvm_permission_denied',
          dependency_reason: 'El usuario WSL no puede leer/escribir /dev/kvm.',
          dependency_next_action: 'Concede acceso controlado a /dev/kvm y reinicia la sesión WSL.',
          qa_ready: false,
          visual_qa_ready: false,
          publication_ready: false,
          validation_command_count: 1,
          qa_command_count: 1,
        }],
      }],
    }))
    if (route.request().method() !== 'GET') return route.abort('blockedbyclient')
    return route.fulfill(envelope([]))
  })
}

test('registra topología multirepo y scopes de monorepo sin confundirlos', async ({ page }) => {
  await installFixtures(page)
  await page.goto(`/automation/projects/${PROJECT_ID}`)

  await page.getByText('Mantenimiento del resultado').click()
  await page.getByText('Contexto, presupuesto y publicación').click()
  await page.getByText('Memoria y superficies del agente').click()
  await expect(page.getByText('1 registrados · 1 con código · 1 principal')).toBeVisible()
  await expect(page.getByText('Lista para congelar', { exact: true })).toBeVisible()

  await page.getByText('Configuración y captura avanzada').click()
  await expect(page.getByText('Acceso a KVM pendiente', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/Concede acceso controlado a \/dev\/kvm/)).toBeVisible()
  const addContext = page.locator('form').filter({ hasText: 'Añadir contexto' })
  await addContext.getByLabel('Rol en el cambio').selectOption('supporting')
  await addContext.getByLabel('Superficie operativa').selectOption('frontend')
  await addContext.getByLabel('Nombre').fill('Dashboard remoto')
  await addContext.getByRole('textbox', { name: 'Referencia', exact: true }).fill('github://Itbem-Corp/dashboard')
  await addContext.getByRole('textbox', { name: 'Revisión', exact: true }).fill('dashboard-sha-1')
  await addContext.getByRole('button', { name: 'Guardar fuente' }).click()

  await expect(page.getByText('Fuente de contexto guardada. Las siguientes tareas congelarán esta revisión.').first()).toBeVisible()
  await expect(page.getByText('2 registrados · 1 con código · 1 principal')).toBeVisible()

  const dashboardMap = page.locator('details').filter({ hasText: 'Dashboard remoto' }).filter({ hasText: 'Editar mapa y responsabilidades' }).last()
  await dashboardMap.getByText('Editar mapa y responsabilidades').last().click()
  const dashboardMapForm = dashboardMap.locator('form').last()
  await dashboardMapForm.locator('select[name="repositoryRole"]').selectOption('supporting')
  await dashboardMapForm.locator('select[name="repositoryKind"]').selectOption('frontend')
  await dashboardMapForm.locator('textarea[name="repositoryResponsibility"]').fill('Experiencia visual del dashboard')
  await dashboardMapForm.locator('textarea[name="dependsOnRepositories"]').fill('workspace://api')
  await dashboardMapForm.locator('textarea[name="componentScopes"]').fill('apps/dashboard\npackages/ui')
  await dashboardMapForm.getByRole('button', { name: 'Guardar arquitectura' }).click()

  await expect(page.getByText('Arquitectura de Dashboard remoto actualizada. Las tareas existentes conservan su snapshot.').first()).toBeVisible()
  await expect(page.getByText('Depende de: workspace://api', { exact: true })).toBeVisible()
  await expect(page.getByText('Experiencia visual del dashboard', { exact: true }).first()).toBeVisible()
})
