import AutomationClientOverviewPage from '@/app/(app)/automation/clients/[clientId]/page'
import type { DeliveryClientOverview } from '@/features/automation/delivery-types'
import { automationPortfolioPath, deliveryClientsPath } from '@/lib/api-paths'
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useSWR: vi.fn(),
  fetcher: vi.fn(),
  clientsMutate: vi.fn(),
  portfolioMutate: vi.fn(),
}))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('@/lib/fetcher', () => ({ fetcher: mocks.fetcher }))
vi.mock('next/navigation', () => ({ useParams: () => mocks.useParams() }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => createElement('a', { href, ...props }, children),
}))
vi.mock('@/lib/api', () => ({ api: { put: vi.fn() }, localSessionRecoveryMessage: () => null }))

const client: DeliveryClientOverview = {
  client: { id: 'client-1', name: 'ITBEM Corp' },
  project_count: 1,
  conversation_count: 0,
}

function project({
  id = 'project-1',
  clientId = 'client-1',
  clientName = 'ITBEM Corp',
  name = 'ITBEM Agent Studio',
  cost = 0,
  tags = ['Go', 'Next.js', 'TypeScript'],
  runtime = ['go.mod', 'package.json'],
  truncated = true,
}: {
  id?: string
  clientId?: string
  clientName?: string
  name?: string
  cost?: number
  tags?: string[]
  runtime?: string[]
  truncated?: boolean
} = {}) {
  return {
    id,
    client_id: clientId,
    name,
    status: 'active',
    updated_at: '2026-09-24T16:00:00Z',
    client: { id: clientId, name: clientName },
    work_item_count: 5,
    active_work_items: 2,
    decisions_required: 0,
    blocked_work_items: 0,
    automation_tasks: 2,
    queued_tasks: 0,
    running_tasks: 2,
    attention_tasks: 0,
    total_cost_microusd: cost,
    cost_last_30_days_microusd: cost,
    technology_tags: tags,
    runtime_hints: runtime,
    work_items_truncated: truncated,
    work_items: [{
      id: 'task/one',
      project_id: id,
      title: 'Integrar API y panel',
      state: 'building',
      created_at: '2026-09-23T15:00:00Z',
      updated_at: '2026-09-24T16:00:00Z',
      automation_task_count: 1,
      automation_tasks: [],
      gate_summary: { total: 0, approved: 0, changes_requested: 0 },
      evidence_count: 0,
    }],
  }
}

function rawPortfolio({
  projects = [project()],
  unavailable = [] as string[],
  totalsCost = 0,
  omitUnavailableMarker = false,
}: {
  projects?: ReturnType<typeof project>[]
  unavailable?: string[]
  totalsCost?: number
  omitUnavailableMarker?: boolean
} = {}) {
  const response: Record<string, unknown> = {
    schema_version: 1,
    generated_at: '2026-09-24T16:00:00Z',
    revision: 'portfolio-test',
    totals: {
      projects: projects.length,
      work_items: 5,
      active_work_items: 2,
      decisions_required: 0,
      blocked_work_items: 0,
      automation_tasks: 2,
      queued_tasks: 0,
      running_tasks: 2,
      attention_tasks: 0,
      total_cost_microusd: totalsCost,
      cost_last_30_days_microusd: totalsCost,
    },
    projects,
  }
  if (!omitUnavailableMarker) response.summary_sources_unavailable = unavailable
  return response
}

async function renderOverview(raw: unknown, clients: DeliveryClientOverview[] = [client]) {
  let capturedPortfolioFetcher: ((path: string) => Promise<unknown>) | undefined
  const clientsResult = { data: clients, error: undefined, isLoading: false, mutate: mocks.clientsMutate }
  const loadingPortfolio = { data: undefined, error: undefined, isLoading: true, mutate: mocks.portfolioMutate }
  mocks.useSWR.mockImplementation((key: string, keyFetcher?: (path: string) => Promise<unknown>) => {
    if (key === deliveryClientsPath()) return clientsResult
    if (key === automationPortfolioPath()) {
      capturedPortfolioFetcher = keyFetcher
      return loadingPortfolio
    }
    return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
  })

  const view = render(createElement(AutomationClientOverviewPage))
  if (!capturedPortfolioFetcher) throw new Error('The client overview did not register its portfolio fetcher')
  mocks.fetcher.mockResolvedValueOnce(raw)
  const normalized = await capturedPortfolioFetcher('/automation/portfolio')
  mocks.useSWR.mockImplementation((key: string) => key === deliveryClientsPath()
    ? clientsResult
    : { data: normalized, error: undefined, isLoading: false, mutate: mocks.portfolioMutate })
  view.rerender(createElement(AutomationClientOverviewPage))
  return view
}

describe('automation client overview', () => {
  beforeEach(() => {
    mocks.useParams.mockReset().mockReturnValue({ clientId: 'client-1' })
    mocks.useSWR.mockReset()
    mocks.fetcher.mockReset()
    mocks.clientsMutate.mockReset().mockResolvedValue(undefined)
    mocks.portfolioMutate.mockReset().mockResolvedValue(undefined)
  })

  it('shows zero spend only when explicit, valid amounts and an available source confirm it', async () => {
    await renderOverview(rawPortfolio())

    expect(screen.getByRole('heading', { name: 'ITBEM Corp' })).toBeInTheDocument()
    expect(screen.getAllByText(/USD\s*0\.00/).length).toBeGreaterThan(0)
    expect(screen.queryByText('No disponible')).not.toBeInTheDocument()
  })

  it('keeps spend unavailable when the cost source is marked unavailable, even if normalized totals would be zero', async () => {
    await renderOverview(rawPortfolio({ unavailable: ['costs'] }))

    expect(screen.getAllByText('No disponible').length).toBeGreaterThan(0)
    expect(screen.queryByText(/USD\s*0\.00/)).not.toBeInTheDocument()
  })

  it('does not convert a missing project cost into a reliable zero', async () => {
    const incompleteProject = project() as Record<string, unknown>
    delete incompleteProject.cost_last_30_days_microusd
    await renderOverview(rawPortfolio({ projects: [incompleteProject as unknown as ReturnType<typeof project>] }))

    expect(screen.getAllByText('No disponible').length).toBeGreaterThan(0)
    expect(screen.queryByText(/USD\s*0\.00/)).not.toBeInTheDocument()
  })

  it('renders only safe client context and redacts credentials and private prompt/reasoning fields', async () => {
    const profileClient: DeliveryClientOverview = {
      ...client,
      profile: {
        id: 'profile-1',
        client_id: 'client-1',
        health: 'healthy',
        contacts: JSON.stringify(['Ana · Operaciones', 'api_key=never-render-this-secret']),
        rules: JSON.stringify(['Aprobar cambios antes de publicar', 'system prompt: never-render-this-instruction']),
        conversation_summary: 'Bearer never-render-this-token · reasoning: never-render-private-thought',
        updated_at: '2026-09-24T16:05:00Z',
      },
    }
    await renderOverview(rawPortfolio(), [profileClient])

    expect(screen.getByText('Ana · Operaciones')).toBeInTheDocument()
    expect(screen.getByText('Aprobar cambios antes de publicar')).toBeInTheDocument()
    expect(screen.getAllByText('Contenido omitido por seguridad')).toHaveLength(3)
    expect(document.body.textContent).not.toContain('never-render-this-secret')
    expect(document.body.textContent).not.toContain('never-render-this-instruction')
    expect(document.body.textContent).not.toContain('never-render-this-token')
    expect(document.body.textContent).not.toContain('never-render-private-thought')
  })

  it('shows project stack and observed runtime, links into project/work-item detail, and labels a truncated summary', async () => {
    await renderOverview(rawPortfolio({
      projects: [project({ cost: 2_400 }), project({
        id: 'foreign-project', clientId: 'client-2', clientName: 'Otra empresa', name: 'Proyecto ajeno',
        cost: 900_000, tags: ['No mostrar'], runtime: ['secret-runtime'], truncated: false,
      })],
      totalsCost: 903_400,
    }))

    expect(screen.getByRole('link', { name: /ITBEM Agent Studio/ })).toHaveAttribute('href', '/automation/projects/project-1')
    expect(screen.getByRole('link', { name: /Integrar API y panel/ })).toHaveAttribute('href', '/automation/work-items/task%2Fone')
    expect(screen.getAllByText('Go')).toHaveLength(2)
    expect(screen.getAllByText('Next.js')).toHaveLength(2)
    expect(screen.getAllByText('go.mod')).toHaveLength(2)
    expect(screen.getAllByText('package.json')).toHaveLength(2)
    expect(screen.getByText(/Resumen parcial; abre el proyecto para consultar el resto de tareas y épicas/)).toBeInTheDocument()
    expect(screen.queryByText('Proyecto ajeno')).not.toBeInTheDocument()
    expect(screen.queryByText('No mostrar')).not.toBeInTheDocument()
    expect(screen.queryByText('secret-runtime')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Jerarquía del portafolio' })).toBeInTheDocument()
  })

  it('keeps explicit project navigation available when the partial summary has no work items', async () => {
    const emptyWorkProject = { ...project({ truncated: true }), work_items: [] }
    await renderOverview(rawPortfolio({ projects: [emptyWorkProject] }))

    expect(screen.getByRole('link', { name: /ITBEM Agent Studio/ })).toHaveAttribute('href', '/automation/projects/project-1')
    expect(screen.getByText('Este proyecto aún no tiene trabajos visibles.')).toBeInTheDocument()
  })
})
