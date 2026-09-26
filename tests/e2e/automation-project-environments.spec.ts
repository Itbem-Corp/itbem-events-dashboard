import { expect, test } from '@playwright/test'

test.use({ storageState: undefined })

const now = new Date().toISOString()
const session = {
  application: { id: 'application-itbem', code: 'itbem', name: 'ITBEM', product_label: 'Agent operations', modules: ['home', 'users', 'organizations', 'metrics', 'automation'], allows_platform_admin: true, is_active: true },
  user: { id: 'user-environments', email: 'environments@example.test', first_name: 'Environment', last_name: 'Tester', is_active: true, is_root: true, root_level: 1 },
  organizations: [], capabilities: ['dashboard:view', 'automation:view', 'automation:manage', 'organizations:view'],
}

function environment(id: string, name: string, branch: string, deployment: string, url?: string, promotion?: string) {
  return { id, kind: 'environment', name, reference: `local://${id}`, revision: branch, status: 'ready', metadata: { branch, deployment, ...(url ? { url } : {}), ...(promotion ? { promotion } : {}) }, captured_at: now }
}

function runbook() {
  return {
    id: 'delivery-rules', kind: 'runbook', name: 'Guía de entrega', reference: 'workflow://progressive/rules', revision: 'v1', status: 'ready',
    metadata: { technologies: 'Go 1.24; Next.js; PostgreSQL', issue_workflow: 'Planear en GitHub Issues', branch_workflow: 'feature/* desde dev', pull_request_workflow: 'Revisión obligatoria antes de merge', release_workflow: 'QA en staging antes de main' }, captured_at: now,
  }
}

function project(id: string, name: string, contexts: Array<Record<string, unknown>>) {
  return {
    id, client_id: `client-${id}`, name, slug: id, summary: `${name} opera con su propia ruta de entrega`, status: 'active',
    monthly_budget_microusd: 1_000_000, budget_alert_percent: 80, created_at: now, updated_at: now,
    client: { id: `client-${id}`, name: `Cliente ${name}`, code: id }, context: contexts,
    members: [], requests: [], releases: [], work_items: [], preparation: { version: 1, checks: [] },
  }
}

function envelope(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

test('cada proyecto conserva su propia ruta de ambientes, ramas y promoción', async ({ page }) => {
  const projects = {
    'project-progressive': project('project-progressive', 'Entrega por etapas', [environment('dev', 'Desarrollo', 'dev', 'automatic', 'https://dev.example.test'), runbook()]),
    'project-direct': project('project-direct', 'Entrega directa', [environment('prod', 'Producción', 'main', 'manual', 'https://app.other.test')]),
  }
  await page.context().addCookies([{ name: 'session', value: 'environment-session', url: String(test.info().project.use.baseURL), httpOnly: true }])
  await page.route(/\/api\/auth\/token(?:\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'environment-token', session }) }))
  await page.route(/\/automation-bridge\/automation\/projects\/project-progressive(?:\?.*)?$/, (route) => route.fulfill(envelope(projects['project-progressive'])))
  await page.route(/\/automation-bridge\/automation\/projects\/project-direct(?:\?.*)?$/, (route) => route.fulfill(envelope(projects['project-direct'])))
  await page.route(/\/automation-bridge\/automation\/projects\/project-progressive\/context\/dev(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fulfill(envelope(projects['project-progressive'].context))
    const body = route.request().postDataJSON() as { metadata: Record<string, string> }
    expect(body.metadata).toEqual({ branch: 'integration', deployment: 'manual', url: 'https://integration.example.test', promotion: 'Tras QA, abrir PR hacia main' })
    const source = projects['project-progressive'].context.find((item) => item.id === 'dev')!
    source.metadata = { ...(source.metadata as Record<string, unknown>), ...body.metadata }
    source.revision = body.metadata.branch
    source.synced_at = now
    return route.fulfill(envelope(source))
  })
  await page.route(/\/automation-bridge\/automation\/projects\/project-progressive\/context\/delivery-rules(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== 'PATCH') return route.fulfill(envelope(projects['project-progressive'].context))
    const body = route.request().postDataJSON() as { metadata: Record<string, string> }
    expect(body.metadata).toEqual({
      technologies: 'Go 1.24; Next.js 16; PostgreSQL',
      issue_workflow: 'Planear en GitHub Issues y enlazar el PR',
      branch_workflow: 'feature/* desde dev; promover a staging',
      pull_request_workflow: 'Revisión obligatoria y checks verdes antes de merge',
      release_workflow: 'QA en staging antes de main',
    })
    const source = projects['project-progressive'].context.find((item) => item.id === 'delivery-rules')!
    source.metadata = { ...(source.metadata as Record<string, unknown>), ...body.metadata }
    source.revision = 'v2'
    source.synced_at = now
    return route.fulfill(envelope(source))
  })
  await page.route(/\/automation-bridge\/automation\/projects\/project-progressive\/context$/, (route) => {
    if (route.request().method() !== 'POST') return route.fulfill(envelope(projects['project-progressive'].context))
    const body = route.request().postDataJSON() as { kind: string; name: string; reference: string; metadata: Record<string, unknown> }
    expect(body).toMatchObject({ kind: 'environment', name: 'QA', reference: 'local://progressive/qa', metadata: { branch: 'staging', deployment: 'manual', url: 'https://qa.example.test', promotion: 'Tras QA, abrir PR hacia main' } })
    const source = { ...body, id: 'qa', revision: 'staging', status: 'ready', captured_at: now }
    projects['project-progressive'].context.push(source)
    return route.fulfill(envelope(source))
  })
  await page.route(/\/automation-bridge\/.*$/, (route) => {
    if (route.request().url().includes('/automation/projects/project-progressive') || route.request().url().includes('/automation/projects/project-direct')) return route.fallback()
    return route.fulfill(envelope([]))
  })

  await page.goto('/automation/projects/project-progressive')
  const progressiveMap = page.getByRole('region', { name: 'Mapa operativo del proyecto' })
  await expect(progressiveMap).toContainText('Desarrollo')
  await page.getByRole('button', { name: 'Configurar proyecto' }).click()
  await expect(page.getByRole('heading', { name: 'Fuentes y reglas del proyecto' })).toBeVisible()
  await page.getByText('Editar ambiente: Desarrollo', { exact: true }).click()
  await page.getByLabel('Rama de Desarrollo').fill('integration')
  await page.getByLabel('Despliegue de Desarrollo').selectOption('manual')
  await page.getByLabel('URL de Desarrollo').fill('https://integration.example.test')
  await page.getByLabel('Paso siguiente').fill('Tras QA, abrir PR hacia main')
  await page.getByRole('button', { name: 'Guardar ambiente Desarrollo' }).click()
  await expect(progressiveMap).toContainText('Rama integration · Despliegue manual')
  await expect(progressiveMap).toContainText('https://integration.example.test')

  await page.getByText('Editar guía: Guía de entrega', { exact: true }).click()
  await page.getByLabel('Tecnologías y versiones').fill('Go 1.24; Next.js 16; PostgreSQL')
  await page.getByLabel('Issues y planeación').fill('Planear en GitHub Issues y enlazar el PR')
  await page.getByLabel('Ramas y puntos de partida').fill('feature/* desde dev; promover a staging')
  await page.getByLabel('Pull requests y revisión').fill('Revisión obligatoria y checks verdes antes de merge')
  await page.getByRole('button', { name: 'Guardar guía Guía de entrega' }).click()
  await expect(page.locator('dd').filter({ hasText: 'Go 1.24; Next.js 16; PostgreSQL' })).toBeVisible()

  await page.getByRole('button', { name: 'Añadir otro ambiente' }).click()
  await page.getByLabel('Nombre', { exact: true }).fill('QA')
  await page.getByLabel('Referencia', { exact: true }).fill('local://progressive/qa')
  await page.getByLabel('Rama que alimenta este ambiente').fill('staging')
  await page.getByRole('combobox', { name: 'Despliegue' }).selectOption('manual')
  await page.getByRole('textbox', { name: /URL del ambiente/ }).fill('https://qa.example.test')
  await page.getByRole('textbox', { name: /Paso siguiente \/ promoción/ }).fill('Tras QA, abrir PR hacia main')
  await page.getByRole('button', { name: 'Guardar fuente' }).click()
  await expect(progressiveMap).toContainText('Siguiente paso: Tras QA, abrir PR hacia main')
  await expect(progressiveMap).toContainText('https://qa.example.test')

  await page.goto('/automation/projects/project-direct')
  const directMap = page.getByRole('region', { name: 'Mapa operativo del proyecto' })
  await expect(directMap).toContainText('Producción')
  await expect(directMap).toContainText('Rama main · Despliegue manual')
  await expect(directMap).toContainText('https://app.other.test')
  await expect(directMap).not.toContainText('integration.example.test')
  await expect(directMap).not.toContainText('https://qa.example.test')
  await expect(directMap).not.toContainText('Tras QA')
})
