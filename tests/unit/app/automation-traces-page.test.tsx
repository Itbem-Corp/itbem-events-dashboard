import AutomationTracesPage from '@/app/(app)/automation/traces/page'
import { parseAutomationTraceHistory } from '@/features/automation/automation-trace-history'
import { automationAgentsPath, automationTraceHistoryPath, deliveryProjectsPath } from '@/lib/api-paths'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  useSWRInfinite: vi.fn(),
  fetcher: vi.fn(),
  setSize: vi.fn(),
  mutate: vi.fn(),
  workspaceMode: 'platform' as 'platform' | 'organization',
  rootLevel: 0 as 0 | 1 | 2,
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('swr', () => ({ default: mocks.useSWR }))
vi.mock('swr/infinite', () => ({ default: mocks.useSWRInfinite }))
vi.mock('@/lib/fetcher', () => ({ fetcher: mocks.fetcher }))
vi.mock('@/lib/api', () => ({ api: { get: mocks.get, post: mocks.post } }))
vi.mock('@/store/useStore', () => ({ useStore: (selector: (state: { workspaceMode: string; applicationSession: unknown; currentClient: unknown }) => unknown) => selector({
  workspaceMode: mocks.workspaceMode,
  currentClient: { id: 'client-1' },
  applicationSession: { application: { allows_platform_admin: true }, user: { is_root: mocks.rootLevel > 0, root_level: mocks.rootLevel }, organizations: [], capabilities: [] },
}) }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}))

const directory = {
  schema_version: 1,
  generated_at: '2026-09-24T16:00:00Z',
  summary: { profile_count: 1, live_instances: 1, active_runs: 1, available_slots: 0, queued_tasks: 0, spend_30d_microusd: 1_000 },
  agents: [{
    agent_key: 'frontend-specialist', name: 'Ada', specialty: 'Frontend', description: 'Interfaces', capabilities: ['React'],
    status: 'working', instance_count: 1, active_run_count: 1, total_runs_30d: 1, spend_30d_microusd: 1_000,
    instances: [{ worker_id: 'worker-1', machine_id: 'machine-1', status: 'working', provider: 'openrouter', model: 'small', concurrency: 1, draining: false, started_at: '2026-09-24T15:00:00Z', last_seen_at: '2026-09-24T15:59:00Z', active_runs: [] }],
  }],
  queue_lanes: [],
}

const projects = [
  { id: 'project-1', name: 'Agent Studio', slug: 'agent-studio', client_id: 'client-1', summary: '', status: 'active', created_at: '', updated_at: '', client: { id: 'client-1', name: 'ITBEM' } },
  { id: 'project-2', name: 'EventiApp', slug: 'eventiapp', client_id: 'client-2', summary: '', status: 'active', created_at: '', updated_at: '', client: { id: 'client-2', name: 'EventiApp' } },
]

const tracePage = {
  items: [{
    id: 'trace-1', kind: 'tool_call', occurred_at: '2026-09-24T15:30:00Z', agent_key: 'frontend-specialist',
    automation_task_id: '3d427ae7-9698-4599-9cf9-5d625a9da491', run_id: 'run_01HZX9',
    worker_id: 'worker-1', machine_id: 'machine-1', agent_instance_id: 'instance-1', client_id: 'client-1', client_name: 'ITBEM',
    project_id: 'project-1', project_name: 'Agent Studio', epic_id: 'epic-1', epic_title: 'Trazas',
    work_item_id: 'work-1', work_item_title: 'Explorador', step_id: 'step-1', step_key: 'build', operation: 'delivery.implementation',
    tool: 'stagehand', status: 'completed', provider: 'openrouter', model: 'small-model', input_tokens: 120,
    output_tokens: 40, total_cost_microusd: 1250, cost_pricing_status: 'verified_usd', summary: 'Leyó la lista de archivos autorizados.', activity_action: 'tool',
  }],
  cost_coverage: { scope: 'returned_page', verified_usd_executions: 1, unpriced_executions: 0 },
  limit: 50,
  has_more: true,
  next_cursor: 'opaque-next-cursor',
  snapshot_at: '2026-09-24T15:45:00Z',
}

function configurePrivateInspection() {
  mocks.rootLevel = 1
  mocks.get.mockResolvedValue({ data: { status: 200, data: [{
    receipt_id: 'receipt-1', call_id: 'call-1', run_id: 'run_01HZX9', status: 'accepted',
    diagnostics: { request_hash: 'sealed', request_bytes: 20, message_count: 1, max_completion_tokens: 4096, duration_ms: 100, gateway_status: 200, request_capture: 'available', response_capture: 'available', attempts: [] },
  }] } })
  mocks.post.mockResolvedValue({ data: { status: 200, data: { request_available: true, response_available: true, request: { messages: [{ role: 'user', content: 'private event input' }] }, response: { final_answer: 'private event output' } } } })
}

describe('Automation traces page', () => {
  beforeEach(() => {
    mocks.workspaceMode = 'platform'
    mocks.rootLevel = 0
    mocks.get.mockReset()
    mocks.post.mockReset()
    mocks.useSWR.mockReset().mockImplementation((path) => ({
      data: path === deliveryProjectsPath() ? projects : directory,
      error: undefined,
      isLoading: false,
      isValidating: false,
    }))
    mocks.useSWRInfinite.mockReset().mockReturnValue({
      data: [tracePage], error: undefined, isLoading: false, isValidating: false, size: 1,
      setSize: mocks.setSize, mutate: mocks.mutate,
    })
    mocks.fetcher.mockReset()
    mocks.setSize.mockReset()
    mocks.mutate.mockReset()
  })

  it.each([[2, 'platform'], [1, 'organization'], [0, 'platform']] as const)('denies private inspection for root level %s in %s context', (level, mode) => {
    mocks.rootLevel = level
    mocks.workspaceMode = mode
    render(<AutomationTracesPage />)
    fireEvent.click(screen.getByRole('button', { name: /stagehand/ }))
    expect(screen.queryByRole('region', { name: 'Diagnóstico de inferencia' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Consultar llamadas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir contenido privado y registrar acceso' })).not.toBeInTheDocument()
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('clears previously visible private content when platform Root 1 access changes', async () => {
    configurePrivateInspection()
    const view = render(<AutomationTracesPage />)
    fireEvent.click(screen.getByRole('button', { name: /stagehand/ }))
    expect(screen.getByRole('region', { name: 'Diagnóstico de inferencia' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Consultar llamadas' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Consultar llamadas' }))
    await screen.findByText('Receipt: receipt-1')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir contenido privado y registrar acceso' }))
    await screen.findByText('private event output')
    mocks.rootLevel = 2
    view.rerender(<AutomationTracesPage />)
    expect(screen.queryByRole('region', { name: 'Diagnóstico de inferencia' })).not.toBeInTheDocument()
    expect(screen.queryByText('private event output')).not.toBeInTheDocument()
    expect(screen.queryByText(/private event input/)).not.toBeInTheDocument()
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })

  it('clears private content when switching to another event run without automatically requesting content', async () => {
    configurePrivateInspection()
    mocks.useSWRInfinite.mockReturnValue({ data: [{ ...tracePage, items: [tracePage.items[0], { ...tracePage.items[0], id: 'trace-2', run_id: 'run_second' }] }], error: undefined, isLoading: false, isValidating: false, size: 1, setSize: mocks.setSize, mutate: mocks.mutate })
    render(<AutomationTracesPage />)
    const events = screen.getAllByRole('button', { name: /stagehand/ })
    expect(events).toHaveLength(2)
    fireEvent.click(events[0])
    fireEvent.click(screen.getByRole('button', { name: 'Consultar llamadas' }))
    await screen.findByText('Receipt: receipt-1')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir contenido privado y registrar acceso' }))
    await screen.findByText('private event output')
    fireEvent.click(events[1])
    expect(screen.queryByText('private event output')).not.toBeInTheDocument()
    expect(screen.queryByText(/private event input/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Consultar llamadas' })).toBeInTheDocument()
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })

  it('requests one global, snapshot-cursored endpoint and shows only approved event metadata', () => {
    render(<AutomationTracesPage />)

    expect(mocks.useSWRInfinite).toHaveBeenCalledTimes(1)
    const [getKey] = mocks.useSWRInfinite.mock.calls[0]
    expect(getKey(0, null)).toBe(automationTraceHistoryPath({ limit: 50 }))
    expect(screen.getByLabelText('Buscar en trazas')).toHaveAttribute('maxlength', '120')
    expect(screen.getByRole('heading', { name: 'Trazabilidad de ejecuciones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stagehand/ })).toBeInTheDocument()
    expect(screen.getByText(/Instantánea estable desde .* · hasta 50 eventos por página/)).toBeInTheDocument()

    const eventButton = screen.getByRole('button', { name: /stagehand/ })
    expect(eventButton).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(eventButton)
    expect(eventButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'stagehand' })).toBeInTheDocument()
    expect(screen.getByText('Leyó la lista de archivos autorizados.')).toBeInTheDocument()
    const details = within(screen.getByLabelText('Detalle del evento seleccionado'))
    expect(details.getByText('ID de evento').parentElement).toHaveTextContent('trace-1')
    expect(details.getByText('ID de tarea (workflow)').parentElement).toHaveTextContent('3d427ae7-9698-4599-9cf9-5d625a9da491')
    expect(details.getByText('Run ID').parentElement).toHaveTextContent('run_01HZX9')
    expect(details.getByText('ID de tarea de proyecto').parentElement).toHaveTextContent('work-1')
    expect(details.getByText('ID de paso').parentElement).toHaveTextContent('step-1')
    expect(details.getByText('ID de instancia').parentElement).toHaveTextContent('instance-1')
    expect(screen.getByRole('link', { name: 'Abrir cliente: ITBEM' })).toHaveAttribute('href', '/automation/clients/client-1')
    expect(screen.getByRole('link', { name: 'Abrir proyecto: Agent Studio' })).toHaveAttribute('href', '/automation/projects/project-1')
    expect(screen.getByRole('link', { name: 'Abrir épica: Trazas' })).toHaveAttribute('href', '/automation/epics/epic-1?tasks_limit=20')
    expect(screen.getByRole('link', { name: 'Abrir tarea: Explorador' })).toHaveAttribute('href', '/automation/work-items/work-1')
    expect(screen.getByRole('link', { name: 'Abrir paso: build' })).toHaveAttribute('href', '/automation/work-items/work-1?step=build')
    expect(screen.getAllByText('openrouter · small-model')).toHaveLength(2)
    expect(screen.queryByText(/private prompt|private reasoning|private output/i)).not.toBeInTheDocument()
    expect(screen.getAllByText('$0.00125 · Verificado USD')).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'Cobertura de costos de la página' })).toHaveTextContent('1 llamada con precio USD verificado · 0 sin precio confirmado')
    expect(screen.getByText(/únicamente a los eventos de esta página, no a todo el historial filtrado/)).toBeInTheDocument()
    expect(screen.queryByText('Latencia')).not.toBeInTheDocument()
    expect(screen.queryByText('Tokens de entrada en caché')).not.toBeInTheDocument()
  })

  it('accepts bounded task/run correlation IDs from the trace API and rejects malformed IDs', () => {
    const parsed = parseAutomationTraceHistory(tracePage)
    expect(parsed.cost_coverage).toEqual({ scope: 'returned_page', verified_usd_executions: 1, unpriced_executions: 0 })
    expect(parsed.items[0]).toMatchObject({
      automation_task_id: '3d427ae7-9698-4599-9cf9-5d625a9da491',
      run_id: 'run_01HZX9',
    })
    expect(() => parseAutomationTraceHistory({
      ...tracePage,
      items: [{ ...tracePage.items[0], automation_task_id: 'not-a-uuid' }],
    })).toThrow(/no compatible o no segura/)
    expect(() => parseAutomationTraceHistory({ ...tracePage, cost_coverage: { scope: 'all_history', verified_usd_executions: 1, unpriced_executions: 0 } })).toThrow(/no compatible o no segura/)
    expect(() => parseAutomationTraceHistory({ ...tracePage, items: [{ ...tracePage.items[0], cost_pricing_status: 'legacy' }] })).toThrow(/no compatible o no segura/)
  })

  it('marks unknown provider pricing and partial page coverage without displaying a zero USD cost', () => {
    mocks.useSWRInfinite.mockReturnValue({
      data: [{ ...tracePage, cost_coverage: { scope: 'returned_page', verified_usd_executions: 0, unpriced_executions: 1 }, items: [{
        ...tracePage.items[0], id: 'unpriced-call', kind: 'inference', tool: undefined,
        total_cost_microusd: null, cost_pricing_status: 'unknown',
      }] }], error: undefined, isLoading: false, isValidating: false, size: 1,
      setSize: mocks.setSize, mutate: mocks.mutate,
    })

    render(<AutomationTracesPage />)

    const event = screen.getByRole('button', { name: /Inferencia/ })
    expect(event).toHaveTextContent('Importe USD no verificado')
    expect(event).not.toHaveTextContent('$0.00')
    expect(screen.getByRole('region', { name: 'Cobertura de costos de la página' })).toHaveTextContent('0 llamadas con precio USD verificado · 1 sin precio confirmado')
    expect(screen.getByText(/cobertura es parcial.*no se cuentan como gasto cero/i)).toBeInTheDocument()
    fireEvent.click(event)
    const details = within(screen.getByLabelText('Detalle del evento seleccionado'))
    expect(details.getByText('Costo registrado').parentElement).toHaveTextContent('Importe USD no verificado')
  })

  it('shows a zero amount only when the event explicitly has verified USD pricing', () => {
    mocks.useSWRInfinite.mockReturnValue({
      data: [{ ...tracePage, items: [{ ...tracePage.items[0], total_cost_microusd: 0, cost_pricing_status: 'verified_usd' }] }],
      error: undefined, isLoading: false, isValidating: false, size: 1,
      setSize: mocks.setSize, mutate: mocks.mutate,
    })

    render(<AutomationTracesPage />)

    const event = screen.getByRole('button', { name: /stagehand/ })
    expect(event).toHaveTextContent('$0.00 · Verificado USD')
    fireEvent.click(event)
    expect(within(screen.getByLabelText('Detalle del evento seleccionado')).getByText('Costo registrado').parentElement).toHaveTextContent('$0.00 · Verificado USD')
  })

  it('treats a legacy amount without pricing status and page coverage as unknown', () => {
    const legacyPage = {
      ...tracePage,
      cost_coverage: undefined,
      items: [{ ...tracePage.items[0], total_cost_microusd: 1250, cost_pricing_status: undefined }],
    }
    mocks.useSWRInfinite.mockReturnValue({
      data: [legacyPage], error: undefined, isLoading: false, isValidating: false, size: 1,
      setSize: mocks.setSize, mutate: mocks.mutate,
    })

    render(<AutomationTracesPage />)

    expect(screen.getByRole('button', { name: /stagehand/ })).toHaveTextContent('Importe USD no verificado')
    expect(screen.getByRole('button', { name: /stagehand/ })).not.toHaveTextContent('$0.00125')
    expect(screen.getByRole('status')).toHaveTextContent(/no informó la cobertura.*no se puede confirmar/i)
  })

  it('applies hierarchy and agent filters to the single global query', () => {
    mocks.useSWRInfinite.mockReturnValueOnce({
      data: [tracePage], error: undefined, isLoading: false, isValidating: false, size: 3,
      setSize: mocks.setSize, mutate: mocks.mutate,
    })
    render(<AutomationTracesPage />)

    fireEvent.change(screen.getByLabelText('Cliente / empresa'), { target: { value: 'client-1' } })
    const projectSelect = screen.getByLabelText('Proyecto') as HTMLSelectElement
    expect([...projectSelect.options].map((option) => option.textContent)).toEqual(['Todos los proyectos', 'Agent Studio'])
    fireEvent.change(projectSelect, { target: { value: 'project-1' } })
    fireEvent.change(screen.getByLabelText('ID de épica'), { target: { value: 'epic-1' } })
    fireEvent.change(screen.getByLabelText('ID de tarea'), { target: { value: 'work-1' } })
    fireEvent.change(screen.getByLabelText('ID de paso'), { target: { value: 'step-1' } })
    fireEvent.change(screen.getByLabelText('Agente'), { target: { value: 'frontend-specialist' } })
    fireEvent.change(screen.getByLabelText('ID de worker'), { target: { value: 'worker-id' } })
    fireEvent.change(screen.getByLabelText('ID de máquina'), { target: { value: 'machine-id' } })
    fireEvent.change(screen.getByLabelText('ID de instancia'), { target: { value: 'instance-id' } })
    fireEvent.change(screen.getByLabelText('Clave del paso'), { target: { value: 'build_api' } })
    fireEvent.change(screen.getByLabelText('Operación'), { target: { value: 'delivery.implementation' } })
    fireEvent.change(screen.getByLabelText('Herramienta'), { target: { value: 'stagehand' } })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'cancel_requested' } })
    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: 'deepseek' } })
    fireEvent.change(screen.getByLabelText('Modelo exacto'), { target: { value: ' DeepSeek-V4-Flash ' } })
    fireEvent.change(screen.getByLabelText('Run ID de ejecución'), { target: { value: 'run_01HZX9' } })
    fireEvent.change(screen.getByLabelText('Buscar en trazas'), { target: { value: 'x'.repeat(130) } })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-20T10:00' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-24T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    const calls = mocks.useSWRInfinite.mock.calls
    const [getKey] = calls.at(-1)!
    const [path, query] = (getKey(0, null) as string).split('?')
    expect(path).toBe('/automation/traces')
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      client_id: 'client-1', project_id: 'project-1', epic_id: 'epic-1', work_item_id: 'work-1', step_id: 'step-1',
      step_key: 'build_api', agent_key: 'frontend-specialist', worker_id: 'worker-id', machine_id: 'machine-id', agent_instance_id: 'instance-id',
      operation: 'delivery.implementation', tool: 'stagehand', status: 'cancel_requested', provider: 'deepseek',
      model: 'DeepSeek-V4-Flash', run_id: 'run_01HZX9',
      q: 'x'.repeat(120),
      from: new Date('2026-09-20T10:00').toISOString(), to: new Date('2026-09-24T10:00').toISOString(), limit: '50',
    })
    expect(mocks.setSize).toHaveBeenCalledWith(1)
  })

  it('clears a selected project when the client changes, and reset removes both filters', () => {
    render(<AutomationTracesPage />)

    const clientSelect = screen.getByLabelText('Cliente / empresa') as HTMLSelectElement
    const projectSelect = screen.getByLabelText('Proyecto') as HTMLSelectElement
    const modelInput = screen.getByLabelText('Modelo exacto') as HTMLInputElement
    const runIdInput = screen.getByLabelText('Run ID de ejecución') as HTMLInputElement
    fireEvent.change(clientSelect, { target: { value: 'client-1' } })
    fireEvent.change(projectSelect, { target: { value: 'project-1' } })
    fireEvent.change(modelInput, { target: { value: 'MiniMax-M3' } })
    fireEvent.change(runIdInput, { target: { value: 'run_01HZX9' } })
    fireEvent.change(clientSelect, { target: { value: 'client-2' } })

    expect(projectSelect.value).toBe('')
    expect([...projectSelect.options].map((option) => option.value)).toEqual(['', 'project-2'])
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))

    expect(clientSelect.value).toBe('')
    expect(projectSelect.value).toBe('')
    expect(modelInput.value).toBe('')
    expect(runIdInput.value).toBe('')
    const [getKey] = mocks.useSWRInfinite.mock.calls.at(-1)!
    expect(getKey(0, null)).toBe(automationTraceHistoryPath({ limit: 50 }))
    expect(mocks.setSize).toHaveBeenLastCalledWith(1)
  })

  it('requires project scope in organization workspace and sends no unscoped request', () => {
    mocks.workspaceMode = 'organization'
    render(<AutomationTracesPage />)

    let [getKey] = mocks.useSWRInfinite.mock.calls.at(-1)!
    expect(getKey(0, null)).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(/selecciona un proyecto/i)
    expect(mocks.useSWR.mock.calls.some(([path]) => path === automationAgentsPath())).toBe(false)

    fireEvent.change(screen.getByLabelText('Proyecto'), { target: { value: 'project-1' } })
    fireEvent.change(screen.getByLabelText('Agente'), { target: { value: 'frontend-specialist' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    ;[getKey] = mocks.useSWRInfinite.mock.calls.at(-1)!
    expect(getKey(0, null)).toBe(automationTraceHistoryPath({ client_id: 'client-1', project_id: 'project-1', agent_key: 'frontend-specialist', limit: 50 }))
  })

  it('carries the same snapshot on the next global cursor page', () => {
    render(<AutomationTracesPage />)

    fireEvent.change(screen.getByLabelText('Modelo exacto'), { target: { value: 'DeepSeek-V4-Flash' } })
    fireEvent.change(screen.getByLabelText('Run ID de ejecución'), { target: { value: 'run_01HZX9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    const [getKey] = mocks.useSWRInfinite.mock.calls.at(-1)!
    expect(getKey(0, null)).toBe('/automation/traces?model=DeepSeek-V4-Flash&run_id=run_01HZX9&limit=50')
    const nextPageKey = getKey(1, tracePage) as string
    const nextPageQuery = new URLSearchParams(nextPageKey.split('?')[1])
    expect(nextPageQuery.get('model')).toBe('DeepSeek-V4-Flash')
    expect(nextPageQuery.get('run_id')).toBe('run_01HZX9')
    expect(nextPageQuery.get('cursor')).toBe('opaque-next-cursor')
    expect(nextPageQuery.get('snapshot_at')).toBe(tracePage.snapshot_at)
    expect(nextPageQuery.get('limit')).toBe('50')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más eventos' }))
    expect(mocks.setSize).toHaveBeenCalledWith(2)
  })

  it('labels historical rows without persisted agent attribution honestly', () => {
    mocks.useSWRInfinite.mockReturnValueOnce({
      data: [{ ...tracePage, items: [{ ...tracePage.items[0], agent_key: 'unknown' }] }],
      error: undefined, isLoading: false, isValidating: false, size: 1,
      setSize: mocks.setSize, mutate: mocks.mutate,
    })

    render(<AutomationTracesPage />)

    expect(screen.getByText('Sin atribución')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'unknown' })).not.toBeInTheDocument()
  })

  it('labels approved assignment, gate, and evidence events and shows present cache/latency metadata', () => {
    mocks.useSWRInfinite.mockReturnValue({
      data: [{ ...tracePage, has_more: false, next_cursor: undefined, items: [
        { id: 'assignment-1', kind: 'assignment_event', occurred_at: tracePage.snapshot_at, status: 'running', event_type: 'target_changed', previous_status: 'queued', previous_agent_key: 'old-agent', previous_machine_id: 'worker-old', summary: 'Asignación confirmada.' },
        { id: 'assignment-2', kind: 'assignment_event', occurred_at: tracePage.snapshot_at, status: 'queued', event_type: 'assignment_created' },
        { id: 'assignment-3', kind: 'assignment_event', occurred_at: tracePage.snapshot_at, status: 'running', event_type: 'status_changed' },
        { id: 'assignment-4', kind: 'assignment_event', occurred_at: tracePage.snapshot_at, status: 'running', event_type: 'status_and_target_changed' },
        { id: 'gate-1', kind: 'gate_decision', occurred_at: tracePage.snapshot_at, event_type: 'plan', status: 'approved', summary: 'Plan aprobado.' },
        { id: 'evidence-1', kind: 'step_evidence', occurred_at: tracePage.snapshot_at, status: 'recorded', summary: 'Evidencia registrada.', cached_input_tokens: 24, cache_write_tokens: 8, latency_ms: 321 },
      ] }], error: undefined, isLoading: false, isValidating: false, size: 1,
      setSize: mocks.setSize, mutate: mocks.mutate,
    })

    render(<AutomationTracesPage />)

    const assignmentButtons = screen.getAllByRole('button', { name: /Asignación/ })
    expect(assignmentButtons).toHaveLength(4)
    expect(screen.getByRole('button', { name: /Decisión de revisión/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Decisión de revisión/ })).toHaveTextContent('Humano')
    expect(screen.getByLabelText('Estado')).toHaveTextContent('dispatched')
    const evidence = screen.getByRole('button', { name: /Evidencia de paso/ })
    fireEvent.click(evidence)
    expect(screen.getByRole('heading', { name: 'Evidencia de paso' })).toBeInTheDocument()
    expect(screen.getByText('Tokens de entrada en caché')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
    expect(screen.getByText('Tokens escritos en caché')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('Latencia')).toBeInTheDocument()
    expect(screen.getByText('321 ms')).toBeInTheDocument()
    fireEvent.click(assignmentButtons[0])
    expect(screen.getByText('Tipo de asignación')).toBeInTheDocument()
    expect(screen.getByText('Destino reasignado')).toBeInTheDocument()
    expect(screen.getByText('queued → running')).toBeInTheDocument()
    expect(screen.getByText('old-agent')).toBeInTheDocument()
    expect(screen.getByText('worker-old')).toBeInTheDocument()
    for (const [index, label] of [[1, 'Asignación creada'], [2, 'Estado actualizado'], [3, 'Estado y destino actualizados']] as const) {
      fireEvent.click(assignmentButtons[index])
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: /Decisión de revisión/ }))
    expect(screen.getAllByText('Humano')).toHaveLength(2)
    expect(parseAutomationTraceHistory({ ...tracePage, items: [{ id: 'gate-valid', kind: 'gate_decision', occurred_at: tracePage.snapshot_at, event_type: 'release', status: 'changes_requested' }] }).items).toHaveLength(1)
    expect(() => parseAutomationTraceHistory({ ...tracePage, items: [{ id: 'assignment', kind: 'assignment_event', occurred_at: tracePage.snapshot_at, event_type: 'worker_reassigned' }] })).toThrow(/no compatible o no segura/)
    expect(() => parseAutomationTraceHistory({ ...tracePage, items: [{ id: 'gate', kind: 'gate_decision', occurred_at: tracePage.snapshot_at, event_type: 'unknown', status: 'approved' }] })).toThrow(/no compatible o no segura/)
    expect(() => parseAutomationTraceHistory({ ...tracePage, items: [{ id: 'gate', kind: 'gate_decision', occurred_at: tracePage.snapshot_at, event_type: 'plan', status: 'recorded' }] })).toThrow(/no compatible o no segura/)
    expect(() => parseAutomationTraceHistory({ ...tracePage, items: [{ id: 'bad', kind: 'step_evidence', occurred_at: tracePage.snapshot_at, latency_ms: -1 }] })).toThrow(/no compatible o no segura/)
    expect(() => parseAutomationTraceHistory({ ...tracePage, items: [{ id: 'assignment', kind: 'assignment_event', occurred_at: tracePage.snapshot_at, event_type: 'assignment_created', previous_status: null, previous_agent_key: '', previous_machine_id: null }] })).not.toThrow()
  })

  it('fails closed when a response includes private provider payloads or reasoning', () => {
    expect(() => parseAutomationTraceHistory({ ...tracePage, items: [{ ...tracePage.items[0], prompt: 'private prompt' }] })).toThrow(/no compatible o no segura/)
    expect(() => parseAutomationTraceHistory({ ...tracePage, items: [{ ...tracePage.items[0], reasoning: 'private reasoning' }] })).toThrow(/no compatible o no segura/)
    expect(() => parseAutomationTraceHistory({ ...tracePage, raw_json: '{}' })).toThrow(/no compatible o no segura/)
    expect(() => parseAutomationTraceHistory({ ...tracePage, items: [{ ...tracePage.items[0], run_id: 'private run id' }] })).toThrow(/no compatible o no segura/)
  })

  it('shows cost and token usage as unknown for non-provider activity instead of displaying zero', () => {
    mocks.useSWRInfinite.mockReturnValue({
      data: [{ ...tracePage, items: [{ id: 'status-event', kind: 'step_event', occurred_at: tracePage.snapshot_at, status: 'completed', summary: 'Paso cerrado.' }] }],
      error: undefined, isLoading: false, isValidating: false, size: 1,
      setSize: mocks.setSize, mutate: mocks.mutate,
    })

    render(<AutomationTracesPage />)

    expect(screen.getByRole('button', { name: /Paso/ })).toHaveTextContent('—')
    fireEvent.click(screen.getByRole('button', { name: /Paso/ }))
    const details = within(screen.getByLabelText('Detalle del evento seleccionado'))
    expect(details.getByText('Tokens (entrada / salida)').parentElement).toHaveTextContent('—')
    expect(details.getByText('Costo registrado').parentElement).toHaveTextContent('No disponible')
  })
})
