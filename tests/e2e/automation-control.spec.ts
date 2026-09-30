import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// This is a hermetic product-level check. It exercises the real dashboard
// route and interaction model without Cognito, a provider call, or a mutable
// backend. The same contract can therefore run in CI and in local review.
test.use({ storageState: undefined })

const WORK_ITEM_ID = 'automation-e2e-work-item'
const now = new Date().toISOString()
// The hermetic control-surface test must exercise the same private-asset
// download path as production. Distinct SVG fixtures make the before/after
// comparison visibly meaningful without checking binary files into the repo.
const evidenceBefore = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#eef2ff"/><rect x="48" y="52" width="544" height="296" rx="24" fill="#ffffff" stroke="#c7d2fe" stroke-width="4"/><text x="80" y="150" font-family="Arial" font-size="36" font-weight="700" fill="#312e81">Antes</text><text x="80" y="205" font-family="Arial" font-size="22" fill="#4f46e5">Estado inicial del flujo</text><circle cx="520" cy="185" r="42" fill="#a5b4fc"/></svg>')
const evidenceAfter = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#ecfdf5"/><rect x="48" y="52" width="544" height="296" rx="24" fill="#ffffff" stroke="#86efac" stroke-width="4"/><text x="80" y="150" font-family="Arial" font-size="36" font-weight="700" fill="#166534">Después</text><text x="80" y="205" font-family="Arial" font-size="22" fill="#15803d">Estado verificado del flujo</text><path d="M492 190l22 22 48-58" fill="none" stroke="#22c55e" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg>')

const axeSource = readFileSync(path.resolve(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')

async function runWcagAudit(page: Page) {
  return page.evaluate(async () => {
    const axe = (window as Window & { axe?: { run: (context: Document, options: unknown) => Promise<{ violations: Array<{ id: string; help: string; nodes: Array<{ target: string[] }> }> }> } }).axe
    if (!axe) throw new Error('axe-core was not installed in the page')
    return axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
  })
}

const session = {
  application: {
    id: 'application-itbem',
    code: 'itbem',
    name: 'ITBEM',
    product_label: 'Agent operations',
    modules: ['home', 'users', 'organizations', 'metrics', 'automation'],
    allows_platform_admin: true,
    is_active: true,
  },
  user: {
    id: 'user-automation-e2e',
    email: 'automation-e2e@example.test',
    first_name: 'Automation',
    last_name: 'Operator',
    is_active: true,
    is_root: true,
    root_level: 1,
  },
  organizations: [],
  capabilities: ['dashboard:view', 'automation:view', 'automation:manage', 'metrics:view', 'organizations:view'],
}

const workItem = {
  id: WORK_ITEM_ID,
  project_id: 'project-automation-e2e',
  title: 'Entrega premium del agente',
  description: 'Validar la experiencia de operación, evidencia y recuperación.',
  expected_outcome: 'El dashboard debe permitir ver el avance y continuar con seguridad.',
  mandate_version: 1,
  mandate: {
    version: 1,
    objective: 'El dashboard debe permitir ver el avance y continuar con seguridad.',
    included_scope: ['Control en vivo', 'Evidencia y trazabilidad'],
    excluded_scope: ['Publicación automática'],
    repository_refs: ['workspace://dashboard-ts'],
    allowed_tools: ['context.read', 'repository.read', 'worktree.create', 'patch.apply', 'test.run', 'evidence.record'],
    effective_allowed_tools: ['context.read', 'repository.read', 'worktree.create', 'patch.apply', 'test.run', 'evidence.record'],
    max_concurrency: 1,
    budget_microusd: 1200000,
    autonomy_policy: 'bounded_autonomy',
    stop_conditions: ['scope_exceeded', 'budget_exhausted', 'human_gate_required'],
    human_actions: ['approve_plan', 'approve_code_review', 'resolve_blocker'],
  },
  included_scope: JSON.stringify(['Control en vivo', 'Evidencia y trazabilidad']),
  excluded_scope: JSON.stringify(['Publicación automática']),
  acceptance_criteria: JSON.stringify(['El estado es visible', 'El costo de conversación está separado']),
  state: 'implementation',
  assigned_agent: 'local-worker-01',
  created_at: now,
  updated_at: now,
  context_snapshots: [{
    id: 'context-repo', kind: 'repository', name: 'dashboard-ts', reference: 'dashboard-ts', revision: 'abc1234', captured_at: now,
  }],
  evidence: [
    {
      id: 'evidence-qa', kind: 'test_result', phase: 'qa', title: 'QA local · 1208 pruebas', reference: 'artifact://qa-1208', captured_by: 'local-worker-01', captured_at: now,
    },
    {
      id: 'evidence-before', kind: 'screenshot', phase: 'qa', title: 'Vista antes · control', reference: 's3://private/evidence-before.png', captured_by: 'local-worker-01', captured_at: now,
      metadata: { automation_task_id: 'task-running', qa_comparison_key: 'case-1', qa_comparison_role: 'before', agent_note: 'Baseline capturado antes del cambio.' },
    },
    {
      id: 'evidence-after', kind: 'screenshot', phase: 'qa', title: 'Vista después · control', reference: 's3://private/evidence-after.png', captured_by: 'local-worker-01', captured_at: now,
      metadata: { automation_task_id: 'task-running', qa_comparison_key: 'case-1', qa_comparison_role: 'after', agent_note: 'Estado verificado tras el cambio.' },
    },
  ],
  messages: [
    { id: 'message-agent', phase: 'implementation', author_type: 'agent', author_id: 'local-worker-01', body: 'Implementé la superficie de control y dejé la evidencia lista para revisar.', intent: 'agent_answer', effect: 'informational', created_at: now },
    { id: 'message-human', phase: 'implementation', author_type: 'human', author_id: 'operator', body: 'Conserva el alcance de EventiApp sin cambios.', intent: 'context', effect: 'stored_context', created_at: now },
  ],
  automation_tasks: [{
    id: 'task-running', operation: 'delivery.implementation', status: 'running', provider: 'minimax', model: 'MiniMax-M3', progress_step: 'validating', progress_call: 4, created_at: now, updated_at: now,
  }],
  cost_summary: {
    executions: 2, input_tokens: 800, output_tokens: 320, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 1120,
    input_cost_microusd: 40, output_cost_microusd: 30, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 70,
    conversation: {
      executions: 1, input_tokens: 120, output_tokens: 40, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 160,
      input_cost_microusd: 12, output_cost_microusd: 8, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 20,
    },
    steps: [{ step_key: 'implementation', execution_kind: 'agent', executions: 1, input_tokens: 680, output_tokens: 280, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 960, input_cost_microusd: 28, output_cost_microusd: 22, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 50 }],
  },
  workflow_projection: {
    schema_version: 1, stage: 'build', state_kind: 'active', summary: 'El agente está validando el cambio', detail: 'La siguiente decisión segura es revisar la evidencia cuando termine.', state: 'implementation', current_operation: 'delivery.implementation', current_task_id: 'task-running', waiting_reason: '', waiting_category: '',
    actor: { type: 'agent', operation: 'delivery.implementation', provider: 'minimax', model: 'MiniMax-M3' }, last_activity_at: now, stale_after_seconds: 180, stale: false,
    evidence: { total: 1, validations: 1, has_result: false, has_changes: false, has_human_gate: false },
    recovery: { mode: 'repair', title: 'Ver actividad del intento', detail: 'Si la señal se detiene, revisa el último resultado antes de continuar.', action_id: 'open_activity', requires_human_review: false },
    available_actions: [{ id: 'open-activity', kind: 'navigation', label: 'Ver actividad', permission: 'automation:view' }], can_continue: false,
  },
  project: { id: 'project-automation-e2e', name: 'Agent platform', repository_mode: 'monorepo' },
}

const executionGraph = {
  work_item_id: WORK_ITEM_ID,
  revision: 'revision-4',
  nodes: [
    { id: 'node-task', kind: 'task', status: 'running', summary: 'Implementación', detail: 'El agente valida el cambio', occurred_at: now, entity: { type: 'automation_task', id: 'task-running' }, metadata: { operation: 'delivery.implementation', attempt_count: 1 }, actions: [{ id: 'open_trace', target_type: 'automation_task', target_id: 'task-running' }] },
    { id: 'node-evidence', kind: 'evidence', status: 'completed', summary: 'QA local', detail: '1208 pruebas verificadas', occurred_at: now, entity: { type: 'delivery_evidence', id: 'evidence-qa' }, metadata: { operation: 'qa' }, actions: [] },
  ],
  edges: [{ id: 'edge-1', source_id: 'node-evidence', target_id: 'node-task', kind: 'supports', status: 'completed' }],
}

const stalePreviewItem = {
  ...workItem,
  state: 'preview_pending',
  workflow_projection: {
    ...workItem.workflow_projection,
    stage: 'preview',
    state_kind: 'waiting',
    state: 'preview_pending',
    summary: 'Falta un preview verificable',
    detail: 'La publicación observada pertenece a otra revisión.',
    available_actions: [{ id: 'preview-ready', kind: 'transition', label: 'Registrar preview', permission: 'automation:manage', transition: 'preview_ready' }],
  },
  plans: [{
    id: 'plan-multirepo', work_item_id: WORK_ITEM_ID, version: 1, status: 'approved', summary: 'Plan multirrepositorio',
    structured_result: JSON.stringify({ repository_impact: [
      { name: 'Web', reference: 'workspace://web', revision: 'web-sha', role: 'primary', impact: 'changes', notes: 'Aplicación web' },
      { name: 'API', reference: 'workspace://api', revision: 'api-sha', role: 'supporting', impact: 'changes', notes: 'API de soporte' },
    ] }),
    created_at: now,
  }],
  change_sets: [
    {
      id: 'review-web', work_item_id: WORK_ITEM_ID, repository_ref: 'workspace://web', branch: 'itbem-agent/web', review_type: 'local_worktree', ci_status: 'passed', created_by: 'itbem-local-agent', created_at: now,
      metadata: { verification_source: 'itbem-local-agent', automation_task_id: 'task-web', worktree: 'workspace://web#itbem-agent/web', review_diff_sha256: 'reviewed-web-digest' },
    },
    {
      id: 'publication-web-stale', work_item_id: WORK_ITEM_ID, repository_ref: 'workspace://web', branch: 'itbem-agent/web', review_type: 'pull_request', ci_status: 'passed', preview_url: 'https://stale.preview.example.test', created_at: now,
      metadata: { branch_published: true, verification_source: 'itbem-github-app', review_diff_sha256: 'old-web-digest' },
    },
    {
      id: 'review-api', work_item_id: WORK_ITEM_ID, repository_ref: 'workspace://api', branch: 'itbem-agent/api', review_type: 'local_worktree', ci_status: 'passed', created_by: 'itbem-local-agent', created_at: now,
      metadata: { verification_source: 'itbem-local-agent', automation_task_id: 'task-api', worktree: 'workspace://api#itbem-agent/api', review_diff_sha256: 'reviewed-api-digest' },
    },
    {
      id: 'publication-api', work_item_id: WORK_ITEM_ID, repository_ref: 'workspace://api', branch: 'itbem-agent/api', review_type: 'pull_request', ci_status: 'passed', preview_url: 'https://integrated.preview.example.test', created_at: now,
      metadata: { branch_published: true, verification_source: 'itbem-github-app', review_diff_sha256: 'reviewed-api-digest' },
    },
  ],
} as unknown as typeof workItem

function envelope(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ status: 200, data }) }
}

async function installAutomationFixtures(page: Page, fixture: { item?: typeof workItem; graph?: typeof executionGraph } = {}) {
  const item = fixture.item ?? workItem
  const graph = fixture.graph ?? executionGraph
  await page.context().addCookies([{ name: 'session', value: 'automation-e2e-session', url: String(test.info().project.use.baseURL), httpOnly: true }])

  await page.route(/\/api\/auth\/token(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ token: 'automation-e2e-token', session }),
  }))

  await page.route(/\/automation-bridge\/automation\/work-items\/automation-e2e-work-item\/stream$/, (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    headers: { 'cache-control': 'no-cache' },
    body: `event: snapshot\ndata: ${JSON.stringify({ work_item_id: WORK_ITEM_ID, revision: 'revision-4', state: 'implementation', active_tasks: 1, last_activity_at: now, generated_at: now })}\n\n`,
  }))
  await page.route(/\/automation-bridge\/automation\/work-items\/automation-e2e-work-item\/execution-graph$/, (route) => route.fulfill(envelope(graph)))
  await page.route(/\/automation-bridge\/automation\/work-items\/automation-e2e-work-item\/budget$/, (route) => route.fulfill(envelope({ budget_microusd: 1_200_000, alert_percent: 80, spent_microusd: 70, reserved_microusd: 0, allocated_microusd: 1_200_000, remaining_microusd: 1_199_930, enforced: true })))
  await page.route(/\/automation-bridge\/automation\/work-items\/automation-e2e-work-item$/, (route) => route.fulfill(envelope(item)))
  await page.route(/\/automation-bridge\/automation\/health$/, (route) => route.fulfill(envelope({ operational_telemetry_available: true, active_workers: 1, workers: [{ capabilities: ['delivery.implementation', 'delivery.chat'], workspace_readiness: [] }], operation_readiness: [{ operation: 'delivery.implementation', worker_count: 1, worker_capacity: 1, ready: true }] })))
  await page.route(/\/automation-bridge\/automation\/projects\/project-automation-e2e\/publication-readiness$/, (route) => route.fulfill(envelope({ state: 'ready', provider: 'github_app', message: 'GitHub App listo' })))
  await page.route(new RegExp(`/automation-bridge/automation/work-items/${WORK_ITEM_ID}/evidence/(evidence-before|evidence-after)/asset$`), (route) => {
    const body = route.request().url().includes('evidence-before') ? evidenceBefore : evidenceAfter
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body })
  })

  // Keep incidental reads deterministic while making unexpected mutations fail
  // loudly instead of silently hiding a broken contract.
  await page.route(/\/automation-bridge\/.*$/, async (route) => {
    const url = route.request().url()
    if (
      url.includes(`/automation/work-items/${WORK_ITEM_ID}`) ||
      url.includes('/automation/health') ||
      url.includes('/automation/projects/project-automation-e2e/publication-readiness')
    ) return route.fallback()
    if (route.request().method() !== 'GET') return route.abort('blockedbyclient')
    await route.fulfill(envelope([]))
  })
}

test.describe('Automation control surface', () => {
  test('mantiene el control surface sin violaciones WCAG A/AA', async ({ page }) => {
    await installAutomationFixtures(page)
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}`)
    // The dashboard deliberately carries a nonce-based CSP, so an inline
    // <script> tag is rejected. The hermetic test is allowed to use the
    // page's explicit unsafe-eval test policy and installs the pinned local
    // axe bundle without weakening the application response headers.
    await page.evaluate((source) => {
      const execute = new Function(source)
      execute()
    }, axeSource)

    const variants = [
      { name: 'light desktop', dark: false, viewport: { width: 1280, height: 720 } },
      { name: 'dark desktop', dark: true, viewport: { width: 1280, height: 720 } },
      { name: 'dark mobile', dark: true, viewport: { width: 390, height: 844 } },
    ]
    for (const variant of variants) {
      await page.setViewportSize(variant.viewport)
      await page.evaluate((dark) => {
        const root = document.documentElement
        root.classList.toggle('dark', dark)
        root.dataset.theme = dark ? 'dark' : 'light'
        root.style.colorScheme = dark ? 'dark' : 'light'
      }, variant.dark)
      // Theme transitions are intentionally smooth in the product. Wait for
      // the settled token color before auditing so axe never samples a
      // half-transitioned foreground/background pair.
      const expectedBodyColor = variant.dark ? 'rgb(244, 246, 248)' : 'rgb(21, 26, 35)'
      await page.waitForFunction((expected) => getComputedStyle(document.body).color === expected, expectedBodyColor)
      await page.waitForTimeout(220)
      const audit = await runWcagAudit(page)
      expect(audit.violations, `${variant.name}: ${JSON.stringify(audit.violations, null, 2)}`).toEqual([])
    }
  })

  test('presenta una matriz visual de estados sin ofrecer acciones incompatibles', async ({ page }) => {
    const stateMatrix = [
      { name: 'activo', summary: 'En ejecución', item: { ...workItem, state: 'implementation', workflow_projection: { ...workItem.workflow_projection, state_kind: 'active', summary: 'En ejecución', detail: 'El agente continúa dentro del mandato.', available_actions: [] } } },
      { name: 'esperando', summary: 'Esperando dependencia', item: { ...workItem, state: 'preview_pending', workflow_projection: { ...workItem.workflow_projection, state_kind: 'waiting', summary: 'Esperando dependencia', detail: 'El flujo continuará cuando llegue la señal durable.', waiting_reason: 'Falta una dependencia verificable.', available_actions: [] } } },
      { name: 'revision', summary: 'Revisión pendiente', item: { ...workItem, state: 'code_review', workflow_projection: { ...workItem.workflow_projection, state_kind: 'review', summary: 'Revisión pendiente', detail: 'La decisión humana mantiene el control del siguiente gate.', available_actions: [] } } },
      { name: 'atencion', summary: 'Atención requerida', item: { ...workItem, state: 'implementation', workflow_projection: { ...workItem.workflow_projection, state_kind: 'attention', summary: 'Atención requerida', detail: 'El agente dejó un diagnóstico para continuar con seguridad.', available_actions: [] } } },
      { name: 'bloqueado', summary: 'Necesita contexto', item: { ...workItem, state: 'blocked', workflow_projection: { ...workItem.workflow_projection, state_kind: 'blocked', summary: 'Necesita contexto', detail: 'El siguiente intento requiere una respuesta concreta.', recovery: { mode: 'operator_input', title: 'Aporta el contexto faltante', detail: 'La respuesta quedará vinculada a este intento.', action_id: 'open_conversation', requires_human_review: false }, available_actions: [], can_continue: true } } },
      { name: 'incierto', summary: 'Resultado por confirmar', item: { ...workItem, state: 'blocked', workflow_projection: { ...workItem.workflow_projection, state_kind: 'uncertain', summary: 'Resultado por confirmar', detail: 'No repitas la operación hasta revisar la evidencia.', recovery: { mode: 'reconcile', title: 'Confirma el resultado anterior', detail: 'La operación externa puede haber ocurrido.', action_id: 'open_evidence', requires_human_review: true }, available_actions: [], can_continue: false } } },
      { name: 'parcial', summary: 'Entrega parcial', item: { ...workItem, state: 'preview_pending', workflow_projection: { ...workItem.workflow_projection, state_kind: 'partial', summary: 'Entrega parcial', detail: 'Una parte del trabajo quedó comprobada y otra requiere atención.', available_actions: [] } } },
      { name: 'cancelado', summary: 'Cancelado', terminal: true, item: { ...workItem, state: 'cancelled', automation_tasks: [], workflow_projection: { ...workItem.workflow_projection, state_kind: 'terminal', summary: 'Cancelado', detail: 'El historial y la evidencia permanecen disponibles.', available_actions: [], can_continue: false } } },
      { name: 'entregado', summary: 'Entregado', terminal: true, item: { ...workItem, state: 'released', automation_tasks: [], workflow_projection: { ...workItem.workflow_projection, state_kind: 'terminal', summary: 'Entregado', detail: 'La entrega está vinculada a sus gates y evidencia.', available_actions: [], can_continue: false } } },
    ] as unknown as Array<{ name: string; summary: string; terminal?: boolean; item: typeof workItem }>

    const viewports = [
      { name: 'desktop', width: 1280, height: 720 },
      { name: 'mobile', width: 390, height: 844 },
    ]
    for (const scenario of stateMatrix) {
      for (const viewport of viewports) {
        await test.step(`estado ${scenario.name} · ${viewport.name}`, async () => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height })
          await installAutomationFixtures(page, { item: scenario.item })
          await page.goto(`/automation/work-items/${WORK_ITEM_ID}`)
          const summary = page.getByRole('region', { name: 'Resumen del trabajo' })
          await expect(summary).toBeVisible()
          await expect(summary).toContainText(scenario.summary)
          await expect(page.getByText('Resultado esperado').first()).toBeVisible()
          await expect(page.getByText('Actualizaciones').first()).toBeVisible()
          if (scenario.terminal) {
            await expect(page.getByRole('button', { name: /aprobar|reanudar|reintentar|publicar|liberar/i })).toHaveCount(0)
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
        })
      }
    }
  })

  test('presenta estado vivo, conversación, evidencia y costo separado', async ({ page }) => {
    await installAutomationFixtures(page)
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}`)

    await expect(page.getByRole('heading', { name: workItem.title })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Organizaciones', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Clientes', exact: true })).toHaveCount(0)
    await expect(page.getByText('Canal en vivo').first()).toBeVisible()
    await expect(page.getByRole('region', { name: 'Contrato de autonomía' })).toBeVisible()
    await expect(page.getByText('Autonomía acotada al resultado')).toBeVisible()
    await expect(page.getByText('1 carril simultáneo')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Conversación de trabajo' })).toBeVisible()
    await expect(page.getByText('Implementé la superficie de control y dejé la evidencia lista para revisar.')).toBeVisible()
    await expect(page.getByRole('tab', { name: /Evidencia/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Revisión' })).toBeVisible()

    await page.getByRole('tab', { name: /Intentos/ }).click()
    await expect(page.getByText('Uso y límites')).toBeVisible()
    await page.getByText('Uso y límites').click()
    await expect(page.getByText('Conversación con el agente')).toBeVisible()
    await expect(page.getByText('$0.00002')).toBeVisible()
    await expect(page.getByText('160 tokens')).toBeVisible()

    await page.getByRole('tab', { name: /Evidencia/ }).click()
    await expect(page.getByText('Antes / Después')).toBeVisible()
    await expect(page.locator('img[alt^="Antes:"]')).toHaveCount(1)
    await expect(page.locator('img[alt^="Después:"]')).toHaveCount(1)
    await expect(page.getByText('Captura no disponible')).toHaveCount(0)
    await page.getByText('Registros').click()
    await expect(page.getByLabel(/Evidencia/).getByText('QA local · 1208 pruebas', { exact: true })).toBeVisible()
    const evidenceScreenshotPath = test.info().outputPath('automation-control-evidence.png')
    await page.screenshot({ path: evidenceScreenshotPath, fullPage: true })
    await test.info().attach('automation-control-evidence', { path: evidenceScreenshotPath, contentType: 'image/png' })
  })

  test('mantiene pulso, consumo y última evidencia en Trabajo con acceso directo al detalle', async ({ page }) => {
    await installAutomationFixtures(page)
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}`)

    await expect(page.getByRole('region', { name: 'Pipeline de entrega en vivo' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Consumo de IA de esta tarea' })).toContainText('$0.00007')
    await expect(page.getByRole('region', { name: 'Consumo de IA de esta tarea' })).toContainText('Conversación')
    await expect(page.getByRole('region', { name: 'Consumo de IA de esta tarea' })).toContainText('Implementación')
    await expect(page.getByRole('region', { name: 'Evidencia de esta tarea' })).toContainText('QA local · 1208 pruebas')
    await expect(page.getByRole('region', { name: 'Evidencia de esta tarea' })).toContainText('Resultado de prueba registrado')
    await expect(page.getByText('Cronología detallada · eventos, intentos y dependencias')).toBeVisible()

    await page.getByRole('button', { name: 'Abrir evidencia' }).click()
    await expect(page.getByRole('tab', { name: /Evidencia/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Resultado y evidencia del trabajo' })).toBeVisible()

    await page.getByRole('tab', { name: 'Trabajo' }).click()
    await page.getByRole('button', { name: 'Ver límites y llamadas' }).click()
    await expect(page.getByRole('tab', { name: /Actividad/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('Uso y límites')).toBeVisible()
    await expect(page.getByText('Implementación', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Conversación con el agente' })).toBeVisible()
  })

  test('explica un preview desactualizado y bloquea el avance multirrepositorio', async ({ page }) => {
    await installAutomationFixtures(page, { item: stalePreviewItem })
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}?view=control`)

    await expect(page.getByText('Cobertura multirrepositorio')).toBeVisible()
    await expect(page.getByText('Preview desactualizado')).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'La publicación no corresponde al diff aprobado' })).toBeVisible()
    await expect(page.getByText('Vuelve a publicar la rama exacta revisada')).toBeVisible()
    await expect(page.getByRole('tabpanel', { name: 'Revisión' }).getByRole('button', { name: 'Registrar preview' })).toBeDisabled()
    const stalePreviewScreenshotPath = test.info().outputPath('automation-control-stale-preview.png')
    await page.screenshot({ path: stalePreviewScreenshotPath, fullPage: true })
    await test.info().attach('automation-control-stale-preview', { path: stalePreviewScreenshotPath, contentType: 'image/png' })
  })

  test('hace visible la confianza de registros no visuales y no los presenta como verificados', async ({ page }) => {
    // This fixture intentionally exercises metadata fields that are not part
    // of the narrow visual baseline union above (integrity and lineage). Keep
    // the runtime payload honest while widening only this test fixture.
    const artifactItem = {
      ...workItem,
      evidence: [
        ...workItem.evidence,
        {
          id: 'evidence-invalid-report',
          kind: 'report',
          phase: 'qa',
          title: 'Reporte parcial · revisión antigua',
          reference: 's3://private/report.json',
          captured_by: 'local-worker-01',
          captured_at: now,
          metadata: {
            sha256: 'not-a-digest',
            automation_attempt: 2,
            repository_context_status: 'unavailable',
            agent_note: 'La ejecución no alcanzó una revisión verificable.',
          },
        },
      ],
    } as unknown as typeof workItem
    await installAutomationFixtures(page, { item: artifactItem })
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}?view=evidence`)

    await expect(page.getByText('Registros', { exact: true })).toBeVisible()
    await page.getByText('Registros', { exact: true }).click()
    const record = page.getByText('Reporte parcial · revisión antigua').locator('..')
    await expect(record.getByText('Integridad no verificable')).toBeVisible()
    await expect(record.getByText('Intento 2')).toBeVisible()
    await expect(record.getByText('Contexto no disponible')).toBeVisible()
    await expect(record.getByText('Huella SHA-256 registrada')).toHaveCount(0)
  })

  test('mantiene la revisión como una acción explícita y no como aprobación implícita', async ({ page }) => {
    await installAutomationFixtures(page)
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}?view=control`)

    await expect(page.getByRole('tab', { name: 'Revisión' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText(/decisión|revisión/i).first()).toBeVisible()
    await expect(page.getByText('Conversación con el agente')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /aprobar|liberar/i })).toHaveCount(0)
  })

  test('mantiene una pregunta informativa fuera de la ruta de ejecución', async ({ page }) => {
    const informationalItem = {
      ...workItem,
      messages: [
        ...workItem.messages,
        {
          id: 'message-question',
          phase: 'implementation',
          author_type: 'human',
          author_id: 'operator',
          body: '¿Qué pasa si publicamos ahora?',
          intent: 'question',
          effect: 'informational',
          created_at: now,
        },
      ],
      workflow_projection: {
        ...workItem.workflow_projection,
        can_continue: false,
      },
    }
    await installAutomationFixtures(page, { item: informationalItem })
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}`)

    const question = page.getByText('¿Qué pasa si publicamos ahora?')
    await expect(question).toBeVisible()
    await expect(question.locator('..').getByText('Pregunta · no ejecuta')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Guardar contexto' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enviar y continuar' })).toHaveCount(0)
  })

  test('expone un bloqueo incierto y lleva a la evidencia sin prometer reintento', async ({ page }) => {
    const blockedItem = {
      ...workItem,
      state: 'blocked',
      automation_tasks: [{ ...workItem.automation_tasks[0], status: 'failed', error_message: 'Provider outcome uncertain after interruption; reconciliation required.' }],
      workflow_projection: {
        ...workItem.workflow_projection,
        state_kind: 'uncertain',
        summary: 'Resultado por confirmar',
        detail: 'El efecto anterior no tiene una respuesta durable. Revisa la evidencia antes de continuar.',
        waiting_reason: 'La publicación puede haber ocurrido, pero su confirmación no está disponible.',
        current_operation: 'delivery.publish',
        actor: { type: 'system', operation: 'delivery.publish', provider: 'minimax', model: 'MiniMax-M3' },
        stale: true,
        recovery: { mode: 'reconcile', title: 'Confirma el resultado anterior', detail: 'No repitas la operación hasta verificar si el efecto externo ocurrió.', action_id: 'open_evidence', requires_human_review: true },
        available_actions: [{ id: 'open-evidence', kind: 'navigation', label: 'Revisar evidencia', permission: 'automation:view' }],
        can_continue: false,
      },
    }
    await installAutomationFixtures(page, { item: blockedItem })
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}`)

    await expect(page.getByText('Resultado por confirmar').first()).toBeVisible()
    await expect(page.getByText('Siguiente paso seguro')).toBeVisible()
    await expect(page.getByText('Confirma el resultado anterior')).toBeVisible()
    await expect(page.getByText('Señal obsoleta · revisar actividad')).toBeVisible()
    const recoveryButton = page.getByRole('region', { name: 'Resumen del trabajo' }).getByRole('button', { name: 'Revisar evidencia' }).last()
    await expect(recoveryButton).toBeVisible()
    await expect(page.getByRole('button', { name: /reanudar|reintentar|publicar|liberar/i })).toHaveCount(0)

    await recoveryButton.click()
    await expect(page.getByRole('tab', { name: /Evidencia/ })).toHaveAttribute('aria-selected', 'true')
  })

  test('explica un fallo de contrato del reviewer y conserva el retry explícito', async ({ page }) => {
    const invalidReviewItem = {
      ...workItem,
      state: 'code_review',
      automation_tasks: [{
        ...workItem.automation_tasks[0],
        id: 'task-review-invalid',
        operation: 'code.review',
        status: 'failed',
        error_message: 'code review findings must not repeat a source location',
      }],
      workflow_projection: {
        ...workItem.workflow_projection,
        state_kind: 'attention',
        stage: 'review',
        summary: 'Revisión detenida',
        detail: 'La respuesta del reviewer no cumplió el contrato verificable.',
        current_operation: 'code.review',
        current_task_id: 'task-review-invalid',
        recovery: { mode: 'repair', reason_code: 'review_contract_invalid', title: 'La revisión devolvió un formato inválido', detail: 'El intento no produjo una respuesta verificable. Ningún gate avanzó; revisa el diagnóstico antes de reintentar sobre el mismo diff congelado.', action_id: 'open_activity', requires_human_review: true },
        can_continue: false,
      },
    }
    await installAutomationFixtures(page, { item: invalidReviewItem })
    let retryCalled = false
    await page.route(/\/automation-bridge\/automation\/tasks\/task-review-invalid\/retry-code-review$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      retryCalled = true
      return route.fulfill(envelope({ id: 'task-review-retry', operation: 'code.review', status: 'queued', input_ref: 's3://private/frozen-review-input.json' }))
    })
    page.on('dialog', (dialog) => void dialog.accept())
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}`)

    await page.getByRole('tab', { name: /Intentos \(1\)/ }).click()
    await expect(page.getByText('La revisión devolvió un formato inválido')).toHaveCount(1)
    await expect(page.getByText(/ningún gate avanzó/i).first()).toBeVisible()
    const retryButton = page.getByRole('button', { name: 'Reintentar revisión' })
    await expect(retryButton).toBeVisible()
    await retryButton.click()
    await expect(page.getByText('Reintento de revisión en cola. Conserva el mismo diff congelado y el intento anterior sigue disponible para auditoría.')).toBeVisible()
    expect(retryCalled).toBe(true)
  })

  test('permite aportar contexto y solicitar continuación sólo cuando la fase es recuperable', async ({ page }) => {
    const recoverableItem = {
      ...workItem,
      agent_progress: 'blocked',
      automation_tasks: [{ ...workItem.automation_tasks[0], status: 'failed', error_message: 'Las pruebas requieren una corrección antes del siguiente intento.' }],
      workflow_projection: {
        ...workItem.workflow_projection,
        state_kind: 'blocked',
        summary: 'Necesita una corrección',
        detail: 'El agente puede continuar después de recibir el contexto faltante.',
        recovery: { mode: 'operator_input', title: 'Aporta la corrección', detail: 'El siguiente intento quedará trazado.', action_id: 'open_conversation', requires_human_review: false },
        can_continue: true,
      },
    }
    await installAutomationFixtures(page, { item: recoverableItem })
    let received: Record<string, unknown> | undefined
    await page.route(/\/automation-bridge\/automation\/work-items\/automation-e2e-work-item\/messages$/, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      received = route.request().postDataJSON() as Record<string, unknown>
      return route.fulfill(envelope({ id: 'message-recovery', effect: 'continuation_queued' }))
    })
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}`)

    const message = page.getByRole('textbox', { name: 'Mensaje para el agente' })
    await message.fill('Corrige el selector de navegación y conserva el alcance aprobado.')
    await expect(page.getByRole('button', { name: 'Enviar y continuar' })).toBeVisible()
    await page.getByRole('button', { name: 'Enviar y continuar' }).click()
    await expect(page.getByText('Contexto guardado. El nuevo intento quedó solicitado; no es una aprobación ni una publicación.')).toBeVisible()
    expect(received).toMatchObject({
      phase: 'implementation',
      body: 'Corrige el selector de navegación y conserva el alcance aprobado.',
      resume: true,
      expected_epoch: 0,
    })
    expect(typeof received?.client_message_id).toBe('string')
  })

  test('mantiene el contrato accesible de controles y tabs por teclado', async ({ page }) => {
    await installAutomationFixtures(page)
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}`)

    const audit = await page.evaluate(() => {
      const interactive = Array.from(document.querySelectorAll<HTMLElement>('a,button,input,textarea,select,[role="tab"],[role="button"]'))
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      const unnamed = interactive
        .filter((element) => {
          const labelledBy = element.getAttribute('aria-labelledby')
          const labelledText = labelledBy
            ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
            : ''
          const associatedLabel = 'labels' in element
            ? Array.from((element as HTMLInputElement).labels ?? []).map((label) => label.textContent ?? '').join(' ')
            : ''
          return !(element.getAttribute('aria-label')?.trim() || labelledText.trim() || associatedLabel.trim() || element.textContent?.trim() || element.getAttribute('placeholder')?.trim() || element.getAttribute('title')?.trim())
        })
        .map((element) => `${element.tagName.toLowerCase()}#${element.id}`)
      const ids = Array.from(document.querySelectorAll<HTMLElement>('[id]')).map((element) => element.id)
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
      return { unnamed, duplicates }
    })
    expect(audit.unnamed).toEqual([])
    expect(audit.duplicates).toEqual([])

    const workTab = page.getByRole('tab', { name: 'Trabajo' })
    await workTab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: /Intentos/ })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(workTab).toHaveAttribute('aria-selected', 'true')
    await expect(workTab).toBeFocused()
  })

  test('conserva foco y lectura util en móvil sin desbordamiento horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await installAutomationFixtures(page)
    await page.goto(`/automation/work-items/${WORK_ITEM_ID}?view=control`)

    await expect(page.getByRole('heading', { name: workItem.title })).toBeVisible()
    const evidenceTab = page.getByRole('tab', { name: /Evidencia/ })
    await evidenceTab.focus()
    await expect(evidenceTab).toBeFocused()
    // A live snapshot may arrive while the operator is reading. It must not
    // steal focus or turn a narrow viewport into a horizontal scroll trap.
    await page.waitForTimeout(250)
    await expect(evidenceTab).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.keyboard.press('Enter')
    await expect(evidenceTab).toHaveAttribute('aria-selected', 'true')
  })
})
