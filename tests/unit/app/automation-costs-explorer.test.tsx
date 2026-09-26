import AutomationCostsPage from '@/app/(app)/automation/costs/page'
import { automationCostsPath, deliveryProjectsPath } from '@/lib/api-paths'
import { deliveryProjectEpicsPagePath, type DeliveryEpicListPage } from '@/features/automation/delivery-epics'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ useSWR: vi.fn(), fetcher: vi.fn() }))
const INSTANCE_A = '0bb702e3-9d09-4fed-9a6a-4181629c9f14'
const INSTANCE_B = '7e527331-3dd7-4f31-9afe-9c265072c0bf'
const EPIC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EPIC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
let failEpicOptions = false
let failAgentInstanceCostQuery = false
let loadingAgentInstanceCostQuery = false
let emptyAgentInstanceCosts = false

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('@/lib/fetcher', () => ({ fetcher: mocks.fetcher }))
vi.mock('@/lib/api', () => ({ localSessionRecoveryMessage: () => null }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}))
vi.mock('next/dynamic', () => ({
  default: () => ({ taskId, executionId }: { taskId: string; executionId: string }) => <div data-testid="execution-detail">{taskId}:{executionId}</div>,
}))
vi.mock('@/components/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div role="dialog">{children}</div> : null,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

type BudgetWatchFixture = {
  project_id: string
  project_name: string
  monthly_budget_microusd: number
  alert_percent: number
  spent_microusd: number
  reserved_microusd: number
  allocated_microusd: number
  remaining_microusd: number
  usage_percent: number
  status: 'healthy' | 'attention' | 'exceeded'
}

const overview = {
  range_days: 30,
  summary: { executions: 3, tasks: 3, unpriced_executions: 0, input_tokens: 300, output_tokens: 150, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 450, input_cost_microusd: 5_000, output_cost_microusd: 5_000, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 10_000 },
  by_operation: [],
  by_step: [],
  by_project: [
    { project_id: 'project-a', project_name: 'EventiApp', executions: 1, input_tokens: 100, output_tokens: 50, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 150, input_cost_microusd: 2_000, output_cost_microusd: 500, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 2_500 },
    { project_id: 'project-b', project_name: 'Caffetton', executions: 1, input_tokens: 100, output_tokens: 50, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 150, input_cost_microusd: 2_000, output_cost_microusd: 500, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 2_500 },
  ],
  by_work_item: [
    { project_id: 'project-a', project_name: 'EventiApp', work_item_id: 'work-a', work_item_title: 'Actualizar checkout', executions: 1, total_tokens: 150, total_cost_microusd: 2_500 },
    { project_id: 'project-b', project_name: 'Caffetton', work_item_id: 'work-b', work_item_title: 'Ajustar menú', executions: 1, total_tokens: 150, total_cost_microusd: 2_500 },
  ],
  by_agent: [
    { agent_key: 'implementer', executions: 1, total_tokens: 150, total_cost_microusd: 2_500 },
    { agent_key: 'qa', executions: 1, total_tokens: 150, total_cost_microusd: 2_500 },
  ],
  by_model: [
    { provider: 'openrouter', model: 'cheap-model', executions: 1, input_tokens: 100, output_tokens: 50, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 150, input_cost_microusd: 2_000, output_cost_microusd: 500, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 2_500 },
    { provider: 'deepseek', model: 'flash-model', executions: 1, input_tokens: 100, output_tokens: 50, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 150, input_cost_microusd: 2_000, output_cost_microusd: 500, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 2_500 },
  ],
  budget_watch: [] as BudgetWatchFixture[],
  task_budget_watch: [],
  recent_executions: [
    { id: 'execution-a', automation_task_id: 'task-a', delivery_work_item_id: 'work-a', project_id: 'project-a', project_name: 'EventiApp', work_item_title: 'Actualizar checkout', agent_key: 'implementer', agent_instance_id: INSTANCE_A, operation: 'delivery.implementation', task_status: 'completed', execution_kind: 'agent', step_key: 'build', provider: 'openrouter', model: 'cheap-model', input_tokens: 100, output_tokens: 50, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 150, input_cost_microusd: 2_000, output_cost_microusd: 500, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 2_500, pricing_basis: 'snapshot', completed_at: '2026-09-23T12:00:00Z', api_key: 'sk-sensitive-never-render', prompt: 'private-prompt-never-render', request_ref: 'private-request-ref-never-render' },
    { id: 'execution-b', automation_task_id: 'task-b', delivery_work_item_id: 'work-b', project_id: 'project-b', project_name: 'Caffetton', work_item_title: 'Ajustar menú', agent_key: 'qa', agent_instance_id: INSTANCE_B, operation: 'delivery.qa', task_status: 'completed', execution_kind: 'agent', step_key: 'qa', provider: 'deepseek', model: 'flash-model', input_tokens: 100, output_tokens: 50, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 150, input_cost_microusd: 2_000, output_cost_microusd: 500, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 2_500, pricing_basis: 'snapshot', completed_at: '2026-09-23T11:00:00Z' },
    { id: 'execution-general', automation_task_id: 'task-general', operation: 'ai.chat', task_status: 'completed', execution_kind: 'agent', step_key: 'chat', provider: 'openrouter', model: 'cheap-model', input_tokens: 100, output_tokens: 50, cached_input_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 150, input_cost_microusd: 2_000, output_cost_microusd: 500, cached_cost_microusd: 0, cache_write_cost_microusd: 0, total_cost_microusd: 5_000, pricing_basis: 'snapshot', completed_at: '2026-09-23T10:00:00Z' },
  ],
  ledger_coverage: { state: 'complete', agent_ledger: true, tool_ledger: true, unknown_dimensions: [] as string[] },
}

const agentInstanceCostRows = [
  { agent_key: 'generalist', agent_instance_id: null, instance_attributed: false, executions: 3, total_tokens: 450, total_cost_microusd: 5_000 },
  { agent_key: 'implementer', agent_instance_id: INSTANCE_A, instance_attributed: true, executions: 2, total_tokens: 250, total_cost_microusd: 2_500 },
  ...Array.from({ length: 24 }, (_, index) => ({
    agent_key: `worker-${index}`,
    agent_instance_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    instance_attributed: true,
    executions: 1,
    total_tokens: 50 + index,
    total_cost_microusd: 1_000 - index,
  })),
]

const projects = [
  { id: 'project-a', name: 'EventiApp', client_id: 'client-a', client: { id: 'client-a', name: 'ITBEM' }, slug: 'eventiapp', summary: '', status: 'active', created_at: '', updated_at: '' },
  { id: 'project-b', name: 'Caffetton', client_id: 'client-b', client: { id: 'client-b', name: 'Caffetton House' }, slug: 'caffetton', summary: '', status: 'active', created_at: '', updated_at: '' },
]

const firstEpicPage: DeliveryEpicListPage = {
  can_manage: false,
  items: Array.from({ length: 100 }, (_, index) => ({
    id: index === 0 ? EPIC_A : `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    project_id: 'project-a',
    title: index === 0 ? 'Modernizar checkout' : `Épica ${index + 1}`,
    status: 'active',
    task_count: 1,
    created_at: '',
    updated_at: '',
  })),
  limit: 100,
  next_cursor: 'epic-cursor-2',
}

const secondEpicPage: DeliveryEpicListPage = {
  can_manage: false,
  items: [{ id: EPIC_B, project_id: 'project-a', title: 'Integrar pagos', status: 'planned', task_count: 0, created_at: '', updated_at: '' }],
  limit: 100,
}

function useSWRResult(key: string | null) {
  if (key === deliveryProjectsPath()) return { data: projects, isLoading: false, error: undefined }
  if (key?.startsWith('/automation/projects/') && key.includes('/epics?')) {
    if (failEpicOptions) return { data: undefined, isLoading: false, error: new Error('Epic options unavailable') }
    const params = new URLSearchParams(key.split('?')[1])
    return {
      data: params.get('cursor') ? secondEpicPage : firstEpicPage,
      isLoading: false,
      isValidating: false,
      error: undefined,
    }
  }
  if (key?.startsWith('/automation/costs/agent-instances?')) {
    const params = new URLSearchParams(key.split('?')[1])
    if (failAgentInstanceCostQuery) {
      return { data: undefined, isLoading: false, isValidating: false, error: new Error('Instance costs unavailable'), mutate: vi.fn() }
    }
    if (loadingAgentInstanceCostQuery) {
      return { data: undefined, isLoading: true, isValidating: false, error: undefined, mutate: vi.fn() }
    }
    const filtered = emptyAgentInstanceCosts ? [] : agentInstanceCostRows.filter((row) =>
      (!params.get('agent_key') || row.agent_key === params.get('agent_key')) &&
      (!params.get('agent_instance_id') || row.agent_instance_id === params.get('agent_instance_id')),
    )
    const start = params.has('agent_instance_cursor') ? 25 : 0
    const items = filtered.slice(start, start + 25)
    const hasMore = start + items.length < filtered.length
    return {
      data: {
        range_days: Number(params.get('days') ?? 30),
        snapshot_at: '2026-09-24T12:00:00Z',
        applied_filters: {
          client_id: params.get('client_id'),
          project_id: params.get('project_id'),
          epic_id: params.get('epic_id'),
          work_item_id: params.get('work_item_id'),
          agent_key: params.get('agent_key'),
          agent_instance_id: params.get('agent_instance_id'),
          step_key: params.get('step_key'),
          provider: params.get('provider'),
          model: params.get('model'),
        },
        items,
        limit: 25,
        has_more: hasMore,
        next_cursor: hasMore ? 'instance-cursor-2' : undefined,
      },
      isLoading: false,
      isValidating: false,
      error: undefined,
      mutate: vi.fn(),
    }
  }
  if (key?.startsWith('/automation/costs?')) {
    const params = new URLSearchParams(key.split('?')[1])
    const page = Number(params.get('page') ?? 1)
    const hasFilter = ['client_id', 'project_id', 'epic_id', 'work_item_id', 'step_key', 'agent_key', 'agent_instance_id', 'provider', 'model'].some((name) => params.has(name))
    const filtered = overview.recent_executions.filter((row) =>
      (!params.get('client_id') || projects.some((project) => project.id === row.project_id && project.client_id === params.get('client_id'))) &&
      (!params.get('project_id') || row.project_id === params.get('project_id')) &&
      (!params.get('work_item_id') || row.delivery_work_item_id === params.get('work_item_id')) &&
      (!params.get('agent_key') || row.agent_key === params.get('agent_key')) &&
      (!params.get('agent_instance_id') || row.agent_instance_id === params.get('agent_instance_id')) &&
      (!params.get('provider') || row.provider === params.get('provider')) &&
      (!params.get('model') || row.model === params.get('model')),
    )
    const filteredWorkItems = overview.by_work_item.filter((item) =>
      (!params.get('client_id') || projects.some((project) => project.id === item.project_id && project.client_id === params.get('client_id'))) &&
      (!params.get('project_id') || item.project_id === params.get('project_id')) &&
      (!params.get('work_item_id') || item.work_item_id === params.get('work_item_id')) &&
      overview.recent_executions.some((execution) =>
        execution.delivery_work_item_id === item.work_item_id &&
        (!params.get('agent_key') || execution.agent_key === params.get('agent_key')) &&
        (!params.get('agent_instance_id') || execution.agent_instance_id === params.get('agent_instance_id')) &&
        (!params.get('provider') || execution.provider === params.get('provider')) &&
        (!params.get('model') || execution.model === params.get('model')),
      ),
    )
    const workItemCursor = params.get('work_item_cursor')
    const workItemRows = workItemCursor ? filteredWorkItems.slice(1) : hasFilter ? filteredWorkItems : filteredWorkItems.slice(0, 1)
    const workItemHasMore = !workItemCursor && !hasFilter && filteredWorkItems.length > 1
    const cursorMode = params.has('cursor')
    const total = params.has('epic_id') || params.has('step_key') ? 41 : hasFilter ? filtered.length : 41
    const rows = cursorMode ? [overview.recent_executions[2]] : filtered
    const hasMore = !cursorMode && page === 1 && total > 40
    const recentPage = {
      page,
      page_size: 40,
      total,
      total_pages: Math.ceil(total / 40),
      mode: cursorMode ? 'cursor' : 'offset',
      has_more: hasMore,
      next_cursor: hasMore ? 'cursor-2' : undefined,
    }
    return {
      data: {
        ...overview,
        applied_filters: {
          client_id: params.get('client_id'),
          project_id: params.get('project_id'),
          epic_id: params.get('epic_id'),
          work_item_id: params.get('work_item_id'),
          step_key: params.get('step_key'),
          agent_key: params.get('agent_key'),
          agent_instance_id: params.get('agent_instance_id'),
          provider: params.get('provider'),
          model: params.get('model'),
        },
        by_work_item: workItemRows,
        by_work_item_cursor: workItemCursor ?? '',
        by_work_item_next_cursor: workItemHasMore ? 'work-item-cursor-2' : '',
        recent_executions: rows,
        recent_execution_page: recentPage,
      },
      isLoading: false,
      isValidating: false,
      error: undefined,
      mutate: vi.fn(),
    }
  }
  return { data: undefined, isLoading: false, error: undefined }
}

function requestedCostPaths() {
  return mocks.useSWR.mock.calls
    .map(([key]) => key)
    .filter((key): key is string => typeof key === 'string' && key.startsWith('/automation/costs?'))
}

function requestedAgentInstanceCostPaths() {
  return mocks.useSWR.mock.calls
    .map(([key]) => key)
    .filter((key): key is string => typeof key === 'string' && key.startsWith('/automation/costs/agent-instances?'))
}

describe('automation costs explorer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    overview.summary.unpriced_executions = 0
    overview.summary.executions = 3
    overview.ledger_coverage = { state: 'complete', agent_ledger: true, tool_ledger: true, unknown_dimensions: [] }
    overview.budget_watch = []
    overview.recent_executions[0].pricing_basis = 'snapshot'
    overview.recent_executions[0].total_cost_microusd = 2_500
    failEpicOptions = false
    failAgentInstanceCostQuery = false
    loadingAgentInstanceCostQuery = false
    emptyAgentInstanceCosts = false
    mocks.useSWR.mockImplementation((key: string | null) => useSWRResult(key))
    mocks.fetcher.mockResolvedValue(undefined)
  })

  it('does not present partial ledger coverage as a healthy budget or unknown cost dimensions as zero', async () => {
    overview.ledger_coverage = {
      state: 'partial',
      agent_ledger: true,
      tool_ledger: false,
      unknown_dimensions: ['tool_ledger', 'input_cost_micros'],
    }
    overview.budget_watch = [{
      project_id: 'project-a',
      project_name: 'EventiApp',
      monthly_budget_microusd: 1_000_000,
      alert_percent: 80,
      spent_microusd: 2_500,
      reserved_microusd: 0,
      allocated_microusd: 2_500,
      remaining_microusd: 997_500,
      usage_percent: 1,
      status: 'healthy',
    }]

    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    const pulse = screen.getByRole('region', { name: 'Pulso de consumo' })
    expect(within(pulse).getByRole('heading', { name: 'Presupuesto no confirmable' })).toBeInTheDocument()
    expect(within(pulse).getAllByText(/subtotal registrado/i).length).toBeGreaterThan(0)
    expect(within(pulse).getByRole('status')).toHaveTextContent(/registro de costos de herramientas/)
    expect(within(pulse).getByRole('status')).toHaveTextContent(/costo de entrada/)

    const budgets = screen.getByRole('region', { name: 'Protecciones que necesitan revisión' })
    expect(within(budgets).getByText('Cobertura parcial')).toBeInTheDocument()
    expect(within(budgets).getByText('Margen no confirmado')).toBeInTheDocument()
    expect(within(budgets).queryByText('$0.9975 disponibles')).not.toBeInTheDocument()

    await user.click(screen.getByText('Detalles y trazabilidad'))
    const recent = screen.getByText('Movimiento reciente').closest('details') as HTMLDetailsElement
    await user.click(within(recent).getByText('Movimiento reciente'))
    const execution = within(recent).getAllByText('openrouter · cheap-model')[0].closest('li') as HTMLElement
    await user.click(within(execution).getByText('Ver desglose de coste'))
    expect(within(execution).getByText('No disponible')).toBeInTheDocument()
    expect(within(execution).queryByText('$0.0020')).not.toBeInTheDocument()
  })

  it('does not display unpriced executions as known zero-cost movements', async () => {
    overview.recent_executions[0].pricing_basis = 'unpriced'
    overview.recent_executions[0].total_cost_microusd = 0
    overview.budget_watch = [{
      project_id: 'project-a',
      project_name: 'EventiApp',
      monthly_budget_microusd: 1_000_000,
      alert_percent: 80,
      spent_microusd: 2_500,
      reserved_microusd: 0,
      allocated_microusd: 2_500,
      remaining_microusd: 997_500,
      usage_percent: 1,
      status: 'healthy',
    }]

    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    const pulse = screen.getByRole('region', { name: 'Pulso de consumo' })
    expect(within(pulse).getByRole('heading', { name: 'Presupuesto no confirmable' })).toBeInTheDocument()
    expect(within(pulse).getByRole('status')).toHaveTextContent(/hay al menos 1 ejecución sin base de precio en el conjunto filtrado/i)
    expect(within(pulse).queryByText('$0.0000')).not.toBeInTheDocument()

    await user.click(screen.getByText('Detalles y trazabilidad'))
    const recent = screen.getByText('Movimiento reciente').closest('details') as HTMLDetailsElement
    await user.click(within(recent).getByText('Movimiento reciente'))
    const execution = within(recent).getAllByText('openrouter · cheap-model')[0].closest('li') as HTMLElement
    expect(within(execution).getByText('No disponible')).toBeInTheDocument()
    expect(within(execution).queryByText('$0.0000')).not.toBeInTheDocument()
    await user.click(within(execution).getByText('Ver desglose de coste'))
    expect(within(execution).getAllByText('No disponible')).toHaveLength(5)
  })

  it('marks filtered totals and budgets incomplete when unpriced executions are outside the visible recent page', () => {
    overview.summary.unpriced_executions = 2
    expect(overview.recent_executions.every((execution) => execution.pricing_basis === 'snapshot')).toBe(true)
    overview.budget_watch = [{
      project_id: 'project-a',
      project_name: 'EventiApp',
      monthly_budget_microusd: 1_000_000,
      alert_percent: 80,
      spent_microusd: 2_500,
      reserved_microusd: 0,
      allocated_microusd: 2_500,
      remaining_microusd: 997_500,
      usage_percent: 1,
      status: 'healthy',
    }]

    render(<AutomationCostsPage />)

    const pulse = screen.getByRole('region', { name: 'Pulso de consumo' })
    expect(within(pulse).getByRole('heading', { name: 'Presupuesto no confirmable' })).toBeInTheDocument()
    expect(within(pulse).getByRole('status')).toHaveTextContent('Hay 2 ejecuciones sin base de precio en el conjunto filtrado')
    expect(within(pulse).getByText(/subtotal registrado/i)).toBeInTheDocument()

    const budgets = screen.getByRole('region', { name: 'Protecciones que necesitan revisión' })
    expect(within(budgets).getByText('Margen no confirmado')).toBeInTheDocument()
    expect(within(budgets).queryByText('$0.9975 disponibles')).not.toBeInTheDocument()
  })

  it('treats an explicit zero unpriced count as complete when every ledger dimension is available', () => {
    overview.summary.unpriced_executions = 0
    overview.ledger_coverage = { state: 'complete', agent_ledger: true, tool_ledger: true, unknown_dimensions: [] }
    overview.budget_watch = [{
      project_id: 'project-a',
      project_name: 'EventiApp',
      monthly_budget_microusd: 1_000_000,
      alert_percent: 80,
      spent_microusd: 2_500,
      reserved_microusd: 0,
      allocated_microusd: 2_500,
      remaining_microusd: 997_500,
      usage_percent: 1,
      status: 'healthy',
    }]

    render(<AutomationCostsPage />)

    const pulse = screen.getByRole('region', { name: 'Pulso de consumo' })
    expect(within(pulse).getByRole('heading', { name: 'Consumo dentro del presupuesto' })).toBeInTheDocument()
    expect(within(pulse).queryByRole('status')).not.toBeInTheDocument()
    const budgets = screen.getByRole('region', { name: 'Presupuestos sin alertas' })
    expect(within(budgets).getByText('$0.9975 disponibles')).toBeInTheDocument()
    expect(within(budgets).queryByText('Margen no confirmado')).not.toBeInTheDocument()
  })

  it('keeps older responses without the aggregate count compatible without claiming complete pricing for a partial page', () => {
    Reflect.deleteProperty(overview.summary, 'unpriced_executions')
    overview.summary.executions = 41

    render(<AutomationCostsPage />)

    const pulse = screen.getByRole('region', { name: 'Pulso de consumo' })
    expect(within(pulse).getByRole('heading', { name: 'Coste no confirmado' })).toBeInTheDocument()
    expect(within(pulse).getByRole('status')).toHaveTextContent('Esta respuesta antigua no informa cuántas ejecuciones carecen de precio')
    expect(within(pulse).getByText(/subtotal registrado/i)).toBeInTheDocument()
  })

  it('sends project, task, provider, model and agent filters to the server and opens execution detail', async () => {
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    fireEvent.click(screen.getByText('Detalles y trazabilidad'))
    const recent = screen.getByText('Movimiento reciente').closest('details') as HTMLDetailsElement
    fireEvent.click(within(recent).getByText('Movimiento reciente'))

    expect(screen.getByRole('group', { name: 'Rango de tiempo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '365 días' })).toBeInTheDocument()
    expect(within(recent).getByText('deepseek · flash-model')).toBeInTheDocument()

    await user.selectOptions(within(recent).getByLabelText('Cliente'), 'client-a')
    expect(within(recent).getByLabelText('Proyecto')).toHaveValue('')
    expect(within(recent).queryByRole('option', { name: 'Caffetton' })).not.toBeInTheDocument()
    await user.selectOptions(within(recent).getByLabelText('Proyecto'), 'project-a')
    await user.selectOptions(within(recent).getByLabelText('Tarea / entrega'), 'work-a')
    await user.selectOptions(within(recent).getByLabelText('Proveedor'), 'openrouter')
    await user.selectOptions(within(recent).getByLabelText('Modelo'), 'cheap-model')
    await user.selectOptions(within(recent).getByLabelText('Agente'), 'implementer')

    expect(within(recent).getByLabelText('Cliente')).toHaveValue('client-a')
    const filteredPath = automationCostsPath({ days: 30, client_id: 'client-a', project_id: 'project-a', work_item_id: 'work-a', provider: 'openrouter', model: 'cheap-model', agent_key: 'implementer', page: 1, page_size: 40 })
    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return ['days', 'client_id', 'project_id', 'work_item_id', 'agent_key', 'provider', 'model', 'page', 'page_size'].every((key) => params.get(key) === new URLSearchParams(filteredPath.split('?')[1]).get(key))
    })).toBe(true))
    expect(within(recent).getAllByText('openrouter · cheap-model').length).toBeGreaterThan(0)
    expect(within(recent).getByText('EventiApp · Actualizar checkout · Agente implementer')).toBeInTheDocument()
    expect(within(recent).getByRole('button', { name: `Filtrar costos por instancia: ${INSTANCE_A}` })).toHaveTextContent(INSTANCE_A)
    expect(screen.queryByText('sk-sensitive-never-render')).not.toBeInTheDocument()
    expect(screen.queryByText('private-prompt-never-render')).not.toBeInTheDocument()
    expect(screen.queryByText('private-request-ref-never-render')).not.toBeInTheDocument()
    expect(within(recent).queryByText('deepseek · flash-model')).not.toBeInTheDocument()
    expect(within(recent).getByText(/Los filtros se aplican en el servidor/)).toBeInTheDocument()
    expect(within(recent).getByText(/Los límites de presupuesto muestran el estado actual/)).toBeInTheDocument()

    await user.click(within(recent).getByRole('button', { name: 'Ver detalle' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByTestId('execution-detail')).toHaveTextContent('task-a:execution-a')
  })

  it('filters by epic and step, loads epic options in 100-item pages, and resets/preserves both cost cursors', async () => {
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    await user.click(screen.getByText('Detalles y trazabilidad'))
    const recent = screen.getByText('Movimiento reciente').closest('details') as HTMLDetailsElement

    await user.click(within(recent).getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(requestedCostPaths().some((path) => new URLSearchParams(path.split('?')[1]).get('cursor') === 'cursor-2')).toBe(true))
    const workItemCosts = screen.getByRole('region', { name: 'Consumo por tarea' })
    await user.click(within(workItemCosts).getByRole('button', { name: 'Cargar más tareas' }))
    await waitFor(() => expect(requestedCostPaths().some((path) => new URLSearchParams(path.split('?')[1]).has('work_item_cursor'))).toBe(true))

    await user.selectOptions(within(recent).getByLabelText('Proyecto'), 'project-a')
    await waitFor(() => expect(mocks.useSWR.mock.calls.some(([key]) => key === deliveryProjectEpicsPagePath('project-a', { limit: 100 }))).toBe(true))
    expect(within(recent).getByRole('button', { name: 'Cargar siguientes 100 épicas' })).toBeInTheDocument()
    await user.click(within(recent).getByRole('button', { name: 'Cargar siguientes 100 épicas' }))
    await waitFor(() => expect(mocks.useSWR.mock.calls.some(([key]) => key === deliveryProjectEpicsPagePath('project-a', { limit: 100, cursor: 'epic-cursor-2' }))).toBe(true))

    await user.type(within(recent).getByLabelText('Épica'), EPIC_B)
    await user.type(within(recent).getByLabelText('Paso'), 'build_api')
    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('project_id') === 'project-a' && params.get('epic_id') === EPIC_B && params.get('step_key') === 'build_api' && params.get('page') === '1' && !params.has('cursor') && !params.has('work_item_cursor')
    })).toBe(true))
    expect(within(recent).getByRole('button', { name: 'Quitar filtro: Épica: Integrar pagos' })).toBeInTheDocument()
    expect(within(recent).getByRole('button', { name: 'Quitar filtro: Paso: build_api' })).toBeInTheDocument()

    await user.click(within(recent).getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('epic_id') === EPIC_B && params.get('step_key') === 'build_api' && params.get('page') === '2' && params.get('cursor') === 'cursor-2'
    })).toBe(true))

    await user.click(within(recent).getByRole('button', { name: 'Limpiar filtros' }))
    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('page') === '1' && !params.has('epic_id') && !params.has('step_key') && !params.has('cursor') && !params.has('work_item_cursor')
    })).toBe(true))
  })

  it('shows cost by agent and drills into the selected agent history', async () => {
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    await user.click(screen.getByText('Detalles y trazabilidad'))

    const agents = screen.getByRole('region', { name: 'Consumo por agente' })
    expect(within(agents).getByText('implementer')).toBeInTheDocument()
    expect(within(agents).getAllByText('1 llamadas · 150 tokens')).toHaveLength(2)
    expect(within(agents).getAllByText('$0.0025')).toHaveLength(2)

    await user.click(within(agents).getByRole('button', { name: 'Filtrar costos por agente: implementer' }))
    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('agent_key') === 'implementer' && params.get('page') === '1' && !params.has('cursor')
    })).toBe(true))
    expect(within(agents).getByRole('button', { name: 'Filtrar costos por agente: implementer' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Quitar filtro: Agente: implementer' })).toBeInTheDocument()
  })

  it('shows attributed and legacy instance cost, then drills into existing history by instance ID', async () => {
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    await user.click(screen.getByText('Detalles y trazabilidad'))

    const instances = screen.getByRole('region', { name: 'Consumo por instancia' })
    expect(await within(instances).findByText('Sin instancia atribuida')).toBeInTheDocument()
    expect((await within(instances).findAllByText('Instancia atribuida')).length).toBeGreaterThan(0)
    expect(within(instances).getByText('Gasto legacy conservado sin asociarlo a una máquina concreta.')).toBeInTheDocument()
    expect(within(instances).getByText('3 llamadas · 450 tokens')).toBeInTheDocument()
    expect(within(instances).getByText('$0.005')).toBeInTheDocument()

    await user.click(within(instances).getByRole('button', { name: `Filtrar costos por instancia: ${INSTANCE_A}` }))
    await waitFor(() => expect(requestedCostPaths().some((path) => new URLSearchParams(path.split('?')[1]).get('agent_instance_id') === INSTANCE_A)).toBe(true))
    expect(screen.getByRole('button', { name: `Quitar filtro: Instancia: ${INSTANCE_A.slice(0, 8)}` })).toBeInTheDocument()
  })

  it('sends every active filter to the instance endpoint and uses only its bounded cursor pagination', async () => {
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    await user.click(screen.getByText('Detalles y trazabilidad'))
    const recent = screen.getByText('Movimiento reciente').closest('details') as HTMLDetailsElement
    await user.click(within(recent).getByText('Movimiento reciente'))
    await user.selectOptions(within(recent).getByLabelText('Proyecto'), 'project-a')
    await user.type(within(recent).getByLabelText('Épica'), EPIC_A)
    await user.selectOptions(within(recent).getByLabelText('Tarea / entrega'), 'work-a')
    await user.type(within(recent).getByLabelText('Paso'), 'build_api')
    await user.selectOptions(within(recent).getByLabelText('Proveedor'), 'openrouter')
    await user.selectOptions(within(recent).getByLabelText('Modelo'), 'cheap-model')
    await user.selectOptions(within(recent).getByLabelText('Agente'), 'implementer')
    await user.type(within(recent).getByLabelText('Instancia de agente'), INSTANCE_A)
    await user.click(screen.getByRole('button', { name: '7 días' }))

    await waitFor(() => expect(requestedAgentInstanceCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('days') === '7' &&
        params.get('client_id') === 'client-a' &&
        params.get('project_id') === 'project-a' &&
        params.get('epic_id') === EPIC_A &&
        params.get('work_item_id') === 'work-a' &&
        params.get('step_key') === 'build_api' &&
        params.get('provider') === 'openrouter' &&
        params.get('model') === 'cheap-model' &&
        params.get('agent_key') === 'implementer' &&
        params.get('agent_instance_id') === INSTANCE_A &&
        params.get('agent_instance_limit') === '25'
    })).toBe(true))
    const firstPageParams = new URLSearchParams(requestedAgentInstanceCostPaths().at(-1)?.split('?')[1])
    expect(firstPageParams.has('page')).toBe(false)
    expect(firstPageParams.has('page_size')).toBe(false)
    expect(firstPageParams.has('cursor')).toBe(false)
    expect(firstPageParams.has('work_item_cursor')).toBe(false)
  })

  it('loads further instance groups with the opaque cursor and appends without duplicates', async () => {
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    await user.click(screen.getByText('Detalles y trazabilidad'))
    const instances = screen.getByRole('region', { name: 'Consumo por instancia' })
    await user.click(await within(instances).findByRole('button', { name: 'Cargar más instancias' }))

    await waitFor(() => expect(requestedAgentInstanceCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('agent_instance_limit') === '25' && params.get('agent_instance_cursor') === 'instance-cursor-2' &&
        !params.has('page') && !params.has('cursor')
    })).toBe(true))
    expect(await within(instances).findByText('worker-23')).toBeInTheDocument()
    expect(within(instances).getByText('26 cargadas')).toBeInTheDocument()
    expect(within(instances).getByRole('status')).toHaveTextContent('Fin de resultados')
  })

  it('communicates instance cost loading, error, and empty states', async () => {
    loadingAgentInstanceCostQuery = true
    const loadingUser = userEvent.setup()
    const loadingView = render(<AutomationCostsPage />)
    await loadingUser.click(screen.getByText('Detalles y trazabilidad'))
    expect(await screen.findByRole('status')).toHaveTextContent('Consultando costes por agente e instancia')
    loadingView.unmount()

    failAgentInstanceCostQuery = true
    const errorUser = userEvent.setup()
    const errorView = render(<AutomationCostsPage />)
    await errorUser.click(screen.getByText('Detalles y trazabilidad'))
    const instances = screen.getByRole('region', { name: 'Consumo por instancia' })
    expect(await within(instances).findByRole('alert')).toHaveTextContent('No se pudo cargar el desglose por instancia')
    expect(within(instances).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    errorView.unmount()

    failAgentInstanceCostQuery = false
    loadingAgentInstanceCostQuery = false
    emptyAgentInstanceCosts = true
    const emptyUser = userEvent.setup()
    render(<AutomationCostsPage />)
    await emptyUser.click(screen.getByText('Detalles y trazabilidad'))
    const emptyInstances = screen.getByRole('region', { name: 'Consumo por instancia' })
    await waitFor(() => expect(emptyInstances).toHaveTextContent('No hay costes por instancia que coincidan con los filtros y el período seleccionados.'))
  })

  it('keeps epic filtering usable with a pasted UUID when project epic options fail', async () => {
    failEpicOptions = true
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    await user.click(screen.getByText('Detalles y trazabilidad'))
    const recent = screen.getByText('Movimiento reciente').closest('details') as HTMLDetailsElement
    await user.selectOptions(within(recent).getByLabelText('Proyecto'), 'project-a')
    expect(await within(recent).findByText('No se pudieron cargar las opciones; puedes pegar el UUID de la épica.')).toBeInTheDocument()

    await user.type(within(recent).getByLabelText('Épica'), EPIC_A)
    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('project_id') === 'project-a' && params.get('epic_id') === EPIC_A && !params.has('cursor') && !params.has('work_item_cursor')
    })).toBe(true))
  })

  it('applies the selected range and navigates forward/back using the opaque cursor stack', async () => {
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    expect(requestedCostPaths()).toContain(automationCostsPath({ days: 30, page: 1, page_size: 40 }))

    await user.click(screen.getByRole('button', { name: '7 días' }))
    await waitFor(() => expect(requestedCostPaths()).toContain(automationCostsPath({ days: 7, page: 1, page_size: 40 })))

    fireEvent.click(screen.getByText('Detalles y trazabilidad'))
    const recent = screen.getByText('Movimiento reciente').closest('details') as HTMLDetailsElement
    await user.click(within(recent).getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(requestedCostPaths()).toContain(automationCostsPath({ days: 7, page: 2, page_size: 40, cursor: 'cursor-2' })))
    expect(within(recent).getByText(/continuación por cursor/)).toBeInTheDocument()

    await user.click(within(recent).getByRole('button', { name: 'Anterior' }))
    await waitFor(() => expect(requestedCostPaths()).toContain(automationCostsPath({ days: 7, page: 1, page_size: 40 })))

    await user.click(within(recent).getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(requestedCostPaths()).toContain(automationCostsPath({ days: 7, page: 2, page_size: 40, cursor: 'cursor-2' })))
    await user.selectOptions(within(recent).getByLabelText('Proveedor'), 'deepseek')
    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('days') === '7' && params.get('page') === '1' && params.get('provider') === 'deepseek' && !params.has('cursor')
    })).toBe(true))
  })

  it('uses a selected inclusive calendar range across overview and instance-cost requests', async () => {
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2025-01-02' } })
    expect(screen.getByRole('status')).toHaveTextContent('Selecciona ambas fechas')
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2025-01-04' } })

    const fromAt = new Date(2025, 0, 2).toISOString()
    const toAt = new Date(2025, 0, 5).toISOString()
    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('from_at') === fromAt && params.get('to_at') === toAt && !params.has('cursor')
    })).toBe(true))
    expect(screen.getByText('Uso registrado · 2025-01-02 a 2025-01-04')).toBeInTheDocument()

    await user.click(screen.getByText('Detalles y trazabilidad'))
    await waitFor(() => expect(requestedAgentInstanceCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('from_at') === fromAt && params.get('to_at') === toAt
    })).toBe(true))
  })

  it('drills down from model summaries, resets a scoped cursor, and keeps filters available for empty results', async () => {
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    await user.click(screen.getByText('Detalles y trazabilidad'))
    const recent = screen.getByText('Movimiento reciente').closest('details') as HTMLDetailsElement
    await user.click(within(recent).getByText('Movimiento reciente'))
    await user.click(screen.getByRole('button', { name: 'Filtrar costos por proyecto: EventiApp' }))
    await waitFor(() => expect(requestedCostPaths()).toContain(automationCostsPath({
      days: 30,
      client_id: 'client-a',
      project_id: 'project-a',
      page: 1,
      page_size: 40,
    })))
    await user.click(within(recent).getByRole('button', { name: 'Quitar filtro: Proyecto: EventiApp' }))
    await user.click(within(recent).getByRole('button', { name: 'Quitar filtro: Cliente: ITBEM' }))
    await waitFor(() => expect(requestedCostPaths()).toContain(automationCostsPath({ days: 30, page: 1, page_size: 40 })))
    await user.click(within(recent).getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(requestedCostPaths()).toContain(automationCostsPath({ days: 30, page: 2, page_size: 40, cursor: 'cursor-2' })))

    await user.click(screen.getByRole('button', { name: 'Filtrar costos por modelo: deepseek · flash-model' }))
    await waitFor(() => expect(requestedCostPaths()).toContain(automationCostsPath({
      days: 30,
      provider: 'deepseek',
      model: 'flash-model',
      page: 1,
      page_size: 40,
    })))

    await user.selectOptions(within(recent).getByLabelText('Proyecto'), 'project-a')
    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('client_id') === 'client-a' && params.get('project_id') === 'project-a' && params.get('provider') === 'deepseek' && params.get('model') === 'flash-model' && params.get('page') === '1' && !params.has('cursor')
    })).toBe(true))
    expect(within(recent).getByText('No hay movimientos que coincidan con estos filtros en el período seleccionado.')).toBeInTheDocument()
    expect(within(recent).getByLabelText('Proyecto')).toBeInTheDocument()
    expect(within(recent).getByRole('button', { name: 'Quitar filtro: Proyecto: EventiApp' })).toBeInTheDocument()

    await user.click(within(recent).getByRole('button', { name: 'Quitar filtro: Proyecto: EventiApp' }))
    await user.click(within(recent).getByRole('button', { name: 'Quitar filtro: Cliente: ITBEM' }))
    await waitFor(() => expect(requestedCostPaths()).toContain(automationCostsPath({
      days: 30,
      provider: 'deepseek',
      model: 'flash-model',
      page: 1,
      page_size: 40,
    })))
    expect(within(recent).getByText('Caffetton · Ajustar menú · Agente qa')).toBeInTheDocument()
    await user.click(within(recent).getByRole('button', { name: 'Limpiar filtros' }))
    await waitFor(() => expect(requestedCostPaths()).toContain(automationCostsPath({ days: 30, page: 1, page_size: 40 })))
    expect(within(recent).getAllByText('openrouter · cheap-model').length).toBeGreaterThan(0)
  })

  it('appends work-item cost pages and restarts pagination when a task filter changes', async () => {
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    await user.click(screen.getByText('Detalles y trazabilidad'))

    const workItemCosts = screen.getByRole('region', { name: 'Consumo por tarea' })
    expect(within(workItemCosts).getByText('Actualizar checkout')).toBeInTheDocument()
    expect(within(workItemCosts).queryByText('Ajustar menú')).not.toBeInTheDocument()
    await user.click(within(workItemCosts).getByRole('button', { name: 'Cargar más tareas' }))

    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('work_item_limit') === '20' && params.get('work_item_cursor') === 'work-item-cursor-2'
    })).toBe(true))
    expect(within(workItemCosts).getByText('Actualizar checkout')).toBeInTheDocument()
    expect(within(workItemCosts).getByText('Ajustar menú')).toBeInTheDocument()
    expect(within(workItemCosts).getByRole('status')).toHaveTextContent('Fin de resultados')

    await user.click(within(workItemCosts).getByRole('button', { name: 'Filtrar costos por tarea: Ajustar menú' }))
    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('work_item_id') === 'work-b' && params.get('work_item_limit') === '20' && !params.has('work_item_cursor')
    })).toBe(true))
    expect(within(workItemCosts).getByText('Ajustar menú')).toBeInTheDocument()
    expect(within(workItemCosts).queryByText('Actualizar checkout')).not.toBeInTheDocument()
  })

  it('filters and attributes execution costs by a validated agent instance, resetting both cursors', async () => {
    const user = userEvent.setup()
    render(<AutomationCostsPage />)
    await user.click(screen.getByText('Detalles y trazabilidad'))
    const recent = screen.getByText('Movimiento reciente').closest('details') as HTMLDetailsElement
    await user.click(within(recent).getByText('Movimiento reciente'))
    const workItemCosts = screen.getByRole('region', { name: 'Consumo por tarea' })
    await user.click(within(workItemCosts).getByRole('button', { name: 'Cargar más tareas' }))
    await waitFor(() => expect(requestedCostPaths().some((path) => new URLSearchParams(path.split('?')[1]).has('work_item_cursor'))).toBe(true))
    await user.click(within(recent).getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(requestedCostPaths().some((path) => new URLSearchParams(path.split('?')[1]).get('cursor') === 'cursor-2')).toBe(true))

    const instanceInput = within(recent).getByLabelText('Instancia de agente')
    await user.type(instanceInput, INSTANCE_B)
    await waitFor(() => expect(requestedCostPaths().some((path) => {
      const params = new URLSearchParams(path.split('?')[1])
      return params.get('agent_instance_id') === INSTANCE_B && params.get('page') === '1' && !params.has('cursor') && !params.has('work_item_cursor')
    })).toBe(true))
    expect(within(recent).getByRole('button', { name: `Filtrar costos por instancia: ${INSTANCE_B}` })).toHaveTextContent(INSTANCE_B)
    expect(within(recent).queryByRole('button', { name: `Filtrar costos por instancia: ${INSTANCE_A}` })).not.toBeInTheDocument()
    expect(within(recent).getByRole('button', { name: `Quitar filtro: Instancia: ${INSTANCE_B.slice(0, 8)}` })).toBeInTheDocument()

    await user.clear(instanceInput)
    const requestCountBeforeInvalidID = requestedCostPaths().length
    await user.type(instanceInput, 'not-a-uuid')
    expect(instanceInput).toHaveAttribute('aria-invalid', 'true')
    expect(within(recent).getByRole('alert')).toHaveTextContent('UUID completo válido')
    await waitFor(() => expect(requestedCostPaths().length).toBeGreaterThan(requestCountBeforeInvalidID))
    const latestCostQuery = new URLSearchParams(requestedCostPaths().at(-1)?.split('?')[1])
    expect(latestCostQuery.has('agent_instance_id')).toBe(false)
  })
})
