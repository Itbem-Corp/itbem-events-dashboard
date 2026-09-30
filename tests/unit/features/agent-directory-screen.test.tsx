import type {
  AutomationAgentDirectorySnapshot,
  AutomationAgentHistoryItem,
  AutomationAgentHistoryPage,
  AutomationAgentProfile,
} from '@/features/automation/agent-directory'
import { AgentDirectoryScreen } from '@/features/automation/agent-directory-screen'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

const agent: AutomationAgentProfile = {
  agent_key: 'frontend-specialist',
  name: 'Ada',
  specialty: 'Frontend',
  description: 'Implementa interfaces accesibles.',
  capabilities: ['React', 'Pruebas'],
  status: 'available',
  instance_count: 0,
  active_run_count: 0,
  total_runs_30d: 0,
  spend_30d_microusd: 0,
  instances: [],
}

const snapshot: AutomationAgentDirectorySnapshot = {
  schema_version: 1,
  generated_at: '2026-09-24T18:20:00Z',
  summary: {
    profile_count: 1,
    live_instances: 0,
    active_runs: 0,
    available_slots: 0,
    queued_tasks: 0,
    spend_30d_microusd: 0,
  },
  agents: [agent],
  queue_lanes: [],
}

const activity: AutomationAgentHistoryItem = {
  id: 'activity-1',
  kind: 'step_activity',
  occurred_at: '2026-09-24T18:05:00Z',
  task_id: 'task-1',
  run_id: 'run-1',
  worker_id: '11111111-2222-4333-8444-555555555555',
  machine_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  agent_instance_id: 'cccccccc-dddd-4eee-8fff-000000000001',
  operation: 'delivery.implementation',
  status: 'completed',
  client_id: 'client-1',
  client_name: 'ITBEM',
  project_id: 'project-1',
  project_name: 'Agent Studio',
  epic_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  epic_title: 'Consola de agentes',
  work_item_id: 'work-1',
  work_item_title: 'Roster visual',
  step_key: 'build-ui_step',
  activity_action: 'file_change',
  provider: 'openrouter',
  model: 'small-model',
  input_tokens: 240,
  output_tokens: 120,
  total_cost_microusd: 3_500,
  summary: 'Plan step activity',
}

const secondActivity: AutomationAgentHistoryItem = {
  ...activity,
  id: 'activity-2',
  client_id: 'client-2',
  client_name: 'Caffetón House',
  project_id: 'project-2',
  project_name: 'App de reservas',
  work_item_id: 'work-2',
  work_item_title: 'Flujo de reservas',
  run_id: 'run-2',
  worker_id: '22222222-3333-4444-8555-666666666666',
  machine_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
  summary: 'Validación registrada.',
  activity_action: 'validation',
}

const page: AutomationAgentHistoryPage = {
  agent_key: agent.agent_key,
  items: [activity, secondActivity],
  limit: 2,
  has_more: true,
  next_cursor: 'opaque cursor / page 2',
}

type History = {
  pages: AutomationAgentHistoryPage[]
  error?: Error
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
}

function renderDirectory({
  snapshot: snapshotOverride = snapshot,
  history = { pages: [page], isLoading: false, isLoadingMore: false, hasMore: true },
  scopeClientId = '',
  scopeProjectId = '',
  clients = [],
  projects = [],
  onScopeChange = vi.fn(),
  onHistoryFiltersChange = vi.fn(),
  onLoadMoreHistory = vi.fn(),
  onRetryHistory = vi.fn(),
}: {
  snapshot?: AutomationAgentDirectorySnapshot
  history?: History
  scopeClientId?: string
  scopeProjectId?: string
  clients?: Array<{ id: string; name: string }>
  projects?: Array<{ id: string; client_id: string; name: string }>
  onScopeChange?: (clientId: string, projectId: string) => void
  onHistoryFiltersChange?: (filters: Record<string, string>) => void
  onLoadMoreHistory?: () => void
  onRetryHistory?: () => void
} = {}) {
  const onAgentOpen = vi.fn()
  const onAgentClose = vi.fn()
  const onHistoryRequestChange = vi.fn()
  const view = render(
    <AgentDirectoryScreen
      snapshot={snapshotOverride}
      scopeClientId={scopeClientId}
      scopeProjectId={scopeProjectId}
      clients={clients}
      projects={projects}
      onScopeChange={onScopeChange}
      initialAgentKey={agent.agent_key}
      history={history}
      onAgentOpen={onAgentOpen}
      onAgentClose={onAgentClose}
      onHistoryRequestChange={onHistoryRequestChange}
      onHistoryFiltersChange={onHistoryFiltersChange}
      onLoadMoreHistory={onLoadMoreHistory}
      onRetryHistory={onRetryHistory}
    />
  )

  return {
    ...view,
    onAgentOpen,
    onScopeChange,
    onAgentClose,
    onHistoryRequestChange,
    onHistoryFiltersChange,
    onLoadMoreHistory,
    onRetryHistory,
  }
}

describe('agent directory screen history', () => {
  it('changes the primary client/project scope independently from history filters', () => {
    const onScopeChange = vi.fn()
    renderDirectory({
      scopeClientId: 'client-1',
      clients: [{ id: 'client-1', name: 'ITBEM' }],
      projects: [{ id: 'project-1', client_id: 'client-1', name: 'Agent Studio' }],
      onScopeChange,
    })

    fireEvent.change(screen.getByLabelText('Proyecto del alcance'), { target: { value: 'project-1' } })
    expect(onScopeChange).toHaveBeenCalledWith('client-1', 'project-1')
    expect(screen.queryByLabelText('Cliente')).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('Proyecto')).getByRole('option', { name: /Agent Studio/ })).toBeInTheDocument()
    expect(within(screen.getByLabelText('Proyecto')).queryByRole('option', { name: /App de reservas/ })).not.toBeInTheDocument()
  })

  it('offers machine identity registration from the agent module', () => {
    renderDirectory()

    expect(screen.getByRole('heading', { name: 'Registro de máquinas locales' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gestionar identidades' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Sólo admin raíz')).toBeInTheDocument()
  })

  it('shows only shared queue lanes that have pending tasks', () => {
    const queueSnapshot: AutomationAgentDirectorySnapshot = {
      ...snapshot,
      queue_lanes: [
        { operation: 'delivery.chat', queued_tasks: 0 },
        { operation: 'delivery.plan', queued_tasks: 0 },
        { operation: 'delivery.implementation', queued_tasks: 2, oldest_queued_at: '2026-09-24T18:00:00Z' },
      ],
    }

    renderDirectory({ snapshot: queueSnapshot })

    const queue = screen.getByRole('complementary', { name: 'Cola compartida' })
    expect(within(queue).getByText('Implementación')).toBeInTheDocument()
    expect(within(queue).getByText('2 en espera')).toBeInTheDocument()
    expect(within(queue).queryByText('Chat de agente')).not.toBeInTheDocument()
    expect(within(queue).queryByText('Planeación')).not.toBeInTheDocument()
    expect(within(queue).queryByText('No hay tareas pendientes de asignación.')).not.toBeInTheDocument()
  })

  it('shows an explicit empty state when all shared queue lanes have zero tasks', () => {
    const queueSnapshot: AutomationAgentDirectorySnapshot = {
      ...snapshot,
      queue_lanes: [
        { operation: 'delivery.chat', queued_tasks: 0 },
        { operation: 'delivery.plan', queued_tasks: 0 },
        { operation: 'delivery.implementation', queued_tasks: 0 },
      ],
    }

    renderDirectory({ snapshot: queueSnapshot })

    const queue = screen.getByRole('complementary', { name: 'Cola compartida' })
    expect(within(queue).getByText('No hay tareas pendientes de asignación.')).toBeInTheDocument()
    expect(within(queue).queryByText(/en espera/)).not.toBeInTheDocument()
    expect(within(queue).queryByText('Chat de agente')).not.toBeInTheDocument()
  })

  it('labels the profile instance count as a 30-day view rather than live capacity', async () => {
    const historicalAgent: AutomationAgentProfile = {
      ...agent,
      status: 'offline',
      instance_count: 1,
      instances: [
        {
          worker_id: '11111111-2222-4333-8444-555555555555',
          machine_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          protocols: [],
          status: 'offline',
          provider: 'openrouter',
          model: 'small-model',
          concurrency: 1,
          draining: false,
          started_at: '2026-09-01T18:00:00Z',
          last_seen_at: '2026-09-01T18:20:00Z',
          active_runs: [],
        },
      ],
    }

    renderDirectory({ snapshot: { ...snapshot, agents: [historicalAgent] } })

    const card = screen.getByRole('button', { name: 'Ver perfil de Ada' })
    expect(within(card).getByText('Vistas · 30 d')).toBeInTheDocument()
    await screen.findByRole('dialog')
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Instancias vistas · 30 días')).toBeInTheDocument()
    expect(within(dialog).getByText('1 registro · 30 d')).toBeInTheDocument()
    expect(within(card).getByText(/Plan steps: 0 compatible · 1 legacy\/sin soporte/)).toBeInTheDocument()
    expect(within(dialog).getByText('Legacy · sin soporte de pasos')).toBeInTheDocument()
  })

  it('does not treat a missing worker protocol list as proof of legacy support', async () => {
    const unreportedAgent: AutomationAgentProfile = {
      ...agent,
      instance_count: 1,
      instances: [{
        worker_id: 'worker-without-protocols',
        status: 'available',
        provider: 'openrouter',
        model: 'small-model',
        concurrency: 1,
        draining: false,
        started_at: '2026-09-24T18:00:00Z',
        last_seen_at: '2026-09-24T18:20:00Z',
        active_runs: [],
      }],
    }

    renderDirectory({ snapshot: { ...snapshot, agents: [unreportedAgent] } })

    const card = screen.getByRole('button', { name: 'Ver perfil de Ada' })
    expect(within(card).getByText(/Plan steps: 0 compatible · 0 legacy\/sin soporte · 1 sin protocolo reportado/)).toBeInTheDocument()
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Protocolo no reportado')).toBeInTheDocument()
  })

  it('surfaces parallel sessions in each contributor card and hides unsafe activity details', async () => {
    const workingAgent: AutomationAgentProfile = {
      ...agent,
      status: 'working',
      instance_count: 2,
      active_run_count: 2,
      instances: [
        {
          worker_id: '11111111-2222-4333-8444-555555555555',
          machine_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          protocols: ['delivery.plan_steps.v1'],
          status: 'working',
          provider: 'openrouter',
          model: 'small-model',
          concurrency: 1,
          draining: false,
          started_at: '2026-09-24T18:00:00Z',
          last_seen_at: '2026-09-24T18:20:00Z',
          active_runs: [
            {
              task_id: 'task-1',
              run_id: 'run-1',
              operation: 'delivery.implementation',
              status: 'running',
              client_name: 'ITBEM',
              project_name: 'Agent Studio',
              epic_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
              epic_title: 'Consola de agentes',
              work_item_title: 'Agenda del cliente',
              step_key: 'build-agenda',
            },
          ],
        },
        {
          worker_id: '22222222-3333-4444-8555-666666666666',
          machine_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
          protocols: [],
          status: 'working',
          provider: 'deepseek',
          model: 'deepseek-chat',
          concurrency: 1,
          draining: false,
          started_at: '2026-09-24T18:01:00Z',
          last_seen_at: '2026-09-24T18:20:00Z',
          active_runs: [
            {
              task_id: 'task-2',
              run_id: 'run-2',
              operation: 'delivery.qa',
              status: 'running',
              client_name: 'Caffetón House',
              project_name: 'Reservas',
              work_item_title: 'C:\\Users\\worker\\private.txt',
              step_key: 'src\\components\\reservations.tsx',
            },
          ],
        },
      ],
    }
    const workingSnapshot: AutomationAgentDirectorySnapshot = {
      ...snapshot,
      summary: { ...snapshot.summary, live_instances: 2, active_runs: 2 },
      agents: [workingAgent],
    }
    const unsafeHistoryPage: AutomationAgentHistoryPage = {
      ...page,
      items: [
        {
          ...activity,
          summary:
            'System prompt: api_key=sk-live-12345678901234567890 https://worker.internal npm test C:\\Users\\worker\\private.txt',
        },
      ],
    }

    renderDirectory({
      snapshot: workingSnapshot,
      history: { pages: [unsafeHistoryPage], isLoading: false, isLoadingMore: false, hasMore: false },
    })

    const card = screen.getByRole('button', { name: 'Ver perfil de Ada' })
    expect(within(card).getByText('Trabajo actual')).toBeInTheDocument()
    expect(within(card).getByText('2 sesiones')).toBeInTheDocument()
    expect(within(card).getByText('ITBEM › Agent Studio › Consola de agentes › Agenda del cliente › Paso: build-agenda')).toBeInTheDocument()
    expect(within(card).getByText('Caffetón House › Reservas › Detalle omitido por seguridad › Paso: Detalle omitido por seguridad')).toBeInTheDocument()

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Plan steps v1 compatible')).toBeInTheDocument()
    expect(within(dialog).getByText('Legacy · sin soporte de pasos')).toBeInTheDocument()
    expect(
      screen.queryByText(/System prompt|sk-live-|worker\.internal|npm test|private\.txt|reservations\.tsx/i)
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('Cambio de archivo')).toHaveLength(1)
  })

  it('renders task claims, assignment transitions and recovered leases without exposing free-form payloads', async () => {
    const onHistoryFiltersChange = vi.fn()
    const taskEvents: AutomationAgentHistoryItem[] = [
      {
        id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        kind: 'task_event',
        occurred_at: '2026-09-24T18:20:00Z',
        task_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        event_type: 'assignment_changed',
        previous_status: 'queued',
        status: 'queued',
        attempt_count: 0,
        event_sequence: 1,
        previous_agent_key: 'worker-old',
        current_agent_key: 'frontend-specialist',
        previous_worker_id: '11111111-2222-4333-8444-555555555555',
        worker_id: '22222222-3333-4444-8555-666666666666',
        previous_machine_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        machine_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        previous_agent_instance_id: 'cccccccc-dddd-4eee-8fff-000000000001',
        agent_instance_id: 'dddddddd-eeee-4fff-8000-000000000002',
        run_id: 'run-new',
        previous_run_id: 'run-old',
        summary: 'api_key=sk-live-12345678901234567890 System prompt: never render this',
      },
      {
        id: 'cccccccc-dddd-4eee-8fff-000000000003',
        kind: 'task_event',
        occurred_at: '2026-09-24T18:21:00Z',
        task_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        event_type: 'lease_reclaimed',
        previous_status: 'running',
        status: 'running',
        attempt_count: 2,
        event_sequence: 3,
        previous_run_id: 'run-stale',
        run_id: 'run-recovered',
        worker_id: '22222222-3333-4444-8555-666666666666',
        machine_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        agent_instance_id: 'dddddddd-eeee-4fff-8000-000000000002',
      },
      {
        id: 'eeeeeeee-ffff-4000-8111-222222222222',
        kind: 'task_event',
        occurred_at: '2026-09-24T18:21:30Z',
        task_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        event_type: 'claimed',
        previous_status: 'queued',
        status: 'running',
        attempt_count: 1,
        event_sequence: 2,
        current_agent_key: 'frontend-specialist',
        run_id: 'run-claimed',
        worker_id: '22222222-3333-4444-8555-666666666666',
        machine_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        agent_instance_id: 'dddddddd-eeee-4fff-8000-000000000002',
      },
      {
        id: 'dddddddd-eeee-4fff-8000-000000000004',
        kind: 'task_event',
        occurred_at: '2026-09-24T18:22:00Z',
        task_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        event_type: 'status_transition',
        previous_status: 'running',
        status: 'completed',
        attempt_count: 2,
        event_sequence: 4,
      },
    ]
    renderDirectory({
      history: { pages: [{ ...page, items: taskEvents }], isLoading: false, isLoadingMore: false, hasMore: false },
      onHistoryFiltersChange,
    })

    await screen.findByRole('dialog')
    expect(screen.getAllByText('Ciclo de vida de tarea')).toHaveLength(4)
    expect(screen.getByText('Asignación actualizada')).toBeInTheDocument()
    expect(screen.getByText('Trabajo reclamado')).toBeInTheDocument()
    expect(screen.getByText('Lease recuperado tras vencimiento')).toBeInTheDocument()
    expect(screen.getByText('Cambio de estado')).toBeInTheDocument()
    expect(screen.getByText('Estado de tarea: En cola → En cola')).toBeInTheDocument()
    expect(screen.getByText('Estado de tarea: En cola → En curso')).toBeInTheDocument()
    expect(screen.getByText('Estado de tarea: En curso → Completada')).toBeInTheDocument()
    expect(screen.getByText('Agente · worker-old → frontend-specialist')).toBeInTheDocument()
    expect(screen.getByText('Worker · 11111111-2222-4333-8444-555555555555 → 22222222-3333-4444-8555-666666666666')).toBeInTheDocument()
    expect(screen.getByText('Máquina · aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee → bbbbbbbb-cccc-4ddd-8eee-ffffffffffff')).toBeInTheDocument()
    expect(screen.getByText('Instancia · cccccccc-dddd-4eee-8fff-000000000001 → dddddddd-eeee-4fff-8000-000000000002')).toBeInTheDocument()
    expect(screen.getByText('Ejecución · run-stale → run-recovered')).toBeInTheDocument()
    expect(screen.getAllByText('Intento 2')).toHaveLength(2)
    expect(screen.queryByText(/api_key=|sk-live-|System prompt|never render this/)).not.toBeInTheDocument()
    const instanceFilter = screen.getByLabelText('Instancia de agente')
    expect(within(instanceFilter).getByRole('option', { name: 'cccccccc-dddd-4eee-8fff-000000000001' })).toBeInTheDocument()
    fireEvent.change(instanceFilter, { target: { value: 'cccccccc-dddd-4eee-8fff-000000000001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(onHistoryFiltersChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ agent_instance_id: 'cccccccc-dddd-4eee-8fff-000000000001' })
    )
  })

  it('applies the selected hierarchical filters and sends an exclusive next-day date boundary', async () => {
    const onHistoryFiltersChange = vi.fn()
    renderDirectory({ onHistoryFiltersChange })
    await screen.findByRole('dialog')

    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-23' } })
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'client-1' } })
    fireEvent.change(screen.getByLabelText('Proyecto'), { target: { value: 'project-1' } })
    fireEvent.change(screen.getByLabelText('Tarea'), { target: { value: 'work-1' } })
    fireEvent.change(screen.getByLabelText('Operación'), { target: { value: 'delivery.implementation' } })
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'completed' } })
    fireEvent.change(screen.getByLabelText('Proveedor'), { target: { value: 'openrouter' } })
    fireEvent.change(screen.getByLabelText('Worker'), { target: { value: activity.worker_id } })
    fireEvent.change(screen.getByLabelText('Máquina'), { target: { value: activity.machine_id } })
    fireEvent.change(screen.getByLabelText('Instancia de agente'), { target: { value: activity.agent_instance_id } })
    fireEvent.change(screen.getByLabelText('Ejecución (run)'), { target: { value: activity.run_id } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    expect(onHistoryFiltersChange).toHaveBeenLastCalledWith({
      from: new Date(2026, 8, 1).toISOString(),
      to: new Date(2026, 8, 24).toISOString(),
      client_id: 'client-1',
      project_id: 'project-1',
      work_item_id: 'work-1',
      operation: 'delivery.implementation',
      status: 'completed',
      provider: 'openrouter',
      worker_id: activity.worker_id,
      machine_id: activity.machine_id,
      agent_instance_id: activity.agent_instance_id,
      run_id: activity.run_id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(onHistoryFiltersChange).toHaveBeenLastCalledWith({
      from: '',
      to: '',
      client_id: '',
      project_id: '',
      work_item_id: '',
      operation: '',
      status: '',
      provider: '',
      worker_id: '',
      machine_id: '',
      agent_instance_id: '',
      run_id: '',
    })
  })

  it('keeps dependent context filters cleared when changing the selected client', async () => {
    const onHistoryFiltersChange = vi.fn()
    renderDirectory({ onHistoryFiltersChange })
    await screen.findByRole('dialog')

    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'client-1' } })
    fireEvent.change(screen.getByLabelText('Proyecto'), { target: { value: 'project-1' } })
    fireEvent.change(screen.getByLabelText('Tarea'), { target: { value: 'work-1' } })
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'client-2' } })

    expect(screen.getByLabelText('Proyecto')).toHaveValue('')
    expect(screen.getByLabelText('Tarea')).toHaveValue('')
  })

  it('uses authorized hierarchy identifiers for client, project, work-item, and step/run drill-downs', async () => {
    renderDirectory()
    await screen.findByRole('dialog')

    expect(screen.getByRole('link', { name: 'ITBEM' })).toHaveAttribute('href', '/clients/client-1')
    expect(screen.getByRole('link', { name: 'Agent Studio' })).toHaveAttribute('href', '/automation/projects/project-1')
    expect(screen.getAllByRole('link', { name: 'Consola de agentes' }).every((link) =>
      link.getAttribute('href') === '/automation/epics/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    )).toBe(true)
    expect(screen.getByRole('link', { name: /Roster visual · abrir diario de build-ui_step/ })).toHaveAttribute(
      'href',
      '/automation/work-items/work-1?view=overview&step=build-ui_step&run=run-1'
    )
    expect(screen.getAllByText('Actividad del paso')).toHaveLength(2)
    expect(screen.getByText('Cambio de archivo')).toBeInTheDocument()
  })

  it('requests the next cursor page and exposes retry for initial and continuation failures', async () => {
    const onLoadMoreHistory = vi.fn()
    const onRetryHistory = vi.fn()
    const initialError = new Error('network')
    const view = renderDirectory({
      history: { pages: [page], error: initialError, isLoading: false, isLoadingMore: false, hasMore: true },
      onLoadMoreHistory,
      onRetryHistory,
    })
    await screen.findByRole('dialog')

    expect(
      screen.getByText('No se pudo actualizar el historial. Los eventos cargados se mantienen visibles.')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetryHistory).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(onLoadMoreHistory).toHaveBeenCalledTimes(1)

    view.rerender(
      <AgentDirectoryScreen
        snapshot={snapshot}
        initialAgentKey={agent.agent_key}
        history={{ pages: [page], isLoading: true, isLoadingMore: true, hasMore: true }}
        onAgentOpen={vi.fn()}
        onAgentClose={vi.fn()}
        onHistoryRequestChange={vi.fn()}
        onHistoryFiltersChange={vi.fn()}
        onLoadMoreHistory={onLoadMoreHistory}
        onRetryHistory={onRetryHistory}
      />
    )
    expect(screen.getByRole('button', { name: 'Actualizando…' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Actualizando…' }))
    expect(onLoadMoreHistory).toHaveBeenCalledTimes(1)

    view.rerender(
      <AgentDirectoryScreen
        snapshot={snapshot}
        initialAgentKey={agent.agent_key}
        history={{ pages: [], error: initialError, isLoading: false, isLoadingMore: false, hasMore: false }}
        onAgentOpen={vi.fn()}
        onAgentClose={vi.fn()}
        onHistoryRequestChange={vi.fn()}
        onHistoryFiltersChange={vi.fn()}
        onLoadMoreHistory={onLoadMoreHistory}
        onRetryHistory={onRetryHistory}
      />
    )
    await waitFor(() => expect(screen.getByText('No se pudo cargar el historial de Ada.')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetryHistory).toHaveBeenCalledTimes(2)
  })
})
