import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AutomationClientsPage from '@/app/(app)/automation/clients/page'
import AutomationClientOverviewPage from '@/app/(app)/automation/clients/[clientId]/page'
import { normalizeDeliveryPortfolio } from '@/features/automation/delivery-portfolio'
import type { DeliveryClientOverview } from '@/features/automation/delivery-types'
import { automationPortfolioPath, deliveryClientProfilePath, deliveryClientsPath, deliveryProjectsPath } from '@/lib/api-paths'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useSWR: vi.fn(),
  fetcher: vi.fn(),
  put: vi.fn(),
  clientsMutate: vi.fn(),
  portfolioMutate: vi.fn(),
}))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('@/lib/fetcher', () => ({ fetcher: mocks.fetcher }))
vi.mock('next/navigation', () => ({ useParams: () => mocks.useParams() }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => createElement('a', { href, ...props }, children),
}))
vi.mock('@/lib/api', () => ({
  api: { put: mocks.put },
  localSessionRecoveryMessage: () => null,
}))

const clientProfile = {
  id: 'profile-1',
  client_id: 'client-1',
  health: 'watch' as const,
  contacts: JSON.stringify(['Ana · Operaciones', 'Luis · Tecnología']),
  rules: JSON.stringify(['Aprobar cambios antes de publicar']),
  conversation_summary: 'Acordamos validar el alcance en la próxima revisión.',
  last_conversation_at: '2026-09-24T16:00:00Z',
  updated_at: '2026-09-24T16:05:00Z',
}

const clientList: DeliveryClientOverview[] = [{
  client: { id: 'client-1', name: 'ITBEM Corp' },
  profile: clientProfile,
  project_count: 1,
  conversation_count: 1,
}]

const zeroCostPortfolio = {
  schema_version: 1,
  generated_at: '2026-09-24T16:00:00Z',
  revision: 'portfolio-1',
  summary_sources_unavailable: [],
  totals: {
    projects: 1,
    workItems: 0,
    activeWorkItems: 0,
    decisionsRequired: 0,
    blockedWorkItems: 0,
    automationTasks: 0,
    queuedTasks: 0,
    runningTasks: 0,
    attentionTasks: 0,
    total_cost_microusd: 0,
    unpriced_executions: 0,
    cost_last_30_days_microusd: 0,
    unpriced_executions_last_30_days: 0,
  },
  projects: [{
    id: 'project-zero',
    client_id: 'client-1',
    name: 'Proyecto sin gasto',
    status: 'active',
    updated_at: '2026-09-24T16:00:00Z',
    client: { id: 'client-1', name: 'ITBEM Corp' },
    work_item_count: 0,
    active_work_items: 0,
    decisions_required: 0,
    blocked_work_items: 0,
    automation_tasks: 0,
    queued_tasks: 0,
    running_tasks: 0,
    attention_tasks: 0,
    total_cost_microusd: 0,
    unpriced_executions: 0,
    cost_last_30_days_microusd: 0,
    unpriced_executions_last_30_days: 0,
    technology_tags: [],
    runtime_hints: [],
    work_items_truncated: false,
    work_items: [],
  }],
}

const unavailableCostPortfolio = {
  ...zeroCostPortfolio,
  summary_sources_unavailable: ['costs'],
}

const portfolioWithProject = {
  ...zeroCostPortfolio,
  totals: { ...zeroCostPortfolio.totals, projects: 1, work_items: 1, total_cost_microusd: 3_500, cost_last_30_days_microusd: 2_400 },
  projects: [{
    id: 'project-1',
    client_id: 'client-1',
    name: 'ITBEM Agent Studio',
    status: 'active',
    updated_at: '2026-09-24T16:00:00Z',
    client: { id: 'client-1', name: 'ITBEM Corp' },
    work_item_count: 1,
    active_work_items: 1,
    decisions_required: 0,
    blocked_work_items: 0,
    automation_tasks: 1,
    queued_tasks: 0,
    running_tasks: 1,
    attention_tasks: 0,
    total_cost_microusd: 3_500,
    unpriced_executions: 0,
    cost_last_30_days_microusd: 2_400,
    unpriced_executions_last_30_days: 0,
    technology_tags: ['Go', 'Next.js', 'TypeScript'],
    runtime_hints: [],
    work_items_truncated: false,
    work_items: [{
      id: 'work-1',
      project_id: 'project-1',
      title: 'Conectar el panel con la API',
      state: 'building',
      created_at: '2026-09-24T15:00:00Z',
      updated_at: '2026-09-24T16:00:00Z',
      automation_task_count: 1,
      automation_tasks: [{
        id: 'run-1',
        operation: 'delivery.build',
        status: 'running',
        attempt_count: 1,
        created_at: '2026-09-24T15:30:00Z',
        updated_at: '2026-09-24T16:00:00Z',
      }],
      gate_summary: { total: 0, approved: 0, changes_requested: 0 },
      evidence_count: 0,
    }],
  }],
}

const summaryMarkerOmittedPortfolio: Record<string, unknown> = { ...zeroCostPortfolio }
delete summaryMarkerOmittedPortfolio.summary_sources_unavailable

const normalizedZeroCostSnapshot = normalizeDeliveryPortfolio(zeroCostPortfolio)!

function renderClientPage(clients = clientList, costsAvailable = true) {
  const clientsResult = { data: clients, error: undefined, isLoading: false, isValidating: false, mutate: mocks.clientsMutate }
  const portfolioResult = { data: { snapshot: normalizedZeroCostSnapshot, costsAvailable }, error: undefined, isLoading: false, isValidating: false, mutate: mocks.portfolioMutate }
  mocks.useSWR.mockImplementation((path: string) => path === deliveryClientsPath() ? clientsResult : portfolioResult)
  return render(createElement(AutomationClientOverviewPage))
}

function renderPortfolioWithProject() {
  const snapshot = normalizeDeliveryPortfolio(portfolioWithProject)
  if (!snapshot) throw new Error('Project fixture is not a valid portfolio snapshot')
  const clientsResult = { data: clientList, error: undefined, isLoading: false, isValidating: false, mutate: mocks.clientsMutate }
  const portfolioResult = { data: snapshot, error: undefined, isLoading: false, isValidating: false, mutate: mocks.portfolioMutate }
  mocks.useSWR.mockImplementation((path: string) => path === deliveryClientsPath() ? clientsResult : portfolioResult)
  return render(createElement(AutomationClientsPage))
}

async function renderClientPageFromApi(rawPortfolio: unknown) {
  const clientsResult = { data: clientList, error: undefined, isLoading: false, isValidating: false, mutate: mocks.clientsMutate }
  const emptyPortfolioResult = { data: null, error: undefined, isLoading: true, isValidating: false, mutate: mocks.portfolioMutate }
  let portfolioFetcher: ((path: string) => Promise<unknown>) | undefined
  mocks.fetcher.mockResolvedValueOnce(rawPortfolio)
  mocks.useSWR.mockImplementation((path: string, fetcher?: (path: string) => Promise<unknown>) => {
    if (path === deliveryClientsPath()) return clientsResult
    portfolioFetcher = fetcher
    return emptyPortfolioResult
  })

  const view = render(createElement(AutomationClientOverviewPage))
  if (!portfolioFetcher) throw new Error('Portfolio fetcher was not registered')
  const data = await portfolioFetcher('/automation/portfolio')
  const portfolioResult = { data, error: undefined, isLoading: false, isValidating: false, mutate: mocks.portfolioMutate }
  mocks.useSWR.mockImplementation((path: string) => path === deliveryClientsPath() ? clientsResult : portfolioResult)
  view.rerender(createElement(AutomationClientOverviewPage))
  return view
}

function readPage(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('automation client and project hierarchy', () => {
  beforeEach(() => {
    mocks.useParams.mockReset().mockReturnValue({ clientId: 'client-1' })
    mocks.useSWR.mockReset()
    mocks.fetcher.mockReset()
    mocks.put.mockReset()
    mocks.clientsMutate.mockReset().mockResolvedValue(undefined)
    mocks.portfolioMutate.mockReset().mockResolvedValue(undefined)
  })

  it('places the client portfolio below organization navigation and groups projects by client', () => {
    const page = readPage('src/app/(app)/automation/clients/page.tsx')

    expect(page).toContain('<nav aria-label="Jerarquía del portafolio"')
    expect(page).toContain('href="/clients"')
    expect(page).toContain('Organizaciones')
    expect(page).toContain('aria-current="page" className="font-semibold text-ink-secondary">Clientes</span>')
    expect(page).toContain('Cada empresa agrupa sus proyectos.')
    expect(page).toContain('aria-label={`Proyectos de ${client.client.name}`}')
    expect(page).toContain('clientProjectsHref(client.client.id')
    expect(page).toContain('href={`/automation/clients/${encodeURIComponent(client.client.id)}`}')
  })

  it('shows project stack under its client and explains the epic link not present in the summary', () => {
    renderPortfolioWithProject()

    expect(screen.getByRole('group', { name: 'Proyectos de ITBEM Corp' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ITBEM Agent Studio/ })).toHaveAttribute('href', '/automation/projects/project-1')
    expect(screen.getByText('Go')).toBeInTheDocument()
    expect(screen.getByText('Next.js')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Jerarquía y snapshots de contexto'))
    expect(screen.getByText(/la respuesta resumida no expone el vínculo de épica/)).toBeInTheDocument()
    expect(screen.getByText(/Editar el perfil de empresa tampoco reescribe snapshots/)).toBeInTheDocument()
  })

  it('keeps project navigation available on the detailed-project fallback without inventing stack or cost', () => {
    const clientsResult = { data: clientList, error: undefined, isLoading: false, isValidating: false, mutate: mocks.clientsMutate }
    const projectsResult = {
      data: [{
        id: 'project-fallback',
        client_id: 'client-1',
        name: 'EventiApp',
        slug: 'eventiapp',
        summary: '',
        status: 'active',
        created_at: '2026-09-24T15:00:00Z',
        updated_at: '2026-09-24T16:00:00Z',
        client: { id: 'client-1', name: 'ITBEM Corp' },
        work_items: [],
      }],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: mocks.portfolioMutate,
    }
    mocks.useSWR.mockImplementation((path: string) => {
      if (path === deliveryClientsPath()) return clientsResult
      if (path === automationPortfolioPath()) return { data: undefined, error: new Error('summary unavailable'), isLoading: false, isValidating: false, mutate: mocks.portfolioMutate }
      if (path === deliveryProjectsPath()) return projectsResult
      return { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: mocks.portfolioMutate }
    })

    render(createElement(AutomationClientsPage))

    expect(screen.getByRole('link', { name: /EventiApp/ })).toHaveAttribute('href', '/automation/projects/project-fallback')
    expect(screen.getByText('Stack no incluido en esta respuesta')).toBeInTheDocument()
    expect(screen.queryByText(/IA 30 días/)).not.toBeInTheDocument()
  })

  it('provides a client overview with scoped project, cost, stack and runtime signals', () => {
    const page = readPage('src/app/(app)/automation/clients/[clientId]/page.tsx')

    expect(page).toContain('deliveryClientsPath()')
    expect(page).toContain('automationPortfolioPath()')
    expect(page).toContain('project.clientId === clientId')
    expect(page).toContain('project.technologyTags')
    expect(page).toContain('project.runtimeHints')
    expect(page).toContain('normalizeClientPortfolioResponse(await fetcher<unknown>(path))')
    expect(page).toContain('summary_sources_unavailable')
    expect(page).toContain('deliveryProjectPath(project.id)')
    expect(page).toContain('Jerarquía del portafolio')
  })

  it('shows an actual zero cost only when the API confirms the source is available', async () => {
    await renderClientPageFromApi(zeroCostPortfolio)

    expect(screen.getAllByText('IA · 30 días').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/USD\s*0\.00/).length).toBeGreaterThan(0)
    expect(screen.queryByText('No disponible')).not.toBeInTheDocument()
  })

  it('does not present an explicitly unavailable cost summary as zero', async () => {
    await renderClientPageFromApi(unavailableCostPortfolio)

    expect(screen.getAllByText('No disponible').length).toBeGreaterThan(0)
    expect(screen.queryByText(/USD\s*0\.00/)).not.toBeInTheDocument()
  })

  it('accepts explicit costs when the API omits its empty unavailable-sources list', async () => {
    await renderClientPageFromApi(summaryMarkerOmittedPortfolio)
    expect(screen.getAllByText(/USD\s*0\.00/).length).toBeGreaterThan(0)
    expect(screen.queryByText('No disponible')).not.toBeInTheDocument()
  })

  it('labels a reported amount as a subtotal when its unpriced counter is absent', async () => {
    const missingPriceCoverage = {
      ...zeroCostPortfolio,
      totals: {
        ...zeroCostPortfolio.totals,
        unpriced_executions: undefined,
        unpriced_executions_last_30_days: undefined,
      },
      projects: zeroCostPortfolio.projects.map(project => ({
        ...project,
        unpriced_executions: undefined,
        unpriced_executions_last_30_days: undefined,
      })),
    }

    await renderClientPageFromApi(missingPriceCoverage)

    expect(screen.getAllByText(/Subtotal USD verificable:/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/el total puede ser mayor o desconocido/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/^USD\s*0\.00$/)).not.toBeInTheDocument()
  })

  it('treats missing cost amounts as unavailable even when the source marker is present', async () => {
    const missingAmount = {
      ...zeroCostPortfolio,
      totals: { ...zeroCostPortfolio.totals, cost_last_30_days_microusd: undefined },
      projects: zeroCostPortfolio.projects.map(project => ({ ...project, cost_last_30_days_microusd: undefined })),
    }

    await renderClientPageFromApi(missingAmount)

    expect(screen.getAllByText('No disponible').length).toBeGreaterThan(0)
    expect(screen.queryByText(/USD\s*0\.00/)).not.toBeInTheDocument()
  })

  it('reads the company context only from the returned profile', () => {
    renderClientPage()

    expect(screen.getByRole('heading', { name: 'Contexto de empresa' })).toBeInTheDocument()
    expect(screen.getAllByText('En seguimiento')).toHaveLength(2)
    expect(screen.getByText('Ana · Operaciones')).toBeInTheDocument()
    expect(screen.getByText('Aprobar cambios antes de publicar')).toBeInTheDocument()
    expect(screen.getByText('Acordamos validar el alcance en la próxima revisión.')).toBeInTheDocument()
    expect(screen.getByText(/Registrado/)).toBeInTheDocument()
  })

  it('shows explicit empty values when the company profile is absent', () => {
    renderClientPage([{ client: { id: 'client-1', name: 'ITBEM Corp' }, project_count: 1, conversation_count: 0 }])

    expect(screen.getByText('Sin perfil guardado')).toBeInTheDocument()
    expect(screen.getByText('Sin estado registrado')).toBeInTheDocument()
    expect(screen.getByText('No hay contactos: aún no existe perfil de empresa.')).toBeInTheDocument()
    expect(screen.getByText('No hay reglas: aún no existe perfil de empresa.')).toBeInTheDocument()
    expect(screen.getByText('No hay handoff: aún no existe perfil de empresa.')).toBeInTheDocument()
    expect(screen.queryByText('Estable')).not.toBeInTheDocument()
  })

  it('saves an edited company profile through the existing protected profile route', async () => {
    mocks.put.mockResolvedValueOnce({ data: { id: 'profile-1' } })
    renderClientPage()

    fireEvent.click(screen.getByRole('button', { name: 'Editar contexto de ITBEM Corp' }))
    fireEvent.change(screen.getByLabelText(/Contactos/), { target: { value: 'Ana · Operaciones\nMarco · Finanzas' } })
    fireEvent.change(screen.getByLabelText(/Reglas/), { target: { value: 'Aprobar cambios antes de publicar\nRegistrar evidencia' } })
    fireEvent.change(screen.getByLabelText(/Resumen del último handoff/), { target: { value: 'El cliente confirmó la fecha de entrega.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Estable' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contexto' }))

    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith(deliveryClientProfilePath('client-1'), {
      health: 'healthy',
      contacts: ['Ana · Operaciones', 'Marco · Finanzas'],
      rules: ['Aprobar cambios antes de publicar', 'Registrar evidencia'],
      conversation_summary: 'El cliente confirmó la fecha de entrega.',
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Contexto guardado.')
    expect(mocks.clientsMutate).toHaveBeenCalledTimes(1)
  })

  it('handles a profile 403 with a safe message and never renders the response body', async () => {
    mocks.put.mockRejectedValueOnce({
      response: {
        status: 403,
        data: { detail: 'private server payload must not appear in the UI' },
      },
    })
    renderClientPage()
    fireEvent.click(screen.getByRole('button', { name: 'Editar contexto de ITBEM Corp' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contexto' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Sólo una persona administradora de plataforma')
    expect(screen.queryByText(/private server payload|private server|must not appear/i)).not.toBeInTheDocument()
    expect(mocks.clientsMutate).not.toHaveBeenCalled()
  })

  it('keeps the project listing in the organization → client → projects path and preserves client scope', () => {
    const page = readPage('src/app/(app)/automation/projects/page.tsx')

    expect(page).toContain('<nav aria-label="Jerarquía del portafolio"')
    expect(page).toContain('href="/clients"')
    expect(page).toContain('href="/automation/clients"')
    expect(page).toContain('{selectedClientFilterName ?? \'Clientes\'}')
    expect(page).toContain('aria-label="Filtrar proyectos por cliente"')
    expect(page).toContain('clientFilterId ? workspaces.filter(({ project }) => project.client_id === clientFilterId) : workspaces')
    expect(page).toContain('router.replace(`/automation/projects${query ? `?${query}` : \'\'}`, { scroll: false })')
  })
})
